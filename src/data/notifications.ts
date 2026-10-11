import { callCommunity } from './community'

/** Уведомления колокольчика: пишет функция community (notifications.js), здесь только чтение. */
export interface SiteNotification {
  $id: string
  kind: 'reply' | 'review-like' | 'ucol-like' | 'follow'
  actorId: string
  actorName: string
  text: string
  link: string
  at: number
  read: boolean
}

export const loadNotifications = () => callCommunity<{ items: SiteNotification[]; unread: number }>({ action: 'notif-list' })

export const markNotificationsRead = () => callCommunity({ action: 'notif-read' })

/** Строка уведомления: кто и что сделал. */
export function notificationText(n: SiteNotification): string {
  switch (n.kind) {
    case 'reply':
      return `${n.actorName} ответил(а) на ваш комментарий`
    case 'review-like':
      return `${n.actorName} отметил(а) ваш отзыв полезным`
    case 'ucol-like':
      return `${n.actorName} оценил(а) вашу подборку «${n.text}»`
    case 'follow':
      return `${n.actorName} подписался(-ась) на вас`
  }
}
