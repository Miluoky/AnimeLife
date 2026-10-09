import './voice-logo.css'
import { useState, type CSSProperties } from 'react'

/** Свои логотипы для студий, у которых в источниках нет картинки. */
const LOCAL_LOGOS: Record<string, string> = {
  anilibria: '/voiceovers/anilibria.svg',
  aniliberty: '/voiceovers/anilibria.svg',
  steponee: '/voiceovers/steponee.svg',
  'св-дубль': '/voiceovers/sv-dubl.svg',
  'дубляж св-дубль': '/voiceovers/sv-dubl.svg',
  miraidub: '/voiceovers/miraidub.svg',
  'mca-lab': '/voiceovers/mca-lab.svg',
}

/** Оттенки монограмм: тёплые и холодные, все читаются на тёмном фоне «Ночного кинотеатра». */
const HUES = [352, 14, 34, 50, 88, 142, 168, 188, 206, 226, 262, 318]

const norm = (title: string) => title.trim().toLowerCase()

/** FNV-1a: похожие названия дают далёкие числа, поэтому и цвета у них разные. */
function hash(text: string) {
  let h = 0x811c9dc5
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0
  return h
}

/** Две буквы студии: «Studio Band» → SB, «AniDUB» → AD (по заглавным), «Оканэ» → ОК. */
export function voiceInitials(title: string) {
  const clean = title.replace(/^(дубляж|студия)\s+/i, '').replace(/[^\p{L}\p{N}\s]+/gu, ' ').trim() || title
  const words = clean.split(/\s+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const word = words[0] ?? '?'
  const caps = word.slice(1).match(/\p{Lu}/u)
  return (caps ? word[0] + caps[0] : word.slice(0, 2)).toUpperCase()
}

/**
 * Значок студии озвучки: настоящий логотип, если он есть и загрузился, иначе монограмма
 * своего цвета и узора. Цвет зависит от названия, поэтому у каждой студии он свой и не меняется.
 */
export default function VoiceLogo({
  title,
  kind = 'voice',
  icon,
  size = 40,
}: {
  title: string
  kind?: 'voice' | 'subtitles'
  icon?: string
  size?: number
}) {
  const [broken, setBroken] = useState(false)
  const src = (!broken && icon) || LOCAL_LOGOS[norm(title)]
  const h = hash(norm(title))
  const style = {
    '--vl-size': `${size}px`,
    '--vl-h': HUES[h % HUES.length],
  } as CSSProperties
  return (
    <span className={`voice-logo voice-logo--p${(h >>> 4) % 4}`} style={style} aria-hidden="true">
      {src ? (
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      ) : (
        <span className="voice-logo__letters">{voiceInitials(title)}</span>
      )}
      {kind === 'subtitles' && <span className="voice-logo__cc">CC</span>}
    </span>
  )
}
