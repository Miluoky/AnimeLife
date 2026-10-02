import { Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import TitlePage from './pages/TitlePage'
import Player from './pages/Player'
import NotFound from './pages/NotFound'
import CatalogSection from './components/CatalogSection'
import MyList from './pages/MyList'
import Schedule from './pages/Schedule'
import Catalog from './pages/Catalog'

// key сбрасывает состояние страницы (например, выбранную страницу серий) при переходе к другому тайтлу.
function TitlePageRoute() {
  const { id } = useParams()
  return <TitlePage key={id} />
}

export default function App() {
  return (
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
        <Route path="catalog" element={<Catalog />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="my-list" element={<MyList />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
