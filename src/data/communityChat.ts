import { callCommunity } from './community'
import { startVisibilityPoll } from './visibilityPoll'

export interface CommunityChatMessage {
  $id: string
  userId: string
  name: string
  text: string
  at: number
  reports?: number
  hidden?: boolean
  moderated?: boolean
}

export const COMMUNITY_CHAT_LIMIT = 100

export async function loadCommunityChat() {
  const res = await fetch('/api/core/chat', { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('load chat')
  const data = (await res.json()) as { messages?: CommunityChatMessage[] }
  return (data.messages ?? []).slice(-COMMUNITY_CHAT_LIMIT)
}

export const sendCommunityChatMessage = (text: string) =>
  callCommunity<{ message: CommunityChatMessage }>({ action: 'community-chat-send', text }).then((result) => result.message)

export const deleteCommunityChatMessage = (messageId: string) =>
  callCommunity({ action: 'community-chat-delete', messageId })

export const reportCommunityChatMessage = (messageId: string) =>
  callCommunity<{ already?: boolean; hidden?: boolean }>({ action: 'community-chat-report', messageId })

export const loadCommunityChatModeration = () =>
  callCommunity<{ messages: CommunityChatMessage[] }>({ action: 'community-chat-mod-list' }).then((result) => result.messages)

export const moderateCommunityChatMessage = (messageId: string, decision: 'hide' | 'show' | 'delete') =>
  callCommunity<{ message?: CommunityChatMessage }>({ action: 'community-chat-mod-action', messageId, decision })

const CHAT_POLL_MS = 4500

/** Живые обновления: ~4.5 с, только пока вкладка видима (hidden → пауза, resume → backoff). */
export function subscribeCommunityChat(handlers: {
  onMessage: (message: CommunityChatMessage) => void
  onDelete: (messageId: string) => void
}) {
  let stopped = false
  const seen = new Set<string>()
  let primed = false
  const tick = async () => {
    if (stopped) return
    try {
      const loaded = await loadCommunityChat()
      if (stopped) return
      const loadedIds = new Set(loaded.map((m) => m.$id))
      if (!primed) {
        for (const m of loaded) seen.add(m.$id)
        primed = true
        return
      }
      for (const m of loaded) {
        if (seen.has(m.$id)) continue
        seen.add(m.$id)
        handlers.onMessage(m)
      }
      for (const id of [...seen]) {
        if (!loadedIds.has(id)) {
          seen.delete(id)
          handlers.onDelete(id)
        }
      }
    } catch {
      // сеть — следующий тик
    }
  }
  const stop = startVisibilityPoll(tick, { intervalMs: CHAT_POLL_MS, stopped: () => stopped })
  return () => {
    stopped = true
    stop()
  }
}
