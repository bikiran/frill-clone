'use client'

// "Create job" from somewhere else in Colvy (a conversation, a booking, a
// form response). The server fills the job in from its source and links the
// two; the same booking or response always gives the same job.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { readStored, writeStored } from '@/lib/client-cache'
import { jobsEnabled } from '@/lib/modules'
import { api } from '@/components/booking/admin/shared'

export type JobSource =
  | { source: 'conversation'; conversationId: string }
  | { source: 'booking'; bookingId: string }
  | { source: 'form'; formResponseId: string }

const key = () => {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}

/** Make (or find) the job and return it: { job: { id, number }, existing? }. */
export async function createJobFrom(companyId: string, src: JobSource): Promise<{ job: { id: string; number: number }; existing?: boolean }> {
  return api('/api/jobs', { method: 'POST', json: { companyId, createKey: key(), ...src } })
}

const cacheKey = (cid: string) => `jobs-module:${cid}`

/**
 * Is Jobs & quotes on for this workspace? (lib/modules: the switch in Quote
 * Settings, else the business type.) Remembered in this browser so menus
 * don't flicker; checked again each time, and updated when Settings changes it.
 */
export function useJobsEnabled(companyId: string | null | undefined): boolean {
  const [on, setOn] = useState<boolean>(() => !!(companyId && readStored<boolean>(cacheKey(companyId))))
  useEffect(() => {
    if (!companyId) { setOn(false); return }
    setOn(!!readStored<boolean>(cacheKey(companyId)))
    let live = true
    ;(supabase as any).from('companies').select('*').eq('id', companyId).maybeSingle()
      .then(({ data }: any) => { if (!live || !data) return; const v = jobsEnabled(data); setOn(v); writeStored(cacheKey(companyId), v) }, () => {})
    const onChange = (e: any) => {
      const m = e?.detail?.modules
      if (m && typeof m.jobs === 'boolean') { setOn(m.jobs); writeStored(cacheKey(companyId), m.jobs) }
    }
    window.addEventListener('colvy:modules-changed', onChange)
    return () => { live = false; window.removeEventListener('colvy:modules-changed', onChange) }
  }, [companyId])
  return on
}
