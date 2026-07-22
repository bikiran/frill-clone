'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export type DraftKind = 'message' | 'task' | 'event'

/**
 * Drafts let someone start a message or task, walk away, and pick it up later.
 * They're personal — keyed on the signed-in user — so two people working the
 * same conversation don't overwrite each other.
 *
 * Saving is deliberately forgiving: if the drafts table hasn't been migrated
 * yet, every call quietly no-ops rather than throwing in the middle of someone
 * typing.
 */

export async function loadDraft(userId: string, kind: DraftKind, refId = ''): Promise<any | null> {
  if (!userId) return null
  try {
    const { data } = await (supabase as any).from('drafts')
      .select('content').eq('user_id', userId).eq('kind', kind).eq('ref_id', refId || '')
      .limit(1)
    return data?.length ? data[0].content : null
  } catch { return null }
}

export async function saveDraft(
  userId: string, companyId: string | null, kind: DraftKind, refId: string, content: any
): Promise<void> {
  if (!userId) return
  const ref = refId || ''
  try {
    // Update first, insert if nothing was there. Avoids relying on upsert
    // semantics against the unique index.
    const { data } = await (supabase as any).from('drafts')
      .select('id').eq('user_id', userId).eq('kind', kind).eq('ref_id', ref).limit(1)
    if (data?.length) {
      await (supabase as any).from('drafts')
        .update({ content, updated_at: new Date().toISOString() }).eq('id', data[0].id)
    } else {
      await (supabase as any).from('drafts')
        .insert({ user_id: userId, company_id: companyId, kind, ref_id: ref, content })
    }
  } catch { /* drafts are a convenience, never block the user */ }
}

export async function clearDraft(userId: string, kind: DraftKind, refId = ''): Promise<void> {
  if (!userId) return
  try {
    await (supabase as any).from('drafts')
      .delete().eq('user_id', userId).eq('kind', kind).eq('ref_id', refId || '')
  } catch { /* ignore */ }
}

/**
 * Auto-saving draft hook.
 *
 * Returns the restored draft (once loaded) and a `saved` flag for showing a
 * "Draft saved" hint. Writes are debounced so typing doesn't hammer the
 * database.
 */
export function useDraft(
  userId: string | null,
  companyId: string | null,
  kind: DraftKind,
  refId: string,
  value: any,
  { enabled = true, isEmpty }: { enabled?: boolean; isEmpty?: (v: any) => boolean } = {}
) {
  const [restored, setRestored] = useState<any | null>(null)
  const [ready, setReady] = useState(false)
  const [saved, setSaved] = useState(false)
  const timer = useRef<any>(null)
  const skipFirst = useRef(true)

  // Restore whatever was left behind for this user + thing.
  useEffect(() => {
    let cancelled = false
    setReady(false); setRestored(null); skipFirst.current = true
    if (!userId || !enabled) { setReady(true); return }
    ;(async () => {
      const d = await loadDraft(userId, kind, refId)
      if (!cancelled) { setRestored(d); setReady(true) }
    })()
    return () => { cancelled = true }
  }, [userId, kind, refId, enabled])

  // Save on change, debounced. The dependency is the serialised value, not the
  // object itself — callers usually build a fresh object each render, which
  // would otherwise re-trigger this on every keystroke of unrelated state.
  const serialised = JSON.stringify(value ?? null)
  useEffect(() => {
    if (!userId || !enabled || !ready) return
    // Don't write the value we just restored straight back.
    if (skipFirst.current) { skipFirst.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const empty = isEmpty ? isEmpty(value) : !value
      if (empty) {
        await clearDraft(userId, kind, refId)
        setSaved(false)
      } else {
        await saveDraft(userId, companyId, kind, refId, value)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialised, userId, companyId, kind, refId, enabled, ready])

  const discard = useCallback(async () => {
    if (userId) await clearDraft(userId, kind, refId)
    setSaved(false)
  }, [userId, kind, refId])

  return { restored, ready, saved, discard }
}
