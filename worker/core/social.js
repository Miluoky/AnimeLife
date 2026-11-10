/** Подписки и лента активности на D1. */

import { err, json } from './auth.js'
import { randomId } from './crypto.js'

export async function handleSocialGet(request, env, path) {
  const url = new URL(request.url)

  if (path === '/social/counts' && request.method === 'GET') {
    const userId = String(url.searchParams.get('userId') || '')
    if (!userId) return err('userId', 400)
    const followers = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?')
      .bind(userId)
      .first()
    const following = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?')
      .bind(userId)
      .first()
    return json({ followers: followers?.n || 0, following: following?.n || 0 })
  }

  if (path === '/social/following' && request.method === 'GET') {
    const me = String(url.searchParams.get('me') || '')
    if (!me) return err('me', 400)
    const res = await env.DB.prepare('SELECT following_id FROM follows WHERE follower_id = ? LIMIT 500')
      .bind(me)
      .all()
    return json({ ids: (res.results || []).map((r) => r.following_id) })
  }

  if (path === '/social/is-following' && request.method === 'GET') {
    const me = String(url.searchParams.get('me') || '')
    const userId = String(url.searchParams.get('userId') || '')
    const row = await env.DB.prepare(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1',
    )
      .bind(me, userId)
      .first()
    return json({ following: !!row })
  }

  if (path === '/social/feed' && request.method === 'GET') {
    const ids = (url.searchParams.get('ids') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 100)
    let res
    if (ids.length) {
      // D1 не любит огромный IN — берём общую ленту и фильтруем.
      res = await env.DB.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 200').all()
      const set = new Set(ids)
      const rows = (res.results || []).filter((r) => set.has(r.user_id)).slice(0, 60)
      return json({ activity: rows.map(mapActivity) })
    }
    res = await env.DB.prepare('SELECT * FROM activity ORDER BY created_at DESC LIMIT 60').all()
    return json({ activity: (res.results || []).map(mapActivity) })
  }

  if (path === '/social/episode-score' && request.method === 'GET') {
    const animeId = String(url.searchParams.get('animeId') || '')
    const episode = Math.floor(Number(url.searchParams.get('episode') || 0))
    if (!/^\d{1,10}$/.test(animeId) || episode < 1) return err('animeId/episode', 400)
    const row = await env.DB.prepare(
      'SELECT * FROM episode_scores WHERE anime_id = ? AND episode = ?',
    )
      .bind(animeId, episode)
      .first()
    if (!row || !row.votes) return json({ score: null })
    return json({
      score: { animeId, episode, avg: row.avg, votes: row.votes },
    })
  }

  if (path === '/social/best-episodes' && request.method === 'GET') {
    const animeId = String(url.searchParams.get('animeId') || '')
    if (!/^\d{1,10}$/.test(animeId)) return err('animeId', 400)
    const res = await env.DB.prepare(
      'SELECT * FROM episode_scores WHERE anime_id = ? AND votes > 0 ORDER BY avg DESC LIMIT 6',
    )
      .bind(animeId)
      .all()
    return json({
      scores: (res.results || []).map((r) => ({
        animeId: r.anime_id,
        episode: r.episode,
        avg: r.avg,
        votes: r.votes,
      })),
    })
  }

  if (path === '/social/top' && request.method === 'GET') {
    const res = await env.DB.prepare(
      'SELECT user_id, name, about, xp, summary FROM profiles WHERE hidden = 0 ORDER BY xp DESC LIMIT 50',
    ).all()
    return json({
      profiles: (res.results || []).map((p) => ({
        $id: p.user_id,
        name: p.name,
        about: p.about,
        xp: p.xp,
        summary: p.summary,
      })),
    })
  }

  return null
}

function mapActivity(r) {
  let data = {}
  try {
    data = JSON.parse(r.data || '{}')
  } catch {
    data = {}
  }
  return {
    $id: r.id,
    userId: r.user_id,
    name: data.name || '',
    kind: r.kind,
    animeId: data.animeId || '',
    title: data.title || '',
    poster: data.poster || '',
    status: data.status,
    value: Number(data.value) || 0,
    at: r.created_at,
  }
}

