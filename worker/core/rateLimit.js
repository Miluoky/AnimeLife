/**
 * Простой счётчик запросов по IP в KV (SESSIONS): защита login/register и пакетов аналитики.
 */

import { err } from './auth.js'

const MINUTE = 60_000

export function clientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    ''
  )
}

/** null — ок; иначе Response 429. */
export async function rateLimitIp(env, request, { key, limit, windowMs = MINUTE, message }) {
  const ip = clientIp(request)
  if (!ip) return null
  const bucket = `rl:${key}:${ip}`
  const now = Date.now()
  let n = 0
  let reset = now + windowMs
  try {
    const raw = await env.SESSIONS.get(bucket)
    if (raw) {
      const data = JSON.parse(raw)
      if (Number(data.reset) > now) {
        n = Math.max(0, Number(data.n) || 0)
        reset = Number(data.reset)
      }
    }
    n += 1
    const ttl = Math.max(60, Math.ceil((reset - now) / 1000))
    await env.SESSIONS.put(bucket, JSON.stringify({ n, reset }), { expirationTtl: ttl })
    if (n > limit) {
      return err(message || 'Слишком много запросов с этого адреса. Подождите минуту.', 429, 429)
    }
  } catch (e) {
    console.error('rateLimitIp', key, e)
  }
  return null
}

/** Мягкий лимит: true, если пакет нужно принять без обработки (не тратить D1). */
export async function analyticsOverCap(env, request, limit = 60, windowMs = MINUTE) {
  const ip = clientIp(request)
  if (!ip) return false
  const bucket = `rl:analytics:${ip}`
  const now = Date.now()
  let n = 0
  let reset = now + windowMs
  try {
    const raw = await env.SESSIONS.get(bucket)
    if (raw) {
      const data = JSON.parse(raw)
      if (Number(data.reset) > now) {
        n = Math.max(0, Number(data.n) || 0)
        reset = Number(data.reset)
      }
    }
    n += 1
    const ttl = Math.max(60, Math.ceil((reset - now) / 1000))
    await env.SESSIONS.put(bucket, JSON.stringify({ n, reset }), { expirationTtl: ttl })
    return n > limit
  } catch (e) {
    console.error('analyticsOverCap', e)
    return false
  }
}
