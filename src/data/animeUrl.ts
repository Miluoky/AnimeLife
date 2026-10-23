/**
 * Часть адреса тайтла из латинского названия Shikimori (name): «Sousou no Frieren» → «sousou-no-frieren».
 * Без латиницы в названии получается пустая строка, и адрес остаётся просто /anime/<id>.
 */
export function animeSlug(name: string | null | undefined) {
  const slug = (name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length <= 60) return slug
  // Длинные названия режем по границе слова.
  return slug.slice(0, 61).replace(/-[^-]*$/, '')
}

/** Адрес страницы тайтла: /anime/6-trigun. Старые адреса /anime/6 Worker перенаправляет сюда (301). */
export function animePath(id: string | number, name?: string | null) {
  const slug = animeSlug(name)
  return `/anime/${id}${slug ? `-${slug}` : ''}`
}

/** id тайтла из параметра адреса: «6-trigun» → «6». Нечисловые id (демо-данные) остаются как есть. */
export const animeIdFromParam = (param: string) => param.match(/^(\d+)-[a-z0-9-]+$/)?.[1] ?? param

/**
 * Адрес тайтла для ссылок приложения. У карточки латинское название — originalTitle (если есть русское),
 * иначе само title; русское название в адрес не идёт.
 */
export function animeHref(a: { id: string; title: string; originalTitle?: string }) {
  const name = a.originalTitle ?? (/[а-яё]/i.test(a.title) ? undefined : a.title)
  return /^\d+$/.test(a.id) ? animePath(a.id, name) : `/anime/${a.id}`
}
