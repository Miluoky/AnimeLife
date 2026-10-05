/**
 * «Чётче»: улучшение картинки своего плеера на видеокарте зрителя (WebGL2), в духе Anime4K и AMD FidelityFX.
 *   1. В исходном разрешении: адаптивная резкость CAS (AMD, MIT) и лёгкое затемнение контуров, как в Anime4K.
 *   2. Растяжение до размера экрана бикубическим фильтром Catmull-Rom вместо мыльного билинейного.
 * Холст лежит поверх <video>, само видео и кнопки плеера не меняются. Модуль грузится, только когда фильтр включён.
 */

const VERTEX = `#version 300 es
in vec2 pos;
// Кадр видео в текстуре лежит строками сверху вниз, а WebGL рисует снизу вверх: на экран выводим с переворотом,
// а в промежуточную текстуру — без него, чтобы она осталась в том же порядке строк, что и кадр.
uniform float flipY;
out vec2 uv;
void main() {
  uv = vec2(pos.x * 0.5 + 0.5, 0.5 + flipY * pos.y * 0.5);
  gl_Position = vec4(pos, 0.0, 1.0);
}`

// CAS по кресту соседей + затемнение тонких тёмных линий (контуры рисовки).
const SHARPEN = `#version 300 es
precision mediump float;
uniform sampler2D src;
uniform vec2 texel;
in vec2 uv;
out vec4 color;
const float SHARPNESS = 0.7;
const float LINES = 0.25;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 e = texture(src, uv).rgb;
  vec3 b = texture(src, uv - vec2(0.0, texel.y)).rgb;
  vec3 d = texture(src, uv - vec2(texel.x, 0.0)).rgb;
  vec3 f = texture(src, uv + vec2(texel.x, 0.0)).rgb;
  vec3 h = texture(src, uv + vec2(0.0, texel.y)).rgb;
  vec3 mn = min(e, min(min(b, d), min(f, h)));
  vec3 mx = max(e, max(max(b, d), max(f, h)));
  vec3 amp = sqrt(clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0));
  vec3 w = amp * (-1.0 / mix(8.0, 5.0, SHARPNESS));
  vec3 sharp = clamp((e + (b + d + f + h) * w) / (1.0 + 4.0 * w), 0.0, 1.0);
  // Пиксель темнее соседей — часть контура: делаем его чуть темнее, линии становятся чётче.
  float around = luma((b + d + f + h) * 0.25);
  float dark = max(0.0, around - luma(sharp));
  color = vec4(clamp(sharp - dark * LINES, 0.0, 1.0), 1.0);
}`

// Catmull-Rom за 9 выборок с билинейной подсказкой (как у TheRealMJP).
const UPSCALE = `#version 300 es
precision highp float;
uniform sampler2D src;
uniform vec2 size;
in vec2 uv;
out vec4 color;
void main() {
  vec2 p = uv * size;
  vec2 c = floor(p - 0.5) + 0.5;
  vec2 f = p - c;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (c - 1.0) / size;
  vec2 t3 = (c + 2.0) / size;
  vec2 t12 = (c + w2 / w12) / size;
  vec3 r = vec3(0.0);
  r += texture(src, vec2(t0.x, t0.y)).rgb * w0.x * w0.y;
  r += texture(src, vec2(t12.x, t0.y)).rgb * w12.x * w0.y;
  r += texture(src, vec2(t3.x, t0.y)).rgb * w3.x * w0.y;
  r += texture(src, vec2(t0.x, t12.y)).rgb * w0.x * w12.y;
  r += texture(src, vec2(t12.x, t12.y)).rgb * w12.x * w12.y;
  r += texture(src, vec2(t3.x, t12.y)).rgb * w3.x * w12.y;
  r += texture(src, vec2(t0.x, t3.y)).rgb * w0.x * w3.y;
  r += texture(src, vec2(t12.x, t3.y)).rgb * w12.x * w3.y;
  r += texture(src, vec2(t3.x, t3.y)).rgb * w3.x * w3.y;
  color = vec4(clamp(r, 0.0, 1.0), 1.0);
}`

/** Больше 4K не рисуем: на огромных экранах это только нагрузка. */
const MAX_WIDTH = 3840

export interface EnhanceHandlers {
  /** браузер не умеет WebGL2 или видеокарта отказала */
  onUnsupported: () => void
  /** видео с чужого сервера без разрешения CORS: нужно перезагрузить его с crossOrigin */
  onCors: () => void
}

