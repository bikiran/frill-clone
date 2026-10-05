'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser } from '@/lib/client-cache'
import PageHeader from '@/components/PageHeader'
import { SkeletonList } from '@/components/Skeleton'
import WaitlistAddModal from '@/components/WaitlistAddModal'
import { confirmDialog } from '@/components/ConfirmDialog'
import { BellIcon, GearIcon, PlusIcon, ChatIcon, TagIcon, XIcon, EditIcon, ExternalIcon } from '@/components/booking/icons'

// Back-in-stock waitlists. Customers who asked for something that's out of
// stock are grouped by item; when it's back, everyone waiting gets one SMS —
// automatically for products linked to WooCommerce, or with "Notify now".

const DEFAULT_TEMPLATE = 'Hi {name}, good news — {item} is back in stock at {business}! {link} Reply STOP to opt out.'
const OPEN = ['waiting', 'queued', 'sending', 'failed']

const STATUS_PILL: Record<string, { label: string; bg: string; c: string }> = {
  waiting: { label: 'Waiting', bg: '#eff6ff', c: '#2563eb' },
  queued: { label: 'Sends at 9am', bg: '#fffbeb', c: '#b45309' },
  sending: { label: 'Sending…', bg: '#f5f3ff', c: '#7c3aed' },
  notified: { label: 'Notified', bg: '#f0fdf4', c: '#059669' },
  failed: { label: 'Failed', bg: '#fef2f2', c: '#dc2626' },
  cancelled: { label: 'Removed', bg: '#f3f4f6', c: '#6b7280' },
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const t = data?.session?.access_token
  return t ? { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }
}

const groupKey = (e: any) => e.woo_product_id ? `p:${e.woo_product_id}` : `n:${String(e.item_name || '').trim().toLowerCase()}`
// Only real web links open in a new tab (staff can type an item link by hand).
const webUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
const isWaiting = (e: any) => e.status === 'waiting' || e.status === 'queued'

