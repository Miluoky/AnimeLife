/**
 * Клубы и подборки зрителей — бывший social.js (club-*, ucol-*).
 */

import { err, json } from './auth.js'
import { randomId, sha256Hex } from './crypto.js'

const MAX_COLLECTIONS = 20
const MAX_COLLECTION_ITEMS = 100
const MAX_CLUBS_PER_USER = 3
const POSTS_PER_MINUTE = 5
const REPORTS_TO_HIDE = 3
const ID = /^[a-zA-Z0-9._-]{1,36}$/
const ANIME_ID = /^\d{1,10}$/

function isAdmin(session) {
  return (session?.user?.labels || []).includes('admin')
}

function nameOf(session) {
  return (session.user.name || 'Зритель').slice(0, 64)
}

function checkId(id, what = 'Запись') {
  const s = String(id ?? '')
  if (!ID.test(s)) throw new UserError(`${what} не найдена.`)
  return s
}

class UserError extends Error {
  constructor(message) {
    super(message)
    this.userMessage = message
  }
}

function userErr(e) {
  if (e instanceof UserError) return err(e.userMessage, 400)
  throw e
}

function text(value, max, min = 1, what = 'Текст') {
  const s = String(value ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (s.length < min) {
    throw new UserError(min > 1 ? `${what}: хотя бы ${min} символа.` : `${what} пустой.`)
  }
  if (s.length > max) throw new UserError(`${what} длиннее ${max} символов.`)
  return s
}

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{1,490}$/.test(u) ? u : '')

async function memberId(clubId, userId) {
  return `m${(await sha256Hex(`${clubId}:${userId}`)).slice(0, 24)}`
}

async function likeId(collectionId, userId) {
  return `l${(await sha256Hex(`${collectionId}:${userId}`)).slice(0, 24)}`
}

function rowClub(r) {
  if (!r) return null
  return {
    $id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    title: r.title,
    about: r.about || '',
    members: r.members ?? 0,
    posts: r.posts ?? 0,
    at: r.created_at,
    lastAt: r.last_at,
  }
}

function rowCollection(r) {
  if (!r) return null
  return {
    $id: r.id,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    title: r.title,
    about: r.about || '',
    items: r.items || '[]',
    count: r.count ?? 0,
    cover: r.cover || undefined,
    likes: r.likes ?? 0,
    updatedAt: r.updated_at,
  }
}

function rowPost(r) {
  return {
    $id: r.id,
    clubId: r.club_id,
    userId: r.user_id,
    name: r.author_name,
    text: r.text,
    at: r.created_at,
    hidden: !!r.hidden,
  }
}

function cleanItems(items) {
  if (!Array.isArray(items)) throw new UserError('Неверный список тайтлов.')
  const seen = new Set()
  const out = []
  for (const it of items) {
    const id = String(it?.id ?? '')
    if (!ANIME_ID.test(id) || seen.has(id)) continue
    seen.add(id)
    out.push({
      id,
      title: String(it.title ?? '').slice(0, 200),
      poster: httpsUrl(it.poster),
      year: Number.isInteger(it.year) ? it.year : undefined,
      kind: typeof it.kind === 'string' ? it.kind.slice(0, 20) : undefined,
      note: typeof it.note === 'string' ? it.note.trim().slice(0, 200) : undefined,
    })
    if (out.length > MAX_COLLECTION_ITEMS) {
      throw new UserError(`В подборке не больше ${MAX_COLLECTION_ITEMS} тайтлов.`)
    }
  }
  return out
}

