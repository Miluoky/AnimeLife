import { Query } from 'appwrite'
import { COMMUNITY_DB, client, tablesDB } from '../api/appwrite'
import { callCommunity } from './community'

export interface CommunityChatMessage {
  $id: string
  userId: string
  name: string
  text: string
  at: number
}

export const COMMUNITY_CHAT_LIMIT = 100

export async function loadCommunityChat() {
  const result = await tablesDB.listRows({
    databaseId: COMMUNITY_DB,
    tableId: 'community_chat',
    queries: [Query.orderDesc('at'), Query.limit(COMMUNITY_CHAT_LIMIT)],
  })
  return (result.rows as unknown as CommunityChatMessage[]).reverse()
}

export const sendCommunityChatMessage = (text: string) =>
  callCommunity<{ message: CommunityChatMessage }>({ action: 'community-chat-send', text }).then((result) => result.message)

export const deleteCommunityChatMessage = (messageId: string) =>
  callCommunity({ action: 'community-chat-delete', messageId })

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