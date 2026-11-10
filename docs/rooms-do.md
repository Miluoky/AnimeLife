# Комнаты «Вместе»: от polling к Durable Objects

Сейчас голос и синхрон плеера живут на D1 + короткий polling клиента (`room-presence`, `room-signal`, GET `/rooms/:code`). Это работает без Workers Paid extras, но даёт задержку ~1–2.5 с и лишние запросы.

## Цель

Один Durable Object на комнату (`RoomDO`), binding `ROOMS`:

1. Клиент открывает WebSocket `/api/core/rooms/:code/ws` (или DO stub).
2. Presence / player control / WebRTC signaling — сообщения по сокету, без записи каждого сигнала в D1.
3. Состояние комнаты (тайтл, эпизод, playhead) периодически сбрасывается в D1 для списка публичных комнат и после reconnect.
4. Hibernation WebSocket (CF) — DO спит между событиями, дешевле на пустых комнатах.

## Миграция без большого bang

1. Оставить текущий polling API.
2. Добавить DO рядом: тот же `roomId` → `env.ROOMS.get(id).fetch(...)`.
3. Клиент: feature-flag `VITE_ROOMS_WS=1`, fallback на polling.
4. Когда WS стабилен — выключить polling presence/signals.

Код presence/signal уже в `worker/core/voice.js` (D1). DO заменит запись в `room_signals` на fan-out по сокетам.
