/**
 * Хеш пароля и токены сессий без внешних пакетов (Web Crypto в Workers).
 */

const te = new TextEncoder()

export function randomId(bytes = 16) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Формат: pbkdf2$iter$saltB64$hashB64 */
export async function hashPassword(password) {
  const iterations = 100_000
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await pbkdf2(password, salt, iterations)
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(hash)}`
}

export async function verifyPassword(password, stored) {
  if (!stored?.startsWith('pbkdf2$')) return false
  const [, iterS, saltB64, hashB64] = stored.split('$')
  const iterations = Number(iterS)
  if (!iterations || !saltB64 || !hashB64) return false
  const salt = fromB64(saltB64)
  const expected = fromB64(hashB64)
  const actual = await pbkdf2(password, salt, iterations)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}

function b64(bytes) {
  return btoa(String.fromCharCode(...bytes))
}

function fromB64(s) {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', te.encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
