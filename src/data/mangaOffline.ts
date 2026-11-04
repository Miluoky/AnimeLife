/**
 * Офлайн-хранилище глав манги на IndexedDB.
 * Позволяет скачать главу целиком в память браузера (Blob) и читать её
 * в дороге без интернета (самолёт, метро, слабый сигнал).
 */

const DB_NAME = 'animelife_offline'
const DB_VERSION = 1
const STORE_NAME = 'chapters'

export interface OfflineChapter {
  id: string
  urls: string[]
  blobs: Blob[]
  savedAt: number
  title?: string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB не поддерживается'))
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function isChapterOffline(chapterId: string): Promise<boolean> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(chapterId)
      req.onsuccess = () => resolve(!!req.result)
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

export async function getOfflinePages(chapterId: string): Promise<string[] | null> {
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(chapterId)
      req.onsuccess = () => {
        const item: OfflineChapter | undefined = req.result
        if (item && item.blobs && item.blobs.length) {
          const urls = item.blobs.map((blob) => URL.createObjectURL(blob))
          resolve(urls)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function saveChapterOffline(
  chapterId: string,
  urls: string[],
  title?: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const db = await openDB()
  const blobs: Blob[] = []
  const total = urls.length

  for (let i = 0; i < total; i++) {
    const res = await fetch(urls[i], { referrerPolicy: 'no-referrer' })
    if (!res.ok) throw new Error(`Ошибка загрузки страницы ${i + 1}`)
    const blob = await res.blob()
    blobs.push(blob)
    onProgress?.(Math.round(((i + 1) / total) * 100))
  }

  const record: OfflineChapter = {
    id: chapterId,
    urls,
    blobs,
    savedAt: Date.now(),
    title,
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

export async function deleteOfflineChapter(chapterId: string): Promise<void> {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).delete(chapterId)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error)
    })
  } catch {}
}
