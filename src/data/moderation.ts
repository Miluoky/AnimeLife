import { callCommunity } from './community'

export interface BanUserInfo {
  userId: string
  email: string
  name: string
  active: boolean
  moderatedBy?: string | null
  moderatedAt?: number | null
  banReason?: string | null
  moderatorName?: string
}

type BanTarget = { userId: string } | { email: string }

const pickUser = (res: { user: BanUserInfo }) => res.user

export const lookupBanUser = (target: BanTarget) =>
  callCommunity<{ user: BanUserInfo }>({ action: 'user-ban-lookup', ...target }).then(pickUser)

export const banUser = (body: BanTarget & { reason?: string }) =>
  callCommunity<{ user: BanUserInfo }>({ action: 'user-ban', ...body }).then(pickUser)

export const unbanUser = (target: BanTarget) =>
  callCommunity<{ user: BanUserInfo }>({ action: 'user-unban', ...target }).then(pickUser)
