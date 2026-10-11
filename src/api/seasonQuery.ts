// Запрос сезонного чарта без зависимостей: его же проверяет тест прокси (worker/shikiProxy.js пропускает только его).

export const SEASON_FIELDS =
  'id name russian kind score status episodes episodesAired airedOn { date } nextEpisodeAt duration poster { mainUrl main2xUrl } genres { russian kind } studios { name } description'

export const seasonQuery = (season: string, kinds: string, page: number) =>
  `{ animes(season: "${season}", kind: "${kinds}", order: popularity, censored: true, limit: 50, page: ${page}) { ${SEASON_FIELDS} } }`
