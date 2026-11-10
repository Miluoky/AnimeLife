import { callCommunity } from './community'

export interface ClubModPost {
  $id: string
  clubId: string
  userId: string
  name?: string
  text: string
  at: number
  hidden?: boolean
  reports?: number
  moderated?: boolean
}

export const loadClubModeration = () =>
  callCommunity<{ posts: ClubModPost[] }>({ action: 'club-mod-list' }).then((r) => r.posts)

export const moderateClubPost = (postId: string, decision: 'hide' | 'show' | 'delete') =>
  callCommunity<{ post?: ClubModPost }>({ action: 'club-mod-action', postId, decision })
