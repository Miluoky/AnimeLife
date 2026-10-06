import { Query } from 'appwrite'
import { COMMUNITY_DB, client, tablesDB } from '../api/appwrite'
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

export async function loadCommunityChat() {
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

export function subscribeCommunityChat(handlers: {
  onMessage: (message: CommunityChatMessage) => void
  onDelete: (messageId: string) => void
}) {
  return client.subscribe<CommunityChatMessage>([`databases.${COMMUNITY_DB}.tables.community_chat.rows`], (event) => {
    const message = event.payload
    if (event.events.some((name) => name.endsWith('.delete'))) handlers.onDelete(message.$id)
    else handlers.onMessage(message)
  })
}