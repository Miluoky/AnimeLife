import { callCommunity, CommunityError } from './community'
import { clearInvite, inviteStore, pendingInvite } from './inviteStore'
import { markFlag } from './flags'
import { toast } from './toast'
import { XP } from './xp'

/** Запросы «Позови друга» к функции community (functions/community/src/invites.js). */

export const inviteLink = (userId: string) => `${location.origin}${import.meta.env.BASE_URL}?ref=${encodeURIComponent(userId)}`

export async function loadInviteStats() {
  const stats = await callCommunity<{ invited: number; invitedBy: boolean }>({ action: 'invite-stats' })
  inviteStore.set({ invited: stats.invited, invitedBy: stats.invitedBy })
  if (stats.invited > 0) markFlag('invitedFriend')
  return stats
}

/** После входа: сообщить серверу, по чьей ссылке пришли. Любой ответ, кроме сбоя сети, закрывает приглашение. */
export async function claimInvite() {
  const ref = pendingInvite()
  if (!ref) return
  try {
    const r = await callCommunity<{ ok: boolean; inviter?: string }>({ action: 'invite-claim', ref })
    clearInvite()
    if (r.ok) {
      inviteStore.set({ ...inviteStore.get(), invitedBy: true })
      toast(`Вас позвал(а) ${r.inviter}: +${XP.invited} опыта вам, +${XP.invite} другу`)
    }
  } catch (e) {
    // Ошибка сервера с понятным текстом: повторять бессмысленно. Нет сети — попробуем при следующем входе.
    if (e instanceof CommunityError && !/связи|не ответил/.test(e.message)) clearInvite()
  }
}
