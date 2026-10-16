// One place that decides whether AI work becomes a NEW task or goes on an
// EXISTING one. Every AI path that makes tasks goes through here before it
// writes to conversation_tasks: the Agent Engine's create_task (every role,
// and the AI phone agent's take-a-message), Colvy AI's create_task (and MCP,
// which runs the same tool), and the "Draft tasks" card on call and chat
// summaries (its server route, and the summary generators that write the
// action items in the first place).
//
//   • Open tasks for the same customer (this conversation, or any of the
//     contact's conversations) or the same order, from the last 30 days, are
//     compared with the new one: cheap normalised-token similarity on titles,
//     details and checklist steps, with product / order names counting most.
//   • A match isn't duplicated: the new steps go on its checklist (skipping
//     any it already has), the details get a short dated line, and priority /
//     due date only ever move to the more urgent one.
//   • Several action items from one source about the same job become ONE task
//     with a checklist, not one task each.
//   • Daily caps for tasks AI makes on its own (per conversation and per
//     business): over the cap it adds to an open task instead, or skips with
//     a reason the run trail shows.
//
// The top half is pure (the inbox's Draft tasks card imports it in the
// browser); the bottom half takes a Supabase client and works on databases
// that predate the checklist / description / status / source columns.

export type ChecklistItem = { id: string; text: string; done: boolean }

export type OpenTask = {
  id: string
  title: string
  text: string
  description: string | null
  /** null when the database has no checklist column (pre-V229). */
  checklist: ChecklistItem[] | null
  priority: string | null
  dueDate: string | null
  conversationId: string | null
  orderId: string | null
  source: string | null
  createdAt: string | null
}

export type ActionGroup = { title: string; steps: string[] }

// ── Text ─────────────────────────────────────────────────────────────────────

const STOP = new Set(('a an the and or but of to for from with without in on at by as is are was were be been being it its this that these those ' +
  'they them their there here he she his her him we us our you your i me my mine so if then than too very just also can could would should will shall may might ' +
  'do does did done have has had not no yes re into onto over under up down out off any all some each per via about again still yet now soon asap please pls ' +
  'what which who whom whose when where why how one two three').split(/\s+/))

// Words that say what kind of to-do it is, not what it's about. They still
// count, but much less than a product, a supplier or an order number.
const GENERIC_WORDS = ('call back ring phone order customer client follow followup send check confirm arrange wait await ensure make get need let know contact reply respond ' +
  'message email text team staff task next once before after sure give ask tell request item stock delivery deliver supplier week day today tomorrow monday tuesday ' +
  'wednesday thursday friday saturday sunday payment pay update quantity amount add extra new price quote details info information see look find put take keep ' +
  'help sort organise organize schedule book booking reminder remind note able want look review google facebook instagram star rating comment post ' +
  'reply replied left leave').split(/\s+/)

export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[’']s$/, '').replace(/[’']/g, '')
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ied')) w = `${w.slice(0, -3)}y`
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1)
  return w
}

const GENERIC = new Set(GENERIC_WORDS.map(stem))

