import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const WASM_MODULE = 'virtual:vtracer-wasm'

// Inline the vtracer wasm as base64 so the worker never has to fetch it.
// That keeps `connect-src 'none'` intact: the app is provably incapable of
// making any network request, which is the privacy claim the UI makes.
function inlineWasm(): Plugin {
  const resolved = '\0' + WASM_MODULE
  return {
    name: 'inline-vtracer-wasm',
    resolveId: (id) => (id === WASM_MODULE ? resolved : undefined),
    async load(id) {
      if (id !== resolved) return
      const path = createRequire(import.meta.url).resolve('wasm_vtracer/wasm_vtracer_bg.wasm')
      const base64 = (await readFile(path)).toString('base64')
      return `export default ${JSON.stringify(base64)}`
    },
  }
}

// Strict CSP on the built index.html only — the dev server needs inline
// preambles and an HMR websocket that this policy would block.
// 'wasm-unsafe-eval' is required to compile the inlined WebAssembly module.
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: [
                "default-src 'none'",
                "script-src 'self' 'wasm-unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' blob: data:",
                "worker-src 'self' blob:",
                "connect-src 'none'",
                "font-src 'self'",
                "base-uri 'none'",
                "form-action 'none'",
              ].join('; '),
            },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), inlineWasm(), cspPlugin()],
  base: './',
  build: {
    target: 'es2022',
  },
  worker: {
    format: 'es',
    plugins: () => [inlineWasm()],
  },
})
