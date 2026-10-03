import { useEffect, useState, useSyncExternalStore } from 'react'
import { setPublicProfile, useAuth } from '../data/auth'
import { toast } from '../data/toast'
import { useMyList } from '../data/myList'
import { flagsStore } from '../data/flags'
import Achievements from './Achievements'
import { unlocked } from '../data/achievements'
import { ShareIcon } from './Icons'

/** Открытый профиль и достижения в «Профиле». */
export default function ProfileSettings() {
  const { user } = useAuth()
  const list = useMyList()
  const flags = useSyncExternalStore(flagsStore.subscribe, flagsStore.get)
  const savedPublic = !!(user?.prefs as { publicProfile?: boolean } | undefined)?.publicProfile
  // Галочка переключается сразу, а не после ответа сервера; при ошибке вернётся назад.
  const [isPublic, setIsPublic] = useState(savedPublic)
  useEffect(() => setIsPublic(savedPublic), [savedPublic])
  const [about, setAbout] = useState('')
  const [busy, setBusy] = useState(false)
  const link = user ? `${location.origin}${import.meta.env.BASE_URL}u/${user.$id}` : ''

  useEffect(() => {
    if (!user || !isPublic) return
    void import('../data/profile').then(async (m) => {
      const p = await m.loadProfile(user.$id)
      if (p?.about) setAbout(p.about)
    })
  }, [user, isPublic])

  const toggle = async (on: boolean) => {
    setIsPublic(on)
    setBusy(true)
    try {
      const m = await import('../data/profile')
      if (on) await m.publishProfile(about)
      else await m.hideProfile()
      await setPublicProfile(on)
      toast(on ? 'Профиль открыт: ссылкой можно делиться' : 'Профиль скрыт')
    } catch (e) {
      setIsPublic(!on)
      toast(e instanceof Error ? e.message : 'Не получилось')
    } finally {
      setBusy(false)
    }
  }

  const saveAbout = async () => {
    setBusy(true)
    try {
      await (await import('../data/profile')).publishProfile(about)
      toast('Профиль обновлён')
    } catch {
      toast('Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Achievements unlocked={unlocked(list, flags)} />
      {user && (
        <section className="stack profile-settings">
          <h2>Открытый профиль</h2>
          <label className="appearance__toggle">
            <input type="checkbox" checked={isPublic} disabled={busy} onChange={(e) => void toggle(e.target.checked)} />
            <span>Показывать мой список, оценки и достижения по ссылке</span>
          </label>
          {isPublic && (
            <>
              <label className="field">
                <span>О себе</span>
                <textarea value={about} maxLength={300} rows={2} onChange={(e) => setAbout(e.target.value)} />
              </label>
              <div className="actions">
                <button type="button" className="btn btn--ghost btn--small" onClick={saveAbout} disabled={busy}>
                  Сохранить
                </button>
                <a className="btn btn--ghost btn--small" href={link} target="_blank" rel="noreferrer">
                  Открыть профиль
                </a>
                <button
                  type="button"
                  className="btn btn--accent btn--small"
                  onClick={() =>
                    navigator.share
                      ? navigator.share({ title: `${user.name}: профиль на Anime Life`, url: link }).catch(() => undefined)
                      : navigator.clipboard.writeText(link).then(() => toast('Ссылка скопирована'))
                  }
                >
                  <ShareIcon size={16} />
                  Поделиться
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}
