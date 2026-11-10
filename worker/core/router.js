/**
 * AnimeLife Core API — замена Appwrite Cloud.
 * Нужны bindings: DB (D1), SESSIONS (KV).
 */

import { coreReady, err, handleAuth, json } from './auth.js'
import { handleLists } from './lists.js'
import { handleAction } from './actions.js'
import { handleCommunityGet } from './community.js'
import { handleRoomsGet } from './rooms.js'
import { handleSocialGet } from './social.js'

const PREFIX = '/api/core'

export const isCoreApi = (pathname) => pathname === PREFIX || pathname.startsWith(PREFIX + '/')

export async function coreApi(request, env) {
  if (!coreReady(env)) {
    return err('Core API не настроен: нужны D1 (DB) и KV (SESSIONS). См. worker/core/README.md', 503, 503)
  }

  const url = new URL(request.url)
  let path = url.pathname.slice(PREFIX.length) || '/'
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) })
  }

  let res
  try {
    if (path === '/health' || path === '/') {
      res = json({ ok: true, backend: 'core', time: Date.now() })
    } else if (path.startsWith('/auth/')) {
      res = await handleAuth(request, env, path)
    } else if (path.startsWith('/lists/')) {
      res = await handleLists(request, env, path)
    } else if (path === '/reviews' || path === '/comments') {
      res = (await handleCommunityGet(request, env, path)) || err('Not found', 404)
    } else if (path.startsWith('/rooms')) {
      res = (await handleRoomsGet(request, env, path)) || err('Not found', 404)
    } else if (path.startsWith('/social/')) {
      res = (await handleSocialGet(request, env, path)) || err('Not found', 404)
    } else if (path === '/action') {
      res = await handleAction(request, env)
    } else {
      res = err('Not found', 404)
    }
  } catch (e) {
    console.error('coreApi', e)
    res = err('Внутренняя ошибка Core', 500)
  }

  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(corsHeaders(request))) headers.set(k, v)
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
