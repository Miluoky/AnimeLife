/**
 * Sibnet — интеграция с парсером и стримингом видео через наш Worker.
 * Позволяет проигрывать серии из Sibnet напрямую в <video> «Нашего плеера».
 */

export function extractSibnetVideoId(url: string): string | null {
  if (!url) return null
  const m = url.match(/[?&]videoid=(\d+)/i) || url.match(/\/shell\.php\?videoid=(\d+)/i) || url.match(/\/video(\d+)/i)
  return m ? m[1] : null
}

export function isSibnetUrl(url?: string): boolean {
  if (!url) return false
  return /sibnet\.ru/i.test(url)
}

/**
 * Адрес потока MP4 через наш Cloudflare Worker.
 * На animelife.top запросы идут через Worker, в локальной разработке — через прокси.
 */
export function sibnetStreamUrl(videoId: string | number): string {
  return `/api/sibnet/stream/${videoId}`
}
