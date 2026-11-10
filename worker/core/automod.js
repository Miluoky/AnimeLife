/**
 * Автомодерация текстов (порт functions/community/src/automod.js).
 */

const LOOKALIKE = { a: 'а', b: 'в', c: 'с', e: 'е', k: 'к', m: 'м', h: 'н', o: 'о', p: 'р', t: 'т', x: 'х', y: 'у', '0': 'о', '3': 'з', '6': 'б' }
const CYR = /[а-яё]/

export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\s]+/g, (word) => (CYR.test(word) ? word.replace(/[abcekmhoptxy036]/g, (ch) => LOOKALIKE[ch]) : word))
    .replace(/ё/g, 'е')
    .replace(/(?<=[а-я])[.*_-]+(?=[а-я])/g, '')
}

const START = '(?:^|[^а-я])'
const OBSCENE = new RegExp(
  [
    `${START}(?:на|по|о|от|за|ни|пере)?ху[йяеию]`,
    'пизд',
    `${START}(?:за|вы|по|на|от|у|при|до|раз|про|под|недо|съ|въ|подъ|объ|разъ)?еб(?:а|у|ть|ан|ен|ыв|ло|ли|ля|ла|лан|ну|нут|ись|ит|ет|ал|ат)`,
    `${START}бля(?:[^а-ях]|$|д|т)`,
    `${START}муд(?:ак|ач|ил|озв)`,
    `${START}пид(?:ор|ар|рил)`,
    `${START}гандон`,
    `${START}шлюх`,
  ].join('|'),
)

const ALLOWED_HOSTS = /(^|\.)(animelife\.top|shikimori\.(one|io|me)|myanimelist\.net|anilist\.co|youtube\.com|youtu\.be|wikipedia\.org)$/
const URL_RE = /\b(?:https?:\/\/|www\.)([^\s/?#]+)[^\s]*/gi
const DOMAIN_RE = /\b((?:[a-z0-9-]+\.)+(?:ru|com|net|org|io|xyz|top|site|online|club|me|cc|info|biz|pro|su|gg|ly|app|link|shop|store|live|fun|win|bet|casino))\b/gi
const TELEGRAM_RE = /\b(?:t\.me|telegram\.me)\/|(?:^|\s)@[a-z0-9_]{5,}\b/i

function foreignLink(text) {
  const hosts = [...text.matchAll(URL_RE)].map((m) => m[1]).concat([...text.matchAll(DOMAIN_RE)].map((m) => m[1]))
  if (hosts.some((host) => !ALLOWED_HOSTS.test(host.toLowerCase().replace(/^www\./, '')))) return true
  return TELEGRAM_RE.test(text)
}

export function heldReason(text) {
  if (OBSCENE.test(normalize(text))) return 'мат'
  if (foreignLink(text)) return 'ссылка'
  return null
}

/** @param {string[]} recentTexts */
export function rejectSpam(text, recentTexts = []) {
  if (/(.)\1{14,}/su.test(text)) throw new UserError('Похоже на флуд: уберите повторяющиеся символы.')
  const same = normalize(text).replace(/\s+/g, ' ').trim()
  if (recentTexts.some((t) => normalize(t).replace(/\s+/g, ' ').trim() === same)) {
    throw new UserError('Вы уже отправили такой же текст.')
  }
}

export class UserError extends Error {}
