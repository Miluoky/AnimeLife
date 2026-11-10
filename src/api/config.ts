// Настройки бэкенда и внешних сервисов (без SDK).

/** Аккаунты и коммьюнити — только AnimeLife Core (`/api/core`, worker/core). */
export const BACKEND = 'core' as const

const env = import.meta.env as Record<string, string | undefined>

/**
 * Способы входа через другие сервисы. ID приложений не секретные.
 * Google/Яндекс на Core выкл. по умолчанию (нет серверных ключей); VK/Telegram — через `/api/core/auth/oauth`.
 */
export const SOCIAL_LOGIN = {
  google: (env.VITE_AUTH_GOOGLE ?? '0') === '1',
  yandex: (env.VITE_AUTH_YANDEX ?? '0') === '1',
  /** ID приложения VK ID */
  vkAppId: env.VITE_VK_APP_ID ?? '',
  /** вход через бота @AnimeLifeAuth_bot (секреты на Worker) */
  telegram: (env.VITE_AUTH_TELEGRAM ?? '1') === '1',
}

/** Публичный ключ VAPID для пуш-уведомлений. Секретная половина хранится только на Worker. */
export const VAPID_PUBLIC_KEY =
  env.VITE_VAPID_PUBLIC_KEY ?? 'BHgyQXea-s96oolbzWaTuGkW6TlVgqKpCyl8y7bEQCHA33CJ2MrQdH-w_JPc5iMw7M6BDW4aBsFiEUNVTCURVt8'

/**
 * Капча Cloudflare Turnstile для отзывов и жалоб. Ключ сайта публичный; пока он пустой, капчи нет.
 * Включать вместе с секретом TURNSTILE_SECRET на Worker.
 */
export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY ?? ''