export default function WaitlistsPage() {
  const router = useRouter()
  const [companyId, setCompanyId] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [entries, setEntries] = useState<any[]>([])
  const [stock, setStock] = useState<Record<string, any>>({})
  const [settings, setSettings] = useState<any>({ auto_notify: true, template: DEFAULT_TEMPLATE, timezone: 'Australia/Melbourne' })
  const [loading, setLoading] = useState(true)
  const [setupMsg, setSetupMsg] = useState('')
  const [tab, setTab] = useState<'waiting' | 'notified' | 'all'>('waiting')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<string | null>(null)

  // Opening Waitlists clears the side-menu "new sign-ups" badge.
  useEffect(() => {
    try { localStorage.setItem('colvy-waitlist-seen-at', new Date().toISOString()); window.dispatchEvent(new Event('waitlist-seen')) } catch {}
  }, [])
  const [busy, setBusy] = useState('')
  const [toast, setToast] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 5000) }

  const load = async (cid: string) => {
    try {
      const res = await fetch(`/api/waitlist?companyId=${cid}`, { headers: await authHeaders() })
      const d = await res.json()
      if (d.needsMigration) setSetupMsg(d.error)
      else if (!res.ok) setSetupMsg(d.error || 'Could not load waitlists')
      else setSetupMsg('')
      setEntries(d.entries || [])
      setStock(d.stock || {})
      if (d.settings) setSettings(d.settings)
    } catch { setSetupMsg('Could not load waitlists') }
  }

  useEffect(() => {
    ;(async () => {
      const { companyId: cidRaw, user } = await resolveCompanyUser()
      if (!user) { router.push('/signin'); return }
      let cid = cidRaw
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      if (cid) {
        setCompanyId(cid)
        const { data: co } = await (supabase as any).from('companies').select('name').eq('id', cid).maybeSingle()
        setBusinessName(co?.name || '')
        await load(cid)
      }
      setLoading(false)
    })()
  }, [])

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const map = new Map<string, any>()
    for (const e of entries) {
      const inTab = tab === 'all' || (tab === 'waiting' ? OPEN.includes(e.status) : e.status === 'notified')
      if (!inTab) continue
      if (q && ![e.item_name, e.customer_name, e.phone, e.email].some(v => String(v || '').toLowerCase().includes(q))) continue
      const k = groupKey(e)
      const g = map.get(k) || { key: k, name: e.item_name, image: e.item_image, url: e.item_url, productId: e.woo_product_id, entries: [] as any[] }
      g.image = g.image || e.item_image
      g.url = g.url || e.item_url
      g.entries.push(e)
      map.set(k, g)
    }
    const list = Array.from(map.values())
    list.forEach(g => { g.url = webUrl(g.url) || webUrl(g.productId ? stock[String(g.productId)]?.permalink : null) })
    list.forEach(g => {
      g.waiting = g.entries.filter(isWaiting).length
      // Current price from the store, and what the waitlist is worth if each
      // person waiting buys one once it's back.
      const p = g.productId ? stock[String(g.productId)] : null
      g.price = p?.price ?? null
      g.regular = p?.on_sale ? p.regular_price : null
      g.potential = g.price != null ? g.price * g.waiting : null
    })
    return list.sort((a, b) => b.waiting - a.waiting || b.entries.length - a.entries.length)
  }, [entries, tab, search, stock])

  const stats = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86400000
    const waiting = entries.filter(isWaiting)
    let potential = 0, unpriced = 0
    for (const e of waiting) {
      const price = e.woo_product_id ? stock[String(e.woo_product_id)]?.price : null
      if (price != null) potential += price; else unpriced++
    }
    return {
      potential, unpriced,
      waiting: waiting.length,
      items: new Set(waiting.map(groupKey)).size,
      queued: entries.filter(e => e.status === 'queued').length,
      notified30: entries.filter(e => e.status === 'notified' && e.notified_at && new Date(e.notified_at).getTime() > monthAgo).length,
    }
  }, [entries, stock])

  const notifyGroup = async (g: any) => {
    const ids = g.entries.filter((e: any) => e.status === 'waiting' || e.status === 'queued').map((e: any) => e.id)
    if (!ids.length) return
    if (!await confirmDialog({ title: `Text ${ids.length} customer${ids.length === 1 ? '' : 's'}?`, message: `They'll get an SMS that ${g.name} is back in stock.`, confirmLabel: ids.length === 1 ? 'Send text' : `Send ${ids.length} texts`, tone: 'primary' })) return
    setBusy(g.key)
    try {
      const res = await fetch('/api/waitlist/notify', { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ companyId, ids }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      const parts = [`${d.sent} sent`]
      if (d.failed) parts.push(`${d.failed} failed`)
      if (d.skipped) parts.push(`${d.skipped} opted out`)
      flash(`${g.name}: ${parts.join(', ')}.`)
      await load(companyId)
    } catch (e: any) { flash(e.message) } finally { setBusy('') }
  }

  // Website sign-ups have no thread yet: find or create their contact and
  // conversation, then open it in the inbox.
  const openChat = async (e: any) => {
    setBusy(`chat:${e.id}`)
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: e.id, action: 'chat' }) })
      const d = await res.json()
      if (!res.ok || !d.conversationId) throw new Error(d.error || 'Could not open a chat')
      router.push(`/admin/inbox?conversation=${d.conversationId}`)
    } catch (err: any) { flash(err.message); setBusy('') }
  }

  const removeEntry = async (e: any) => {
    if (!await confirmDialog({ title: 'Remove from waitlist?', message: `${e.customer_name || e.phone || 'This customer'} won't be told when ${e.item_name} is back.`, confirmLabel: 'Remove', tone: 'danger' })) return
    setBusy(e.id)
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: e.id, action: 'cancel' }) })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed')
      await load(companyId)
    } catch (err: any) { flash(err.message) } finally { setBusy('') }
  }

  const stockBadge = (g: any) => {
    if (!g.productId) return { label: 'Not listed online', bg: '#f3f4f6', c: '#6b7280' }
    const s = stock[String(g.productId)]
    if (!s) return { label: 'Linked product', bg: '#f3f4f6', c: '#6b7280' }
    if (s.stock_status === 'instock') return { label: `In stock${s.stock_quantity != null ? ` · ${s.stock_quantity}` : ''}`, bg: '#f0fdf4', c: '#059669' }
    if (s.stock_status === 'onbackorder') return { label: 'On backorder', bg: '#fffbeb', c: '#b45309' }
    return { label: 'Out of stock', bg: '#fef2f2', c: '#dc2626' }
  }

  if (loading) return <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}><SkeletonList /></div>

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 560px) { .wl-hide-sm { display: none } }
        @media (max-width: 640px) {
          .wl-stats { display: flex !important; overflow-x: auto; scroll-snap-type: x mandatory; margin-left: -24px; margin-right: -24px; padding: 0 24px 4px; scroll-padding-left: 24px; scrollbar-width: none; -webkit-overflow-scrolling: touch }
          .wl-stats::-webkit-scrollbar { display: none }
          .wl-stats > div { flex: 0 0 72%; scroll-snap-align: start }
          .wl-title { white-space: normal !important; line-height: 1.3 }
        }
      `}</style>
      <PageHeader
        title="Back-in-stock waitlists"
        subtitle="Customers waiting for an item. When it's back, they get one SMS."
        bleed={24}
        action={
          <>
            <button onClick={() => setShowSettings(s => !s)} style={{ ...btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6 }}><GearIcon size={15} /> Settings</button>
            <button onClick={() => setShowAdd(true)} disabled={!!setupMsg} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}><PlusIcon size={15} strokeWidth={2.4} /> Add to waitlist</button>
          </>
        }
      />

      {setupMsg && <div style={{ ...card, background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontSize: 13.5, marginBottom: 16 }}>{setupMsg}</div>}
      {toast && <div style={{ ...card, background: '#f0fdf4', borderColor: '#bbf7d0', color: '#065f46', fontSize: 13.5, marginBottom: 16, padding: '10px 14px' }}>{toast}</div>}

      {showSettings && <SettingsPanel companyId={companyId} businessName={businessName} settings={settings} onSaved={s => { setSettings(s); flash('Settings saved.') }} />}

      {/* Stat tiles — a swipeable row on phones */}
      <div className="wl-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 18 }}>
        {[
          { label: 'Customers waiting', value: String(stats.waiting), c: '#2563eb', bg: '#eff6ff' },
          { label: 'Items with a waitlist', value: String(stats.items), c: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Potential revenue', value: money(stats.potential), c: '#059669', bg: '#f0fdf4',
            sub: stats.unpriced ? `${stats.unpriced} without a price` : 'If everyone waiting buys one',
            title: 'Current store price × each customer waiting. Items not listed online have no price, so they aren’t counted.' },
          ...(stats.queued ? [{ label: 'Texts queued for 9am', value: String(stats.queued), c: '#b45309', bg: '#fffbeb',
            sub: 'Back in stock overnight', title: 'Texts only go out 9am–8pm. Anything back in stock overnight is sent at 9am.' }] : []),
          { label: 'Notified (30 days)', value: String(stats.notified30), c: '#0891b2', bg: '#ecfeff' },
        ].map((s: any) => (
          <div key={s.label} title={s.title} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
            <div style={{ minWidth: 38, height: 38, padding: s.value.length > 3 ? '0 10px' : 0, borderRadius: 10, background: s.bg, color: s.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: 'var(--slate)', fontWeight: 600 }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 1, opacity: 0.85 }}>{s.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: 3 }}>
          {(['waiting', 'notified', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: tab === t ? '#fff' : 'transparent', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none', color: tab === t ? 'var(--ink)' : 'var(--slate)', fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize' }}>{t}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search item or customer…" style={{ ...inp, maxWidth: 300 }} />
      </div>

      {groups.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ width: 54, height: 54, borderRadius: 17, background: 'var(--peach, #fff1ee)', color: 'var(--coral, #ff7a6b)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}><BellIcon size={26} /></div>
          <p style={{ margin: '0 0 6px', fontWeight: 800, fontSize: 16, color: 'var(--ink)' }}>{tab === 'waiting' ? 'Nobody is waiting right now' : 'Nothing here yet'}</p>
          <p style={{ margin: '0 auto 16px', fontSize: 13.5, color: 'var(--slate)', maxWidth: 440, lineHeight: 1.55 }}>
            When a customer asks for something that's out of stock, add them here (or with <b>Waitlist</b> on their conversation). The moment it's back, they get a text.
          </p>
          {!setupMsg && <button onClick={() => setShowAdd(true)} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6 }}><PlusIcon size={15} strokeWidth={2.4} /> Add to waitlist</button>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groups.map(g => {
            const badge = stockBadge(g)
            const isOpen = open[g.key] ?? groups.length <= 3
            return (
              <div key={g.key} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', flexWrap: 'wrap' }}>
                  <button onClick={() => setOpen(o => ({ ...o, [g.key]: !isOpen }))} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: '1 1 260px', minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                    {g.image
                      ? <img src={g.image} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', border: '1px solid var(--border)', flexShrink: 0 }} />
                      : <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}><TagIcon size={22} /></div>}
                    <div style={{ minWidth: 0 }}>
                      <div className="wl-title" style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {g.name}
                        {g.price != null && (
                          <span style={{ fontWeight: 700, color: 'var(--ink)' }}> – {money(g.price)}
                            {g.regular != null && <span style={{ fontWeight: 500, fontSize: 13, color: 'var(--slate)', textDecoration: 'line-through', marginLeft: 6 }}>{money(g.regular)}</span>}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: badge.bg, color: badge.c }}>{badge.label}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                          {g.waiting} waiting · {g.entries.length} total
                          {g.potential != null && g.waiting > 0 && <> · <span style={{ color: '#059669', fontWeight: 700 }}>{money(g.potential)} potential</span></>}
                          {' '}{isOpen ? '▴' : '▾'}
                        </span>
                      </div>
                    </div>
                  </button>
                  {g.url && (
                    <a href={g.url} target="_blank" rel="noopener noreferrer" title="View product on your website" aria-label={`View ${g.name} on your website`}
                      style={{ ...btnGhost, textDecoration: 'none', padding: '9px 12px' }}><ExternalIcon size={15} /> <span className="wl-hide-sm">View product</span></a>
                  )}
                  {g.waiting > 0 && (
                    <button onClick={() => notifyGroup(g)} disabled={busy === g.key} style={{ ...btnPrimary, opacity: busy === g.key ? 0.6 : 1 }}>
                      {busy === g.key ? 'Sending…' : `Notify ${g.waiting} now`}
                    </button>
                  )}
                </div>
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {g.entries.map((e: any) => {
                      const pill = STATUS_PILL[e.status] || STATUS_PILL.waiting
                      if (editing === e.id) return (
                        <EditEntry key={e.id} entry={e} companyId={companyId}
                          onCancel={() => setEditing(null)}
                          onSaved={async () => { setEditing(null); flash('Customer details saved.'); await load(companyId) }} />
                      )
                      return (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                              {e.customer_name || 'Customer'}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--slate)' }}>{[e.phone, e.email].filter(Boolean).join(' · ')}</div>
                            {e.note && <div style={{ fontSize: 12, color: 'var(--slate)', marginTop: 2, fontStyle: 'italic' }}>“{e.note}”</div>}
                            {e.status === 'failed' && e.error && <div style={{ fontSize: 12, color: '#dc2626', marginTop: 2 }}>{e.error}</div>}
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--slate)', whiteSpace: 'nowrap' }}>
                            {e.status === 'notified' && e.notified_at ? `${e.notified_via === 'email' ? 'Emailed' : 'Texted'} ${fmtDate(e.notified_at)}` : `Added ${fmtDate(e.created_at)}`}{e.source === 'inbox' ? ' · from inbox' : e.source === 'website' ? ' · from website' : ''}
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: pill.bg, color: pill.c, whiteSpace: 'nowrap' }}>{pill.label}</span>
                          {e.conversation_id
                            ? <a href={`/admin/inbox?conversation=${e.conversation_id}`} title="Open conversation" aria-label="Open conversation" style={{ ...iconBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate, #6b7280)' }}><ChatIcon size={15} /></a>
                            : (e.phone || e.email || e.contact_id) && (
                              <button onClick={() => openChat(e)} disabled={busy === `chat:${e.id}`} title="Chat with this customer" aria-label="Chat with this customer" style={{ ...iconBtn, opacity: busy === `chat:${e.id}` ? 0.5 : 1 }}><ChatIcon size={15} /></button>
                            )}
                          {['waiting', 'queued', 'failed'].includes(e.status) && (
                            <button onClick={() => setEditing(e.id)} title="Edit customer details" aria-label="Edit customer details" style={iconBtn}><EditIcon size={14} /></button>
                          )}
                          {['waiting', 'queued', 'failed'].includes(e.status) && (
                            <button onClick={() => removeEntry(e)} disabled={busy === e.id} title="Remove from waitlist" style={{ ...iconBtn, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><XIcon size={13} /></button>
                          )}
                        </div>
                      )
                    })}
                    {g.waiting > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', background: 'var(--canvas, #fafafa)', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>
                          {g.price != null
                            ? <>Potential revenue · {g.waiting} waiting × {money(g.price)} each</>
                            : g.productId ? 'No price on this product in your store yet' : 'Not listed online, so there’s no price to estimate from'}
                        </span>
                        {g.potential != null && <span style={{ fontSize: 14, fontWeight: 800, color: '#059669', fontVariantNumeric: 'tabular-nums' }}>{money(g.potential)}</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <WaitlistAddModal companyId={companyId} onClose={() => setShowAdd(false)} onAdded={async (dup) => { setShowAdd(false); flash(dup ? 'Already on that waitlist.' : 'Added to the waitlist.'); await load(companyId) }} />}
    </div>
  )
}

// ── Edit a waiting customer ───────────────────────────────────────────────────
function EditEntry({ entry, companyId, onCancel, onSaved }: { entry: any; companyId: string; onCancel: () => void; onSaved: () => void }) {
  const [name, setName] = useState<string>(entry.customer_name || '')
  const [phone, setPhone] = useState<string>(entry.phone || '')
  const [email, setEmail] = useState<string>(entry.email || '')
  const [note, setNote] = useState<string>(entry.note || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const save = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!phone.trim() && !email.trim()) { setErr('Add a phone number or an email so they can be told it’s back.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, id: entry.id, action: 'edit', customerName: name, phone, email, note }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not save')
      onSaved()
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  const field = (label: string, el: React.ReactNode) => (
    <label style={{ display: 'block', flex: '1 1 180px', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', marginBottom: 4 }}>{label}</span>
      {el}
    </label>
  )
  return (
    <form onSubmit={save} style={{ padding: '12px 16px 14px', borderBottom: '1px solid var(--border)', background: 'var(--canvas, #fafafa)' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {field('Name', <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer name" autoFocus style={{ ...inp, fontSize: 16 }} />)}
        {field('Mobile', <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0412 345 678" inputMode="tel" autoComplete="off" style={{ ...inp, fontSize: 16 }} />)}
        {field('Email', <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" type="email" inputMode="email" autoComplete="off" style={{ ...inp, fontSize: 16 }} />)}
      </div>
      <div style={{ marginTop: 10 }}>
        {field('Note (staff only)', <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. wants 2, happy to pick up" style={{ ...inp, fontSize: 16 }} />)}
      </div>
      <p style={{ fontSize: 12, color: 'var(--slate)', margin: '8px 0 0' }}>They’re texted when it’s back, or emailed if there’s no mobile.</p>
      {err && <p role="alert" style={{ fontSize: 12.5, color: '#dc2626', margin: '6px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel} style={btnGhost}>Cancel</button>
        <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

// ── Settings ─────────────────────────────────────────────────────────────────
function SettingsPanel({ companyId, businessName, settings, onSaved }: { companyId: string; businessName: string; settings: any; onSaved: (s: any) => void }) {
  const [auto, setAuto] = useState<boolean>(settings.auto_notify !== false)
  const [tpl, setTpl] = useState<string>(settings.template || DEFAULT_TEMPLATE)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const preview = tpl.replace(/\{name\}/g, 'Sam').replace(/\{item\}/g, 'Diamond Eye Molly').replace(/\{business\}/g, businessName || 'your store')
    .replace(/\{link\}/g, 'https://shop.example/p/molly').replace(/[ \t]{2,}/g, ' ').trim()
  const segments = preview.length <= 160 ? 1 : Math.ceil(preview.length / 153)

  const save = async () => {
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/waitlist', { method: 'PATCH', headers: await authHeaders(), body: JSON.stringify({ companyId, settings: { auto_notify: auto, template: tpl } }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Failed')
      onSaved(d.settings)
    } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
  }

  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 15, color: 'var(--ink)' }}>Waitlist settings</p>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16, cursor: 'pointer' }}>
        <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} style={{ marginTop: 3 }} />
        <span>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Text customers automatically when a linked product is back in stock</span>
          <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', marginTop: 2, lineHeight: 1.5 }}>
            Triggered by WooCommerce stock updates. Texts only go out 9am–8pm; anything that arrives overnight is sent at 9am.
            Items not listed online are sent with <b>Notify now</b>. If stock changes don't come through, re-register webhooks under Integrations → WooCommerce.
          </span>
        </span>
      </label>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 6 }}>SMS message</label>
      <textarea value={tpl} onChange={e => setTpl(e.target.value)} rows={3} style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
        {['{name}', '{item}', '{business}', '{link}'].map(t => (
          <button key={t} type="button" onClick={() => setTpl(v => `${v} ${t}`.trim())} style={{ padding: '3px 9px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--canvas)', fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}>{t}</button>
        ))}
      </div>
      <div style={{ background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', display: 'block', marginBottom: 4 }}>PREVIEW · {preview.length} chars · {segments} SMS</span>
        {preview}
      </div>
      {!/stop/i.test(tpl) && <p style={{ fontSize: 12, color: '#b45309', margin: '8px 0 0' }}>Tip: keep "Reply STOP to opt out" — it's the required unsubscribe option for marketing texts in Australia.</p>}
      {err && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '8px 0 0' }}>{err}</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setTpl(DEFAULT_TEMPLATE)} style={btnGhost}>Reset to default</button>
        <button type="button" onClick={save} disabled={saving} style={btnPrimary}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box', background: '#fff', color: 'var(--ink)' }
const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
const iconBtn: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--slate)', flexShrink: 0 }
