import { createLocalStore } from './localStore'

/** Уведомления о сериях в Telegram включены. Точное состояние знает функция, это копия на устройстве (см. telegramNotify.ts). */
export const telegramOnStore = createLocalStore<boolean>('anime.tgnotify.v1', false)
