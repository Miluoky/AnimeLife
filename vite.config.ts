import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import preact from '@preact/preset-vite'

const HOP_HEADERS = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection'])

/**
 * В dev нет Cloudflare Worker, а http-proxy Vite буферизует ответ и ломает Range.
 * Тот же sibnetProxy, что на проде: стрим MP4 пишется в ответ Node напрямую.
 */
function sibnetDevProxy(): Plugin {
  return {
    name: 'sibnet-dev-proxy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? ''
        const pathname = rawUrl.split('?')[0] ?? ''
        if (!pathname.startsWith('/api/sibnet/')) {
          next()
          return
        }
        void proxySibnet(server.config.root, req, res)
      })
    },
  }
}

async function proxySibnet(root: string, req: IncomingMessage, res: ServerResponse) {
  try {
    const host = req.headers.host || 'localhost'
    const headers = new Headers()
    const rangeHeader = req.headers.range
    const range = Array.isArray(rangeHeader) ? rangeHeader[0] : rangeHeader
    if (range) headers.set('Range', range)

    const request = new Request(new URL(req.url ?? '/', `http://${host}`), {
      method: req.method || 'GET',
      headers,
    })
    const mod = (await import(pathToFileURL(join(root, 'worker/sibnetProxy.js')).href)) as {
      sibnetProxy: (request: Request) => Promise<Response>
    }
    const response = await mod.sibnetProxy(request)
    await writeSibnetResponse(req, res, response)
  } catch {
    if (res.headersSent || res.writableEnded) {
      res.destroy()
      return
    }
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'proxy error' }))
  }
}

async function writeSibnetResponse(req: IncomingMessage, res: ServerResponse, response: Response) {
  res.statusCode = response.status
  if (response.statusText) res.statusMessage = response.statusText

  const encoding = response.headers.get('content-encoding')
  const decoded = !!encoding && encoding !== 'identity'
  response.headers.forEach((value, key) => {
    if (HOP_HEADERS.has(key)) return
    if (decoded && (key === 'content-encoding' || key === 'content-length')) return
    try {
      res.setHeader(key, value)
    } catch {
      // Node не принимает часть служебных заголовков fetch.
    }
  })

  const method = req.method || 'GET'
  if (method === 'HEAD' || !response.body) {
    if (response.body) await response.body.cancel().catch(() => {})
    res.end()
    return
  }

  if (typeof Readable.fromWeb === 'function') {
    const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
    nodeStream.on('error', () => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'proxy error' }))
      } else {
        res.destroy()
      }
    })
    res.on('close', () => nodeStream.destroy())
    nodeStream.pipe(res)
    return
  }

  res.end(Buffer.from(await response.arrayBuffer()))
}

/**
 * precache.json: код и стили всех страниц сборки. Service worker (public/sw.js) скачивает их на быстрой сети,
 * чтобы без интернета открывались и те разделы, куда зритель ещё не заходил. hls.js (около 120 КБ)
 * не входит: он нужен только одному плееру в части браузеров.
 */
function precacheList(): Plugin {
  return {
    name: 'precache-list',
    apply: 'build',
    // После записи: Vite к этому моменту уже убрал пустые части (JS у страниц, где только CSS).
    writeBundle(options, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => /^assets\/.+\.(js|css|woff2)$/.test(f) && !/^assets\/hls/.test(f))
        .sort()
      writeFileSync(join(options.dir ?? 'dist', 'precache.json'), JSON.stringify(files))
    },
  }
}

export default defineConfig({
  // Сайт можно собрать для подпапки: BASE_PATH=/папка/ npm run build.
  base: process.env.BASE_PATH ?? '/',
  // Preact вместо React: тот же API через preact/compat, а основной бандл легче примерно на 35 КБ (gzip).
  plugins: [preact(), precacheList(), sibnetDevProxy()],
  build: {
    // Модули AudioWorklet (шумоподавление) всегда отдельными файлами: data:-ссылку addModule берёт не везде.
    assetsInlineLimit: (file) => (/worklet/i.test(file) ? false : undefined),
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/')
          // hls.js только для AniLibria/HLS в части браузеров — не в main и не в Player.
          if (normalized.includes('node_modules/hls.js')) return 'hls'
          if (
            normalized.includes('node_modules/@remix-run') ||
            normalized.includes('node_modules/react-router') ||
            normalized.includes('node_modules/react-router-dom')
          ) {
            return 'router'
          }
        },
      },
    },
  },
})
