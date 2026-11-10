import { callCommunity } from './community'

export interface UserSessionRow {
  revokeKey: string
  createdAt: number
  expiresAt: number
  userAgent: string
  current: boolean
}

export const loadSessions = () => callCommunity<{ sessions: UserSessionRow[] }>({ action: 'sessions-list' }).then((r) => r.sessions)

export const revokeSession = (revokeKey: string) =>
  callCommunity<{ ok: boolean; endedCurrent?: boolean }>({ action: 'session-revoke', revokeKey })
