// Status page incidents (status_incidents, migrations/COLVY_V405_STATUS_INCIDENTS.sql).
// The platform admin writes them through /api/platform-admin/status; the public
// page reads published ones through the server (lib/status-server.ts). The
// table is server only, so every function here takes the service-role client.
// Before V405 runs: reads say `unavailable` and writes are refused politely.

import { COMPONENT_KEYS, INCIDENT_IMPACTS, INCIDENT_STATUSES, type Incident, type IncidentImpact, type IncidentStatus, type IncidentUpdate } from '@/lib/status-health'

export const INCIDENT_TABLE = 'status_incidents'
export const TITLE_MAX = 140
export const MESSAGE_MAX = 2000
export const UPDATES_MAX = 100

export const isMissingTable = (e: any) => /does not exist|schema cache|Could not find|PGRST205|42P01/i.test(String(e?.message || e?.code || e || ''))
const isStatus = (s: any): s is IncidentStatus => (INCIDENT_STATUSES as readonly string[]).includes(s)
const isImpact = (s: any): s is IncidentImpact => (INCIDENT_IMPACTS as readonly string[]).includes(s)
const clean = (s: any, max: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const cleanMessage = (s: any) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, MESSAGE_MAX)

export type IncidentInput = {
  title?: string; impact?: string; status?: string; components?: string[]
  message?: string; published?: boolean; startedAt?: string
}
type Valid = { title?: string; impact?: IncidentImpact; status?: IncidentStatus; components?: string[]; message?: string; published?: boolean; startedAt?: string }

/** Check what the admin sent. `create` needs a title, an impact and a first message. */
export type Validation = { ok: boolean; value: Valid; error?: string }
export function validateIncident(body: IncidentInput, mode: 'create' | 'update'): Validation {
  const fail = (error: string): Validation => ({ ok: false, value: {}, error })
  const v: Valid = {}
  if (body.title !== undefined || mode === 'create') {
    const t = clean(body.title, TITLE_MAX)
    if (!t) return fail('Give the incident a title.')
    v.title = t
  }
  if (body.impact !== undefined || mode === 'create') {
    if (!isImpact(body.impact)) return fail('Choose an impact: minor, major or critical.')
    v.impact = body.impact
  }
  if (body.status !== undefined) {
    if (!isStatus(body.status)) return fail('Choose a status: investigating, identified, monitoring or resolved.')
    v.status = body.status
  }
  if (body.components !== undefined) {
    if (!Array.isArray(body.components)) return fail('Components must be a list.')
    const bad = body.components.filter(c => !COMPONENT_KEYS.includes(c as any))
    if (bad.length) return fail(`Unknown component: ${bad.join(', ')}`)
    v.components = Array.from(new Set(body.components))
  }
  if (body.message !== undefined || mode === 'create') {
    const m = cleanMessage(body.message)
    if (!m && mode === 'create') return fail('Write a first update for customers.')
    if (m) v.message = m
  }
  if (body.published !== undefined) v.published = !!body.published
  if (body.startedAt !== undefined && body.startedAt !== null && body.startedAt !== '') {
    const t = Date.parse(String(body.startedAt))
    if (!Number.isFinite(t)) return fail('The start time isn’t a valid date.')
    if (t > Date.now() + 5 * 60_000) return fail('The start time can’t be in the future.')
    v.startedAt = new Date(t).toISOString()
  }
  return { ok: true, value: v }
}

function normalise(r: any): Incident {
  return {
    id: String(r.id), title: String(r.title || ''),
    status: isStatus(r.status) ? r.status : 'investigating',
    impact: isImpact(r.impact) ? r.impact : 'minor',
    components: Array.isArray(r.components) ? r.components.map(String) : [],
    updates: (Array.isArray(r.updates) ? r.updates : []).filter((u: any) => u && u.message).map((u: any) => ({ at: String(u.at), status: isStatus(u.status) ? u.status : 'investigating', message: String(u.message) })),
    started_at: String(r.started_at || r.created_at), resolved_at: r.resolved_at || null,
    published: r.published === true, created_at: r.created_at, updated_at: r.updated_at,
  }
}

/** Incidents started or resolved in the last `days` (all of them for the admin;
 *  `publishedOnly` for the public page). Open incidents are always included. */
