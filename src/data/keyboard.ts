// Клавиши в одном порядке на латинской и русской раскладке ЙЦУКЕН.
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбюё'

const toRu = new Map([...EN].map((c, i) => [c, RU[i]]))
const toEn = new Map([...RU].map((c, i) => [c, EN[i]]))

/**
 * Текст, набранный не на той раскладке: «yfhenj» → «наруто», «щту зшусу» → «one piece».
 * Возвращает undefined, если менять нечего или в тексте смешаны обе раскладки.
 */
export function swapLayout(text: string): string | undefined {
  const lower = text.toLowerCase()
  const latin = /[a-z]/.test(lower)
  const cyrillic = /[а-яё]/.test(lower)
  if (latin === cyrillic) return undefined
  const map = latin ? toRu : toEn
  const swapped = [...lower].map((c) => map.get(c) ?? c).join('')
  return swapped === lower ? undefined : swapped
}
