/**
 * Main-thread client for the job worker. One run at a time per client: starting a run or cancelling terminates
 * the busy worker (a fresh one is created lazily) and every response is matched by `runId`, so a result of a
 * cancelled run is never applied. Each tool keeps one client per job kind, so a run of one kind never cancels
 * a run of another.
 */
import { DtError, type DtErrorCode } from '../core/errors'
import type { DtJob, ResultOf } from './jobs'

export type WorkerRequest = { type: 'run'; runId: number; job: DtJob }

export type WorkerResponse =
  | { type: 'progress'; runId: number; done: number; total: number }
  | { type: 'done'; runId: number; result: ResultOf<DtJob> }
  | { type: 'error'; runId: number; code: DtErrorCode; details?: Record<string, unknown>; message: string }

export interface JobHandle<R> {
  runId: number
  promise: Promise<R>
  cancel(): void
}

export interface JobClient {
  start<J extends DtJob>(job: J, onProgress?: (done: number, total: number) => void): JobHandle<ResultOf<J>>
  /** Cancels the pending run and terminates the worker; a later `start` creates a new one. */
  dispose(): void
}

interface Pending {
  runId: number
  onProgress?: (done: number, total: number) => void
  resolve: (r: ResultOf<DtJob>) => void
  reject: (e: DtError) => void
}

const defaultCreateWorker = (): Worker => new Worker(new URL('./dt.worker.ts', import.meta.url), { type: 'module' })

export function createJobClient(createWorker: () => Worker = defaultCreateWorker): JobClient {
  let worker: Worker | null = null
  let pending: Pending | null = null
  let lastRunId = 0

  function dropWorker(): void {
    if (!worker) return
    worker.onmessage = null
    worker.onerror = null
    worker.onmessageerror = null
    worker.terminate()
    worker = null
  }

  function settle(runId: number): Pending | null {
    if (!pending || pending.runId !== runId) return null
    const p = pending
    pending = null
    return p
  }

  function onMessage(ev: MessageEvent<WorkerResponse>): void {
    const msg = ev.data
    if (!pending || msg.runId !== pending.runId) return // stale message of a cancelled or finished run
    if (msg.type === 'progress') pending.onProgress?.(msg.done, msg.total)
    else if (msg.type === 'done') settle(msg.runId)?.resolve(msg.result)
    else settle(msg.runId)?.reject(new DtError(msg.code, msg.details, msg.message))
  }

  /** Rejects the current run with WORKER_FAILED and discards the worker (it may still be busy). */
  function failCurrent(details: Record<string, unknown>): void {
    const p = pending
    pending = null
    dropWorker()
    p?.reject(new DtError('WORKER_FAILED', details))
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = createWorker()
      worker.onmessage = onMessage
      worker.onerror = (ev: ErrorEvent) => failCurrent({ reason: 'workerError', message: ev.message })
      worker.onmessageerror = () => failCurrent({ reason: 'messageError' })
    }
    return worker
  }

  function cancelRun(runId: number): void {
    const p = settle(runId)
    if (!p) return
    dropWorker()
    p.reject(new DtError('CANCELLED'))
  }

  function start<J extends DtJob>(
    job: J,
    onProgress?: (done: number, total: number) => void,
  ): JobHandle<ResultOf<J>> {
    if (pending) cancelRun(pending.runId)
    const runId = ++lastRunId
    const promise = new Promise<ResultOf<J>>((resolve, reject) => {
      pending = { runId, onProgress, resolve: resolve as Pending['resolve'], reject }
    })
    const request: WorkerRequest = { type: 'run', runId, job }
    try {
      ensureWorker().postMessage(request)
    } catch (e) {
      // Worker creation or structured cloning failed synchronously: settle this run now so no orphaned
      // promise remains pending; the caller observes the rejection through `promise`.
      failCurrent({ reason: 'postFailed', message: e instanceof Error ? e.message : String(e) })
    }
    return { runId, promise, cancel: () => cancelRun(runId) }
  }

  function dispose(): void {
    if (pending) cancelRun(pending.runId)
    dropWorker()
  }

  return { start, dispose }
}
