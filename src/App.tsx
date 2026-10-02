import { Route, Routes, useParams } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import TitlePage from './pages/TitlePage'
import Player from './pages/Player'
import NotFound from './pages/NotFound'
import CatalogSection from './components/CatalogSection'

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
              <CatalogSection title="Онгоинги" status="ongoing" />
            </main>
          }
        />
        <Route path="schedule" element={<NotFound title="Расписание" />} />
        <Route path="my-list" element={<NotFound title="Мой список" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
