import { BACKEND } from '../api/config'
import { callCommunity } from './community'

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

const useCore = () => BACKEND === 'core'

export async function loadCommunityChat() {
  if (useCore()) {
    const res = await fetch('/api/core/chat', { credentials: 'include', cache: 'no-store' })
    if (!res.ok) throw new Error('load chat')
    const data = (await res.json()) as { messages?: CommunityChatMessage[] }
    return (data.messages ?? []).slice(-COMMUNITY_CHAT_LIMIT)
  }
  const { Query } = await import('appwrite')
  const { COMMUNITY_DB, tablesDB } = await import('../api/appwrite')
  const result = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'community_chat',
    queries: [Query.equal('hidden', false), Query.orderDesc('at'), Query.limit(COMMUNITY_CHAT_LIMIT)],
  })
  return (result.rows as unknown as CommunityChatMessage[]).filter((message) => !message.hidden).reverse()
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

/**
 * Живые обновления: на Core — polling раз в 2.5 с (без Appwrite Realtime).
 */
export function subscribeCommunityChat(handlers: {
  onMessage: (message: CommunityChatMessage) => void
  onDelete: (messageId: string) => void
}) {
  if (useCore()) {
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
    void tick()
    const timer = window.setInterval(tick, 2500)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }

  let unsub = () => {}
  void import('../api/appwrite').then(({ COMMUNITY_DB, client }) => {
    unsub = client.subscribe<CommunityChatMessage>([`databases.${COMMUNITY_DB}.tables.community_chat.rows`], (event) => {
      const message = event.payload
      if (event.events.some((name) => name.endsWith('.delete'))) handlers.onDelete(message.$id)
      else handlers.onMessage(message)
    })
  })
  return () => unsub()
}
