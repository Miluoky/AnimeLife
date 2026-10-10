import { Fragment } from 'react'
import { Link, useLocation } from 'react-router-dom'
import ContactForm from '../components/ContactForm'
import InstallButton from '../components/InstallButton'
import { usePageMeta } from '../data/pageMeta'
import { LEGAL, textParts } from '../data/legal'
import { LEGAL_LINKS } from '../data/seo'
import NotFound from './NotFound'
import './legal.css'

/** Абзац со ссылками из разметки [текст](/адрес). */
function Text({ text }: { text: string }) {
  return (
    <>
      {textParts(text).map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : part[1].startsWith('mailto:') ? (
          <a key={i} href={part[1]}>
            {part[0]}
          </a>
        ) : (
          <Link key={i} to={part[1]}>
            {part[0]}
          </Link>
        ),
      )}
    </>
  )
}

/**
 * О проекте, приложение, правообладателям, контакты, политика конфиденциальности и соглашение. Тексты общие с Worker (src/data/legal.ts),
 * поэтому поисковик без JavaScript видит то же самое.
 */
export default function Legal() {
  const { pathname } = useLocation()
  const path = pathname.replace(/\/+$/, '')
  const page = LEGAL[path]
  usePageMeta(page?.title, page?.description)

  if (!page) return <NotFound />

  return (
    <main className="container legal">
      <nav className="crumbs muted" aria-label="Хлебные крошки">
        <Link to="/">Главная</Link> › {page.h1}
      </nav>
      <h1 className="page-title">{page.h1}</h1>
      {page.sections.map((s, i) => (
        <section key={i} className="legal__section">
          {s.h2 && <h2>{s.h2}</h2>}
          {s.p?.map((p, j) => (
            <p key={j}>
              <Text text={p} />
            </p>
          ))}
          {s.list && (
            <ul>
              {s.list.map((li, j) => (
                <li key={j}>
                  <Text text={li} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {page.form === 'install' ? <InstallButton /> : page.form && <ContactForm kind={page.form} />}
      <nav className="chips legal__more" aria-label="Документы">
        {LEGAL_LINKS.filter(([, to]) => to !== path).map(([name, to]) => (
          <Link key={to} to={to} className="pill pill--link">
            {name}
          </Link>
        ))}
      </nav>
    </main>
  )
}