export async function handleClubsGet(request, env, path) {
  const url = new URL(request.url)

  if (path === '/clubs' && request.method === 'GET') {
    const id = String(url.searchParams.get('id') || '')
    if (id) {
      if (!ID.test(id)) return err('Клуб не найден.', 404)
      const row = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(id).first()
      if (!row) return err('Клуб не найден.', 404)
      return json({ club: rowClub(row) })
    }
    const order = url.searchParams.get('order') === 'big' ? 'members' : 'last_at'
    const res = await env.DB.prepare(`SELECT * FROM clubs ORDER BY ${order} DESC LIMIT 60`).all()
    return json({ clubs: (res.results || []).map(rowClub) })
  }

  if (path === '/clubs/posts' && request.method === 'GET') {
    const clubId = String(url.searchParams.get('clubId') || '')
    if (!clubId) return err('clubId', 400)
    const res = await env.DB.prepare(
      'SELECT * FROM club_posts WHERE club_id = ? AND hidden = 0 ORDER BY created_at DESC LIMIT 100',
    )
      .bind(clubId)
      .all()
    return json({ posts: (res.results || []).map(rowPost) })
  }

  if (path === '/clubs/member' && request.method === 'GET') {
    const userId = String(url.searchParams.get('userId') || '')
    if (!userId) return err('userId', 400)
    const res = await env.DB.prepare('SELECT club_id FROM club_members WHERE user_id = ? LIMIT 200')
      .bind(userId)
      .all()
    return json({ ids: (res.results || []).map((r) => r.club_id) })
  }

  if (path === '/collections' && request.method === 'GET') {
    const id = String(url.searchParams.get('id') || '')
    if (id) {
      if (!ID.test(id)) return err('Подборка не найдена.', 404)
      const row = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?').bind(id).first()
      if (!row) return err('Подборка не найдена.', 404)
      return json({ collection: rowCollection(row) })
    }
    const order = url.searchParams.get('order') === 'new' ? 'updated_at' : 'likes'
    const ownerId = url.searchParams.get('ownerId')
    let res
    if (ownerId) {
      res = await env.DB.prepare(
        `SELECT * FROM user_collections WHERE hidden = 0 AND owner_id = ? ORDER BY ${order} DESC LIMIT 48`,
      )
        .bind(ownerId)
        .all()
    } else {
      res = await env.DB.prepare(
        `SELECT * FROM user_collections WHERE hidden = 0 ORDER BY ${order} DESC LIMIT 48`,
      ).all()
    }
    return json({ collections: (res.results || []).map(rowCollection) })
  }

  return null
}

async function updateMembers(env, clubId) {
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_members WHERE club_id = ?')
    .bind(clubId)
    .first()
  const members = count?.n || 0
  await env.DB.prepare('UPDATE clubs SET members = ? WHERE id = ?').bind(members, clubId).run()
  return members
}

