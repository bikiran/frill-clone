'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from './supabase'

interface TerminologyContextType {
  terms: Record<string, string>
  getTerm: (key: string, defaultValue?: string) => string
  loading: boolean
}

const TerminologyContext = createContext<TerminologyContextType | undefined>(undefined)

const DEFAULT_TERMS: Record<string, string> = {
  ideas: 'Ideas',
  announcements: 'Announcements',
  roadmap: 'Roadmap',
  surveys: 'Surveys',
  idea: 'Idea',
  submit_idea: 'Submit Idea',
  create_idea: 'Create Idea',
  vote: 'Vote',
  votes: 'Votes',
  topics: 'Topics',
  status: 'Status',
  priority: 'Priority',
  comment: 'Comment',
  comments: 'Comments',
  manage: 'Manage',
  settings: 'Settings',
  admin: 'Admin',
  trending: 'Trending',
  latest: 'Latest',
  most_votes: 'Most Votes',
  search: 'Search',
  filter: 'Filter',
  sort: 'Sort',
  delete: 'Delete',
  edit: 'Edit',
  save: 'Save',
  cancel: 'Cancel',
  loading: 'Loading',
  no_results: 'No results',
}

export function TerminologyProvider({ children }: { children: ReactNode }) {
  const [terms, setTerms] = useState<Record<string, string>>(DEFAULT_TERMS)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchTerminology = async () => {
      try {
        const { data } = await supabase.from('terminology').select('key, label')
        if (data) {
          const termsMap = data.reduce((acc, item) => {
            acc[item.key] = item.label
            return acc
          }, {} as Record<string, string>)
          setTerms({ ...DEFAULT_TERMS, ...termsMap })
        }
      } catch (error) {
        console.error('Failed to fetch terminology:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTerminology()
  }, [])

  const getTerm = (key: string, defaultValue?: string): string => {
    return terms[key] || defaultValue || key
  }

  return (
    <TerminologyContext.Provider value={{ terms, getTerm, loading }}>
      {children}
    </TerminologyContext.Provider>
  )
}

export function useTerminology() {
  const context = useContext(TerminologyContext)
  if (!context) {
    throw new Error('useTerminology must be used within TerminologyProvider')
  }
  return context
}
