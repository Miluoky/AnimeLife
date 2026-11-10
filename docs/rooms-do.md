# Комнаты «Вместе»: от polling к Durable Objects

Сейчас голос и синхрон плеера живут на D1 + короткий polling (`room-presence`, `room-signal`, GET `/rooms/:code`). Это работает на Free, но даёт задержку ~1–2.5 с.

## Уже в коде

- `worker/core/roomDo.js` — класс `RoomDO` + `upgradeRoomSocket`
- `export { RoomDO }` из `worker/index.js`
- Маршрут `GET /api/core/rooms/:code/ws` в `router.js` (без binding → 501)
- Клиент: `src/data/roomWs.ts`, `subscribeMembers` пробует WS и откатывается на poll
- Binding в `wrangler*.jsonc` **закомментирован** — Durable Objects требуют Workers Paid

## Включить на Paid

В `wrangler.animelife.jsonc` / `wrangler.jsonc` раскомментируйте:

```jsonc
"durable_objects": { "bindings": [{ "name": "ROOMS", "class_name": "RoomDO" }] },
"migrations": [{ "tag": "v1-rooms", "new_classes": ["RoomDO"] }],
```

Выключить клиентский WS: `VITE_ROOMS_WS=0`.

## Дальше

1. Прокинуть WebRTC `signal` через WS в `VoiceChat.send` (сейчас ещё D1 action).
2. Сбрасывать playhead комнаты в D1 из DO для публичного списка.
3. Hibernation уже через `acceptWebSocket` — проверить биллинг на пустых комнатах.
