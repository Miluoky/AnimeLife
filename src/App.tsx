import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import TitlePage from './pages/TitlePage'
import Player from './pages/Player'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="anime/:id" element={<TitlePage />} />
        <Route path="watch/:id/:episode" element={<Player />} />
        <Route path="ongoing" element={<NotFound title="Онгоинги" />} />
        <Route path="schedule" element={<NotFound title="Расписание" />} />
        <Route path="my-list" element={<NotFound title="Мой список" />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
