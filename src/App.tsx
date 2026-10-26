import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { pageChunks, prefetchNavigation } from './api/prefetch'
import { MOVED_GENRES } from './data/movedGenres'
import { animeIdFromParam } from './data/animeUrl'

// Главная входит в основную сборку, остальные страницы грузятся отдельными частями при первом открытии.
const TitlePage = lazy(pageChunks.title)
const Player = lazy(pageChunks.player)
const Catalog = lazy(pageChunks.catalog)
const Landing = lazy(pageChunks.landing)
const En = lazy(pageChunks.en)
const Schedule = lazy(pageChunks.schedule)
const MyList = lazy(pageChunks.myList)
const Watching = lazy(pageChunks.watching)
const Account = lazy(pageChunks.account)
const PasswordRecovery = lazy(pageChunks.passwordRecovery)
const Moderation = lazy(pageChunks.moderation)
const AuthCallback = lazy(pageChunks.authCallback)
const NotFound = lazy(pageChunks.notFound)
const Together = lazy(pageChunks.together)
const TogetherHome = lazy(pageChunks.togetherHome)
const CommunityChat = lazy(pageChunks.communityChat)
const PublicProfile = lazy(pageChunks.publicProfile)
const Legal = lazy(pageChunks.legal)
const CharacterPage = lazy(pageChunks.character)
const MangaPage = lazy(pageChunks.manga)
const MangaReader = lazy(pageChunks.mangaReader)
const MangaUpload = lazy(pageChunks.mangaUpload)
const Random = lazy(pageChunks.random)
const Top = lazy(pageChunks.top)
const Changelog = lazy(pageChunks.changelog)
const Collections = lazy(pageChunks.collections)
const Quiz = lazy(pageChunks.quiz)
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))
const Community = lazy(pageChunks.community)
const ClubPage = lazy(pageChunks.club)
const UserCollectionPage = lazy(() => pageChunks.userCollections().then((m) => ({ default: m.UserCollectionPage })))
const MyCollections = lazy(() => pageChunks.userCollections().then((m) => ({ default: m.MyCollections })))
const CollectionEditor = lazy(() => pageChunks.userCollections().then((m) => ({ default: m.CollectionEditor })))
const Recap = lazy(pageChunks.recap)
const SceneSearch = lazy(pageChunks.scene)
const News = lazy(pageChunks.news)
const Season = lazy(pageChunks.season)
const PersonPage = lazy(pageChunks.person)
const SimilarPage = lazy(pageChunks.similar)

// key сбрасывает состояние страницы (например, выбранную страницу серий) при переходе к другому тайтлу.
function TitlePageRoute() {
  const { id } = useParams()
  return <TitlePage key={animeIdFromParam(id ?? '')} />
}

function TogetherRoute() {
  const { code } = useParams()
  return <Together key={code} />
}

// Переходы людей по страницам отдаются без Worker (ради лимита вызовов), поэтому его постоянные редиректы
// повторены здесь: /search?q= ведёт в каталог с запросом, убранный жанр — на тот, куда его перенесли.
function SearchRedirect() {
  const params = new URLSearchParams(useLocation().search)
  const q = (params.get('q') ?? params.get('query') ?? '').trim().slice(0, 200)
  return <Navigate replace to={q ? `/catalog?q=${encodeURIComponent(q)}` : '/catalog'} />
}

function GenreRoute() {
  const { slug = '' } = useParams()
  const { search } = useLocation()
  const moved = MOVED_GENRES[slug]
  return moved ? <Navigate replace to={`/genre/${moved}${search}`} /> : <Landing />
}

// Пока часть страницы едет по сети, место под неё уже занято: вёрстка не прыгает.
const PageFallback = () => <main className="container page-fallback" aria-busy="true" />

export default function App() {
  useEffect(prefetchNavigation, [])

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="anime/:id" element={<TitlePageRoute />} />
          <Route path="watch/:id/:episode" element={<Player />} />
          {/* Посадочные страницы для поиска: онгоинги, жанры, темы, студии, типы, годы и сезоны (src/data/landings.ts). */}
          <Route path="ongoing" element={<Landing />} />
          <Route path="genre/:slug" element={<GenreRoute />} />
          <Route path="theme/:slug" element={<Landing />} />
          <Route path="best/:slug" element={<Landing />} />
          <Route path="studio/:slug" element={<Landing />} />
          <Route path="similar/:id" element={<SimilarPage />} />
          <Route path="type/:kind" element={<Landing />} />
          <Route path="year/:year" element={<Landing />} />
          <Route path="year/:year/:season" element={<Landing />} />
          {/* Английская версия: о сайте и страницы тайтлов (src/pages/En.tsx, тексты в src/data/en.ts). */}
          <Route path="en" element={<En />} />
          <Route path="en/anime/:id" element={<En />} />
          <Route path="together" element={<TogetherHome />} />
          <Route path="chat" element={<CommunityChat />} />
          <Route path="u/:id" element={<PublicProfile />} />
          <Route path="character/:id" element={<CharacterPage />} />
          <Route path="manga/:id" element={<MangaPage />} />
          <Route path="manga/:id/chapter/:chapter" element={<MangaReader />} />
          <Route path="manga/:id/upload" element={<MangaUpload />} />
          <Route path="together/:code" element={<TogetherRoute />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="search" element={<SearchRedirect />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="random" element={<Random />} />
          <Route path="top" element={<Top />} />
          <Route path="changelog" element={<Changelog />} />
          <Route path="collections" element={<Collections />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="community" element={<Community />} />
          <Route path="club/:id" element={<ClubPage />} />
          <Route path="c/:id" element={<UserCollectionPage />} />
          <Route path="c/:id/edit" element={<CollectionEditor />} />
          <Route path="collections/my" element={<MyCollections />} />
          <Route path="collections/new" element={<CollectionEditor />} />
          <Route path="recap" element={<Recap />} />
          <Route path="scene" element={<SceneSearch />} />
          <Route path="news" element={<News />} />
          <Route path="season" element={<Season />} />
          <Route path="person/:id" element={<PersonPage />} />
          <Route path="account" element={<Account />} />
          <Route path="account/recovery" element={<PasswordRecovery />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="auth/vk" element={<AuthCallback />} />
          <Route path="auth/shikimori" element={<AuthCallback />} />
          <Route path="my-list" element={<MyList />} />
          <Route path="watching" element={<Watching />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="admin/analytics" element={<AdminAnalytics />} />
          {/* Служебные страницы: тексты в src/data/legal.ts, у двух первых форма обращения. */}
          <Route path="about" element={<Legal />} />
          <Route path="app" element={<Legal />} />
          <Route path="rightholders" element={<Legal />} />
          <Route path="contacts" element={<Legal />} />
          <Route path="privacy" element={<Legal />} />
          <Route path="terms" element={<Legal />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
