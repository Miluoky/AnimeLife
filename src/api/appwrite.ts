import { Account, Client, Functions } from 'appwrite'

// Проект Appwrite (регион Франкфурт). ID проекта не секретный, он и так виден в браузере.
export const APPWRITE_ENDPOINT =
  (import.meta.env.VITE_APPWRITE_ENDPOINT as string | undefined) ?? 'https://fra.cloud.appwrite.io/v1'
export const APPWRITE_PROJECT = (import.meta.env.VITE_APPWRITE_PROJECT as string | undefined) ?? '6abf65850016889f9b1b'

export const client = new Client().setEndpoint(APPWRITE_ENDPOINT).setProject(APPWRITE_PROJECT)
export const account = new Account(client)
export const functions = new Functions(client)

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
  /** числовой ID бота Telegram, первая часть его токена до двоеточия */
  telegramBotId: env.VITE_TELEGRAM_BOT_ID ?? '',
}

/** Функция Appwrite, которая проверяет вход через VK и Telegram (functions/social-login). */
export const SOCIAL_FUNCTION = 'social-login'
