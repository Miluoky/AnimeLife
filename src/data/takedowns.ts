import { callCommunity } from './community'

// Обращения с форм «Правообладателям» и «Контакты» через Core `/api/core/action` (worker/core/moderation):
// отправить может кто угодно, список и статусы видят только админы.

export type TakedownKind = 'takedown' | 'contact'
export type TakedownStatus = 'new' | 'done' | 'rejected'

export interface TakedownForm {
  kind: TakedownKind
  name: string
  email: string
  links: string
  message: string
  confirm: boolean
  captcha?: string
  /** поле-ловушка для ботов, у людей всегда пустое */
  website?: string
}

export interface Takedown {
  $id: string
  kind: TakedownKind
  name: string
  email: string
  links?: string | null
  message: string
  status: TakedownStatus
  createdAt: number
  userId?: string | null
}

export const sendTakedown = (form: TakedownForm) => callCommunity({ action: 'takedown-create', ...form })

export const loadTakedowns = (status: TakedownStatus | 'all') =>
  callCommunity<{ takedowns: Takedown[] }>({ action: 'takedown-list', status }).then((r) => r.takedowns)

export const setTakedownStatus = (takedownId: string, status: TakedownStatus) =>
  callCommunity<{ takedown: Takedown }>({ action: 'takedown-status', takedownId, status }).then((r) => r.takedown)
