import { initTracer, trace } from './tracer'
import type { WorkerRequest, WorkerResponse } from './types'

let width = 0
let height = 0
let pixels: Uint8Array | null = null

const post = (msg: WorkerResponse) => self.postMessage(msg)

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const msg = event.data
  if (msg.type === 'init') {
    width = msg.width
    height = msg.height
    pixels = new Uint8Array(msg.buffer)
    return
  }
  if (!pixels) return
  try {
    await initTracer()
    const result = trace(pixels, width, height, msg.params, msg.outWidth, msg.outHeight)
    post({ type: 'traced', gen: msg.gen, ...result })
  } catch (error) {
    post({ type: 'error', gen: msg.gen, message: error instanceof Error ? error.message : String(error) })
  }
}
