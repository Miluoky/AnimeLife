/**
 * Взрослый контент (хентай): рейтинг Shikimori rx или жанр «Хентай» / Hentai.
 * На страницах тайтла, серии и манги показываем Age Gate, даже если пришли с /anime/:id.
 * Рейтинг необязателен: у манги достаточно списка жанров.
 */
export function isAdultContent(a?: { rating?: string | null; genres?: readonly string[] } | null): boolean {
  if (!a) return false
  if (a.rating === 'rx') return true
  return (a.genres ?? []).some((g) => /^хентай$/i.test(g.trim()) || /^hentai$/i.test(g.trim()))
}
