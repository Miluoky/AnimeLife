import { createLocalStore } from './localStore'

/**
 * «Режим дивана»: крупнее главное, без сообщества, клубов и чата.
 * Для гостей и совместного просмотра. Выключается там же, в оформлении.
 */
export const couchStore = createLocalStore<boolean>('anime.couch.v1', false)

/** Ссылки, которые прячем в диване (шапка «Ещё», шторка, Discover, хаб профиля). */
export const COUCH_HIDE = /^\/(community|chat|club|duel|quiz|recap|hentai|hentai-manga|together)/

export const useCouch = couchStore.use

export function setCouch(on: boolean) {
  couchStore.set(on)
  document.body.classList.toggle('couch', on)
}

export function applyCouch(on = couchStore.get()) {
  document.body.classList.toggle('couch', on)
}
