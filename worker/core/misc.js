/**
 * Стена профиля, уведомления, приглашения, обращения (takedowns).
 */

import { err, json } from './auth.js'
import { randomId, sha256Hex } from './crypto.js'
import { heldReason, rejectSpam, UserError } from './automod.js'

const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/
const WALL_POSTS_PER_10MIN = 6
const WALL_MAX_TEXT = 500
const WALL_MIN_TEXT = 2
const NOTIF_KINDS = ['reply', 'review-like', 'ucol-like', 'follow', 'invite']
const KEEP_DAYS = 60
const NOTIF_LIMIT = 30
const CLAIM_DAYS = 7
const TD_KINDS = ['takedown', 'contact']
const TD_STATUSES = ['new', 'done', 'rejected']
const PER_IP_HOUR = 3
const PER_EMAIL_DAY = 5
const ALL_HOUR = 30
const HOUR = 3600 * 1000
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/

function isAdmin(user) {
  return (user?.labels || []).includes('admin')
}

function checkId(id, what = 'Запись') {
  const s = String(id ?? '')
  if (!ID.test(s)) throw new UserError(`${what} не найдена.`)
  return s
}

function wallText(value) {
  const s = String(value ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
  if (s.length < WALL_MIN_TEXT) throw new UserError(`Текст записи: хотя бы ${WALL_MIN_TEXT} символа.`)
  if (s.length > WALL_MAX_TEXT) throw new UserError(`Текст записи длиннее ${WALL_MAX_TEXT} символов.`)
  return s
}

const httpsUrl = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]{1,490}$/.test(u) ? u : '')

async function hash32(text) {
  return (await sha256Hex(text)).slice(0, 32)
}

