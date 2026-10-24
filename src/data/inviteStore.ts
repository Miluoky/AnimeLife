import { createLocalStore } from './localStore'

/**
 * «Позови друга»: ссылка animelife.top/?ref=<ID>. Здесь только то, что нужно в основной части сайта:
 * запомнить, по чьей ссылке пришли, и счётчик друзей для опыта. Запросы к серверу — в invites.ts.
 */
export interface InviteStats {
  /** сколько друзей пришло по моей ссылке */
  invited: number
  /** меня позвали, бонус новичка */
  invitedBy: boolean
}

export const inviteStore = createLocalStore<InviteStats>('anime.invites.v1', { invited: 0, invitedBy: false })

const REF_KEY = 'anime.invite.ref'
/** Ссылка-приглашение действует неделю: сервер засчитывает только аккаунты не старше 7 дней. */
const REF_TTL = 7 * 86400_000

/** При открытии сайта: ?ref=… запоминаем и убираем из адреса, чтобы им не делились дальше. */
export function captureInvite() {
  const url = new URL(location.href)
  const ref = url.searchParams.get('ref')
  if (!ref) return
  url.searchParams.delete('ref')
  history.replaceState(history.state, '', url.pathname + url.search + url.hash)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(ref)) return
  try {
    localStorage.setItem(REF_KEY, JSON.stringify({ ref, at: Date.now() }))
  } catch {
    // Хранилище недоступно: приглашение не засчитается, сайт работает как обычно.
  }
}

export function pendingInvite(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(REF_KEY) ?? 'null') as { ref: string; at: number } | null
    if (saved && Date.now() - saved.at < REF_TTL) return saved.ref
    if (saved) localStorage.removeItem(REF_KEY)
  } catch {
    // нет хранилища или битая запись
  }
  return null
}

export function clearInvite() {
  try {
    localStorage.removeItem(REF_KEY)
  } catch {
    // ничего
  }
}
