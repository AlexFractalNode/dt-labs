/// <reference lib="webworker" />
/** Runs decision-tree jobs off the main thread. Protocol: see WorkerRequest / WorkerResponse in client.ts. */
import { DtError } from '../core/errors'
import type { WorkerRequest, WorkerResponse } from './client'
import { runJob } from './jobs'

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(msg: WorkerResponse): void {
  scope.postMessage(msg)
}

scope.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const { runId, job } = ev.data
  try {
    const result = runJob(job, (done, total) => post({ type: 'progress', runId, done, total }))
    post({ type: 'done', runId, result })
  } catch (e) {
    if (e instanceof DtError) {
      post({ type: 'error', runId, code: e.code, details: e.details, message: e.message })
    } else {
      const message = e instanceof Error ? e.message : String(e)
      post({ type: 'error', runId, code: 'WORKER_FAILED', details: { reason: 'internal', message }, message })
    }
  }
}
