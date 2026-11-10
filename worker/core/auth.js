/**
 * Auth Core: email/пароль + cookie-сессия (KV + D1).
 * Совместимый с клиентом профиль: $id, email, name, prefs, labels, status.
 */

import { hashPassword, randomId, randomToken, sha256Hex, verifyPassword } from './crypto.js'
import { rateLimitIp } from './rateLimit.js'

const COOKIE = 'al_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const SESSION_TTL_S = Math.floor(SESSION_TTL_MS / 1000)

export function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  })
}

export function err(message, status = 400, code) {
  return json({ message, code: code ?? status }, status)
}

export function coreReady(env) {
  return !!(env?.DB && env?.SESSIONS)
}

function cookieOpts(token, maxAge) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', `Max-Age=${maxAge}`]
  return parts.join('; ')
}

export function readSessionToken(request) {
  const raw = request.headers.get('Cookie') || ''
  const m = raw.match(/(?:^|;\s*)al_session=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  const auth = request.headers.get('Authorization') || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  return ''
}

function publicUser(row) {
  let prefs = {}
  let labels = []
  try {
    prefs = JSON.parse(row.prefs || '{}')
  } catch {
    prefs = {}
  }
  try {
    labels = JSON.parse(row.labels || '[]')
  } catch {
    labels = []
  }
  return {
    $id: row.id,
    email: row.email,
    name: row.name || '',
    prefs,
    labels,
    status: !!row.status,
    emailVerification: !!row.email_verified,
    registration: new Date(row.created_at).toISOString(),
  }
}

async function putSession(env, token, userId, meta = {}) {
  const now = Date.now()
  const expires = now + SESSION_TTL_MS
  await env.SESSIONS.put(`s:${token}`, JSON.stringify({ userId, expires }), { expirationTtl: SESSION_TTL_S })
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip_hash) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(token, userId, now, expires, meta.ua?.slice(0, 200) || null, meta.ipHash || null)
    .run()
}

async function dropSession(env, token) {
  if (!token) return
  await env.SESSIONS.delete(`s:${token}`)
  await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(token).run()
}

export async function userFromRequest(env, request) {
  const token = readSessionToken(request)
  if (!token) return null
  const raw = await env.SESSIONS.get(`s:${token}`)
  if (!raw) return null
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!data?.userId || (data.expires && data.expires < Date.now())) {
    await dropSession(env, token)
    return null
  }
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(data.userId).first()
  if (!row || !row.status) return null
  return { user: publicUser(row), token, row }
}

async function bodyJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

function validEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128
}

export async function handleAuth(request, env, path) {
  const method = request.method.toUpperCase()

  if (path === '/auth/register' && method === 'POST') {
    const limited = await rateLimitIp(env, request, {
      key: 'auth-register',
      limit: 5,
      message: 'Слишком много попыток регистрации. Подождите минуту.',
    })
    if (limited) return limited
    const body = await bodyJson(request)
    if (!body || !validEmail(body.email) || !validPassword(body.password)) {
      return err('Нужны email и пароль (от 8 символов)', 400)
    }
    const email = String(body.email).trim().toLowerCase()
    const name = String(body.name || email.split('@')[0]).slice(0, 64)
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (exists) return err('Email уже занят', 409)
    const now = Date.now()
    const id = randomId(16)
    const password_hash = await hashPassword(body.password)
    await env.DB.prepare(
      'INSERT INTO users (id, email, name, password_hash, labels, prefs, status, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)',
    )
      .bind(id, email, name, password_hash, '[]', '{}', now, now)
      .run()
    await env.DB.prepare('INSERT INTO lists (user_id, data, updated_at) VALUES (?, ?, ?)').bind(id, '[]', now).run()
    const token = randomToken()
    const ip = request.headers.get('CF-Connecting-IP') || ''
    await putSession(env, token, id, {
      ua: request.headers.get('User-Agent') || '',
      ipHash: ip ? await sha256Hex(ip + (env.IP_HASH_SALT || '')) : null,
    })
    const user = publicUser({
      id,
      email,
      name,
      prefs: '{}',
      labels: '[]',
      status: 1,
      email_verified: 0,
      created_at: now,
    })
    return json({ user }, 201, { 'Set-Cookie': cookieOpts(token, SESSION_TTL_S) })
  }

  if (path === '/auth/login' && method === 'POST') {
    const limited = await rateLimitIp(env, request, {
      key: 'auth-login',
      limit: 5,
      message: 'Слишком много попыток входа. Подождите минуту.',
    })
    if (limited) return limited
    const body = await bodyJson(request)
    if (!body || !validEmail(body.email) || typeof body.password !== 'string') {
      return err('Нужны email и пароль', 400)
    }
    const email = String(body.email).trim().toLowerCase()
    const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!row || !(await verifyPassword(body.password, row.password_hash))) {
      return err('Неверный email или пароль', 401)
    }
    if (!row.status) return err('Аккаунт отключён', 403)
    const token = randomToken()
    const ip = request.headers.get('CF-Connecting-IP') || ''
    await putSession(env, token, row.id, {
      ua: request.headers.get('User-Agent') || '',
      ipHash: ip ? await sha256Hex(ip + (env.IP_HASH_SALT || '')) : null,
    })
    return json({ user: publicUser(row) }, 200, { 'Set-Cookie': cookieOpts(token, SESSION_TTL_S) })
  }

  if (path === '/auth/logout' && method === 'POST') {
    const token = readSessionToken(request)
    await dropSession(env, token)
    return json({ ok: true }, 200, { 'Set-Cookie': cookieOpts('', 0) })
  }

  if (path === '/auth/me' && method === 'GET') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Не авторизован', 401)
    return json({ user: session.user })
  }

  if (path === '/auth/prefs' && method === 'PUT') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Не авторизован', 401)
    const body = await bodyJson(request)
    if (!body || typeof body.prefs !== 'object' || body.prefs === null) return err('Нужен prefs', 400)
    const prefs = JSON.stringify(body.prefs).slice(0, 60_000)
    const now = Date.now()
    await env.DB.prepare('UPDATE users SET prefs = ?, updated_at = ? WHERE id = ?')
      .bind(prefs, now, session.user.$id)
      .run()
    return json({ user: { ...session.user, prefs: body.prefs } })
  }

  if (path === '/auth/profile' && method === 'PUT') {
    const session = await userFromRequest(env, request)
    if (!session) return err('Не авторизован', 401)
    const body = await bodyJson(request)
    const name = body?.name != null ? String(body.name).slice(0, 64) : session.user.name
    const now = Date.now()
    await env.DB.prepare('UPDATE users SET name = ?, updated_at = ? WHERE id = ?')
      .bind(name, now, session.user.$id)
      .run()
    return json({ user: { ...session.user, name } })
  }

  return err('Not found', 404)
}

export { COOKIE, publicUser, putSession, dropSession, SESSION_TTL_S, cookieOpts }