export async function handleSocialAction(env, session, body) {
  const action = body.action

  if (action === 'follow') {
    if (!session) return err('Войдите.', 401)
    const userId = String(body.userId || '')
    if (!userId || userId === session.user.$id) return err('Нельзя подписаться.', 400)
    const id = randomId(12)
    try {
      await env.DB.prepare(
        'INSERT INTO follows (id, follower_id, following_id, created_at) VALUES (?, ?, ?, ?)',
      )
        .bind(id, session.user.$id, userId, Date.now())
        .run()
    } catch {
      // уже подписан
    }
    const followers = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?')
      .bind(userId)
      .first()
    return json({ followers: followers?.n || 0 })
  }

  if (action === 'unfollow') {
    if (!session) return err('Войдите.', 401)
    const userId = String(body.userId || '')
    await env.DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?')
      .bind(session.user.$id, userId)
      .run()
    const followers = await env.DB.prepare('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?')
      .bind(userId)
      .first()
    return json({ followers: followers?.n || 0 })
  }

  if (action === 'episode-rate') {
    if (!session) return err('Войдите в аккаунт.', 401)
    const animeId = String(body.animeId ?? '')
    const episode = Number(body.episode)
    const score = Number(body.score)
    if (!/^\d{1,10}$/.test(animeId)) return err('Неизвестный тайтл.', 400)
    if (!Number.isInteger(episode) || episode < 1 || episode > 5000) return err('Неверный номер серии.', 400)
    if (!Number.isInteger(score) || score < 0 || score > 5) return err('Оценка от 1 до 5.', 400)

    const voteId = `${session.user.$id}:${animeId}:${episode}`
    const prev = await env.DB.prepare('SELECT score FROM episode_votes WHERE id = ?').bind(voteId).first()
    const old = prev?.score ?? 0
    const now = Date.now()
    if (score === 0) {
      if (old) await env.DB.prepare('DELETE FROM episode_votes WHERE id = ?').bind(voteId).run()
    } else {
      await env.DB.prepare(
        `INSERT INTO episode_votes (id, user_id, anime_id, episode, score, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET score = excluded.score, created_at = excluded.created_at`,
      )
        .bind(voteId, session.user.$id, animeId, episode, score, now)
        .run()
    }

    const agg = await env.DB.prepare('SELECT sum, votes FROM episode_scores WHERE anime_id = ? AND episode = ?')
      .bind(animeId, episode)
      .first()
    const sum = Math.max(0, (agg?.sum ?? 0) - old + score)
    const votes = Math.max(0, (agg?.votes ?? 0) - (old ? 1 : 0) + (score ? 1 : 0))
    const avg = votes ? Math.round((sum / votes) * 100) / 100 : 0
    await env.DB.prepare(
      `INSERT INTO episode_scores (anime_id, episode, sum, votes, avg)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(anime_id, episode) DO UPDATE SET sum = excluded.sum, votes = excluded.votes, avg = excluded.avg`,
    )
      .bind(animeId, episode, sum, votes, avg)
      .run()
    return json({ score, avg, votes })
  }

  if (action === 'episode-my-rate') {
    const userId = session?.user?.$id
    if (!userId) return json({ score: 0 })
    const animeId = String(body.animeId ?? '')
    const episode = Number(body.episode)
    if (!/^\d{1,10}$/.test(animeId) || !Number.isInteger(episode)) return json({ score: 0 })
    const voteId = `${userId}:${animeId}:${episode}`
    const row = await env.DB.prepare('SELECT score FROM episode_votes WHERE id = ?').bind(voteId).first()
    return json({ score: row?.score ?? 0 })
  }

  if (action === 'activity-add') {
    if (!session) return err('Войдите.', 401)
    const kind = String(body.kind || '')
    if (!['status', 'rating', 'episode'].includes(kind)) return err('kind', 400)
    const anime = body.anime || {}
    const id = randomId(12)
    const now = Date.now()
    await env.DB.prepare(
      'INSERT INTO activity (id, user_id, kind, data, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(
        id,
        session.user.$id,
        kind,
        JSON.stringify({
          name: session.user.name || 'Зритель',
          animeId: String(anime.id || ''),
          title: String(anime.title || ''),
          poster: String(anime.poster || ''),
          value: Number(body.value) || 0,
          status: body.status,
        }).slice(0, 2000),
        now,
      )
      .run()
    return json({ ok: true })
  }

  return null
}
