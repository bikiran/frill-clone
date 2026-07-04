'use client'

/**
 * Draft Service - Handle auto-save and draft management
 */

interface DraftData {
  type: 'idea' | 'announcement' | 'help' | 'form' | 'survey' | 'poll'
  id?: string
  companyId: string
  data: Record<string, any>
  timestamp: number
}

const DRAFT_STORAGE_KEY = 'colvy_drafts'
const AUTOSAVE_INTERVAL = 30000 // 30 seconds
const DB_SYNC_INTERVAL = 300000 // 5 minutes

export class DraftService {
  private static autoSaveTimers: Map<string, NodeJS.Timeout> = new Map()
  private static dbSyncTimers: Map<string, NodeJS.Timeout> = new Map()

  /**
   * Start auto-saving a draft to localStorage
   */
  static startAutoSave(
    key: string,
    draftData: DraftData,
    onDbSync?: (data: DraftData) => Promise<void>
  ) {
    // Clear existing timer
    if (this.autoSaveTimers.has(key)) {
      clearInterval(this.autoSaveTimers.get(key)!)
    }

    // Save to localStorage immediately
    this.saveToLocalStorage(draftData)

    // Auto-save to localStorage every 30 seconds
    const localStorageInterval = setInterval(() => {
      this.saveToLocalStorage(draftData)
    }, AUTOSAVE_INTERVAL)

    this.autoSaveTimers.set(key, localStorageInterval)

    // Sync to database every 5 minutes if callback provided
    if (onDbSync) {
      const dbSyncInterval = setInterval(async () => {
        try {
          await onDbSync(draftData)
        } catch (err) {
          console.error('Failed to sync draft to database:', err)
        }
      }, DB_SYNC_INTERVAL)

      this.dbSyncTimers.set(key, dbSyncInterval)
    }
  }

  /**
   * Stop auto-saving
   */
  static stopAutoSave(key: string) {
    if (this.autoSaveTimers.has(key)) {
      clearInterval(this.autoSaveTimers.get(key)!)
      this.autoSaveTimers.delete(key)
    }

    if (this.dbSyncTimers.has(key)) {
      clearInterval(this.dbSyncTimers.get(key)!)
      this.dbSyncTimers.delete(key)
    }
  }

  /**
   * Save draft to localStorage
   */
  static saveToLocalStorage(draftData: DraftData) {
    try {
      const drafts = this.getAllDrafts()
      const key = `${draftData.type}_${draftData.companyId}_${draftData.id || 'new'}`

      drafts[key] = {
        ...draftData,
        timestamp: Date.now()
      }

      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
    } catch (err) {
      console.error('Failed to save draft to localStorage:', err)
    }
  }

  /**
   * Load draft from localStorage
   */
  static loadFromLocalStorage(
    type: string,
    companyId: string,
    id?: string
  ): DraftData | null {
    try {
      const drafts = this.getAllDrafts()
      const key = `${type}_${companyId}_${id || 'new'}`
      return drafts[key] || null
    } catch (err) {
      console.error('Failed to load draft from localStorage:', err)
      return null
    }
  }

  /**
   * Get all drafts
   */
  static getAllDrafts(): Record<string, DraftData> {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY)
      return stored ? JSON.parse(stored) : {}
    } catch (err) {
      console.error('Failed to get drafts:', err)
      return {}
    }
  }

  /**
   * Clear draft from localStorage
   */
  static clearDraft(type: string, companyId: string, id?: string) {
    try {
      const drafts = this.getAllDrafts()
      const key = `${type}_${companyId}_${id || 'new'}`
      delete drafts[key]
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts))
    } catch (err) {
      console.error('Failed to clear draft:', err)
    }
  }

  /**
   * Check if draft exists and is newer than published version
   */
  static hasFreshDraft(
    type: string,
    companyId: string,
    publishedAt?: number,
    id?: string
  ): boolean {
    const draft = this.loadFromLocalStorage(type, companyId, id)
    if (!draft) return false

    if (!publishedAt) return true

    return draft.timestamp > publishedAt
  }
}