export async function listIncidents(db: any, o: { days?: number; publishedOnly?: boolean; now?: number } = {}): Promise<{ unavailable: boolean; incidents: Incident[] }> {
  try {
    const since = new Date((o.now ?? Date.now()) - (o.days ?? 90) * 86_400_000).toISOString()
    let q = db.from(INCIDENT_TABLE).select('*').or(`status.neq.resolved,started_at.gte.${since},resolved_at.gte.${since}`)
    if (o.publishedOnly) q = q.eq('published', true)
    const { data, error } = await q.order('started_at', { ascending: false }).limit(200)
    if (error) return { unavailable: isMissingTable(error), incidents: [] }
    return { unavailable: false, incidents: (data || []).map(normalise) }
  } catch (e) {
    return { unavailable: isMissingTable(e), incidents: [] }
  }
}

export async function getIncident(db: any, id: string): Promise<{ unavailable: boolean; incident: Incident | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { unavailable: false, incident: null }
  const { data, error } = await db.from(INCIDENT_TABLE).select('*').eq('id', id).maybeSingle()
  if (error) return { unavailable: isMissingTable(error), incident: null }
  return { unavailable: false, incident: data ? normalise(data) : null }
}

export type Result = { ok: boolean; incident?: Incident; status?: number; error?: string }
const NOT_SET_UP: Result = { ok: false, status: 503, error: 'Incidents aren’t set up yet: run migrations/COLVY_V405_STATUS_INCIDENTS.sql.' }

export async function createIncident(db: any, input: IncidentInput, actorId: string | null, now = Date.now()): Promise<Result> {
  const v = validateIncident(input, 'create')
  if (!v.ok) return { ok: false, status: 400, error: v.error }
  const at = new Date(now).toISOString()
  const status = v.value.status || 'investigating'
  const row = {
    title: v.value.title, impact: v.value.impact, status,
    components: v.value.components || [],
    updates: [{ at, status, message: v.value.message! }] as IncidentUpdate[],
    started_at: v.value.startedAt || at,
    resolved_at: status === 'resolved' ? at : null,
    published: v.value.published !== false,
    created_by: actorId, created_at: at, updated_at: at,
  }
  const { data, error } = await db.from(INCIDENT_TABLE).insert(row).select('*').single()
  if (error) return isMissingTable(error) ? NOT_SET_UP : { ok: false, status: 500, error: 'Couldn’t save the incident.' }
  return { ok: true, incident: normalise(data) }
}

/** Change the details and/or post an update. A status change always needs a
 *  message (that's what customers read); resolving stamps resolved_at and
 *  reopening clears it. */
export async function updateIncident(db: any, id: string, input: IncidentInput, now = Date.now()): Promise<Result> {
  const v = validateIncident(input, 'update')
  if (!v.ok) return { ok: false, status: 400, error: v.error }
  const cur = await getIncident(db, id)
  if (cur.unavailable) return NOT_SET_UP
  if (!cur.incident) return { ok: false, status: 404, error: 'Incident not found.' }
  const i = cur.incident
  const at = new Date(now).toISOString()
  const status = v.value.status || i.status
  const changedStatus = status !== i.status
  if (changedStatus && !v.value.message) return { ok: false, status: 400, error: 'Say what changed: a status change needs an update message.' }
  const patch: any = { updated_at: at }
  if (v.value.title !== undefined) patch.title = v.value.title
  if (v.value.impact !== undefined) patch.impact = v.value.impact
  if (v.value.components !== undefined) patch.components = v.value.components
  if (v.value.published !== undefined) patch.published = v.value.published
  if (v.value.startedAt !== undefined) patch.started_at = v.value.startedAt
  if (v.value.message) {
    if (i.updates.length >= UPDATES_MAX) return { ok: false, status: 409, error: `An incident can hold ${UPDATES_MAX} updates. Open a new one.` }
    patch.updates = [...i.updates, { at, status, message: v.value.message }]
  }
  if (changedStatus) {
    patch.status = status
    patch.resolved_at = status === 'resolved' ? at : null
  }
  if (Object.keys(patch).length === 1) return { ok: false, status: 400, error: 'Nothing to change.' }
  const { data, error } = await db.from(INCIDENT_TABLE).update(patch).eq('id', id).select('*').single()
  if (error) return isMissingTable(error) ? NOT_SET_UP : { ok: false, status: 500, error: 'Couldn’t save the incident.' }
  return { ok: true, incident: normalise(data) }
}

export async function deleteIncident(db: any, id: string): Promise<Result> {
  const cur = await getIncident(db, id)
  if (cur.unavailable) return NOT_SET_UP
  if (!cur.incident) return { ok: false, status: 404, error: 'Incident not found.' }
  const { error } = await db.from(INCIDENT_TABLE).delete().eq('id', id)
  if (error) return { ok: false, status: 500, error: 'Couldn’t delete the incident.' }
  return { ok: true }
}
