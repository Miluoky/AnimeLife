import { loadAnime } from './index'
import { saverOn } from '../data/saver'

// Код страниц, которые грузятся отдельными частями (см. App.tsx). Повторный вызов import() ничего не стоит.
export const pageChunks = {
  title: () => import('../pages/TitlePage'),
  player: () => import('../pages/Player'),
  catalog: () => import('../pages/Catalog'),
  landing: () => import('../pages/Landing'),
  en: () => import('../pages/En'),
  schedule: () => import('../pages/Schedule'),
  myList: () => import('../pages/MyList'),
  watching: () => import('../pages/Watching'),
  account: () => import('../pages/Account'),
  passwordRecovery: () => import('../pages/PasswordRecovery'),
  moderation: () => import('../pages/Moderation'),
  authCallback: () => import('../pages/AuthCallback'),
  notFound: () => import('../pages/NotFound'),
  together: () => import('../pages/Together'),
  togetherHome: () => import('../pages/TogetherHome'),
  communityChat: () => import('../pages/CommunityChat'),
  publicProfile: () => import('../pages/PublicProfile'),
  legal: () => import('../pages/Legal'),
  character: () => import('../pages/CharacterPage'),
  manga: () => import('../pages/MangaPage'),
  mangaHome: () => import('../pages/MangaHome'),
  mangaReader: () => import('../pages/MangaReader'),
  mangaUpload: () => import('../pages/MangaUpload'),
  random: () => import('../pages/Random'),
  top: () => import('../pages/Top'),
  changelog: () => import('../pages/Changelog'),
  collections: () => import('../pages/Collections'),
  quiz: () => import('../pages/Quiz'),
  community: () => import('../pages/Community'),
  club: () => import('../pages/ClubPage'),
  userCollections: () => import('../pages/UserCollections'),
  recap: () => import('../pages/Recap'),
  scene: () => import('../pages/SceneSearch'),
  news: () => import('../pages/News'),
  season: () => import('../pages/Season'),
  person: () => import('../pages/PersonPage'),
  similar: () => import('../pages/SimilarPage'),
  voiceStudio: () => import('../pages/VoiceStudioPage'),
  chronology: () => import('../pages/ChronologyPage'),
  trope: () => import('../pages/TropeCollectionPage'),
}

const prefetched = new Set<string>()

/**
 * Пока курсор на карточке, заранее тянем код страницы тайтла и данные о нём:
 * к моменту клика всё уже в кэше, и страница открывается без ожидания.
 */
export function prefetchTitle(id: string) {
  if (prefetched.has(id) || saverOn()) return
  prefetched.add(id)
  void pageChunks.title()
  void loadAnime(id).catch(() => undefined)
}

/** Предзагрузка страницы студии озвучки */
export function prefetchVoiceStudio(slug: string) {
  if (prefetched.has(`voice:${slug}`) || saverOn()) return
  prefetched.add(`voice:${slug}`)
  void pageChunks.voiceStudio()
}

/** Предзагрузка страницы хронологии франшизы */
export function prefetchChronology(id: string) {
  if (prefetched.has(`chronology:${id}`) || saverOn()) return
  prefetched.add(`chronology:${id}`)
  void pageChunks.chronology()
}

/** Предзагрузка страницы коллекции тропа / микро-жанра */
export function prefetchTrope(slug: string) {
  if (prefetched.has(`trope:${slug}`) || saverOn()) return
  prefetched.add(`trope:${slug}`)
  void pageChunks.trope()
}

/** Код соседних страниц догружаем, когда браузер свободен, чтобы переходы по меню были мгновенными. */
export function prefetchNavigation() {
  if (saverOn()) return
  const run = () => {
    void pageChunks.catalog()
    void pageChunks.schedule()
    void pageChunks.myList()
  }
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}
