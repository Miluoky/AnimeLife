import { useSyncExternalStore } from 'react'

/**
 * Всплывающие уведомления в углу экрана: «Добавлено в Смотрю» с кнопкой «Отменить» и т. п.
 * Живут 4 секунды, новые вытесняют старые (не больше трёх на экране).
 */
export interface Toast {
  id: number
  message: string
  action?: { label: string; onClick: () => void }
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

export function toast(message: string, action?: Toast['action']) {
  const id = nextId++
  toasts = [...toasts, { id, message, action }].slice(-3)
  notify()
  setTimeout(() => dismissToast(id), 4000)
  return id
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => toasts,
  )
}
