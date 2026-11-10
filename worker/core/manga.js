/**
 * Собственные главы манги (переводы команд): D1 manga_chapters + R2 binding MANGA.
 * Картинки: GET /api/core/manga-img/<key>
 * R2 пока не подключён (биллинг из РФ) — без env.MANGA все /manga* → 503.
 */

import { err, json, userFromRequest } from './auth.js'
import { randomId } from './crypto.js'

const MAX_PAGES = 300
const MAX_BYTES = 15 * 1024 * 1024
const KEY_RE = /^mp\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9]{8,40}\.(jpe?g|png|webp|gif|avif)$/i
const MANGA_ID = /^\d{1,10}$/
const CHAPTER_ID = /^[A-Za-z0-9]{8,40}$/
const NUM_RE = /^\d{1,5}(\.\d{1,2})?$/

const MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
}

function canUpload(session) {
  const labels = session?.user?.labels || []
  return labels.includes('translator') || labels.includes('admin')
}

function parsePages(raw) {
  try {
    const j = JSON.parse(raw || '[]')
    if (Array.isArray(j)) return { team: '', keys: j.filter((k) => typeof k === 'string') }
    if (j && typeof j === 'object' && Array.isArray(j.keys)) {
      return { team: typeof j.team === 'string' ? j.team : '', keys: j.keys.filter((k) => typeof k === 'string') }
    }
  } catch {
    /* */
  }
  return { team: '', keys: [] }
}

function encodePages(team, keys) {
  return JSON.stringify({ team: team || '', keys })
}

function imgUrl(request, key) {
  const origin = new URL(request.url).origin
  return `${origin}/api/core/manga-img/${encodeURIComponent(key)}`
}

function chapterDto(request, row) {
  const { team, keys } = parsePages(row.pages)
  return {
    id: row.id,
    mangaId: row.manga_id,
    lang: row.lang,
    num: row.num,
    title: row.title || null,
    team,
    pages: keys,
    pageUrls: keys.map((k) => imgUrl(request, k)),
    userId: row.uploader_id,
    createdAt: row.created_at,
  }
}

function extFor(file) {
  const t = (file.type || '').toLowerCase()
  if (MIME[t]) return MIME[t]
  const n = file.name || ''
  const m = n.match(/\.(jpe?g|png|webp|gif|avif)$/i)
  if (m) {
    const e = m[1].toLowerCase()
    return '.' + (e === 'jpeg' ? 'jpg' : e)
  }
  return '.jpg'
}

function validKey(key, userId) {
  if (!KEY_RE.test(key)) return false
  return key.startsWith(`mp/${userId}/`)
}

export async function serveMangaImage(request, env, keyEnc) {
  if (!env?.MANGA) return err('Свои главы манги временно отключены (нет R2)', 503, 503)
  let key
  try {
    key = decodeURIComponent(keyEnc)
  } catch {
    return err('Bad key', 400)
  }
  if (!KEY_RE.test(key)) return err('Not found', 404)
  const obj = await env.MANGA.get(key)
  if (!obj) return err('Not found', 404)
  const type = obj.httpMetadata?.contentType || 'image/jpeg'
  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}

export async function handleManga(request, env, path) {
  if (!env?.MANGA) {
    if (path.startsWith('/manga-img/') || path.startsWith('/manga')) {
      return err('Свои главы манги временно отключены (нет R2)', 503, 503)
    }
    return null
  }

  if (path.startsWith('/manga-img/')) {
    if (request.method !== 'GET') return err('Method not allowed', 405)
    return serveMangaImage(request, env, path.slice('/manga-img/'.length))
  }

  if (path === '/manga/chapters' && request.method === 'GET') {
    const mangaId = String(new URL(request.url).searchParams.get('mangaId') || '')
    if (!MANGA_ID.test(mangaId)) return err('mangaId', 400)
    const rows = await env.DB.prepare(
      'SELECT * FROM manga_chapters WHERE manga_id = ? ORDER BY CAST(num AS REAL), num LIMIT 1000',
    )
      .bind(mangaId)
      .all()
    return json({ chapters: (rows.results || []).map((r) => chapterDto(request, r)) })
  }

  const chMatch = path.match(/^\/manga\/chapters\/([^/]+)$/)
  if (chMatch && request.method === 'GET') {
    const id = chMatch[1]
    if (!CHAPTER_ID.test(id)) return err('Not found', 404)
    const row = await env.DB.prepare('SELECT * FROM manga_chapters WHERE id = ?').bind(id).first()
    if (!row) return err('Not found', 404)
    return json({ chapter: chapterDto(request, row) })
  }

  if (path === '/manga/page' && request.method === 'POST') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Войдите в аккаунт', 401, 401)
    if (!canUpload(session)) return err('Нет прав translator/admin', 403, 403)
    let form
    try {
      form = await request.formData()
    } catch {
      return err('multipart', 400)
    }
    const file = form.get('file')
    if (!file || typeof file === 'string') return err('file', 400)
    if (file.size > MAX_BYTES) return err(`Файл больше ${MAX_BYTES / (1024 * 1024)} МБ`, 400)
    const ctype = (file.type || '').toLowerCase()
    if (ctype && !MIME[ctype]) return err('Тип файла не поддерживается', 400)
    const ext = extFor(file)
    const key = `mp/${session.user.$id}/${randomId(16)}${ext}`
    await env.MANGA.put(key, file.stream(), {
      httpMetadata: { contentType: file.type || 'image/jpeg' },
    })
    return json({ key })
  }

  const pageDel = path.match(/^\/manga\/page\/([^/]+)$/)
  if (pageDel && request.method === 'DELETE') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Войдите в аккаунт', 401, 401)
    if (!canUpload(session)) return err('Нет прав', 403, 403)
    let key
    try {
      key = decodeURIComponent(pageDel[1])
    } catch {
      return err('key', 400)
    }
    const admin = (session.user.labels || []).includes('admin')
    if (!validKey(key, session.user.$id) && !admin) return err('Not found', 404)
    await env.MANGA.delete(key).catch(() => undefined)
    return json({ ok: true })
  }

  if (path === '/manga/chapters' && request.method === 'POST') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Войдите в аккаунт', 401, 401)
    if (!canUpload(session)) return err('Нет прав translator/admin', 403, 403)
    let body
    try {
      body = await request.json()
    } catch {
      return err('JSON', 400)
    }
    const mangaId = String(body.mangaId || '')
    const lang = String(body.lang || 'ru').slice(0, 8)
    const num = String(body.num || '').trim().replace(',', '.')
    const title = body.title != null && body.title !== '' ? String(body.title).slice(0, 200) : null
    const team = String(body.team || '').trim().slice(0, 100)
    const pages = Array.isArray(body.pages) ? body.pages.map(String) : []
    if (!MANGA_ID.test(mangaId)) return err('mangaId', 400)
    if (!NUM_RE.test(num)) return err('num', 400)
    if (!team) return err('team', 400)
    if (!pages.length || pages.length > MAX_PAGES) return err('pages', 400)
    for (const k of pages) {
      if (!validKey(k, session.user.$id)) return err('pages: чужой или неверный ключ', 400)
    }
    const id = randomId(16)
    const now = Date.now()
    await env.DB.prepare(
      'INSERT INTO manga_chapters (id, manga_id, num, lang, title, pages, uploader_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, mangaId, num, lang, title, encodePages(team, pages), session.user.$id, now)
      .run()
    const row = await env.DB.prepare('SELECT * FROM manga_chapters WHERE id = ?').bind(id).first()
    return json({ chapter: chapterDto(request, row) }, 201)
  }

  return null
}
