'use client'

// Hands the inbox controller's values to the inbox's pieces.

import { createContext, useContext } from 'react'
import type { useInboxController } from '@/components/inbox/useInboxController'

export type Inbox = ReturnType<typeof useInboxController>

export const InboxContext = createContext<Inbox | null>(null)

export function useInbox(): Inbox {
  const v = useContext(InboxContext)
  if (!v) throw new Error('useInbox() is only for the inbox page')
  return v
}