async function notifyUser(env, { userId, kind, actor, text = '', link, key }) {
  if (!userId || userId === actor.$id || !NOTIF_KINDS.includes(kind)) return
  try {
    const id = `n${await hash32(`${kind}:${key}`)}`
    const data = JSON.stringify({
      actorId: actor.$id,
      actorName: (actor.name || 'Зритель').slice(0, 64),
      text: String(text).replace(/\s+/g, ' ').trim().slice(0, 200),
      link: String(link).slice(0, 300),
    })
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO notifications (id, user_id, kind, data, read, created_at)
       VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, read = 0, created_at = excluded.created_at`,
    )
      .bind(id, userId, kind, data, now)
      .run()
  } catch {
    // уведомление не критично
  }
}

function mapNotif(row) {
  let data = {}
  try {
    data = JSON.parse(row.data || '{}')
  } catch {
    data = {}
  }
  return {
    $id: row.id,
    kind: row.kind,
    actorId: data.actorId || '',
    actorName: data.actorName || 'Зритель',
    text: data.text || '',
    link: data.link || '',
    at: row.created_at,
    read: !!row.read,
  }
}

function mapWallRow(c, liked) {
  return {
    id: c.id,
    $id: c.id,
    profileId: c.profile_id,
    userId: c.user_id,
    name: c.name,
    avatarUrl: c.avatar_url || '',
    frame: c.frame || '',
    text: c.text,
    at: c.created_at,
    likes: c.likes ?? 0,
    liked,
    replyToName: c.reply_to_name || undefined,
    hidden: !!c.hidden,
  }
}

function field(v, max) {
  return String(v ?? '')
    .trim()
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, max + 1)
}

async function ipHash(env, request) {
  const ip = String(request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '')
    .split(',')[0]
    .trim()
  if (!ip) return null
  return sha256Hex(`${env.IP_HASH_SALT || ''}:${ip}`)
}

async function checkCaptcha(env, token) {
  const secret = env.TURNSTILE_SECRET
  if (!secret) return
  if (!token) throw new UserError('Подтвердите, что вы не робот.')
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: String(token) }),
  })
  const data = await res.json().catch(() => ({}))
  if (!data.success) throw new UserError('Проверка на робота не прошла. Попробуйте ещё раз.')
}

function mapTakedown(row) {
  let d = {}
  try {
    d = JSON.parse(row.data || '{}')
  } catch {
    d = {}
  }
  return {
    $id: row.id,
    kind: d.kind,
    name: d.name,
    email: d.email,
    links: d.links ?? null,
    message: d.message,
    status: row.status,
    createdAt: row.created_at,
    userId: d.userId ?? null,
  }
}

export async function handleMiscAction(env, session, body, request) {
  const action = body.action

  try {
    if (action === 'wall-list') {
      const target = checkId(body.profileId || body.targetUserId, 'Профиль')
      const limit = Math.max(1, Math.min(100, Number(body.limit) || 50))
      const rows = await env.DB.prepare(
        'SELECT * FROM profile_wall WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?',
      )
        .bind(target, limit)
        .all()
      const all = rows.results || []
      let likedSet = new Set()
      if (session) {
        const likes = await env.DB.prepare('SELECT comment_id FROM profile_wall_likes WHERE user_id = ? LIMIT 500')
          .bind(session.user.$id)
          .all()
        likedSet = new Set((likes.results || []).map((l) => l.comment_id))
      }
      const uid = session?.user?.$id
      const visible = all.filter((r) => !r.hidden || (uid && (r.user_id === uid || r.profile_id === uid)))
      return json({ comments: visible.map((c) => mapWallRow(c, likedSet.has(c.id))) })
    }

    if (action === 'wall-post') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const target = checkId(body.profileId || body.targetUserId, 'Профиль')
      const exists = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(target).first()
      if (!exists) throw new UserError('Профиль не найдена.')
      const content = wallText(body.text)
      const now = Date.now()
      const recent = await env.DB.prepare(
        'SELECT text FROM profile_wall WHERE user_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT ?',
      )
        .bind(session.user.$id, now - 10 * 60 * 1000, WALL_POSTS_PER_10MIN)
        .all()
      const recentTexts = (recent.results || []).map((r) => r.text)
      if (recentTexts.length >= WALL_POSTS_PER_10MIN) {
        throw new UserError('Слишком много записей подряд, передохните немного.')
      }
      rejectSpam(content, recentTexts)
      const held = heldReason(content)
      const hidden = held ? 1 : 0
      let avatarUrl = httpsUrl(body.avatarUrl) || ''
      let frame = typeof body.frame === 'string' ? body.frame.slice(0, 32) : ''
      const prof = await env.DB.prepare('SELECT summary FROM profiles WHERE user_id = ?').bind(session.user.$id).first()
      if (prof?.summary) {
        try {
          const summary = JSON.parse(prof.summary)
          if (summary?.style?.avatarUrl && !avatarUrl) avatarUrl = httpsUrl(summary.style.avatarUrl) || avatarUrl
          if (summary?.style?.frame && !frame) frame = String(summary.style.frame).slice(0, 32)
        } catch {
          // ignore
        }
      }
      const replyToName =
        typeof body.replyToName === 'string' && body.replyToName.trim()
          ? body.replyToName.trim().slice(0, 64)
          : body.replyTo && typeof body.replyTo === 'string'
            ? body.replyTo.trim().slice(0, 64)
            : null
      const id = randomId(12)
      const author = (session.user.name || 'Зритель').slice(0, 64)
      await env.DB.prepare(
        `INSERT INTO profile_wall (id, profile_id, user_id, name, avatar_url, frame, text, reply_to_name, likes, hidden, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
        .bind(id, target, session.user.$id, author, avatarUrl, frame, content, replyToName, hidden, now)
        .run()
      const comment = mapWallRow(
        {
          id,
          profile_id: target,
          user_id: session.user.$id,
          name: author,
          avatar_url: avatarUrl,
          frame,
          text: content,
          reply_to_name: replyToName,
          likes: 0,
          hidden,
          created_at: now,
        },
        false,
      )
      return json({ comment, ...(held ? { held } : {}) })
    }

    if (action === 'wall-delete') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const commentId = checkId(body.commentId || body.id, 'Запись')
      const comment = await env.DB.prepare('SELECT * FROM profile_wall WHERE id = ?').bind(commentId).first()
      if (!comment) throw new UserError('Запись не найдена.')
      const isAuthor = comment.user_id === session.user.$id
      const isOwner = comment.profile_id === session.user.$id
      if (!isAuthor && !isOwner && !isAdmin(session.user)) {
        throw new UserError('Удалить запись может только автор, владелец стены или администратор.')
      }
      await env.DB.prepare('DELETE FROM profile_wall WHERE id = ?').bind(commentId).run()
      await env.DB.prepare('DELETE FROM profile_wall_likes WHERE comment_id = ?').bind(commentId).run()
      return json({ ok: true })
    }

    if (action === 'wall-like') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const commentId = checkId(body.commentId || body.id, 'Запись')
      const comment = await env.DB.prepare('SELECT * FROM profile_wall WHERE id = ?').bind(commentId).first()
      if (!comment) throw new UserError('Запись не найдена.')
      const likeId = `l${await hash32(`${commentId}:${session.user.$id}`)}`
      const had = await env.DB.prepare('SELECT id FROM profile_wall_likes WHERE id = ?').bind(likeId).first()
      if (had) {
        await env.DB.prepare('DELETE FROM profile_wall_likes WHERE id = ?').bind(likeId).run()
      } else {
        await env.DB.prepare(
          'INSERT INTO profile_wall_likes (id, comment_id, user_id, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(likeId, commentId, session.user.$id, Date.now())
          .run()
      }
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM profile_wall_likes WHERE comment_id = ?')
        .bind(commentId)
        .first()
      const likes = count?.n || 0
      await env.DB.prepare('UPDATE profile_wall SET likes = ? WHERE id = ?').bind(likes, commentId).run()
      return json({ liked: !had, likes })
    }

    if (action === 'notif-list') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const items = await env.DB.prepare(
        'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
      )
        .bind(session.user.$id, NOTIF_LIMIT)
        .all()
      const all = (items.results || []).map(mapNotif)
      const cutoff = Date.now() - KEEP_DAYS * 86400_000
      const fresh = all.filter((n) => n.at >= cutoff)
      const stale = all.filter((n) => n.at < cutoff)
      await Promise.all(stale.map((n) => env.DB.prepare('DELETE FROM notifications WHERE id = ?').bind(n.$id).run()))
      return json({ items: fresh, unread: fresh.filter((n) => !n.read).length })
    }

    if (action === 'notif-read') {
      if (!session) return err('Войдите в аккаунт.', 401)
      await env.DB.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0')
        .bind(session.user.$id)
        .run()
      return json({ ok: true })
    }

    if (action === 'invite-stats') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM invites WHERE inviter_id = ?')
        .bind(session.user.$id)
        .first()
      const mine = await env.DB.prepare('SELECT user_id FROM invites WHERE user_id = ?')
        .bind(session.user.$id)
        .first()
      return json({ invited: count?.n || 0, invitedBy: !!mine })
    }

    if (action === 'invite-claim') {
      if (!session) return err('Войдите в аккаунт.', 401)
      const ref = String(body.ref ?? '')
      if (!ID.test(ref)) return json({ ok: false, reason: 'bad' })
      if (ref === session.user.$id) return json({ ok: false, reason: 'self' })
      const registered = Date.parse(session.user.registration ?? '')
      if (!Number.isFinite(registered) || Date.now() - registered > CLAIM_DAYS * 86400_000) {
        return json({ ok: false, reason: 'old' })
      }
      const already = await env.DB.prepare('SELECT user_id FROM invites WHERE user_id = ?')
        .bind(session.user.$id)
        .first()
      if (already) return json({ ok: false, reason: 'already' })
      const inviter = await env.DB.prepare('SELECT id, name, status FROM users WHERE id = ?').bind(ref).first()
      if (!inviter || !inviter.status) return json({ ok: false, reason: 'unknown' })
      const now = Date.now()
      await env.DB.prepare('INSERT INTO invites (user_id, inviter_id, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(session.user.$id, ref, (session.user.name || 'Зритель').slice(0, 64), now)
        .run()
      await notifyUser(env, {
        userId: ref,
        kind: 'invite',
        actor: session.user,
        link: '/account#invite',
        key: session.user.$id,
      })
      return json({ ok: true, inviter: (inviter.name || 'Зритель').slice(0, 64) })
    }

    if (action === 'takedown-create') {
      if (body.website) return json({ ok: true })
      const kind = TD_KINDS.includes(body.kind) ? body.kind : 'contact'
      const name = field(body.name, 200)
      const email = field(body.email, 254).toLowerCase()
      const links = field(body.links, 4000)
      const message = field(body.message, 5000)
      const MESSAGE_MIN = { takedown: 20, contact: 10 }
      if (name.length < 2) throw new UserError('Укажите имя или название организации.')
      if (name.length > 200) throw new UserError('Имя длиннее 200 символов.')
      if (email.length > 254 || !EMAIL.test(email)) throw new UserError('Проверьте адрес электронной почты.')
      if (links.length > 4000) throw new UserError('Ссылки длиннее 4000 символов: разбейте жалобу на несколько.')
      if (message.length < MESSAGE_MIN[kind]) {
        throw new UserError(`Опишите подробнее: хотя бы ${MESSAGE_MIN[kind]} символов.`)
      }
      if (message.length > 5000) throw new UserError('Текст длиннее 5000 символов.')
      if (kind === 'takedown') {
        if (!/animelife\.top/i.test(links)) {
          throw new UserError('Добавьте ссылки на страницы animelife.top, о которых жалоба.')
        }
        if (body.confirm !== true) {
          throw new UserError('Подтвердите, что вы правообладатель или его представитель.')
        }
      }
      const now = Date.now()
      const ip = request ? await ipHash(env, request) : null
      if (ip) {
        const n = await env.DB.prepare(
          `SELECT COUNT(*) AS c FROM takedowns
           WHERE json_extract(data, '$.ipHash') = ? AND created_at > ?`,
        )
          .bind(ip, now - HOUR)
          .first()
        if ((n?.c || 0) >= PER_IP_HOUR) {
          throw new UserError('Слишком много обращений подряд. Попробуйте через час.')
        }
      }
      const byEmail = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM takedowns
         WHERE json_extract(data, '$.email') = ? AND created_at > ?`,
      )
        .bind(email, now - 24 * HOUR)
        .first()
      if ((byEmail?.c || 0) >= PER_EMAIL_DAY) {
        throw new UserError('С этого адреса уже много обращений за сутки. Мы ответим на них, подождите немного.')
      }
      const all = await env.DB.prepare('SELECT COUNT(*) AS c FROM takedowns WHERE created_at > ?')
        .bind(now - HOUR)
        .first()
      if ((all?.c || 0) >= ALL_HOUR) {
        throw new UserError('Сейчас слишком много обращений. Попробуйте через час.')
      }
      await checkCaptcha(env, body.captcha)
      const id = randomId(12)
      const data = JSON.stringify({
        kind,
        name,
        email,
        links,
        message,
        ipHash: ip,
        userId: session?.user?.$id || null,
      })
      await env.DB.prepare('INSERT INTO takedowns (id, data, status, created_at) VALUES (?, ?, ?, ?)')
        .bind(id, data, 'new', now)
        .run()
      return json({ ok: true })
    }

    if (action === 'takedown-list') {
      if (!session) return err('Нужны права модератора.', 401)
      if (!isAdmin(session.user)) return err('Нужны права модератора.', 403)
      const status = body.status ?? 'new'
      if (status !== 'all' && !TD_STATUSES.includes(status)) throw new UserError('Неизвестный статус.')
      let rows
      if (status === 'all') {
        rows = await env.DB.prepare('SELECT * FROM takedowns ORDER BY created_at DESC LIMIT 100').all()
      } else {
        rows = await env.DB.prepare('SELECT * FROM takedowns WHERE status = ? ORDER BY created_at DESC LIMIT 100')
          .bind(status)
          .all()
      }
      return json({ takedowns: (rows.results || []).map(mapTakedown) })
    }

    if (action === 'takedown-status') {
      if (!session) return err('Нужны права модератора.', 401)
      if (!isAdmin(session.user)) return err('Нужны права модератора.', 403)
      const takedownId = String(body.takedownId ?? '')
      if (!/^[a-zA-Z0-9]{1,36}$/.test(takedownId)) throw new UserError('Обращение не найдено.')
      if (!TD_STATUSES.includes(body.status)) throw new UserError('Неизвестный статус.')
      const row = await env.DB.prepare('SELECT * FROM takedowns WHERE id = ?').bind(takedownId).first()
      if (!row) throw new UserError('Обращение не найдено.')
      await env.DB.prepare('UPDATE takedowns SET status = ? WHERE id = ?').bind(body.status, takedownId).run()
      return json({ takedown: mapTakedown({ ...row, status: body.status }) })
    }
  } catch (e) {
    if (e instanceof UserError) return err(e.message, 400)
    throw e
  }

  return null
}
