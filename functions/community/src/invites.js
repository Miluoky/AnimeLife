import { DB, UserError, query } from './util.js'
import { notify } from './notifications.js'

/**
 * «Позови друга»: ссылка animelife.top/?ref=<ID пригласившего>.
 *   invite-claim {ref}  новый аккаунт (не старше CLAIM_DAYS дней) называет, кто его позвал. Один раз на аккаунт:
 *                       строка таблицы invites с ID приглашённого, поэтому второй раз никого не засчитать.
 *   invite-stats        сколько друзей пришло по моей ссылке и позвал ли кто-то меня.
 * Таблица invites закрыта (читает только функция), создаётся в setup-social.mjs.
 * Опыт за друзей считает сайт (src/data/xp.ts) по числу из invite-stats, как и остальной опыт.
 */

const CLAIM_DAYS = 7
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/

async function signedIn(api, req) {
  const userId = req.headers['x-appwrite-user-id']
  if (!userId) throw new UserError('Войдите в аккаунт.')
  const user = await api('GET', `/users/${userId}`)
  if (user.status === 404 || user.json.status === false) throw new UserError('Аккаунт не найден.')
  return user.json
}

export async function inviteClaim(api, req, body) {
  const user = await signedIn(api, req)
  const ref = String(body.ref ?? '')
  if (!ID.test(ref)) return { ok: false, reason: 'bad' }
  if (ref === user.$id) return { ok: false, reason: 'self' }
  const registered = Date.parse(user.registration ?? '')
  // Старые аккаунты не засчитываем: иначе друзья просто «приглашали» бы друг друга по кругу.
  if (!Number.isFinite(registered) || Date.now() - registered > CLAIM_DAYS * 86400_000) return { ok: false, reason: 'old' }
  if ((await api('GET', `${DB}/invites/rows/${user.$id}`)).status !== 404) return { ok: false, reason: 'already' }
  const inviter = await api('GET', `/users/${ref}`)
  if (inviter.status !== 200 || inviter.json.status === false) return { ok: false, reason: 'unknown' }
  await api('POST', `${DB}/invites/rows`, {
    rowId: user.$id,
    data: { inviterId: ref, name: (user.name || 'Зритель').slice(0, 64), at: Date.now() },
    permissions: [],
  })
  await notify(api, { userId: ref, kind: 'invite', actor: user, link: '/account#invite', key: user.$id })
  return { ok: true, inviter: (inviter.json.name || 'Зритель').slice(0, 64) }
}

export async function inviteStats(api, req) {
  const user = await signedIn(api, req)
  const [count, mine] = await Promise.all([
    api('GET', `${DB}/invites/rows?${[{ method: 'equal', attribute: 'inviterId', values: [user.$id] }, { method: 'limit', values: [1] }].map(query).join('&')}`),
    api('GET', `${DB}/invites/rows/${user.$id}`),
  ])
  return { invited: count.json.total ?? 0, invitedBy: mine.status === 200 }
}

export const inviteActions = {
  'invite-claim': inviteClaim,
  'invite-stats': inviteStats,
}
