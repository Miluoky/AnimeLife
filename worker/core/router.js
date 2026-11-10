/**
 * AnimeLife Core API — замена Appwrite Cloud.
 * Нужны bindings: DB (D1), SESSIONS (KV).
 */

import { coreReady, err, handleAuth, json } from './auth.js'
import { handleOAuth } from './oauth.js'
import { handleLists } from './lists.js'
import { handleAction } from './actions.js'
import { handleCommunityGet } from './community.js'
import { handleRoomsGet } from './rooms.js'
import { handleSocialGet } from './social.js'
import { handleManga } from './manga.js'
import { handleChatGet } from './chat.js'
import { handleClubsGet } from './clubs.js'
import { userFromRequest } from './auth.js'
import { upgradeRoomSocket } from './roomDo.js'
import { ensureMigrations } from './migrate.js'

const PREFIX = '/api/core'

/** Short browser/CDN cache for safe Core GET JSON (Worker Free — repeat-hit relief). */
export function coreCacheHeaders(maxAgeSeconds, { visibility = 'private', varyCookie = false } = {}) {
  const max = Math.max(0, Math.floor(Number(maxAgeSeconds) || 0))
  const headers = { 'Cache-Control': `${visibility}, max-age=${max}` }
  if (varyCookie) headers.Vary = 'Cookie'
  return headers
}

export const isCoreApi = (pathname) => pathname === PREFIX || pathname.startsWith(PREFIX + '/')

export async function coreApi(request, env) {
  if (!coreReady(env)) {
    return err('Core API не настроен: нужны D1 (DB) и KV (SESSIONS). См. worker/core/README.md', 503, 503)
  }

  await ensureMigrations(env)

  const url = new URL(request.url)
  let path = url.pathname.slice(PREFIX.length) || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  let res
  try {
    if (path === '/health' || path === '/') {
      const time = Date.now()
      let d1 = false
      let kv = false
      try {
        const row = await env.DB.prepare('SELECT 1 AS ok').first()
        d1 = row?.ok === 1
      } catch (e) {
        console.error('health d1', e)
      }
      try {
        const probe = `health:probe:${time}`
        await env.SESSIONS.put(probe, '1', { expirationTtl: 60 })
        kv = (await env.SESSIONS.get(probe)) === '1'
        await env.SESSIONS.delete(probe)
      } catch (e) {
        console.error('health kv', e)
      }
      res = json({ ok: d1 && kv, backend: 'core', d1, kv, time })
    } else if (path.startsWith('/auth/oauth')) {
      res = await handleOAuth(request, env, path)
    } else if (path.startsWith('/auth/')) {
      res = await handleAuth(request, env, path)
    } else if (path.startsWith('/lists/')) {
      res = await handleLists(request, env, path)
    } else if (path === '/reviews' || path === '/comments') {
      res = (await handleCommunityGet(request, env, path)) || err('Not found', 404)
    } else if (/^\/rooms\/[A-Za-z0-9]{6}\/ws$/.test(path)) {
      const code = path.split('/')[2]
      const session = await userFromRequest(env, request)
      const upgraded = await upgradeRoomSocket(request, env, code, session)
      if (upgraded) return upgraded
      res = err('WebSocket комнат недоступен (нет ROOMS / Durable Objects).', 501, 501)
    } else if (path.startsWith('/rooms')) {
      res = (await handleRoomsGet(request, env, path)) || err('Not found', 404)
    } else if (path === '/chat') {
      res = (await handleChatGet(request, env, path)) || err('Not found', 404)
    } else if (path.startsWith('/social/')) {
      res = (await handleSocialGet(request, env, path)) || err('Not found', 404)
    } else if (path === '/clubs' || path.startsWith('/clubs/')) {
      res = (await handleClubsGet(request, env, path)) || err('Not found', 404)
    } else if (path === '/collections') {
      res = (await handleClubsGet(request, env, path)) || err('Not found', 404)
    } else if (path === '/action') {
      res = await handleAction(request, env)
    } else if (path.startsWith('/manga-img/') || path.startsWith('/manga')) {
      res = (await handleManga(request, env, path)) || err('Not found', 404)
    } else {
      res = err('Not found', 404)
    }
  } catch (e) {
    console.error('coreApi', e)
    res = err('Внутренняя ошибка Core', 500)
  }

  const headers = new Headers(res.headers)
  const cors = corsHeaders(request)
  for (const [k, v] of Object.entries(cors)) {
    if (k === 'Vary' && headers.has('Vary')) {
      const merged = new Set(
        `${headers.get('Vary')},${v}`
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
      headers.set('Vary', [...merged].join(', '))
    } else headers.set(k, v)
  }
  return new Response(res.body, { status: res.status, headers })
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || ''
  const allow =
    /^https:\/\/(www\.)?animelife\.top$/.test(origin) ||
    /^https:\/\/[^/]+\.pages\.dev$/.test(origin) ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin)
  if (!allow) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}
