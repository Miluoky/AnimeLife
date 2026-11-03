import { useState, useEffect } from 'react'

const TRIVIA_QUESTIONS = [
  {
    q: 'Какая студия выпустила «Атаку титанов» (1–3 сезоны)?',
    options: ['Wit Studio', 'MAPPA', 'Ufotable'],
    correct: 0,
  },
  {
    q: 'Какое аниме держит рекорд по кассовым сборам в Японии?',
    options: ['Унесённые призраками', 'Клинок: Поезд «Бесконечный»', 'Твоё имя'],
    correct: 1,
  },
  {
    q: 'Сколько всего серий в классическом сериале «Евангелион» (1995)?',
    options: ['24 серии', '26 серий', '32 серии'],
    correct: 1,
  },
  {
    q: 'Кто является автором оригинальной манги «Берсерк»?',
    options: ['Кэнтаро Миура', 'Масаси Кисимото', 'Эйитиро Ода'],
    correct: 0,
  },
  {
    q: 'Как звали шинигами, который обронил Тетрадь смерти в мир людей?',
    options: ['Рэм', 'Рюк', 'Сидо'],
    correct: 1,
  },
]

export default function BufferTrivia({ visible }: { visible: boolean }) {
  const [qIndex, setQIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    if (visible) {
      setQIndex(Math.floor(Math.random() * TRIVIA_QUESTIONS.length))
      setSelected(null)
    }
  }, [visible])

  if (!visible) return null
  const item = TRIVIA_QUESTIONS[qIndex]

  return (
    <div
      className="buffer-trivia"
      role="complementary"
      aria-label="Мини-квиз во время загрузки"
      style={{
        position: 'absolute',
        bottom: '80px',
        right: '16px',
        zIndex: 40,
        backgroundColor: 'var(--glass-surface)',
        backdropFilter: 'var(--glass-blur, blur(18px) saturate(145%))',
        WebkitBackdropFilter: 'var(--glass-blur, blur(18px) saturate(145%))',
        border: '1px solid var(--glass-edge)',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: '14px 18px',
        maxWidth: '340px',
        color: 'var(--text)',
        boxShadow: 'var(--glass-shadow)',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ fontSize: '15px' }} aria-hidden="true">⏳</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Мини-квиз во время загрузки
        </span>
      </div>
      <p style={{ fontSize: '13.5px', margin: '0 0 12px 0', lineHeight: 1.45, color: 'var(--text-soft)' }}>
        {item.q}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {item.options.map((opt, i) => {
          const isSelected = selected === i
          const isCorrect = i === item.correct
          let bg = 'var(--surface-2)'
          let border = '1px solid var(--line)'
          let color = 'var(--text)'
          if (selected !== null) {
            if (isCorrect) {
              bg = 'color-mix(in srgb, #22c55e 20%, var(--surface-2))'
              border = '1px solid #22c55e'
              color = '#4ade80'
            } else if (isSelected) {
              bg = 'color-mix(in srgb, #ef4444 20%, var(--surface-2))'
              border = '1px solid #ef4444'
              color = '#f87171'
            }
          }
          return (
            <button
              key={i}
              type="button"
              disabled={selected !== null}
              onClick={() => setSelected(i)}
              style={{
                textAlign: 'left',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                fontSize: '12.5px',
                fontWeight: 600,
                color,
                backgroundColor: bg,
                border,
                cursor: selected === null ? 'pointer' : 'default',
                transition: 'all 0.2s var(--ease)',
              }}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
