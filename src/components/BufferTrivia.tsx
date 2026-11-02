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
      style={{
        position: 'absolute',
        bottom: '80px',
        right: '16px',
        zIndex: 40,
        backgroundColor: 'rgba(15, 15, 20, 0.92)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 64, 112, 0.3)',
        borderRadius: '12px',
        padding: '12px 16px',
        maxWidth: '320px',
        color: '#fff',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '14px' }}>⏳</span>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#ff4070' }}>
          Пока видео загружается: Мини-квиз
        </span>
      </div>
      <p style={{ fontSize: '13px', margin: '0 0 10px 0', lineHeight: 1.4, color: '#e2e8f0' }}>
        {item.q}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {item.options.map((opt, i) => {
          const isSelected = selected === i
          const isCorrect = i === item.correct
          let bg = 'rgba(255, 255, 255, 0.06)'
          let border = '1px solid rgba(255, 255, 255, 0.1)'
          if (selected !== null) {
            if (isCorrect) {
              bg = 'rgba(34, 197, 94, 0.25)'
              border = '1px solid #22c55e'
            } else if (isSelected) {
              bg = 'rgba(239, 68, 68, 0.25)'
              border = '1px solid #ef4444'
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
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#fff',
                backgroundColor: bg,
                border: border,
                cursor: selected === null ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
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
