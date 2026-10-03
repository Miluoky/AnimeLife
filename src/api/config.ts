// Настройки Appwrite и внешних сервисов без самого SDK: этот файл можно подключать в основную сборку,
// а тяжёлый SDK (src/api/appwrite.ts) грузится отдельной частью, когда он действительно нужен.

// Проект Appwrite (регион Франкфурт). ID проекта не секретный, он и так виден в браузере.
export const APPWRITE_ENDPOINT =
  (import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined) ?? 'https://fra.cloud.appwrite.io/v1'
export const APPWRITE_PROJECT = (import.meta.env.VITE_APPWRITE_PROJECT as string | undefined) ?? '6abf65850016889f9b1b'

const env = import.meta.env as Record<string, string | undefined>

/**
 * Способы входа через другие сервисы. Каждый включается, когда приложение у сервиса зарегистрировано
 * и ключи внесены в Appwrite (см. README). ID приложений не секретные.
 */
export const SOCIAL_LOGIN = {
  google: (env.VITE_AUTH_GOOGLE ?? '0') === '1',
  yandex: (env.VITE_AUTH_YANDEX ?? '0') === '1',
  /** ID приложения VK ID */
  vkAppId: env.VITE_VK_APP_ID ?? '',
  /** вход через бота @AnimeLifeAuth_bot (настройки бота живут в функции social-login) */
  telegram: (env.VITE_AUTH_TELEGRAM ?? '1') === '1',
}

/** Функция Appwrite, которая проверяет вход через VK и Telegram (functions/social-login). */
export const SOCIAL_FUNCTION = 'social-login'

/** Функция Appwrite для отзывов и уведомлений о сериях (functions/community) и её база. */
export const COMMUNITY_FUNCTION = 'community'
export const COMMUNITY_DB = 'anime'

/** Публичный ключ VAPID для пуш-уведомлений. Секретная половина хранится только в переменных функции. */
export const VAPID_PUBLIC_KEY =
  env.VITE_VAPID_PUBLIC_KEY ?? 'BHgyQXea-s96oolbzWaTuGkW6TlVgqKpCyl8y7bEQCHA33CJ2MrQdH-w_JPc5iMw7M6BDW4aBsFiEUNVTCURVt8'

/**
 * Капча Cloudflare Turnstile для отзывов и жалоб. Ключ сайта публичный; пока он пустой, капчи нет.
 * Включать вместе с секретом TURNSTILE_SECRET в переменных функции community.
 */
export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY ?? ''
