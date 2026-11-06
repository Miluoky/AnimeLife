/**
 * Взрослый контент (хентай): рейтинг Shikimori rx или жанр «Хентай».
 * На страницах тайтла и серии показываем Age Gate, даже если пришли с /anime/:id.
 */
export function isAdultContent(a?: { rating?: string | null; genres?: string[] } | null): boolean {
  if (!a) return false
  if (a.rating === 'rx') return true
  return (a.genres ?? []).some((g) => /^хентай$/i.test(g.trim()) || /^hentai$/i.test(g.trim()))
}
