/**
 * Sync Progress Tracker
 * Tracks real-time sync progress with event streaming
 */

interface SyncProgress {
  companyId: string
  status: 'idle' | 'syncing' | 'complete' | 'error'
  customersProcessed: number
  totalCustomers: number
  ordersProcessed: number
  currentCustomer?: string
  percentComplete: number
  startedAt: Date
  estimatedTimeRemaining: number
  error?: string
}

const syncState = new Map<string, SyncProgress>()

export class SyncProgressService {
  static initializeSync(companyId: string, totalCustomers: number): SyncProgress {
    const progress: SyncProgress = {
      companyId,
      status: 'syncing',
      customersProcessed: 0,
      totalCustomers,
      ordersProcessed: 0,
      percentComplete: 0,
      startedAt: new Date(),
      estimatedTimeRemaining: totalCustomers * 0.005,
    }
    syncState.set(companyId, progress)
    return progress
  }

  static updateProgress(
    companyId: string,
    customersProcessed: number,
    ordersProcessed: number,
    currentCustomer?: string
  ): SyncProgress | null {
    const progress = syncState.get(companyId)
    if (!progress) return null

    const elapsed = (Date.now() - progress.startedAt.getTime()) / 1000
    const rate = customersProcessed > 0 ? elapsed / customersProcessed : 0
    const remaining = (progress.totalCustomers - customersProcessed) * rate

    progress.customersProcessed = customersProcessed
    progress.ordersProcessed = ordersProcessed
    progress.currentCustomer = currentCustomer
    progress.percentComplete = Math.round((customersProcessed / progress.totalCustomers) * 100)
    progress.estimatedTimeRemaining = Math.ceil(remaining)

    return progress
  }

  static completeSync(companyId: string): SyncProgress | null {
    const progress = syncState.get(companyId)
    if (!progress) return null
    progress.status = 'complete'
    progress.percentComplete = 100
    setTimeout(() => syncState.delete(companyId), 5 * 60 * 1000)
    return progress
  }

  static failSync(companyId: string, error: string): SyncProgress | null {
    const progress = syncState.get(companyId)
    if (!progress) return null
    progress.status = 'error'
    progress.error = error
    setTimeout(() => syncState.delete(companyId), 5 * 60 * 1000)
    return progress
  }

  static getProgress(companyId: string): SyncProgress | null {
    return syncState.get(companyId) || null
  }

  static reset(companyId: string): void {
    syncState.delete(companyId)
  }
}
