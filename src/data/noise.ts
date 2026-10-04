/**
 * Шумоподавление для голосового чата комнаты: нейросеть RNNoise (открытая, как у Krisp по смыслу —
 * убирает клавиатуру, вентилятор, улицу, оставляет голос). Работает прямо в браузере через AudioWorklet,
 * звук никуда не уходит. Модуль грузится отдельно и только когда включают голосовой чат.
 */

import { RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let binary: Promise<ArrayBuffer> | undefined
const ready = new WeakSet<BaseAudioContext>()

/** Пропускает микрофон через RNNoise. Контекст нужен с частотой 48 кГц: модель обучена на ней. */
export async function denoise(ctx: AudioContext, input: MediaStream): Promise<{ stream: MediaStream; stop: () => void }> {
  binary ??= loadRnnoise({ url: wasmUrl, simdUrl })
  binary.catch(() => (binary = undefined))
  const wasmBinary = await binary
  if (!ready.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl)
    ready.add(ctx)
  }
  const source = ctx.createMediaStreamSource(input)
  const node = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  const out = ctx.createMediaStreamDestination()
  source.connect(node)
  node.connect(out)
  return {
    stream: out.stream,
    stop() {
      source.disconnect()
      node.disconnect()
      node.destroy()
      out.stream.getTracks().forEach((t) => t.stop())
    },
  }
}
