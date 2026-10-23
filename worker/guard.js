/**
 * Дешёвый отсев роботов в самом начале Worker (worker/index.js), до сборки страниц и запросов к Shikimori.
 *
 * Каждый вызов Worker идёт в лимит бесплатного плана (100 000 в сутки), поэтому главная защита — правила WAF
 * в Cloudflare (docs/worker-limit.md): там отказ не тратит вызовов. Здесь то, что до Worker всё-таки дошло:
 * отказ за доли миллисекунды без подзапросов вместо полной страницы с тремя-четырьмя запросами к Shikimori.
 *
 * Поисковики (Google, Яндекс, Bing и другие) и роботы превью ссылок (Telegram, VK, Facebook, X, Discord…)
 * проходят всегда: им Worker и нужен — canonical, заголовки, картинка превью и код 404.
 */

// Поисковики и превью ссылок: им всегда отдаём полную страницу. Проверяются первыми.
const WELCOME =
  /googlebot|google-inspectiontool|googleother|storebot-google|adsbot-google|mediapartners-google|google-site-verification|feedfetcher-google|apis-google|yandex|bingbot|bingpreview|msnbot|adidxbot|duckduckbot|applebot|mail\.ru|telegrambot|vkshare|vk\.com|facebookexternalhit|facebookcatalog|twitterbot|discordbot|slackbot|whatsapp|viber|skypeuripreview|linkedinbot|pinterest|redditbot|embedly|iframely|seznambot|qwantbot|ecosia|ok\.ru|odklbot/i

// Сборщики данных для ИИ, SEO-сервисы и прочие, кому сайт ничего не даст. Им 403 без работы.
const BLOCKED =
  /amazonbot|meta-externalagent|meta-externalfetcher|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|tiktokspider|gptbot|oai-searchbot|chatgpt-user|ccbot|claudebot|claude-web|anthropic-ai|claude-searchbot|perplexity|youbot|diffbot|imagesiftbot|timpibot|omgili|dataforseo|blexbot|serpstat|barkrowler|seekport|megaindex|linkpadbot|zoominfobot|awariobot|magpie-crawler|cohere-ai|ai2bot|applebot-extended|friendlycrawler|velenpublicwebcrawler|scrapy|python-requests|python-urllib|aiohttp|httpx|go-http-client|okhttp|java\/|libwww-perl|wget|headlesschrome|phantomjs|nutch|heritrix|archive\.org_bot|ia_archiver|sogou|baiduspider|360spider|yisouspider|coccocbot|zgrab|masscan|nmap|nuclei|censys|expanse|internet-measurement/i

// Чего у сайта нет и не будет: сканеры уязвимостей перебирают такие адреса тысячами.
const JUNK = /\.(?:php\d?|aspx?|jsp|cgi|env|ini|sql|bak|old|swp|git|ds_store|yml|yaml|log)(?:$|\/)|^\/(?:wp-|wordpress|xmlrpc|cgi-bin|\.well-known\/(?!security\.txt|assetlinks\.json|apple-app-site-association)|\.git|\.env|\.aws|\.vscode|vendor\/|phpmyadmin|admin\.php|boaform|actuator|server-status|owa\/|autodiscover|ecp\/|remote\/|hnap1|_ignition|telescope|solr\/|druid\/|containers\/|\.svn)/i

// Настоящие Chrome (с 76), Edge, Opera, Яндекс Браузер и Firefox (с 90) всегда шлют Sec-Fetch-Mode.
// Кто называет себя таким браузером без этого заголовка — программа с поддельным User-Agent.
const MODERN_BROWSER = /(?:chrome|chromium|crios|firefox|fxios|edg|opr|yabrowser)\/\d/i

const text = (body, status) =>
  new Response(body, {
    status,
    // Отказ можно держать в кэше: повтор того же адреса ботом не дойдёт до сборки страницы.
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400', 'X-Robots-Tag': 'noindex' },
  })

/**
 * Что делать с запросом до основной работы:
 * 'welcome' — поисковик или превью, полная обработка;
 * 'plain' — похоже на поддельный браузер: отдать простой index.html без сборки страницы (человек всё равно увидит сайт);
 * Response — готовый отказ;
 * undefined — обычная обработка.
 */
export function guard(request, url) {
  if (JUNK.test(url.pathname)) return text('Gone', 410)
  const ua = request.headers.get('User-Agent') ?? ''
  if (WELCOME.test(ua)) return 'welcome'
  if (!ua || BLOCKED.test(ua)) return text('Forbidden', 403)
  if (MODERN_BROWSER.test(ua) && !request.headers.has('Sec-Fetch-Mode')) {
    // Прокси данных браузер вызывает только через fetch() с Sec-Fetch-Mode: cors, без него — не браузер.
    return url.pathname.startsWith('/api/') ? text('Forbidden', 403) : 'plain'
  }
  return undefined
}
