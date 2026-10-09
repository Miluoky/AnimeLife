import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import { pageChunks, prefetchNavigation } from './api/prefetch'

// Главная входит в основную сборку, остальные страницы грузятся отдельными частями при первом открытии.
const TitlePage = lazy(pageChunks.title)
const Player = lazy(pageChunks.player)
const Catalog = lazy(pageChunks.catalog)
const Landing = lazy(pageChunks.landing)
const Schedule = lazy(pageChunks.schedule)
const MyList = lazy(pageChunks.myList)
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
const Random = lazy(pageChunks.random)
const Top = lazy(pageChunks.top)
const Changelog = lazy(pageChunks.changelog)
const Collections = lazy(pageChunks.collections)
const Quiz = lazy(pageChunks.quiz)
const AdminAnalytics = lazy(() => import('./pages/AdminAnalytics'))

// key сбрасывает состояние страницы (например, выбранную страницу серий) при переходе к другому тайтлу.
function TitlePageRoute() {
  const { id } = useParams()
  return <TitlePage key={id} />
}

function TogetherRoute() {
  const { code } = useParams()
  return <Together key={code} />
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
          {/* Посадочные страницы для поиска: онгоинги, жанры, типы, годы и сезоны (src/data/seo.ts). */}
          <Route path="ongoing" element={<Landing />} />
          <Route path="genre/:slug" element={<Landing />} />
          <Route path="type/:kind" element={<Landing />} />
          <Route path="year/:year" element={<Landing />} />
          <Route path="year/:year/:season" element={<Landing />} />
          <Route path="together" element={<TogetherHome />} />
          <Route path="chat" element={<CommunityChat />} />
          <Route path="u/:id" element={<PublicProfile />} />
          <Route path="character/:id" element={<CharacterPage />} />
          <Route path="together/:code" element={<TogetherRoute />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="random" element={<Random />} />
          <Route path="top" element={<Top />} />
          <Route path="changelog" element={<Changelog />} />
          <Route path="collections" element={<Collections />} />
          <Route path="quiz" element={<Quiz />} />
          <Route path="account" element={<Account />} />
          <Route path="account/recovery" element={<PasswordRecovery />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="auth/vk" element={<AuthCallback />} />
          <Route path="my-list" element={<MyList />} />
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
