'use client'

import { uploadAttachment, type UploadedAttachment } from '@/lib/upload-attachment'

/**
 * Background upload queue.
 *
 * Attachments used to upload inline: the composer sat disabled while five
 * photos went up one at a time, and a dropped connection halfway through lost
 * the lot. Here uploads run in the background — you can keep typing, switch
 * conversations, or move to another page while they finish — and each file
 * retries on its own if the network wobbles, which matters on mobile.
 *
 * The queue is a module-level singleton so it survives navigation within the
 * app. It does NOT survive a full page reload: anything still in flight is
 * lost, which is why the indicator warns before you close the tab.
 */

export type ItemStatus = 'pending' | 'uploading' | 'done' | 'failed'

export interface QueueItem {
  id: string
  name: string
  size: number
  status: ItemStatus
  progress: number          // 0–1 for this file
  attempts: number
  error?: string
  result?: UploadedAttachment
}

export interface Batch {
  id: string
  companyId: string
  conversationId: string
  label: string
  items: QueueItem[]
  /** Runs once every file has finished, with whatever uploaded successfully. */
  onComplete: (uploaded: UploadedAttachment[], failed: QueueItem[]) => void | Promise<void>
  finished: boolean
}

const MAX_ATTEMPTS = 3
const CONCURRENCY = 2          // two at once: faster than serial, gentle on mobile uplink
const BACKOFF_MS = [0, 1500, 4000]

type Listener = (batches: Batch[]) => void

class UploadQueue {
  private batches: Batch[] = []
  private files = new Map<string, File>()   // held outside state; File isn't serialisable
  private listeners = new Set<Listener>()
  private running = 0

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => { this.listeners.delete(fn) }
  }

  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach(fn => fn(snap))
  }

  private snapshot(): Batch[] {
    // Shallow clones so React sees new references and re-renders.
    return this.batches.map(b => ({ ...b, items: b.items.map(i => ({ ...i })) }))
  }

  /** Anything still uploading — used to warn before the tab closes. */
  get activeCount(): number {
    return this.batches
      .filter(b => !b.finished)
      .reduce((n, b) => n + b.items.filter(i => i.status !== 'done' && i.status !== 'failed').length, 0)
  }

  enqueue(
    files: File[],
    ctx: { companyId: string; conversationId: string; label?: string },
    onComplete: Batch['onComplete'],
  ): string {
    const batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const items: QueueItem[] = files.map((f, i) => {
      const id = `${batchId}_${i}`
      this.files.set(id, f)
      return { id, name: f.name, size: f.size, status: 'pending', progress: 0, attempts: 0 }
    })
    this.batches.push({
      id: batchId,
      companyId: ctx.companyId,
      conversationId: ctx.conversationId,
      label: ctx.label || (files.length > 1 ? `${files.length} files` : files[0]?.name || 'Attachment'),
      items,
      onComplete,
      finished: false,
    })
    this.emit()
    this.pump()
    return batchId
  }

  /** Retry the failed files in a batch — the successful ones aren't redone. */
  retry(batchId: string) {
    const b = this.batches.find(x => x.id === batchId)
    if (!b) return
    for (const item of b.items) {
      if (item.status === 'failed' && this.files.has(item.id)) {
        item.status = 'pending'
        item.attempts = 0
        item.error = undefined
      }
    }
    b.finished = false
    this.emit()
    this.pump()
  }

  /** Give up on a batch: drop its files and let it settle. */
  dismiss(batchId: string) {
    const b = this.batches.find(x => x.id === batchId)
    if (b) for (const i of b.items) this.files.delete(i.id)
    this.batches = this.batches.filter(x => x.id !== batchId)
    this.emit()
  }

  private nextPending(): { batch: Batch; item: QueueItem } | null {
    for (const batch of this.batches) {
      if (batch.finished) continue
      for (const item of batch.items) {
        if (item.status === 'pending') return { batch, item }
      }
    }
    return null
  }

  private async pump() {
    while (this.running < CONCURRENCY) {
      const next = this.nextPending()
      if (!next) break
      this.running++
      // Deliberately not awaited — that's what lets several run at once.
      void this.run(next.batch, next.item).finally(() => {
        this.running--
        this.pump()
        this.settle()
      })
    }
    this.settle()
  }

  private async run(batch: Batch, item: QueueItem) {
    const file = this.files.get(item.id)
    if (!file) {
      item.status = 'failed'
      item.error = 'File is no longer available'
      this.emit()
      return
    }

    item.status = 'uploading'
    item.attempts++
    item.progress = 0
    this.emit()

    // Wait a moment before a retry — an immediate retry on a flaky connection
    // usually just fails again.
    const wait = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)]
    if (wait > 0) await new Promise(r => setTimeout(r, wait))

    try {
      const result = await uploadAttachment(file, {
        companyId: batch.companyId,
        conversationId: batch.conversationId,
        onProgress: (p: number) => { item.progress = p; this.emit() },
      })
      item.result = result
      item.status = 'done'
      item.progress = 1
      this.files.delete(item.id)
    } catch (e: any) {
      item.error = e?.message || 'Upload failed'
      if (item.attempts < MAX_ATTEMPTS) {
        item.status = 'pending'          // picked up again by pump()
      } else {
        item.status = 'failed'
      }
    }
    this.emit()
  }

  /** Fire onComplete once nothing in a batch is still moving. */
  private settle() {
    for (const batch of this.batches) {
      if (batch.finished) continue
      const stillGoing = batch.items.some(i => i.status === 'pending' || i.status === 'uploading')
      if (stillGoing) continue
      batch.finished = true
      const uploaded = batch.items.filter(i => i.result).map(i => i.result!) as UploadedAttachment[]
      const failed = batch.items.filter(i => i.status === 'failed')
      this.emit()
      // Don't let a throwing callback wedge the queue.
      Promise.resolve(batch.onComplete(uploaded, failed)).catch(err =>
        console.error('[upload queue] batch callback failed', err))
      // Clear a fully successful batch shortly after, so the indicator doesn't
      // linger. Batches with failures stay so they can be retried.
      if (failed.length === 0) {
        setTimeout(() => this.dismiss(batch.id), 2500)
      }
    }
  }
}

export const uploadQueue = new UploadQueue()

// Warn before losing in-flight uploads to a reload or a closed tab.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (uploadQueue.activeCount > 0) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
}
