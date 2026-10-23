/**
 * Шумоподавление для голосового чата комнаты: нейросеть RNNoise (открытая, как у Krisp по смыслу —
 * убирает клавиатуру, вентилятор, улицу, оставляет голос). Работает прямо в браузере через AudioWorklet,
 * звук никуда не уходит. Модуль грузится отдельно и только когда включают голосовой чат.
 */

import { NoiseGateWorkletNode, RnnoiseWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor'
import workletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url'
import gateUrl from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url'
import wasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url'
import simdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url'

let binary: Promise<ArrayBuffer> | undefined
const ready = new WeakSet<BaseAudioContext>()

/**
 * Шумовые ворота после нейросети: когда человек молчит, остаток шума (дыхание, гул, тихая клавиатура)
 * глушится полностью, как у Krisp. Открываются на голосе громче −50 дБ, закрываются ниже −58 дБ
 * через 300 мс тишины, чтобы не съедать окончания слов.
 */
const GATE = { openThreshold: -50, closeThreshold: -58, holdMs: 300, maxChannels: 1 }

/** Пропускает микрофон через RNNoise и шумовые ворота. Контекст нужен с частотой 48 кГц: модель обучена на ней. */
export async function denoise(ctx: AudioContext, input: MediaStream): Promise<{ stream: MediaStream; stop: () => void }> {
  binary ??= loadRnnoise({ url: wasmUrl, simdUrl })
  binary.catch(() => (binary = undefined))
  const wasmBinary = await binary
  if (!ready.has(ctx)) {
    await Promise.all([ctx.audioWorklet.addModule(workletUrl), ctx.audioWorklet.addModule(gateUrl)])
    ready.add(ctx)
  }
  const source = ctx.createMediaStreamSource(input)
  const node = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 })
  const gate = new NoiseGateWorkletNode(ctx, GATE)
  const out = ctx.createMediaStreamDestination()
  source.connect(node)
  node.connect(gate)
  gate.connect(out)
  return {
    stream: out.stream,
    stop() {
      source.disconnect()
      node.disconnect()
      gate.disconnect()
      node.destroy()
      out.stream.getTracks().forEach((t) => t.stop())
    },
  }
}
