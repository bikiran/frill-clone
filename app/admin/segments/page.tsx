'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, resolveCompanyUser } from '@/lib/client-cache'
import { useRouter } from 'next/navigation'
import { confirmDialog, alertDialog } from '@/components/ConfirmDialog'
import { TrashIcon, PlusIcon, SearchIcon } from '@/components/Icons'
import { AdminPage, Panel } from '@/components/ui/AdminKit'
import { SkeletonList } from '@/components/Skeleton'
import EmptyScroll from '@/components/EmptyScroll'


type Segment = { id: string; name: string; conditions: any[]; match_type: string; created_at: string }

export default function SegmentsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedSegment, setSelectedSegment] = useState<Segment | null>(null)
  const [searchUsers, setSearchUsers] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMatchType, setNewMatchType] = useState('all')
  const [newConditions, setNewConditions] = useState([{ field: 'email', operator: 'contains', value: '' }])
  const [selectedUser, setSelectedUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchSegments()
    fetchUsers()
  }, [router])

  useEffect(() => { setVisibleCount(50) }, [selectedSegment, searchUsers])

  const fetchSegments = async () => {
    try {
      const { data } = await supabase.from('segments').select('*').order('created_at', { ascending: false })
      if (data) {
        setSegments(data)
        if (data.length > 0 && !selectedSegment) setSelectedSegment(data[0])
      }
    } catch {}
    setLoading(false)
  }

  const fetchUsers = async () => {
    // The admin already knows the company; otherwise resolve it
    // (subdomain slug → owner → team membership).
    let cid: string | null = peekCompanyUser()?.companyId || (await resolveCompanyUser().catch(() => null))?.companyId || null
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) { setAllUsers([]); return }
    const h = typeof window !== 'undefined' ? window.location.hostname : ''
    if (!cid && h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com') {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
      cid = co?.id || null
    }
    if (!cid) {
      const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      cid = ownCo?.id || null
    }
    if (!cid) {
      const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).maybeSingle()
      cid = tm?.company_id || null
    }

    // A single map keyed by email (or a synthetic key) so the same person from
    // multiple sources merges into one row with combined source tags.
    const userMap = new Map<string, any>()
    const add = (key: string, data: any, source: string) => {
      const k = (key || '').toLowerCase() || `${source}-${Math.random()}`
      const existing = userMap.get(k)
      if (existing) {
        existing.sources = Array.from(new Set([...(existing.sources || []), source]))
        // Fill any missing fields
        for (const f of ['name', 'email', 'phone', 'total_spend', 'total_orders']) if (!existing[f] && data[f]) existing[f] = data[f]
      } else {
        userMap.set(k, { ...data, sources: [source] })
      }
    }

    if (cid) {
      // The four sources are read side by side, then merged in this order:
      // feedback board, chat contacts, WooCommerce, Shopify.
      const q = (p: any) => Promise.resolve(p).then((r: any) => r?.data || []).catch(() => [])
      const [ideas, contacts, woo, shop] = await Promise.all([
        q(supabase.from('ideas').select('user_id, created_by_name, created_at').eq('company_id', cid)),
        q((supabase as any).from('contacts').select('id, name, email, phone, created_at').eq('company_id', cid)),
        q((supabase as any).from('woocommerce_customers').select('id, email, first_name, last_name, phone, total_spend, total_orders').eq('company_id', cid)),
        q((supabase as any).from('shopify_customers').select('id, email, first_name, last_name, phone, total_spend, total_orders').eq('company_id', cid)),
      ])
      // 1) Feedback board users (ideas) — scoped to THIS company only.
      ideas.forEach((i: any) => { if (i.user_id) add(i.user_id, { id: i.user_id, name: i.created_by_name || 'Anonymous', last_seen: i.created_at }, 'feedback') })
      // 2) Chat contacts
      contacts.forEach((c: any) => add(c.email || c.id, { id: c.id, name: c.name || 'Contact', email: c.email, phone: c.phone, last_seen: c.created_at }, 'chat'))
      // 3) WooCommerce customers
      woo.forEach((c: any) => add(c.email || c.id, { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email, email: c.email, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders }, 'woocommerce'))
      // 4) Shopify customers
      shop.forEach((c: any) => add(c.email || c.id, { id: c.id, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.email, email: c.email, phone: c.phone, total_spend: c.total_spend, total_orders: c.total_orders }, 'shopify'))
    }

    setAllUsers(Array.from(userMap.values()))
  }

  const matchUser = (u: any, segment: Segment) => {
    if (!segment.conditions || segment.conditions.length === 0) return true
    const checks = segment.conditions.map((c: any) => {
      // 'source' is an array of tags; match if any tag matches.
      if (c.field === 'source') {
        const target = (c.value || '').toLowerCase()
        const srcs = (u.sources || []).map((s: string) => s.toLowerCase())
        if (c.operator === 'is_equal_to') return srcs.includes(target)
        return srcs.some((s: string) => s.includes(target))
      }
      const val = (u[c.field] || u.name || '').toLowerCase()
      const target = (c.value || '').toLowerCase()
      if (c.operator === 'contains') return val.includes(target)
      if (c.operator === 'is_equal_to') return val === target
      if (c.operator === 'starts_with') return val.startsWith(target)
      return true
    })
    return segment.match_type === 'all' ? checks.every(Boolean) : checks.some(Boolean)
  }

  const segmentUsers = selectedSegment
    ? allUsers.filter(u => matchUser(u, selectedSegment)).filter(u => !searchUsers || (u.name || '').toLowerCase().includes(searchUsers.toLowerCase()) || (u.email || '').toLowerCase().includes(searchUsers.toLowerCase()))
    : allUsers.filter(u => !searchUsers || (u.name || '').toLowerCase().includes(searchUsers.toLowerCase()) || (u.email || '').toLowerCase().includes(searchUsers.toLowerCase()))
  const visibleUsers = segmentUsers.slice(0, visibleCount)

  const createSegment = async () => {
    if (!newName.trim()) return
    const { error } = await supabase.from('segments').insert({
      name: newName.trim(),
      match_type: newMatchType,
      conditions: newConditions.filter(c => c.value.trim()),
    })
    if (error) {
      await alertDialog({ title: 'Couldn’t save the segment', message: error.message })
      return
    }
    setNewName('')
    setNewConditions([{ field: 'email', operator: 'contains', value: '' }])
    setShowCreate(false)
    fetchSegments()
  }

  const deleteSegment = async (id: string, name: string) => {
    if (!await confirmDialog({ title: `Delete “${name}”?`, message: 'The customers stay; only this segment is removed.', confirmLabel: 'Delete', tone: 'danger' })) return
    await supabase.from('segments').delete().eq('id', id)
    if (selectedSegment?.id === id) setSelectedSegment(null)
    fetchSegments()
  }

  if (loading || !user) return <SkeletonList rows={6} />

  const SRC: Record<string, { label: string; tone: string }> = {
    woocommerce: { label: 'WooCommerce', tone: 'violet' },
    shopify: { label: 'Shopify', tone: 'green' },
    chat: { label: 'Chat', tone: 'blue' },
    feedback: { label: 'Feedback', tone: 'amber' },
  }
  const hues = ['#6366f1', '#16a34a', '#f59e0b', '#ef4444', '#0ea5e9', '#d946ef', '#14b8a6', '#ff6a4d']
  const hue = (s: string) => hues[[...(s || '?')].reduce((n, ch) => n + ch.charCodeAt(0), 0) % hues.length]
  const FIELD_LABEL: Record<string, string> = { name: 'Name', email: 'Email', phone: 'Phone', source: 'Source' }
  const OP_LABEL: Record<string, string> = { contains: 'contains', is_equal_to: 'is', starts_with: 'starts with' }
  const describe = (seg: Segment) => (seg.conditions || []).map((c: any) => `${FIELD_LABEL[c.field] || c.field} ${OP_LABEL[c.operator] || c.operator} “${c.value}”`).join(seg.match_type === 'all' ? ' and ' : ' or ')

  return (
    <AdminPage width="xl" title="Segments" sub="Groups of customers from chat, your store and the feedback board, so you can target them."
      actions={<button type="button" className="ak-btn go" onClick={() => setShowCreate(true)}><PlusIcon size={15} color="currentColor" /> New segment</button>}>
      <div className="sg-cols">
        <aside className="ak-panel sg-side" aria-label="Segments">
          <button type="button" className={`sg-seg${!selectedSegment ? ' on' : ''}`} onClick={() => setSelectedSegment(null)}>
            <span className="t">All customers</span><span className="n">{allUsers.length}</span>
          </button>
          {segments.length > 0 && <p className="sg-side-h">Your segments</p>}
          {segments.map(sg => (
            <button key={sg.id} type="button" className={`sg-seg${selectedSegment?.id === sg.id ? ' on' : ''}`} onClick={() => setSelectedSegment(sg)}>
              <span className="t">{sg.name}</span>
              <span className="n">{allUsers.filter(u => matchUser(u, sg)).length}</span>
            </button>
          ))}
          {segments.length === 0 && <p className="ak-hint" style={{ padding: '8px 10px 4px', margin: 0 }}>No segments yet. Make one to group customers by email, source and more.</p>}
        </aside>

        <div style={{ minWidth: 0 }}>
          {/* Phones: segments as chips. */}
          <div className="sg-chips">
            <button type="button" className={`ak-chip${!selectedSegment ? ' on' : ''}`} onClick={() => setSelectedSegment(null)}>All <span>{allUsers.length}</span></button>
            {segments.map(sg => <button key={sg.id} type="button" className={`ak-chip${selectedSegment?.id === sg.id ? ' on' : ''}`} onClick={() => setSelectedSegment(sg)}>{sg.name}</button>)}
          </div>

          <Panel flush
            title={selectedSegment ? selectedSegment.name : 'All customers'}
            sub={<>{segmentUsers.length.toLocaleString()} {segmentUsers.length === 1 ? 'customer' : 'customers'}{selectedSegment && describe(selectedSegment) ? <> · {describe(selectedSegment)}</> : null}</>}
            right={selectedSegment ? (
              <button type="button" className="ak-icon-btn danger" onClick={() => deleteSegment(selectedSegment.id, selectedSegment.name)} title="Delete segment" aria-label="Delete segment">
                <TrashIcon size={15} color="currentColor" />
              </button>
            ) : undefined}>
            <div style={{ padding: '0 14px 10px' }}>
              <label className="sg-search">
                <SearchIcon size={16} color="currentColor" />
                <input type="text" value={searchUsers} onChange={e => setSearchUsers(e.target.value)} placeholder="Search by name or email" aria-label="Search customers" />
              </label>
            </div>
            <div className="ak-list" style={{ padding: '0 8px 8px' }}>
              {visibleUsers.map(u => {
                const open = selectedUser?.id === u.id
                return (
                  <div key={u.id}>
                    <button type="button" className={`ak-row sg-user${open ? ' on' : ''}`} onClick={() => setSelectedUser(open ? null : u)} aria-expanded={open}>
                      <span className="sg-av" style={{ background: hue(u.name || u.email) }} aria-hidden>{(u.name || 'A')[0].toUpperCase()}</span>
                      <span className="ak-row-t">
                        <b>{u.name}</b>
                        <small>{u.email || (u.last_seen ? `Last seen ${new Date(u.last_seen).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}` : '')}</small>
                      </span>
                      {u.total_spend ? <span className="sg-spend">${Number(u.total_spend).toLocaleString('en-AU', { maximumFractionDigits: 0 })}</span> : null}
                      <span className="sg-srcs">
                        {(u.sources || []).map((src: string) => <span key={src} className={`ak-tag ${SRC[src]?.tone || ''}`}>{SRC[src]?.label || src}</span>)}
                      </span>
                    </button>
                    {open && (
                      <div className="sg-detail">
                        {u.email && <span><small>Email</small>{u.email}</span>}
                        {u.phone && <span><small>Phone</small>{u.phone}</span>}
                        {u.total_orders ? <span><small>Orders</small>{u.total_orders}</span> : null}
                        {u.total_spend ? <span><small>Spent</small>${Number(u.total_spend).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> : null}
                        {u.last_seen && <span><small>First seen</small>{new Date(u.last_seen).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              {segmentUsers.length === 0 && <EmptyScroll compact kinds={['contact']} title="No customers in this segment" line="Customers who fit this segment show up here." />}
              {visibleCount < segmentUsers.length && (
                <button type="button" className="ak-btn ghost" style={{ margin: '8px 4px 2px' }} onClick={() => setVisibleCount(c => c + 50)}>
                  Show more ({(segmentUsers.length - visibleCount).toLocaleString()} left)
                </button>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {/* New segment */}
      {showCreate && (
        <div className="sg-scrim" onClick={() => setShowCreate(false)}>
          <div className="sg-dialog" role="dialog" aria-modal="true" aria-labelledby="sg-new-h" onClick={e => e.stopPropagation()}>
            <div className="sg-dialog-h">
              <h2 id="sg-new-h">New segment</h2>
              <button type="button" className="ak-icon-btn" onClick={() => setShowCreate(false)} aria-label="Close">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <label className="ak-label" htmlFor="sg-name">Name</label>
            <input id="sg-name" className="ak-field" type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Big spenders, Reef keepers, Wholesale" autoFocus />

            <div className="sg-match">
              Customers who match
              <div className="ak-seg" role="radiogroup" aria-label="Match">
                <button type="button" role="radio" aria-checked={newMatchType === 'all'} className={newMatchType === 'all' ? 'on' : ''} onClick={() => setNewMatchType('all')}>all</button>
                <button type="button" role="radio" aria-checked={newMatchType === 'any'} className={newMatchType === 'any' ? 'on' : ''} onClick={() => setNewMatchType('any')}>any</button>
              </div>
              of these:
            </div>

            {newConditions.map((c, i) => (
              <div key={i} className="sg-cond">
                <select className="ak-select sm" value={c.field} aria-label="Field" onChange={e => { const nc = [...newConditions]; nc[i].field = e.target.value; setNewConditions(nc) }}>
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="source">Source</option>
                </select>
                <select className="ak-select sm" value={c.operator} aria-label="Rule" onChange={e => { const nc = [...newConditions]; nc[i].operator = e.target.value; setNewConditions(nc) }}>
                  <option value="contains">contains</option>
                  <option value="is_equal_to">is</option>
                  <option value="starts_with">starts with</option>
                </select>
                <input className="ak-field sm" type="text" value={c.value} aria-label="Value"
                  placeholder={c.field === 'source' ? 'shopify, woocommerce, chat or feedback' : 'Value'}
                  onChange={e => { const nc = [...newConditions]; nc[i].value = e.target.value; setNewConditions(nc) }} />
                {newConditions.length > 1 && (
                  <button type="button" className="ak-icon-btn danger" aria-label="Remove condition" onClick={() => setNewConditions(newConditions.filter((_, idx) => idx !== i))}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="ak-btn ghost sm" style={{ marginTop: 4 }} onClick={() => setNewConditions([...newConditions, { field: 'name', operator: 'contains', value: '' }])}>+ Add a condition</button>

            <div className="sg-dialog-foot">
              <button type="button" className="ak-btn ghost" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="ak-btn go" onClick={createSegment} disabled={!newName.trim()}>Save segment</button>
            </div>
          </div>
        </div>
      )}
      <style>{SG_CSS}</style>
    </AdminPage>
  )
}

const SG_CSS = `
.sg-cols{display:grid;grid-template-columns:250px minmax(0,1fr);gap:14px;align-items:start}
.sg-side{position:sticky;top:76px;margin:0;padding:8px;max-height:calc(100vh - 96px);overflow-y:auto}
.sg-side-h{margin:10px 10px 4px;font-size:12.5px;font-weight:650;color:var(--soft)}
.sg-seg{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;padding:8px 10px;border:none;border-radius:12px;background:none;font:inherit;font-size:14px;color:var(--ink);text-align:left;cursor:pointer}
.sg-seg:hover{background:color-mix(in srgb,var(--f) 70%,transparent)}
.sg-seg.on{background:var(--f);font-weight:650}
.sg-seg .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sg-seg .n{font-size:12px;font-weight:600;color:var(--mut);font-variant-numeric:tabular-nums}
.sg-chips{display:none}
.sg-search{display:flex;align-items:center;gap:9px;height:42px;padding:0 14px;border-radius:999px;background:var(--f);color:var(--soft)}
.ak .sg-search input{flex:1;min-width:0;height:100%;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important}
button.sg-user{width:100%;border:none;background:none;font:inherit;text-align:left;cursor:pointer}
button.sg-user.on{background:var(--f)}
.sg-av{width:38px;height:38px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700}
.sg-spend{flex-shrink:0;font-size:13.5px;font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums}
.sg-srcs{display:flex;gap:4px;flex-shrink:0}
.sg-detail{display:flex;flex-wrap:wrap;gap:6px 22px;margin:2px 4px 8px 62px;padding:10px 14px;border-radius:14px;background:var(--f);font-size:13.5px;color:var(--ink)}
.sg-detail small{display:block;font-size:11.5px;font-weight:600;color:var(--soft)}
@media (max-width:899px){
  .sg-cols{grid-template-columns:minmax(0,1fr)}
  .sg-side{display:none}
  .sg-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -16px 12px;padding:0 16px}
  .sg-srcs{display:none}
  .sg-detail{margin-left:4px}
}
.sg-scrim{position:fixed;inset:0;z-index:3000;background:rgba(15,15,20,.42);display:flex;align-items:center;justify-content:center;padding:16px}
.sg-dialog{width:min(600px,100%);max-height:90vh;overflow-y:auto;padding:22px;border-radius:26px;background:var(--card,#fff);box-shadow:0 30px 80px -20px rgba(0,0,0,.35)}
.sg-dialog-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
.sg-dialog-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:21px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.sg-match{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:18px 0 10px;font-size:14px;color:var(--ink)}
.sg-match .ak-seg button{height:30px;padding:0 13px}
.sg-cond{display:grid;grid-template-columns:120px 130px minmax(0,1fr) auto;gap:6px;align-items:center;margin-bottom:6px}
@media (max-width:560px){.sg-cond{grid-template-columns:1fr 1fr}.sg-cond .ak-field{grid-column:1/-1}}
.sg-dialog-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}
`
