'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { termFor } from './terminology'

// Delivers the workspace's wording (lib/terminology) to the public board.
// AppChrome passes the terms it loads with the site settings; the Settings page
// broadcasts 'colvy-terminology-update' on save so open pages update live.

interface TerminologyContextType {
  terms: Record<string, string>
  getTerm: (key: string) => string
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined)

export function TerminologyProvider({ children, terms: initial }: { children: ReactNode; terms?: Record<string, string> | null }) {
  const [terms, setTerms] = useState<Record<string, string>>(initial || {})
  useEffect(() => { setTerms(initial || {}) }, [initial])
  useEffect(() => {
    const onUpdate = (e: Event) => { const d = (e as CustomEvent).detail; if (d && typeof d === 'object') setTerms(d) }
    window.addEventListener('colvy-terminology-update', onUpdate)
    return () => window.removeEventListener('colvy-terminology-update', onUpdate)
  }, [])
  return (
    <TerminologyContext.Provider value={{ terms, getTerm: (k: string) => termFor(terms, k) }}>
      {children}
    </TerminologyContext.Provider>
  )
}

/** The workspace's wording. Outside a provider it falls back to the defaults. */
export function useTerminology(): TerminologyContextType {
  return useContext(TerminologyContext) || { terms: {}, getTerm: (k: string) => termFor(null, k) }
}
