/**
 * OAuth Shikimori — порт functions/community/src/social.js (shiki-*).
 */

import { err, json } from './auth.js'

const SHIKIMORI = 'https://shikimori.io'
const SHIKI_UA = 'Anime Life'
const ANIME_ID = /^\d{1,10}$/
const STATUSES = new Set(['watching', 'planned', 'completed', 'on_hold', 'dropped'])
const REDIRECT_RE =
  /^https:\/\/(www\.)?animelife\.top\/auth\/shikimori$|^http:\/\/localhost:\d+\/auth\/shikimori$/

function configured(env) {
  return !!(env.SHIKIMORI_CLIENT_ID && env.SHIKIMORI_CLIENT_SECRET)
}

function notConfigured() {
  return err('Синхронизация с Shikimori ещё не настроена на сервере.', 501, 501)
}

async function shikiToken(env, params) {
  const res = await fetch(`${SHIKIMORI}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': SHIKI_UA },
    body: new URLSearchParams({
      client_id: env.SHIKIMORI_CLIENT_ID ?? '',
      client_secret: env.SHIKIMORI_CLIENT_SECRET ?? '',
      ...params,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    return err('Shikimori не подтвердил вход. Попробуйте подключить ещё раз.', 400)
  }
  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expiresAt: ((data.created_at ?? Date.now() / 1000) + (data.expires_in ?? 86400)) * 1000,
  }
}

async function shikiApi(token, method, path, body) {
  const res = await fetch(SHIKIMORI + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': SHIKI_UA, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  })
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1000))
    return shikiApi(token, method, path, body)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) return err(`Shikimori ответил ошибкой ${res.status}.`, 502)
  return data
}

async function loadLink(env, userId) {
  const row = await env.DB.prepare('SELECT * FROM shiki_links WHERE user_id = ?').bind(userId).first()
  if (!row) return err('Shikimori не подключён.', 400)
  if (row.expires_at < Date.now() + 60_000) {
    const tokenRes = await shikiToken(env, { grant_type: 'refresh_token', refresh_token: row.refresh })
    if (tokenRes instanceof Response) return tokenRes
    await env.DB.prepare(
      'UPDATE shiki_links SET access = ?, refresh = ?, expires_at = ? WHERE user_id = ?',
    )
      .bind(tokenRes.access, tokenRes.refresh, tokenRes.expiresAt, userId)
      .run()
    return { ...row, access: tokenRes.access, refresh: tokenRes.refresh, expires_at: tokenRes.expiresAt }
  }
  return row
}

export async function handleShikiAction(env, session, body) {
  const action = body.action
  if (!action?.startsWith('shiki-')) return null

  if (action === 'shiki-status') {
    const userId = session?.user?.$id
    if (!userId) return json({ connected: false })
    const row = await env.DB.prepare('SELECT nickname FROM shiki_links WHERE user_id = ?').bind(userId).first()
    return row ? json({ connected: true, nickname: row.nickname }) : json({ connected: false })
  }

  if (!configured(env)) return notConfigured()
  if (!session) return err('Войдите в аккаунт.', 401)

  if (action === 'shiki-connect') {
    const redirectUri = String(body.redirectUri ?? '')
    if (!REDIRECT_RE.test(redirectUri)) return err('Неизвестный адрес возврата.', 400)
    const tokenRes = await shikiToken(env, {
      grant_type: 'authorization_code',
      code: String(body.code ?? ''),
      redirect_uri: redirectUri,
    })
    if (tokenRes instanceof Response) return tokenRes
    const me = await shikiApi(tokenRes.access, 'GET', '/api/users/whoami')
    if (me instanceof Response) return me
    const nickname = String(me.nickname ?? '').slice(0, 64)
    await env.DB.prepare(
      `INSERT INTO shiki_links (user_id, shiki_id, nickname, access, refresh, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         shiki_id = excluded.shiki_id, nickname = excluded.nickname,
         access = excluded.access, refresh = excluded.refresh, expires_at = excluded.expires_at`,
    )
      .bind(session.user.$id, me.id, nickname, tokenRes.access, tokenRes.refresh, tokenRes.expiresAt)
      .run()
    return json({ nickname })
  }

  if (action === 'shiki-disconnect') {
    await env.DB.prepare('DELETE FROM shiki_links WHERE user_id = ?').bind(session.user.$id).run()
    return json({ ok: true })
  }

  if (action === 'shiki-push') {
    const linkRes = await loadLink(env, session.user.$id)
    if (linkRes instanceof Response) return linkRes
    const link = linkRes
    const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10)
    const pause = () => new Promise((r) => setTimeout(r, 220))
    let sent = 0
    for (const it of items) {
      const targetId = String(it?.id ?? '')
      if (!ANIME_ID.test(targetId) || !STATUSES.has(it.status)) continue
      const rate = {
        status: it.status,
        episodes: Math.max(0, Math.min(5000, Number(it.episodes) || 0)),
        score: Math.max(0, Math.min(10, Number(it.score) || 0)),
      }
      const found = await shikiApi(
        link.access,
        'GET',
        `/api/v2/user_rates?user_id=${link.shiki_id}&target_id=${targetId}&target_type=Anime`,
      )
      if (found instanceof Response) return found
      await pause()
      if (found?.[0]?.id) {
        const patched = await shikiApi(link.access, 'PATCH', `/api/v2/user_rates/${found[0].id}`, { user_rate: rate })
        if (patched instanceof Response) return patched
      } else {
        const posted = await shikiApi(link.access, 'POST', '/api/v2/user_rates', {
          user_rate: { ...rate, user_id: link.shiki_id, target_id: Number(targetId), target_type: 'Anime' },
        })
        if (posted instanceof Response) return posted
      }
      await pause()
      sent++
    }
    return json({ sent, nickname: link.nickname })
  }

  return null
}
