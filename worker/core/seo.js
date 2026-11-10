/** D1 reads for Worker Open Graph (no Appwrite). Same 3s cap as Shikimori fetches in index.js. */

const DB_TIMEOUT_MS = 3000

export function d1First(db, sql, ...bind) {
  const query = db.prepare(sql).bind(...bind).first()
  return Promise.race([
    query,
    new Promise((_, reject) => setTimeout(() => reject(new Error('d1 timeout')), DB_TIMEOUT_MS)),
  ])
}

/** Поля комнаты для OG — те же, что parseState в rooms.js. */
export function roomMetaFromRow(row) {
  if (!row) return null
  let state = {}
  try {
    state = JSON.parse(row.state || '{}')
  } catch {
    state = {}
  }
  return {
    hostName: state.hostName || '',
    animeTitle: row.title || state.animeTitle || 'Аниме',
    episode: row.episode ?? state.episode ?? 1,
    poster: state.poster || undefined,
    title: state.roomTitle || '',
  }
}