/** Lower-case, punctuation-free, single-spaced. */
export const normText = (s: unknown) => String(s ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9#]+/g, ' ').trim()

/** The words that carry meaning, stemmed and de-duplicated. `ignore` drops e.g. the customer's own name. */
export function tokensOf(s: unknown, ignore?: Set<string>): string[] {
  const out = new Set<string>()
  for (const raw of normText(s).split(' ')) {
    if (!raw || STOP.has(raw)) continue
    if (raw.length < 2) continue
    if (/^\d+$/.test(raw) && raw.length < 3) continue
    const t = stem(raw)
    if (!t || STOP.has(t) || ignore?.has(t)) continue
    out.add(t)
  }
  return Array.from(out)
}

/** Tokens to ignore for a person's name ("Shery Smith" → shery, smith). */
export const nameTokens = (name?: string | null) => new Set(tokensOf(name || ''))

const weight = (t: string) => (GENERIC.has(t) ? 0.4 : 1)

/**
 * What a text is about: product-like proper names ("Texas Holy Rock") and
 * order numbers ("#1234"). Lower-cased keys.
 */
export function subjectsOf(s: unknown, ignore?: Set<string>): string[] {
  const text = String(s ?? '')
  const out = new Set<string>()
  const re = /\b([A-Z][A-Za-z0-9’'&-]*(?:\s+(?:[A-Z][A-Za-z0-9’'&-]*|&|of|and|de))*\s+[A-Z][A-Za-z0-9’'&-]*)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    // Drop leading/trailing words that aren't part of a name (sentence-initial
    // verbs, weekdays, the customer's name).
    const words = m[1].split(/\s+/)
    const keep = (w: string) => { const t = stem(w.toLowerCase().replace(/[’']s$/, '')); return !(GENERIC.has(t) || STOP.has(w.toLowerCase()) || ignore?.has(t)) }
    while (words.length && !keep(words[0])) words.shift()
    while (words.length && !keep(words[words.length - 1])) words.pop()
    if (words.length >= 2) out.add(words.join(' ').toLowerCase().replace(/[’']s\b/g, ''))
  }
  for (const n of text.match(/#\s?\d{3,}/g) || []) out.add(`#${n.replace(/\D/g, '')}`)
  return Array.from(out)
}

export type Comparison = { score: number; sharedStrong: number; sharedWeak: number; sharedSubject: boolean }

/** How much two texts overlap: weighted shared words over the smaller side (0–1). */
export function compareTexts(a: unknown, b: unknown, ignore?: Set<string>): Comparison {
  const A = new Set(tokensOf(a, ignore)), B = new Set(tokensOf(b, ignore))
  let wA = 0, wB = 0, sw = 0, strong = 0, weak = 0
  for (const t of A) wA += weight(t)
  for (const t of B) wB += weight(t)
  for (const t of A) if (B.has(t)) { sw += weight(t); if (GENERIC.has(t)) weak++; else strong++ }
  const min = Math.min(wA, wB)
  const sa = subjectsOf(a, ignore), sb = new Set(subjectsOf(b, ignore))
  return { score: min > 0 ? sw / min : 0, sharedStrong: strong, sharedWeak: weak, sharedSubject: sa.some(s => sb.has(s)) }
}

/** The same job? (Used to match a new task to an open one.) */
export function sameJob(a: unknown, b: unknown, ignore?: Set<string>): boolean {
  const c = compareTexts(a, b, ignore)
  return c.sharedSubject || (c.sharedStrong >= 1 && c.score >= 0.5)
}

function overlap(a: unknown, b: unknown, ignore?: Set<string>): { min: number; dice: number; shared: number } {
  const A = new Set(tokensOf(a, ignore)), B = new Set(tokensOf(b, ignore))
  let wA = 0, wB = 0, sw = 0, shared = 0
  for (const t of A) wA += weight(t)
  for (const t of B) wB += weight(t)
  for (const t of A) if (B.has(t)) { sw += weight(t); shared++ }
  return { min: Math.min(wA, wB) > 0 ? sw / Math.min(wA, wB) : 0, dice: wA + wB > 0 ? (2 * sw) / (wA + wB) : 0, shared }
}

/**
 * Is this step already on the list — exactly, or near enough (one may say
 * more than the other: "Confirm the quantity when she calls back" is
 * "Wait for her to call back with the quantity…")?
 */
export function stepCovered(step: string, existing: string[], ignore?: Set<string>): boolean {
  const n = normText(step)
  if (!n) return true
  return existing.some(e => {
    const en = normText(e)
    if (!en) return false
    if (en === n) return true
    const o = overlap(step, e, ignore)
    return o.min >= 0.74 && o.dice >= 0.45 && o.shared >= 2
  })
}

/** Is the step just the task's title again? (A step that merely mentions the job's subject isn't.) */
export function titleCovers(step: string, title: string, ignore?: Set<string>): boolean {
  if (normText(step) === normText(title)) return true
  return overlap(step, title, ignore).dice >= 0.85
}

const newId = () => (globalThis.crypto && typeof (globalThis.crypto as any).randomUUID === 'function'
  ? (globalThis.crypto as any).randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`)

/**
 * New checklist items for the steps that aren't there yet. `titles`: the
 * task's title (a step that repeats it is covered; its words are context, not
 * evidence, when comparing steps). `ignore`: e.g. the customer's name.
 */
export function mergeChecklist(existing: ChecklistItem[] | null | undefined, steps: string[], opts: { titles?: string[]; ignore?: Set<string> } = {}): { checklist: ChecklistItem[]; added: string[] } {
  const list: ChecklistItem[] = Array.isArray(existing) ? existing.filter(i => i && typeof i.text === 'string') : []
  const titles = (opts.titles || []).filter(Boolean)
  const context = new Set([...(opts.ignore || []), ...titles.flatMap(t => tokensOf(t))])
  const seen = list.map(i => i.text)
  const added: string[] = []
  for (const raw of steps) {
    const s = cleanStep(raw)
    if (!s || titles.some(t => titleCovers(s, t, opts.ignore)) || stepCovered(s, seen, context)) continue
    seen.push(s); added.push(s)
  }
  return { checklist: [...list, ...added.map(text => ({ id: newId(), text, done: false }))], added }
}

/** The steps an open task doesn't have yet (on its checklist, or in its text without one). */
export function newStepsFor(task: OpenTask, steps: string[], ignore?: Set<string>): string[] {
  const existing = task.checklist ?? String(task.text || '').split('\n').map(l => l.replace(/^[-•*\s]+/, '').trim()).filter(Boolean).map(text => ({ id: '', text, done: false }))
  return mergeChecklist(existing, steps, { titles: [task.title], ignore }).added
}

const cleanStep = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').replace(/^[-•*\d.)\s]+/, '').trim().slice(0, 300)

// ── Action items → one task per job ─────────────────────────────────────────

/**
 * Action items are stored as plain strings (calls.ai_todos /
 * conversations.ai_todos), which the mobile app also reads. One job with
 * several steps is written "Title: step one; step two; step three".
 */
export function parseActionItem(s: unknown): ActionGroup {
  const text = String(s ?? '').replace(/\s+/g, ' ').trim()
  const m = /^([^:;]{3,100}?):\s+(.+)$/.exec(text)
  if (m) {
    const steps = m[2].split(/\s*;\s+/).map(cleanStep).filter(Boolean)
    if (steps.length >= 2) return { title: m[1].trim(), steps }
  }
  return { title: text, steps: [] }
}

export function formatActionItem(g: ActionGroup): string {
  const steps = g.steps.map(s => cleanStep(s).replace(/;/g, ',')).filter(Boolean)
  const title = g.title.replace(/[:;]/g, ' ').replace(/\s+/g, ' ').trim()
  if (steps.length >= 2) return `${title}: ${steps.join('; ')}`
  return steps[0] && normText(steps[0]) !== normText(title) ? (title ? `${title} — ${steps[0]}` : steps[0]) : (title || steps[0] || '')
}

/** "Wait for the customer…" has nothing for staff to do on its own: it belongs on the related job. */
const isWaitItem = (s: string) => /^\s*(wait|await|waiting|hold off)\b/i.test(s)

const titleCase = (s: string) => s.replace(/\b([a-z])/g, (_m, c) => c.toUpperCase())

/** A short name for a job made of several steps, e.g. "Texas Holy Rock order for Shery". */
export function groupTitle(items: string[], contactName?: string | null): string {
  const ignore = nameTokens(contactName)
  const counts = new Map<string, number>()
  for (const it of items) for (const s of subjectsOf(it, ignore)) if (!s.startsWith('#')) counts.set(s, (counts.get(s) || 0) + 1)
  const best = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0]
  const first = String(contactName || '').trim().split(/\s+/)[0]
  const forWho = first && !/^(visitor|customer|unknown|\+?\d)/i.test(first) ? ` for ${first}` : ''
  if (best) {
    // Keep the casing it was written with.
    let cased = titleCase(best)
    for (const it of items) { const i = it.toLowerCase().indexOf(best); if (i >= 0) { cased = it.slice(i, i + best.length); break } }
    const all = items.join(' ')
    const order = all.match(/#\s?\d{3,}/)?.[0]
    const kind = /\border/i.test(all) && !/\border\b/i.test(cased) ? ' order' : ''
    return `${cased}${kind}${order && !cased.includes(order) ? ` ${order}` : ''}${forWho}`.slice(0, 120)
  }
  // No name to hang it on: the shortest step that isn't a "wait".
  const pick = [...items].filter(i => !isWaitItem(i)).sort((a, b) => a.length - b.length)[0] || items[0] || 'Follow up'
  return pick.slice(0, 120)
}

/**
 * Group the action items from ONE source (a call, a chat summary): items about
 * the same job become one task whose steps are the checklist. Items already
 * written as "Title: a; b" stay as they are (and pick up related singles).
 */
export function groupActionItems(items: string[], opts: { contactName?: string | null } = {}): ActionGroup[] {
  const ignore = nameTokens(opts.contactName)
  const parsed = items.map(parseActionItem).filter(g => g.title || g.steps.length)
  const groups: ActionGroup[] = parsed.filter(g => g.steps.length >= 2).map(g => ({ title: g.title, steps: [...g.steps] }))
  const singles = parsed.filter(g => g.steps.length < 2).map(g => g.title)
  const textOf = (g: ActionGroup) => [g.title, ...g.steps].join(' ')

  // A single that belongs to an already-grouped job joins it.
  const loose: string[] = []
  for (const s of singles) {
    const target = groups.find(g => sameJob(textOf(g), s, ignore))
    if (target) { if (!stepCovered(s, target.steps)) target.steps.push(s) } else loose.push(s)
  }

  // Connected components over "about the same thing" links. Within one call
  // or chat this is generous: a shared product/name word, or two shared
  // generic words ("call", "order"), is enough.
  const n = loose.length
  const parent = loose.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const c = compareTexts(loose[i], loose[j], ignore)
    if (c.sharedSubject || c.sharedStrong >= 1 || c.sharedWeak >= 2) parent[find(i)] = find(j)
  }
  const comps = new Map<number, string[]>()
  loose.forEach((s, i) => { const r = find(i); comps.set(r, [...(comps.get(r) || []), s]) })
  let fresh: string[][] = Array.from(comps.values())

  // A component that is only "wait for…" joins the closest other job.
  const others = () => [...groups.map(textOf), ...fresh.filter(c => !c.every(isWaitItem)).map(c => c.join(' '))]
  if (others().length) {
    const waits = fresh.filter(c => c.every(isWaitItem))
    fresh = fresh.filter(c => !c.every(isWaitItem))
    for (const w of waits) {
      const pool: { add: (s: string[]) => void; text: string }[] = [
        ...groups.map(g => ({ add: (s: string[]) => { for (const x of s) if (!stepCovered(x, g.steps)) g.steps.push(x) }, text: textOf(g) })),
        ...fresh.map(c => ({ add: (s: string[]) => { c.push(...s) }, text: c.join(' ') })),
      ]
      const best = pool.map(p => ({ p, s: compareTexts(p.text, w.join(' '), ignore).score })).sort((a, b) => b.s - a.s)[0]
      best?.p.add(w)
    }
  }

  for (const c of fresh) {
    if (c.length === 1) groups.push({ title: c[0], steps: [] })
    else groups.push({ title: groupTitle(c, opts.contactName), steps: c })
  }
  return groups
}

/**
 * The summary generators' last step: group related items, and drop a job whose
 * steps an open task already has (it's on the list — nothing new to propose).
 * Returns strings in the stored format.
 */
export function refineActionItems(items: unknown, opts: { contactName?: string | null; openTasks?: OpenTask[] } = {}): string[] {
  const list = (Array.isArray(items) ? items : []).map(x => (typeof x === 'string' ? x : String((x as any)?.text || ''))).map(s => s.trim()).filter(Boolean)
  if (!list.length) return []
  const groups = groupActionItems(list, opts)
  const out: string[] = []
  for (const g of groups) {
    if (opts.openTasks?.length) {
      const m = findMatch(opts.openTasks, { title: g.title, steps: g.steps }, opts.contactName)
      if (m && !newStepsFor(m, g.steps.length ? g.steps : [g.title], nameTokens(opts.contactName)).length) continue
    }
    out.push(formatActionItem(g))
  }
  return out.slice(0, 6)
}

/** The open task this new one belongs to, if any. */
export function findMatch(open: OpenTask[], cand: { title: string; details?: string | null; steps?: string[] }, contactName?: string | null, opts: { strict?: boolean } = {}): OpenTask | null {
  const ignore = nameTokens(contactName)
  const candText = [cand.title, cand.details || '', ...(cand.steps || [])].join('. ')
  const candSubjects = subjectsOf(candText, ignore)
  let best: { t: OpenTask; s: number } | null = null
  for (const t of open) {
    const taskText = [t.title, t.text && t.text !== t.title ? t.text : '', ...(t.checklist || []).map(i => i.text)].join('. ')
    // Both name something (a product, a person, an order) and it isn't the same thing: different jobs.
    const taskSubjects = subjectsOf(taskText, ignore)
    if (candSubjects.length && taskSubjects.length && !candSubjects.some(x => taskSubjects.includes(x))) continue
    // Title against title first (a precise signal), then everything against everything.
    const c1 = compareTexts(t.title, cand.title, ignore)
    const c2 = compareTexts(taskText, candText, ignore)
    const subject = c1.sharedSubject || c2.sharedSubject
    // Not tied to a customer or order (back-office work): only the same named thing counts.
    // …or the new one is already a step of it.
    const isStep = () => [cand.title, ...(cand.steps || [])].some(x => stepCovered(x, (t.checklist || []).map(i => i.text), ignore))
    const hit = opts.strict ? subject : subject || (c1.sharedStrong >= 1 && c1.score >= 0.5) || (c2.sharedStrong >= 2 && c2.score >= 0.5) || isStep()
    if (!hit) continue
    const s = Math.max(c1.score, c2.score) + (c1.sharedSubject || c2.sharedSubject ? 1 : 0)
    if (!best || s > best.s) best = { t, s }
  }
  return best?.t || null
}

/** Open tasks as the model sees them, so it can choose "add to task X" over a new one. */
export function openTasksPromptBlock(open: OpenTask[], max = 8): string {
  if (!open.length) return ''
  return open.slice(0, max).map(t => {
    const steps = (t.checklist || []).map(i => `${i.done ? '[x]' : '[ ]'} ${i.text}`).slice(0, 8)
    return `- id ${t.id}: “${t.title.slice(0, 140)}”${steps.length ? ` — checklist: ${steps.join('; ')}` : ''}${t.createdAt ? ` (opened ${t.createdAt.slice(0, 10)})` : ''}`
  }).join('\n')
}

// ── The collapsed Draft tasks card ───────────────────────────────────────────

/**
 * When the drafts haven't been used and the chat has moved on past them —
 * a customer or staff message (not an internal note) newer than the card —
 * the card shows as one closed row ("Draft tasks · 3 to review") that opens on
 * click. Same rule as the mobile app (conversation/[id].tsx `olderThanChat`).
 */
export function latestChatMs(messages: { created_at?: string | null; is_internal?: boolean | null; sender_type?: string | null }[]): number {
  let t = 0
  for (const m of messages || []) {
    if (!m || m.is_internal || (m.sender_type !== 'agent' && m.sender_type !== 'visitor')) continue
    const v = new Date(m.created_at || 0).getTime() || 0
    if (v > t) t = v
  }
  return t
}

export const draftsCollapsed = (cardAt: string | number | null | undefined, latestChat: number) => {
  const at = typeof cardAt === 'number' ? cardAt : new Date(cardAt || 0).getTime() || 0
  return latestChat > at + 1000
}

// ── Database ─────────────────────────────────────────────────────────────────

const DAY = 86_400_000
const PRI_RANK: Record<string, number> = { low: 0, normal: 1, medium: 1, high: 2, urgent: 3 }

/** Sources of tasks AI made on its own (the daily caps count these). */
export const AI_TASK_SOURCES = ['agent']

/** Daily caps for tasks an AI agent makes on its own. */
export const AI_TASK_CAPS = { perConversation: 2, perCompany: 25 }

const missingColumn = (msg: string): string | null => {
  const m = /column "?(?:[a-z_]+\.)?([a-z_]+)"? (?:of relation "?[a-z_]+"? )?does not exist/i.exec(msg)
    || /Could not find the '([a-z_]+)' column/i.exec(msg)
  return m?.[1] || null
}

/** Select, dropping columns an older database doesn't have yet. */
async function selectResilient(cols: string[], run: (cols: string) => PromiseLike<{ data: any; error: any }>): Promise<{ data: any[]; cols: string[] }> {
  let cur = [...cols]
  for (let i = 0; i < 10; i++) {
    let res: any
    try { res = await run(cur.join(', ')) } catch (e: any) { res = { data: null, error: e } }
    if (!res?.error) return { data: Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [], cols: cur }
    const col = missingColumn(String(res.error?.message || ''))
    if (!col || !cur.includes(col) || col === 'id') return { data: [], cols: cur }
    cur = cur.filter(c => c !== col)
  }
  return { data: [], cols: cur }
}

const TASK_COLS = ['id', 'title', 'text', 'description', 'checklist', 'status', 'done', 'priority', 'due_date', 'conversation_id', 'order_id', 'source', 'created_at']

function toOpenTask(r: any, cols: string[]): OpenTask {
  const title = String(r.title || String(r.text || '').split('\n')[0] || 'Task').trim()
  return {
    id: r.id, title, text: String(r.text || ''), description: r.description ?? null,
    checklist: cols.includes('checklist') ? (Array.isArray(r.checklist) ? r.checklist : []) : null,
    priority: r.priority ?? null, dueDate: r.due_date ?? null,
    conversationId: r.conversation_id ?? null, orderId: r.order_id ?? null, source: r.source ?? null, createdAt: r.created_at ?? null,
  }
}

const isOpen = (r: any) => !r.done && !['done', 'cancelled', 'canceled', 'archived'].includes(String(r.status || '').toLowerCase())

/**
 * Open tasks for the same customer (this conversation and the contact's other
 * conversations) and/or the same order, from the last `days` days. With
 * neither, the business's open tasks that aren't on a conversation (stock,
 * supplier and other back-office jobs).
 */
export async function loadOpenTasks(db: any, opts: { companyId: string; conversationId?: string | null; contactId?: string | null; orderId?: string | null; days?: number; limit?: number; now?: number }): Promise<OpenTask[]> {
  const since = new Date((opts.now ?? Date.now()) - (opts.days ?? 30) * DAY).toISOString()
  const limit = opts.limit ?? 40
  const convIds: string[] = opts.conversationId ? [opts.conversationId] : []
  if (opts.contactId) {
    try {
      const { data } = await db.from('conversations').select('id').eq('company_id', opts.companyId).eq('contact_id', opts.contactId).limit(50)
      for (const c of data || []) if (c?.id && !convIds.includes(c.id)) convIds.push(c.id)
    } catch { /* just this conversation */ }
  }
  const scopes: ((q: any) => any)[] = []
  if (convIds.length) scopes.push(q => q.in('conversation_id', convIds))
  if (opts.orderId) scopes.push(q => q.eq('order_id', opts.orderId))
  if (!scopes.length) scopes.push(q => q.is('conversation_id', null))
  const byId = new Map<string, OpenTask>()
  for (const scope of scopes) {
    const { data, cols } = await selectResilient(TASK_COLS, c => scope(db.from('conversation_tasks').select(c).eq('company_id', opts.companyId).eq('done', false).gte('created_at', since)).order('created_at', { ascending: false }).limit(limit))
    for (const r of data) if (r?.id && isOpen(r) && !byId.has(r.id)) byId.set(r.id, toOpenTask(r, cols))
  }
  return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}

async function loadTask(db: any, companyId: string, id: string): Promise<OpenTask | null> {
  if (!/^[0-9a-f-]{8,}$/i.test(String(id || ''))) return null
  const { data, cols } = await selectResilient(TASK_COLS, c => db.from('conversation_tasks').select(c).eq('company_id', companyId).eq('id', id).limit(1))
  const r = data[0]
  return r && isOpen(r) ? toOpenTask(r, cols) : null
}

async function countAiTasks(db: any, companyId: string, since: string, conversationId?: string | null): Promise<number> {
  try {
    let q = db.from('conversation_tasks').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('source', AI_TASK_SOURCES).gte('created_at', since)
    if (conversationId) q = q.eq('conversation_id', conversationId)
    const { count, error } = await q
    return error ? 0 : count || 0
  } catch { return 0 }
}

/** Insert, dropping optional columns an older database lacks. Steps fall back into the text without a checklist column. */
async function insertTask(db: any, row: Record<string, any>, steps: string[]): Promise<{ id?: string; error?: string; checklistSaved: boolean }> {
  let cur: Record<string, any> = { ...row }
  let checklistSaved = 'checklist' in cur
  for (let i = 0; i < 12; i++) {
    let res: any
    try { res = await db.from('conversation_tasks').insert(cur).select('id').maybeSingle() } catch (e: any) { res = { error: e } }
    if (!res?.error) return { id: res?.data?.id, checklistSaved }
    const col = missingColumn(String(res.error?.message || ''))
    if (!col || !(col in cur) || ['company_id', 'text'].includes(col)) return { error: String(res.error?.message || 'insert failed'), checklistSaved }
    const next = { ...cur }
    delete next[col]
    if (col === 'checklist') {
      checklistSaved = false
      if (steps.length) next.text = `${next.text}\n\nChecklist:\n${steps.map(s => `- ${s}`).join('\n')}`
    }
    if (col === 'title' && !String(next.text || '').startsWith(String(row.title || ''))) next.text = `${row.title}\n\n${next.text}`
    cur = next
  }
  return { error: 'insert failed', checklistSaved }
}

async function updateTask(db: any, companyId: string, id: string, patch: Record<string, any>): Promise<{ ok: boolean; error?: string }> {
  let cur = { ...patch }
  for (let i = 0; i < 10; i++) {
    if (!Object.keys(cur).length) return { ok: true }
    let res: any
    try { res = await db.from('conversation_tasks').update(cur).eq('company_id', companyId).eq('id', id) } catch (e: any) { res = { error: e } }
    if (!res?.error) return { ok: true }
    const col = missingColumn(String(res.error?.message || ''))
    if (!col || !(col in cur)) return { ok: false, error: String(res.error?.message || 'update failed') }
    const next = { ...cur }; delete next[col]; cur = next
  }
  return { ok: false, error: 'update failed' }
}

export type UpsertTaskInput = {
  companyId: string
  conversationId?: string | null
  /** The customer, so their other conversations' open tasks count too. Looked up from the conversation when omitted. */
  contactId?: string | null
  contactName?: string | null
  orderId?: string | null
  title: string
  details?: string | null
  /** The job's steps → checklist items. */
  steps?: string[]
  priority?: string | null
  dueDate?: string | null
  locationId?: string | null
  assignees?: { id: string | null; name: string }[]
  createdBy?: string | null
  createdById?: string | null
  source: string
  /** A task the model or the person picked to add to. */
  existingTaskId?: string | null
  /** auto: dedupe (default) · create: always a new task · add: add to existingTaskId. */
  mode?: 'auto' | 'create' | 'add'
  /** Daily caps (AI acting on its own). Omit or null for a person's request. */
  caps?: { perConversation: number; perCompany: number } | null
  /** Who the activity line names, e.g. "Colvy Support Agent". */
  actorName?: string | null
  actorId?: string | null
  /** Where it came from, for the dated line ("call summary", "chat"). */
  sourceLabel?: string | null
  /** Extra columns for a new task (e.g. mentions, order_number). */
  extra?: Record<string, any>
  now?: number
}

export type UpsertTaskResult = {
  ok: boolean
  action: 'created' | 'updated' | 'skipped'
  taskId?: string
  title: string
  /** Checklist steps added (or saved on the new task). */
  added: string[]
  /** Why it didn't make a new task. */
  reason?: string
  /** One line for the run trail / activity: "Updated task “X”: added 2 checklist steps". */
  summary: string
  error?: string
  /** The updated task's previous values (for an undo). */
  restore?: Record<string, any>
  checklistSaved?: boolean
}

const fmtDay = (ms: number) => new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Melbourne' })
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** Add steps (and a dated details line) to an open task. */
export async function addToTask(db: any, task: OpenTask, input: Pick<UpsertTaskInput, 'companyId' | 'title' | 'details' | 'steps' | 'priority' | 'dueDate' | 'actorName' | 'actorId' | 'sourceLabel' | 'now' | 'contactName'>, why = ''): Promise<UpsertTaskResult> {
  const now = input.now ?? Date.now()
  const title = String(input.title || '').trim()
  const steps = (input.steps || []).map(cleanStep).filter(Boolean)
  const candidates = steps.length ? steps : (title ? [title] : [])
  const ignore = nameTokens(input.contactName)
  const patch: Record<string, any> = {}
  const restore: Record<string, any> = {}
  let added: string[] = []

  if (task.checklist) {
    const merged = mergeChecklist(task.checklist, candidates, { titles: [task.title], ignore })
    added = merged.added
    if (added.length) { patch.checklist = merged.checklist; restore.checklist = task.checklist }
  } else {
    // No checklist column: new steps go in the details text.
    added = newStepsFor(task, candidates, ignore)
  }

  const details = String(input.details || '').replace(/\s+/g, ' ').trim()
  const lines: string[] = []
  if (details && !String(task.text || '').includes(details.slice(0, 300))) lines.push(details.slice(0, 300))
  if (!task.checklist && added.length) lines.push(`Also: ${added.join('; ')}`)
  if (lines.length) {
    const line = `${fmtDay(now)}${input.sourceLabel ? ` (${input.sourceLabel})` : ''}: ${lines.join(' — ')}`
    patch.text = `${task.text || task.title}\n\n${line}`.slice(0, 8000)
    restore.text = task.text
  }

  const curRank = PRI_RANK[String(task.priority || 'normal')] ?? 1
  const newRank = PRI_RANK[String(input.priority || '')] ?? -1
  if (newRank > curRank) { patch.priority = input.priority; restore.priority = task.priority }
  if (input.dueDate && (!task.dueDate || new Date(input.dueDate).getTime() < new Date(task.dueDate).getTime())) { patch.due_date = input.dueDate; restore.due_date = task.dueDate }

  if (!Object.keys(patch).length) {
    return { ok: true, action: 'updated', taskId: task.id, title: task.title, added: [], reason: why || 'An open task already covers this.', summary: `Already a task: “${task.title}” — nothing new to add` }
  }
  const upd = await updateTask(db, input.companyId, task.id, patch)
  if (!upd.ok) return { ok: false, action: 'skipped', taskId: task.id, title: task.title, added: [], error: upd.error, summary: `Couldn’t update “${task.title}”: ${upd.error}` }

  const what = added.length ? `added ${plural(added.length, 'checklist step')}` : patch.text ? 'added a note' : patch.priority ? `raised priority to ${patch.priority}` : 'moved the due date'
  // The task card's own history, so Activity says what AI changed.
  try {
    await db.from('task_activity').insert({
      task_id: task.id, company_id: input.companyId, actor_id: input.actorId || null, actor_name: input.actorName || 'Colvy AI',
      kind: added.length ? 'checklist' : 'edit', detail: `${what}${input.sourceLabel ? ` (from the ${input.sourceLabel})` : ''}${added.length ? `: ${added.join('; ')}` : ''}`.slice(0, 500),
    }).then(() => {}, () => {})
  } catch { /* table may not be migrated */ }
  return { ok: true, action: 'updated', taskId: task.id, title: task.title, added, reason: why || 'An open task already covers this job.', summary: `Updated task “${task.title}”: ${what}`, restore, checklistSaved: !!task.checklist }
}

/**
 * Create a task, or add to the open one it duplicates. The one entry point for
 * AI-made tasks.
 */
export async function upsertTask(db: any, input: UpsertTaskInput): Promise<UpsertTaskResult> {
  const now = input.now ?? Date.now()
  const title = String(input.title || '').replace(/\s+/g, ' ').trim().slice(0, 200)
  if (!title) return { ok: false, action: 'skipped', title: '', added: [], error: 'A task needs a title.', summary: 'No title' }
  const steps: string[] = []
  for (const s of (input.steps || []).map(cleanStep)) if (s && !stepCovered(s, steps) && normText(s) !== normText(title)) steps.push(s)
  const mode = input.mode || 'auto'
  let contactId = input.contactId ?? null
  let contactName = input.contactName ?? null
  const base = { ...input, title, steps, now }
  const named = (t: OpenTask, why: string, over: Partial<UpsertTaskInput> = {}) => addToTask(db, t, { ...base, contactName, ...over }, why)

  // The task someone (or the model) chose to add to.
  if ((mode === 'add' || mode === 'auto') && input.existingTaskId) {
    const t = await loadTask(db, input.companyId, input.existingTaskId)
    if (t) return addToTask(db, t, base, 'Added to the task it picked.')
  }
  if (mode !== 'create' && input.conversationId && (!contactId || !contactName)) {
    try {
      const { data: conv } = await db.from('conversations').select('contact_id').eq('company_id', input.companyId).eq('id', input.conversationId).maybeSingle()
      contactId = contactId || conv?.contact_id || null
      if (contactId && !contactName) {
        const { data: ct } = await db.from('contacts').select('name').eq('company_id', input.companyId).eq('id', contactId).maybeSingle()
        contactName = ct?.name || null
      }
    } catch { /* match on this conversation alone */ }
  }

  if (mode === 'auto') {
    const open = await loadOpenTasks(db, { companyId: input.companyId, conversationId: input.conversationId, contactId, orderId: input.orderId, now })
    const match = findMatch(open, { title, details: input.details, steps }, contactName, { strict: !input.conversationId && !contactId && !input.orderId })
    if (match) return named(match, `“${match.title}” is already open for this.`)

    if (input.caps) {
      const since = new Date(now - DAY).toISOString()
      if (input.conversationId && (await countAiTasks(db, input.companyId, since, input.conversationId)) >= input.caps.perConversation) {
        // Enough new tasks on this conversation today: it goes on the newest open one.
        const target = open.find(t => t.conversationId === input.conversationId)
        const why = `Daily limit of ${plural(input.caps.perConversation, 'AI task')} for this conversation reached`
        if (target) return named(target, `${why}, so it was added to “${target.title}”.`, { steps: steps.length ? [title, ...steps] : [title] })
        return { ok: true, action: 'skipped', title, added: [], reason: `${why}.`, summary: `Skipped task “${title}”: ${why.toLowerCase()}` }
      }
      if ((await countAiTasks(db, input.companyId, since)) >= input.caps.perCompany) {
        const why = `Daily limit of ${plural(input.caps.perCompany, 'AI task')} for the business reached`
        return { ok: true, action: 'skipped', title, added: [], reason: `${why}.`, summary: `Skipped task “${title}”: ${why.toLowerCase()}` }
      }
    }
  }

  const details = String(input.details || '').trim().slice(0, 2000)
  const assignees = (input.assignees || []).filter(a => a && a.name)
  const row: Record<string, any> = {
    company_id: input.companyId, title, text: details ? `${title}\n\n${details}` : title, done: false, status: 'todo',
    priority: ['low', 'high'].includes(String(input.priority)) ? input.priority : 'normal',
    due_date: input.dueDate || null,
    assignees, assigned_to_id: assignees[0]?.id || null, assigned_to: assignees[0]?.name || null, mentions: [],
    order_id: input.orderId || null, conversation_id: input.conversationId || null,
    created_by: input.createdBy || null, created_by_id: input.createdById || null, source: input.source,
    ...(input.locationId ? { location_id: input.locationId, location_ids: [input.locationId] } : {}),
    ...(steps.length ? { checklist: steps.map(text => ({ id: newId(), text, done: false })) } : {}),
    ...(input.extra || {}),
  }
  const ins = await insertTask(db, row, steps)
  if (!ins.id) return { ok: false, action: 'skipped', title, added: [], error: ins.error || 'Could not create the task.', summary: `Couldn’t create “${title}”` }
  return {
    ok: true, action: 'created', taskId: ins.id, title, added: steps, checklistSaved: ins.checklistSaved,
    summary: `Created task “${title}”${steps.length ? ` with ${plural(steps.length, 'checklist step')}` : ''}`,
  }
}

// ── Summary prompts ──────────────────────────────────────────────────────────

/** What the call / chat summary prompts ask for in "todos" (shared, so both read the same). */
export const ACTION_ITEMS_GUIDE = [
  'Action items ("todos") are only real to-dos a staff member still has to do later: call back, order stock, arrange payment, chase a supplier, fix an order, send something promised.',
  'Not action items: anything already done in the conversation, information or a summary point, a reply that was already sent, a back-in-stock request (that goes on the product’s waiting list), or “wait for the customer” with nothing for staff to do (make it a step of the related job instead).',
  'One job is ONE item. When a job has several steps, write it as "Short job title: step one; step two; step three" — e.g. "Texas Holy Rock order for Shery: Confirm the quantity when she calls back (before next Thursday’s delivery); Add the extra Texas Holy Rock to the next supplier order; Arrange payment when she confirms". A job with one step is just that step.',
  'Return [] when there is nothing for staff to do. Never invent tasks.',
].join('\n')

/** The open-tasks part of a summary prompt (empty when there are none). */
export function openTasksForSummaryPrompt(open: OpenTask[]): string {
  if (!open.length) return ''
  return `\n\nThese tasks are already OPEN for this customer. If an action item is part of one of these jobs, start it with that task's exact title and list only the steps it doesn't have yet; leave it out if there is nothing new:\n${openTasksPromptBlock(open)}`
}
