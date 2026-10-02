import { Suspense, lazy, useEffect } from 'react'
import { Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import CatalogSection from './components/CatalogSection'
import { pageChunks, prefetchNavigation } from './api/prefetch'

// Главная входит в основную сборку, остальные страницы грузятся отдельными частями при первом открытии.
const TitlePage = lazy(pageChunks.title)
const Player = lazy(pageChunks.player)
const Catalog = lazy(pageChunks.catalog)
const Schedule = lazy(pageChunks.schedule)
const MyList = lazy(pageChunks.myList)
const Account = lazy(pageChunks.account)
const PasswordRecovery = lazy(pageChunks.passwordRecovery)
const Moderation = lazy(pageChunks.moderation)
const AuthCallback = lazy(pageChunks.authCallback)
const NotFound = lazy(pageChunks.notFound)
const Together = lazy(pageChunks.together)
const TogetherHome = lazy(pageChunks.togetherHome)
const PublicProfile = lazy(pageChunks.publicProfile)

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
          <Route
            path="ongoing"
            element={
              <main className="container home">
                <CatalogSection title="Онгоинги" status="ongoing" moreLink="/catalog?status=ongoing" />
              </main>
            }
          />
          <Route path="together" element={<TogetherHome />} />
          <Route path="u/:id" element={<PublicProfile />} />
          <Route path="together/:code" element={<TogetherRoute />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="account" element={<Account />} />
          <Route path="account/recovery" element={<PasswordRecovery />} />
          <Route path="auth/callback" element={<AuthCallback />} />
          <Route path="auth/vk" element={<AuthCallback />} />
          <Route path="my-list" element={<MyList />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