/** Запускает фильтр. Возвращает функцию остановки. */
export function startEnhance(video: HTMLVideoElement, canvas: HTMLCanvasElement, on: EnhanceHandlers): () => void {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: false })
  if (!gl) {
    on.onUnsupported()
    return () => undefined
  }

  const program = (fragment: string) => {
    const p = gl.createProgram()!
    for (const [type, code] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const s = gl.createShader(type)!
      gl.shaderSource(s, code)
      gl.compileShader(s)
      gl.attachShader(p, s)
    }
    gl.bindAttribLocation(p, 0, 'pos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'shader')
    return p
  }

  const texture = () => {
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  let sharpen: WebGLProgram
  let upscale: WebGLProgram
  try {
    sharpen = program(SHARPEN)
    upscale = program(UPSCALE)
  } catch {
    on.onUnsupported()
    return () => undefined
  }

  // Один треугольник на весь экран.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

  const frameTex = texture()
  const sharpTex = texture()
  const fbo = gl.createFramebuffer()
  let srcW = 0
  let srcH = 0
  let stopped = false
  let failed = false

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    let w = Math.round(canvas.clientWidth * dpr)
    let h = Math.round(canvas.clientHeight * dpr)
    if (w > MAX_WIDTH) {
      h = Math.round((h * MAX_WIDTH) / w)
      w = MAX_WIDTH
    }
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w
      canvas.height = h
    }
  }

  function draw() {
    if (stopped || failed || video.readyState < 2 || !video.videoWidth) return
    resize()
    gl!.bindTexture(gl!.TEXTURE_2D, frameTex)
    try {
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, video)
    } catch {
      // SecurityError: кадр с чужого сервера без CORS читать нельзя.
      failed = true
      on.onCors()
      return
    }
    if (video.videoWidth !== srcW || video.videoHeight !== srcH) {
      srcW = video.videoWidth
      srcH = video.videoHeight
      gl!.bindTexture(gl!.TEXTURE_2D, sharpTex)
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, srcW, srcH, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null)
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
      gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, sharpTex, 0)
    }

    // 1. Резкость в исходном разрешении.
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo)
    gl!.viewport(0, 0, srcW, srcH)
    gl!.useProgram(sharpen)
    gl!.activeTexture(gl!.TEXTURE0)
    gl!.bindTexture(gl!.TEXTURE_2D, frameTex)
    gl!.uniform1i(gl!.getUniformLocation(sharpen, 'src'), 0)
    gl!.uniform2f(gl!.getUniformLocation(sharpen, 'texel'), 1 / srcW, 1 / srcH)
    gl!.uniform1f(gl!.getUniformLocation(sharpen, 'flipY'), 1)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)

    // 2. Растягиваем до экрана с сохранением пропорций (как object-fit: contain у <video>).
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
    gl!.clearColor(0, 0, 0, 1)
    gl!.clear(gl!.COLOR_BUFFER_BIT)
    const scale = Math.min(canvas.width / srcW, canvas.height / srcH)
    const vw = Math.round(srcW * scale)
    const vh = Math.round(srcH * scale)
    gl!.viewport(Math.round((canvas.width - vw) / 2), Math.round((canvas.height - vh) / 2), vw, vh)
    gl!.useProgram(upscale)
    gl!.bindTexture(gl!.TEXTURE_2D, sharpTex)
    gl!.uniform1i(gl!.getUniformLocation(upscale, 'src'), 0)
    gl!.uniform2f(gl!.getUniformLocation(upscale, 'size'), srcW, srcH)
    gl!.uniform1f(gl!.getUniformLocation(upscale, 'flipY'), -1)
    gl!.drawArrays(gl!.TRIANGLES, 0, 3)
  }

  // Рисуем каждый новый кадр видео; где requestVideoFrameCallback нет — каждый кадр экрана.
  type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number; cancelVideoFrameCallback?: (id: number) => void }
  const v = video as FrameVideo
  let handle = 0
  const loop = () => {
    draw()
    if (stopped || failed) return
    handle = v.requestVideoFrameCallback ? v.requestVideoFrameCallback(loop) : requestAnimationFrame(loop)
  }
  loop()
  // На паузе новых кадров нет: перерисовываем после перемотки и смены размера.
  const redraw = () => requestAnimationFrame(draw)
  video.addEventListener('seeked', redraw)
  video.addEventListener('loadeddata', redraw)
  const observer = new ResizeObserver(redraw)
  observer.observe(canvas)

  return () => {
    stopped = true
    if (v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(handle)
    else cancelAnimationFrame(handle)
    video.removeEventListener('seeked', redraw)
    video.removeEventListener('loadeddata', redraw)
    observer.disconnect()
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
