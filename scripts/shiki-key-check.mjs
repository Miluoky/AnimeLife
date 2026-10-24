// Только читает: проверяет пару Client ID + секрет приложения Shikimori, ничего не меняя.
// Отправляет заведомо неверный код входа: при верном секрете Shikimori отвечает invalid_grant (код не тот),
// при неверном секрете или Client ID — invalid_client. Сам секрет не печатается.
// Запуск: SHIKIMORI_CLIENT_ID=... SHIKIMORI_CLIENT_SECRET=... node scripts/shiki-key-check.mjs
const id = process.env.SHIKIMORI_CLIENT_ID ?? ''
const secret = process.env.SHIKIMORI_CLIENT_SECRET ?? ''
if (!secret) {
  console.log('::warning::Секрета SHIKIMORI_CLIENT_SECRET нет в секретах GitHub (проверьте имя).')
  process.exit(0)
}
console.log(`Client ID ${id.slice(0, 6)}…, секрет есть (${secret.length} символов).`)
const res = await fetch('https://shikimori.io/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Anime Life' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: id,
    client_secret: secret,
    code: 'animelife-key-check',
    redirect_uri: 'https://animelife.top/auth/shikimori',
  }),
})
const json = await res.json().catch(() => ({}))
console.log(`Shikimori: ${res.status} ${json.error ?? ''}`)
if (json.error === 'invalid_grant') console.log('Ключи Shikimori верные.')
else if (json.error === 'invalid_client') {
  console.log('::error::Shikimori не принял Client ID или секрет (invalid_client). Скопируйте Client Secret приложения ещё раз.')
  process.exit(1)
} else console.log('::warning::Ответ не дал понять, верен ли секрет (возможно, Shikimori закрыт для серверов GitHub).')
