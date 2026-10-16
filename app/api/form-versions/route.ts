import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { formsDb, isUuid } from '@/lib/forms-server'
import {
  VERSION_KEEP, LEGACY_COLUMNS, SNAPSHOT_REASONS, type SnapshotReason, type FormSnapshotRow,
  snapshotOf, shouldSnapshot, sameContent, restorePatch, isMissingTable, isMissingColumn, isDuplicate,
} from '@/lib/form-versions'

export const dynamic = 'force-dynamic'

// Version snapshots of a form, for its workspace's staff. Service role: V375 /
// V382 leave form_versions readable by members only and writable by the server
// only, and a draft form is invisible to the anon key.
//
// A snapshot is always taken from the form as saved in the database, never from
// the request body, so what's recorded is what the form really was.
//
//   GET  ?formId=…                         → { versions, current_version_id }
//   POST { formId, reason }                → records a version if the rules in
//        reason: autosave | publish           lib/form-versions say so
//   POST { formId, action: 'restore', versionId } → puts a version back
//
// Until V382 creates the table every call skips quietly (versions: [], or
// { skipped: 'no_table' }), so autosave and publish never notice.
const getDb = formsDb

type Access = { ok: true; db: SupabaseClient; form: Record<string, unknown>; userId: string | null } | { ok: false; res: NextResponse }

async function loadForm(req: NextRequest, formId: unknown): Promise<Access> {
  if (!isUuid(formId)) return { ok: false, res: NextResponse.json({ error: 'formId required' }, { status: 400 }) }
  const db = getDb()
  // select('*'): the columns a snapshot holds aren't all on every database.
  const { data: form } = await (db as any).from('forms').select('*').eq('id', formId).maybeSingle()
  // Members of the form's workspace only.
  const access = form ? await requireCompanyAccess(req, db, form.company_id) : { ok: false as const }
  if (!form || !access.ok) return { ok: false, res: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  return { ok: true, db, form, userId: access.userId || null }
}

async function latestVersion(db: SupabaseClient, formId: string) {
  const { data, error } = await (db as any).from('form_versions').select('*')
    .eq('form_id', formId).order('version_number', { ascending: false }).limit(1)
  return { latest: (Array.isArray(data) ? data[0] : null) as Record<string, unknown> | null, error }
}

type Recorded =
  | { recorded: true; version_number: number; marked?: 'publish' }
  | { recorded: false; skipped: string }

/** Records a version of `snap` if the rules allow it, then prunes to the newest VERSION_KEEP. */
async function record(db: SupabaseClient, formId: string, snap: FormSnapshotRow, reason: SnapshotReason, userId: string | null): Promise<Recorded> {
  // Two tries: if another request (an autosave snapshot racing a publish) takes
  // the next number first, read the newest version again and decide again.
  for (let attempt = 0; ; attempt++) {
    const { latest, error: readErr } = await latestVersion(db, formId)
    if (readErr) {
      if (isMissingTable(readErr)) return { recorded: false, skipped: 'no_table' }
      throw readErr
    }
    const decision = shouldSnapshot({ reason, latest, snap, now: Date.now() })
    if (!decision.save) {
      // Publishing a form whose newest version already matches it (the save
      // just before publish recorded it): that version is what went live.
      if (reason === 'publish' && decision.why === 'unchanged' && latest?.id && latest.reason !== 'publish') {
        const { error } = await (db as any).from('form_versions').update({ reason: 'publish' }).eq('id', latest.id).eq('form_id', formId)
        // A hand-made table without the reason column: nothing to mark.
        if (!error) return { recorded: true, version_number: Number(latest.version_number) || 0, marked: 'publish' }
        if (!isMissingColumn(error)) throw error
      }
      return { recorded: false, skipped: decision.why }
    }

    const version_number = (Number(latest?.version_number) || 0) + 1
    const row = { form_id: formId, version_number, ...snap, reason, created_by: userId, created_at: new Date().toISOString() }
    let { error } = await (db as any).from('form_versions').insert(row)
    if (error && isMissingColumn(error)) {
      // A table made by hand before V382: store what it has room for.
      const legacy: Record<string, unknown> = { form_id: formId, version_number, created_at: row.created_at }
      for (const c of LEGACY_COLUMNS) if (c in snap) legacy[c] = snap[c]
      ;({ error } = await (db as any).from('form_versions').insert(legacy))
    }
    if (error) {
      if (isMissingTable(error)) return { recorded: false, skipped: 'no_table' }
      if (isDuplicate(error)) {
        if (attempt === 0) continue
        return { recorded: false, skipped: 'concurrent' }
      }
      throw error
    }

    // Keep the newest VERSION_KEEP. A failed prune only leaves extra rows behind.
    try {
      const { data: old } = await (db as any).from('form_versions').select('id')
        .eq('form_id', formId).order('version_number', { ascending: false }).range(VERSION_KEEP, VERSION_KEEP + 999)
      const ids = (Array.isArray(old) ? old : []).map((r: any) => r.id).filter(Boolean)
      if (ids.length) await (db as any).from('form_versions').delete().in('id', ids)
    } catch (e: any) {
      console.error('[form-versions] prune failed', e?.message || e)
    }
    return { recorded: true, version_number }
  }
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}))
    const a = await loadForm(req, b?.formId)
    if ('res' in a) return a.res
    const { db, form, userId } = a
    const formId = String(form.id)

    if (b.action === 'restore') {
      if (!isUuid(b.versionId)) return NextResponse.json({ error: 'versionId required' }, { status: 400 })
      const { data: version, error } = await (db as any).from('form_versions').select('*')
        .eq('id', b.versionId).eq('form_id', formId).maybeSingle()
      if (error && isMissingTable(error)) return NextResponse.json({ error: 'Version history isn’t set up yet' }, { status: 404 })
      if (error) throw error
      if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

      // Keep the form as it is now first, so the restore can itself be undone.
      await record(db, formId, snapshotOf(form), 'before_restore', userId)
      const patch = restorePatch(form, version)
      const { error: upErr } = await (db as any).from('forms')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', formId)
      if (upErr) throw upErr
      const restored = { ...form, ...patch }
      const r = await record(db, formId, snapshotOf(restored), 'restore', userId)
      return NextResponse.json({ success: true, restored: patch, ...r })
    }

    // Snapshot. An old client may still send questions/title/theme: ignored,
    // the saved form is what counts.
    const reason: SnapshotReason = SNAPSHOT_REASONS.includes(b.reason) && b.reason !== 'restore' && b.reason !== 'before_restore'
      ? b.reason : 'autosave'
    const r = await record(db, formId, snapshotOf(form), reason, userId)
    return NextResponse.json({ success: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const a = await loadForm(req, searchParams.get('formId'))
    if ('res' in a) return a.res
    const { db, form } = a

    const { data, error } = await (db as any)
      .from('form_versions')
      .select('*')
      .eq('form_id', form.id)
      .order('version_number', { ascending: false })

    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ versions: [], current_version_id: null })
      throw error
    }
    const versions = Array.isArray(data) ? data : []
    // The newest version is "current" only if the form hasn't changed since.
    const current = versions[0] && sameContent(versions[0], snapshotOf(form)) ? versions[0].id : null
    return NextResponse.json({ versions, current_version_id: current })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