export async function handleClubsAction(env, session, body) {
  const action = body.action
  if (!action?.startsWith('club-') && !action?.startsWith('ucol-')) return null

  try {
    if (action === 'ucol-save') {
      if (!session) return err('Войдите, чтобы собирать подборки.', 401)
      const title = text(body.title, 80, 3, 'Название')
      const about = text(body.about ?? ' ', 500, 0, 'Описание')
      const items = cleanItems(body.items)
      if (!items.length) throw new UserError('Добавьте хотя бы один тайтл.')
      const now = Date.now()
      const ownerName = nameOf(session)
      const itemsJson = JSON.stringify(items)
      const cover = items[0].poster || null
      if (body.id) {
        const prev = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?')
          .bind(checkId(body.id, 'Подборка'))
          .first()
        if (!prev) throw new UserError('Подборка не найдена.')
        if (prev.owner_id !== session.user.$id) throw new UserError('Менять подборку может только её автор.')
        await env.DB.prepare(
          `UPDATE user_collections SET title = ?, about = ?, items = ?, count = ?, cover = ?, owner_name = ?, updated_at = ?
           WHERE id = ?`,
        )
          .bind(title, about, itemsJson, items.length, cover, ownerName, now, prev.id)
          .run()
        const row = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?').bind(prev.id).first()
        return json({ collection: rowCollection(row) })
      }
      const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM user_collections WHERE owner_id = ?')
        .bind(session.user.$id)
        .first()
      if ((n?.c || 0) >= MAX_COLLECTIONS) {
        throw new UserError(`Не больше ${MAX_COLLECTIONS} подборок у одного человека.`)
      }
      const id = randomId(12)
      await env.DB.prepare(
        `INSERT INTO user_collections (id, owner_id, owner_name, title, about, items, count, cover, likes, hidden, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
      )
        .bind(id, session.user.$id, ownerName, title, about, itemsJson, items.length, cover, now, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?').bind(id).first()
      return json({ collection: rowCollection(row) })
    }

    if (action === 'ucol-delete') {
      if (!session) return err('Войдите.', 401)
      const prev = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?')
        .bind(checkId(body.id, 'Подборка'))
        .first()
      if (!prev) throw new UserError('Подборка не найдена.')
      if (prev.owner_id !== session.user.$id && !isAdmin(session)) {
        throw new UserError('Удалить подборку может только её автор.')
      }
      await env.DB.prepare('DELETE FROM user_collections WHERE id = ?').bind(prev.id).run()
      await env.DB.prepare('DELETE FROM collection_likes WHERE collection_id = ?').bind(prev.id).run()
      return json({ ok: true })
    }

    if (action === 'ucol-like') {
      if (!session) return err('Войдите, чтобы ставить лайки.', 401)
      const col = await env.DB.prepare('SELECT * FROM user_collections WHERE id = ?')
        .bind(checkId(body.id, 'Подборка'))
        .first()
      if (!col) throw new UserError('Подборка не найдена.')
      const lid = await likeId(col.id, session.user.$id)
      const had = await env.DB.prepare('SELECT id FROM collection_likes WHERE id = ?').bind(lid).first()
      const now = Date.now()
      if (had) {
        await env.DB.prepare('DELETE FROM collection_likes WHERE id = ?').bind(lid).run()
      } else {
        await env.DB.prepare(
          'INSERT INTO collection_likes (id, collection_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(lid, col.id, session.user.$id, now)
          .run()
      }
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM collection_likes WHERE collection_id = ?')
        .bind(col.id)
        .first()
      const likes = count?.n || 0
      await env.DB.prepare('UPDATE user_collections SET likes = ? WHERE id = ?').bind(likes, col.id).run()
      return json({ liked: !had, likes })
    }

    if (action === 'ucol-my-likes') {
      if (!session) return err('Войдите.', 401)
      const res = await env.DB.prepare('SELECT collection_id FROM collection_likes WHERE user_id = ? LIMIT 500')
        .bind(session.user.$id)
        .all()
      return json({ liked: (res.results || []).map((r) => r.collection_id) })
    }

    if (action === 'club-create') {
      if (!session) return err('Войдите, чтобы создавать клубы.', 401)
      const title = text(body.title, 60, 3, 'Название')
      const about = text(body.about ?? ' ', 500, 0, 'Описание')
      const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM clubs WHERE owner_id = ?')
        .bind(session.user.$id)
        .first()
      if ((n?.c || 0) >= MAX_CLUBS_PER_USER && !isAdmin(session)) {
        throw new UserError(`Не больше ${MAX_CLUBS_PER_USER} клубов у одного человека.`)
      }
      const now = Date.now()
      const id = randomId(12)
      const ownerName = nameOf(session)
      await env.DB.prepare(
        `INSERT INTO clubs (id, owner_id, owner_name, title, about, members, posts, created_at, last_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      )
        .bind(id, session.user.$id, ownerName, title, about, now, now)
        .run()
      const mid = await memberId(id, session.user.$id)
      await env.DB.prepare('INSERT INTO club_members (id, club_id, user_id, created_at) VALUES (?, ?, ?, ?)')
        .bind(mid, id, session.user.$id, now)
        .run()
      const row = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?').bind(id).first()
      return json({ club: rowClub(row) })
    }

    if (action === 'club-delete') {
      if (!session) return err('Войдите.', 401)
      const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?')
        .bind(checkId(body.clubId, 'Клуб'))
        .first()
      if (!club) throw new UserError('Клуб не найден.')
      if (club.owner_id !== session.user.$id && !isAdmin(session)) {
        throw new UserError('Удалить клуб может только его создатель.')
      }
      await env.DB.prepare('DELETE FROM clubs WHERE id = ?').bind(club.id).run()
      await env.DB.prepare('DELETE FROM club_posts WHERE club_id = ?').bind(club.id).run()
      await env.DB.prepare('DELETE FROM club_members WHERE club_id = ?').bind(club.id).run()
      return json({ ok: true })
    }

    if (action === 'club-join') {
      if (!session) return err('Войдите, чтобы вступать в клубы.', 401)
      const club = await env.DB.prepare('SELECT id FROM clubs WHERE id = ?')
        .bind(checkId(body.clubId, 'Клуб'))
        .first()
      if (!club) throw new UserError('Клуб не найден.')
      const mid = await memberId(club.id, session.user.$id)
      try {
        await env.DB.prepare('INSERT INTO club_members (id, club_id, user_id, created_at) VALUES (?, ?, ?, ?)')
          .bind(mid, club.id, session.user.$id, Date.now())
          .run()
      } catch {
        // уже участник
      }
      const members = await updateMembers(env, club.id)
      return json({ ok: true, members })
    }

    if (action === 'club-leave') {
      if (!session) return err('Войдите.', 401)
      const club = await env.DB.prepare('SELECT * FROM clubs WHERE id = ?')
        .bind(checkId(body.clubId, 'Клуб'))
        .first()
      if (!club) throw new UserError('Клуб не найден.')
      if (club.owner_id === session.user.$id) {
        throw new UserError('Создатель не может выйти из своего клуба, только удалить его.')
      }
      const mid = await memberId(club.id, session.user.$id)
      await env.DB.prepare('DELETE FROM club_members WHERE id = ?').bind(mid).run()
      const members = await updateMembers(env, club.id)
      return json({ ok: true, members })
    }

    if (action === 'club-post') {
      if (!session) return err('Войдите, чтобы писать в клуб.', 401)
      const club = await env.DB.prepare('SELECT id FROM clubs WHERE id = ?')
        .bind(checkId(body.clubId, 'Клуб'))
        .first()
      if (!club) throw new UserError('Клуб не найден.')
      const mid = await memberId(club.id, session.user.$id)
      const member = await env.DB.prepare('SELECT id FROM club_members WHERE id = ?').bind(mid).first()
      if (!member) throw new UserError('Вступите в клуб, чтобы писать.')
      const message = text(body.text, 2000, 2, 'Сообщение')
      const now = Date.now()
      const recent = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM club_posts WHERE user_id = ? AND created_at > ?',
      )
        .bind(session.user.$id, now - 60_000)
        .first()
      if ((recent?.n || 0) >= POSTS_PER_MINUTE) {
        throw new UserError('Не так быстро: подождите минуту.')
      }
      const postId = randomId(12)
      await env.DB.prepare(
        `INSERT INTO club_posts (id, club_id, user_id, author_name, text, hidden, reports, created_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?)`,
      )
        .bind(postId, club.id, session.user.$id, nameOf(session), message, now)
        .run()
      const postCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_posts WHERE club_id = ?')
        .bind(club.id)
        .first()
      const posts = postCount?.n || 0
      await env.DB.prepare('UPDATE clubs SET posts = ?, last_at = ? WHERE id = ?')
        .bind(posts, now, club.id)
        .run()
      const row = await env.DB.prepare('SELECT * FROM club_posts WHERE id = ?').bind(postId).first()
      return json({ post: rowPost(row) })
    }

    if (action === 'club-post-delete') {
      if (!session) return err('Войдите.', 401)
      const post = await env.DB.prepare('SELECT * FROM club_posts WHERE id = ?')
        .bind(checkId(body.postId, 'Запись'))
        .first()
      if (!post) throw new UserError('Запись не найдена.')
      if (post.user_id !== session.user.$id && !isAdmin(session)) {
        const club = await env.DB.prepare('SELECT owner_id FROM clubs WHERE id = ?').bind(post.club_id).first()
        if (club?.owner_id !== session.user.$id) {
          throw new UserError('Удалить запись может автор, создатель клуба или модератор.')
        }
      }
      await env.DB.prepare('DELETE FROM club_posts WHERE id = ?').bind(post.id).run()
      await env.DB.prepare('DELETE FROM votes WHERE target_id = ? AND kind = ?')
        .bind(post.id, 'club-report')
        .run()
      const postCount = await env.DB.prepare('SELECT COUNT(*) AS n FROM club_posts WHERE club_id = ?')
        .bind(post.club_id)
        .first()
      await env.DB.prepare('UPDATE clubs SET posts = ? WHERE id = ?')
        .bind(postCount?.n || 0, post.club_id)
        .run()
      return json({ ok: true })
    }

    if (action === 'club-post-report') {
      if (!session) return err('Войдите, чтобы жаловаться.', 401)
      const post = await env.DB.prepare('SELECT * FROM club_posts WHERE id = ?')
        .bind(checkId(body.postId, 'Запись'))
        .first()
      if (!post) throw new UserError('Запись не найдена.')
      if (post.user_id === session.user.$id) throw new UserError('На свою запись жаловаться нельзя.')
      const voteId = `${session.user.$id}:club-report:${post.id}`
      if (await env.DB.prepare('SELECT id FROM votes WHERE id = ?').bind(voteId).first()) {
        return json({ ok: true, already: true })
      }
      await env.DB.prepare('INSERT INTO votes (id, user_id, target_id, kind, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(voteId, session.user.$id, post.id, 'club-report', Date.now())
        .run()
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM votes WHERE target_id = ? AND kind = ?')
        .bind(post.id, 'club-report')
        .first()
      const reports = count?.n || 0
      const hidden = post.hidden || reports >= REPORTS_TO_HIDE
      await env.DB.prepare('UPDATE club_posts SET reports = ?, hidden = ? WHERE id = ?')
        .bind(reports, hidden ? 1 : 0, post.id)
        .run()
      return json({ ok: true, hidden: !!hidden })
    }
  } catch (e) {
    return userErr(e)
  }

  return null
}
