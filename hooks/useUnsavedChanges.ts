'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DraftService } from '@/lib/draft-service'

interface UseUnsavedChangesOptions {
  contentType: 'idea' | 'announcement' | 'help' | 'form' | 'survey' | 'poll'
  companyId: string
  contentId?: string
  isModified: boolean
  contentData: Record<string, any>
}

export function useUnsavedChanges({
  contentType,
  companyId,
  contentId,
  isModified,
  contentData
}: UseUnsavedChangesOptions) {
  const router = useRouter()
  const [showPrompt, setShowPrompt] = useState(false)
  const [pendingRoute, setPendingRoute] = useState<string | null>(null)

  // Auto-save to draft
  useEffect(() => {
    if (!isModified) return

    const draftKey = `${contentType}_${companyId}_${contentId || 'new'}`

    DraftService.startAutoSave(draftKey, {
      type: contentType,
      id: contentId,
      companyId,
      data: contentData,
      timestamp: Date.now()
    })

    return () => {
      DraftService.stopAutoSave(draftKey)
    }
  }, [isModified, contentType, companyId, contentId, contentData])

  // Handle page unload
  useEffect(() => {
    if (!isModified) return

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isModified])

  // Intercept navigation
  const handleNavigation = (route: string, action: 'save' | 'discard' | 'cancel') => {
    if (action === 'save') {
      // Save as draft and navigate
      const draftKey = `${contentType}_${companyId}_${contentId || 'new'}`
      DraftService.saveToLocalStorage({
        type: contentType,
        id: contentId,
        companyId,
        data: contentData,
        timestamp: Date.now()
      })
      setShowPrompt(false)
      router.push(route)
    } else if (action === 'discard') {
      // Clear draft and navigate
      DraftService.clearDraft(contentType, companyId, contentId)
      setShowPrompt(false)
      router.push(route)
    } else if (action === 'cancel') {
      // Don't navigate
      setShowPrompt(false)
      setPendingRoute(null)
    }
  }

  // Override router.push to show prompt
  const pushWithPrompt = (route: string) => {
    if (isModified) {
      setPendingRoute(route)
      setShowPrompt(true)
    } else {
      router.push(route)
    }
  }

  return {
    showPrompt,
    pendingRoute,
    handleNavigation,
    pushWithPrompt,
    setShowPrompt,
    setPendingRoute
  }
}
