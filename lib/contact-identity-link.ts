// Link the same person across channels: every contact that shares an email
// or phone goes under one identity_group_id, and each contact's own channel is
// added to its channels_seen. Used by POST /api/contacts/backfill-identity.
//
// One call does one batch: it reads every contact, works out what's still
// unlinked, writes as much as fits in `budgetMs` and says what's left. Work
// that's done drops out on the next read, so no cursor is needed and a batch
// that dies half way loses nothing. Safe to re-run.

import { fetchAll } from '@/lib/campaign-audience'

const PARALLEL = 8
const ID_CHUNK = 150

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8)
const lower = (e?: string | null) => (e || '').trim().toLowerCase()

export type LinkBatchResult = {
  linkedGroups: number; linkedContacts: number; total: number
  /** Groups of contacts that are one person on more than one channel. */
  people: number
  /** Contact updates this batch found still to do, and how many are left. */
  todo: number; remaining: number
}

export async function linkContactsBatch(db: any, companyId: string, budgetMs: number): Promise<LinkBatchResult> {
  const started = Date.now()
  let readError: any = null
  const contacts: any[] = await fetchAll(o => db.from('contacts')
    .select('id, email, phone, identity_group_id, source, channels_seen', o)
    .eq('company_id', companyId)
    .order('id'), 1000, 200_000, 6, e => { readError = e })
  if (readError) throw new Error(readError.message || 'Could not read contacts')
  const byId = new Map(contacts.map(c => [c.id, c]))

  // Union-find over contacts joined by shared email or phone.
  const parent: Record<string, string> = {}
  const find = (x: string): string => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
  const union = (a: string, b: string) => { parent[find(a)] = find(b) }
  for (const c of contacts) parent[c.id] = c.id

  const byEmail: Record<string, string> = {}
  const byPhone: Record<string, string> = {}
  for (const c of contacts) {
    const e = lower(c.email)
    const p = norm(c.phone)
    if (e) { if (byEmail[e]) union(c.id, byEmail[e]); else byEmail[e] = c.id }
    if (p) { if (byPhone[p]) union(c.id, byPhone[p]); else byPhone[p] = c.id }
  }

  // Groups with more than one member.
  const groups: Record<string, string[]> = {}
  for (const c of contacts) (groups[find(c.id)] ||= []).push(c.id)
  const people = Object.values(groups).filter(m => m.length > 1)

  // Still to do: groups whose members don't all share one group id yet, and
  // contacts whose own channel isn't in channels_seen (so the panel has
  // something to show before their next message). Contacts needing the same
  // new channels_seen value are written together. A big group is written in
  // chunks too; if a batch stops between them, the next one reuses the id the
  // first chunk wrote.
  type Job = { ids: string[]; patch: Record<string, any>; group?: number }
  const jobs: Job[] = []
  for (const members of people) {
    const ids = members.map(id => byId.get(id)?.identity_group_id || null)
    if (ids[0] && ids.every(g => g === ids[0])) continue
    // Reuse any existing group id among the members, else mint one.
    const patch = { identity_group_id: ids.find(Boolean) || crypto.randomUUID() }
    for (let i = 0; i < members.length; i += ID_CHUNK) jobs.push({ ids: members.slice(i, i + ID_CHUNK), patch, group: i === 0 ? members.length : 0 })
  }
  const seenSets = new Map<string, { ids: string[]; value: string[] }>()
  for (const c of contacts) {
    const seen: string[] = Array.isArray(c.channels_seen) ? c.channels_seen : []
    if (!c.source || seen.includes(c.source)) continue
    const value = [...seen, c.source]
    const key = JSON.stringify(value)
    const set = seenSets.get(key) || { ids: [], value }
    set.ids.push(c.id)
    seenSets.set(key, set)
  }
  for (const { ids, value } of seenSets.values()) {
    for (let i = 0; i < ids.length; i += ID_CHUNK) jobs.push({ ids: ids.slice(i, i + ID_CHUNK), patch: { channels_seen: value } })
  }

  const todo = jobs.reduce((n, j) => n + j.ids.length, 0)
  let done = 0, linkedGroups = 0, linkedContacts = 0
  let next = 0
  while (next < jobs.length && Date.now() - started < budgetMs) {
    const wave = jobs.slice(next, next + PARALLEL)
    next += wave.length
    const results = await Promise.all(wave.map(j => db.from('contacts').update(j.patch).eq('company_id', companyId).in('id', j.ids)))
    const failed = results.find(r => r.error)
    if (failed) throw new Error(failed.error.message)
    for (const j of wave) {
      done += j.ids.length
      if (j.group) { linkedGroups++; linkedContacts += j.group }
    }
  }

  return { linkedGroups, linkedContacts, total: contacts.length, people: people.length, todo, remaining: todo - done }
}
