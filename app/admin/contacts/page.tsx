'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import AddContactModal from '@/components/AddContactModal'
import MatchingContactsModal from '@/components/MatchingContactsModal'
import EmptyScroll from '@/components/EmptyScroll'
import { findMatchingContacts, applyRelationship } from '@/lib/contact-matching'
import { SegmentationService } from '@/lib/segmentation-service'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { contactMessageHref } from '@/lib/channel-choice'
import CustomerTimeline from '@/components/CustomerTimeline'

type Contact = { id: string; name: string | null; email: string | null; phone: string | null; address: string | null; city: string | null; country: string | null; source: string; tags: string[]; subscribed_to_marketing: boolean; created_at: string; total_spend?: number; total_orders?: number; last_order_date?: string | null; rfm_category?: string; __aov?: number; relationship_type?: string; company_name?: string | null; notes?: string | null }

// Where a contact came from: a label and the colour of its tag.
const SOURCES: Record<string, { label: string; color: string }> = {
  widget: { label: 'Live chat', color: '#2563eb' }, woocommerce: { label: 'WooCommerce', color: '#7c3aed' }, shopify: { label: 'Shopify', color: '#16a34a' },
  import: { label: 'Import', color: '#0d9488' }, manual: { label: 'Manual', color: '#ca8a04' }, email: { label: 'Email', color: '#ea580c' },
  phone: { label: 'Phone', color: '#0891b2' }, sms: { label: 'SMS', color: '#0d9488' },
}
const sourceMeta = (src?: string | null) => SOURCES[String(src || '')] || { label: src ? String(src).charAt(0).toUpperCase() + String(src).slice(1) : 'Unknown', color: '#71717a' }
// A soft colour per person, so the list isn't a column of identical circles.
const avatarStyle = (c: { name: string | null; email: string | null }): React.CSSProperties => {
  const hue = Array.from(c.name || c.email || '?').reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360
  return { background: `hsl(${hue} 60% 92%)`, color: `hsl(${hue} 45% 36%)` }
}
// "28 Oct", with the year only when it isn't this year.
const fmtAdded = (d: string) => { const t = new Date(d); return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(t.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) }) }
const RELATIONSHIP_LABELS: Record<string, string> = { customer: 'Customer', supplier: 'Supplier', wholesaler: 'Wholesaler', business: 'Business contact' }
const PHONE_PATH = 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.7 2.34a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.74-1.27a2 2 0 0 1 2.11-.45c.74.34 1.53.57 2.34.7A2 2 0 0 1 22 16.92z'

// "Mia Chen" -> "MC"; no name falls back to the email's first letter.
function initialsOf(c: { name: string | null; email: string | null }): string {
  const words = (c.name || '').trim().split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w))
  if (words.length) return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase()
  return ((c.email || '?')[0] || '?').toUpperCase()
}

// The page: a big title, then one white card holding the search, filters and
// the list. Phones (same breakpoint as the Team page cards): the table becomes
// cards, the filters scroll inside their own panel and the contact opens as a
// full-screen sheet. Desktop never sees the cards — they're hidden above 767px.
const CONTACTS_CSS = `
  .ct-page { display: flex; height: calc(100vh - 56px); overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .ct-main { flex: 1; min-width: 0; display: flex; flex-direction: column; overflow: hidden; padding: 26px 28px 20px; }
  .ct-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; flex-shrink: 0; }
  .ct-head h1 { margin: 0; font-size: 30px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.1; color: var(--ink); }
  .ct-head p { margin: 6px 0 0; font-size: 14px; color: #71717a; }
  .ct-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .ct-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; border-radius: 22px; background: var(--card, #fff); box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 1px 2px rgba(16,24,40,.04); overflow: hidden; }
  .ct-tools { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 16px 18px 14px; border-bottom: 1px solid #f0f0f2; flex-shrink: 0; }
  .ct-search { position: relative; flex: 0 1 380px; min-width: 200px; }
  .ct-search > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #a1a1aa; pointer-events: none; }
  .ct-search input { width: 100%; box-sizing: border-box; height: 38px; padding: 0 34px 0 38px; border: 1.5px solid transparent; border-radius: 999px; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
  .ct-search input::placeholder { color: #a1a1aa; }
  .ct-search input:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
  .ct-search button { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); width: 24px; height: 24px; border: none; border-radius: 999px; background: #e4e4e7; color: #52525b; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
  .ct-search button::before { display: none; }
  .ct-pill, .ct-select { flex-shrink: 0; height: 38px; display: inline-flex; align-items: center; gap: 7px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13.5px; font-weight: 600; white-space: nowrap; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .ct-pill::before { display: none; }
  .ct-pill > svg { color: #71717a; flex-shrink: 0; }
  .ct-pill:hover, .ct-select:hover, .ct-pill[aria-expanded="true"] { background-color: #ececef; }
  .ct-pill:disabled { opacity: .45; cursor: default; background: #f4f4f5; }
  .ct-pill.set, .ct-select.set { background-color: color-mix(in srgb, var(--coral) 12%, #fff); color: color-mix(in srgb, var(--coral) 85%, #000); }
  .ct-pill.set > svg { color: currentColor; }
  .ct-select { appearance: none; -webkit-appearance: none; padding-right: 34px; outline: none; max-width: 240px; text-overflow: ellipsis;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 12px center; background-size: 14px; }
  .ct-pill:focus-visible, .ct-select:focus-visible, .ct-icon:focus-visible, .ct-link:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 28%, transparent); }
  .ct-count { min-width: 18px; height: 18px; padding: 0 5px; box-sizing: border-box; border-radius: 999px; background: var(--coral); color: #fff; font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
  .ct-link { background: none; border: none; padding: 0 6px; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--coral); cursor: pointer; white-space: nowrap; border-radius: 8px; }
  .ct-link::before { display: none; }
  .ct-filters { padding: 16px 18px; border-bottom: 1px solid #f0f0f2; background: #fafafa; flex-shrink: 0; }
  .ct-filters-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
  .ct-filters-grid label { font-size: 12.5px; font-weight: 500; color: #8e8e93; }
  .ct-list { flex: 1; overflow: auto; }
  .ct-empty { padding: 36px 12px; }
  .ct-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  .ct-table th { position: sticky; top: 0; z-index: 1; background: var(--card, #fff); text-align: left; padding: 11px 14px; font-size: 12.5px; font-weight: 500; color: #8e8e93; border-bottom: 1px solid #f0f0f2; white-space: nowrap; }
  .ct-table td { padding: 10px 14px; border-bottom: 1px solid #f4f4f5; color: var(--ink); white-space: nowrap; }
  .ct-table th:first-child, .ct-table td:first-child { padding-left: 20px; }
  .ct-table th:last-child, .ct-table td:last-child { padding-right: 14px; }
  .ct-table tbody tr:last-child td { border-bottom: none; }
  .ct-row { cursor: pointer; transition: background .12s ease; }
  .ct-row:hover { background: #fafafa; }
  .ct-row.sel { background: color-mix(in srgb, var(--coral) 8%, transparent); }
  .ct-av { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12.5px; font-weight: 700; flex-shrink: 0; letter-spacing: .02em; }
  .ct-name-link { font-weight: 600; color: var(--ink); text-decoration: none; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }
  .ct-name-link:hover { text-decoration: underline; }
  .ct-muted { color: #71717a; }
  .ct-email { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
  .ct-tag { display: inline-flex; align-items: center; gap: 6px; height: 24px; padding: 0 10px 0 9px; border-radius: 999px; background: color-mix(in srgb, var(--tag) 10%, #fff); color: color-mix(in srgb, var(--tag) 85%, #000); font-size: 12.5px; font-weight: 600; line-height: 1; white-space: nowrap; max-width: 100%; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box; }
  .ct-tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--tag); flex-shrink: 0; }
  .ct-tag.plain { background: #f4f4f5; color: #52525b; }
  .ct-tag.plain::before { display: none; }
  .ct-row-acts { display: flex; align-items: center; justify-content: flex-end; gap: 2px; }
  .ct-icon { width: 32px; height: 32px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: none; border-radius: 999px; background: transparent; color: #71717a; cursor: pointer; transition: background .15s ease, color .15s ease; }
  .ct-icon::before { display: none; }
  .ct-icon:hover { background: #f4f4f5; color: #18181b; }
  .ct-icon:disabled { opacity: .35; cursor: default; background: transparent; }
  .ct-gap { width: 32px; height: 32px; flex-shrink: 0; }
  .ct-foot-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px 18px; border-top: 1px solid #f0f0f2; font-size: 13.5px; color: #71717a; flex-shrink: 0; }
  .ct-pg { font-size: 13.5px; font-weight: 600; color: var(--ink); padding: 0 6px; font-variant-numeric: tabular-nums; }
  .ct-cards { display: none; }

  /* The contact panel floats beside the list. */
  .ct-detail { width: 340px; flex-shrink: 0; margin: 16px 16px 16px 0; border-radius: 22px; background: var(--card, #fff); box-shadow: 0 0 0 1px rgba(0,0,0,.05), 0 8px 28px rgba(16,24,40,.08); display: flex; flex-direction: column; overflow: hidden; animation: ctIn .26s cubic-bezier(.22,1,.36,1); }
  @keyframes ctIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
  .ct-detail-head { padding: 16px 14px 14px 20px; border-bottom: 1px solid #f0f0f2; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .ct-detail-head h3 { margin: 0; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; color: var(--ink); }
  .ct-small { height: 32px; display: inline-flex; align-items: center; gap: 6px; padding: 0 13px; border: none; border-radius: 999px; background: #f4f4f5; color: #18181b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .ct-small::before { display: none; }
  .ct-small:hover { background: #ececef; }
  .ct-field { width: 100%; box-sizing: border-box; padding: 10px 14px; border: 1.5px solid transparent; border-radius: 12px; background: #f4f4f5; font: inherit; font-size: 14px; color: var(--ink); outline: none; transition: background .15s ease, border-color .15s ease, box-shadow .15s ease; }
  .ct-field:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }

  @media (prefers-reduced-motion: reduce) { .ct-detail { animation: none; } }
  @media (max-width: 1100px) {
    .ct-hbtn span { display: none; }
    .ct-hbtn { width: 38px; padding: 0; }
  }
  @media (max-width: 767px) {
    .ct-main { padding: 18px 16px 0; }
    .ct-head { align-items: flex-start; margin-bottom: 14px; }
    .ct-head h1 { font-size: 26px; }
    .ct-panel { border-radius: 20px 20px 0 0; }
    .ct-tools { padding: 14px; }
    .ct-search { flex: 1 1 100%; }
    .ct-search input { font-size: 16px; }
    .ct-select { max-width: 100%; flex: 1 1 auto; }

    .ct-filters { padding: 12px 14px; max-height: 48%; overflow-y: auto; overscroll-behavior: contain; }
    .ct-filters-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .ct-filters-grid input, .ct-filters-grid select { font-size: 16px !important; }

    /* The bottom padding lets the last card and the pager scroll clear of the AI orb. */
    .ct-list { background: #fafafa; overflow-x: hidden; overscroll-behavior: contain; padding-bottom: 76px; }
    .ct-table { display: none !important; }
    .ct-cards { display: flex; flex-direction: column; gap: 8px; list-style: none; margin: 0; padding: 12px; }
    .ct-card { position: relative; display: flex; gap: 12px; padding: 14px; background: #fff; border-radius: 18px; box-shadow: 0 0 0 1px rgba(0,0,0,.06); min-width: 0; -webkit-tap-highlight-color: transparent; transition: background .1s, box-shadow .1s; }
    .ct-card:active { background: #fafafa; }
    .ct-card[data-selected] { box-shadow: 0 0 0 2px var(--coral); }
    .ct-card:has(.ct-open:focus-visible) { outline: 2px solid var(--coral); outline-offset: 2px; }
    .ct-avatar { width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; flex-shrink: 0; letter-spacing: .02em; }
    .ct-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
    .ct-top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
    .ct-open { position: static !important; flex: 1; min-width: 0; display: flex; padding: 0; border: none; background: none; text-align: left; font: inherit; font-size: 15px; font-weight: 700; color: var(--ink); cursor: pointer; outline: none; }
    .ct-open::before { display: none; }
    .ct-name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ct-open::after { content: ''; position: absolute; inset: 0; border-radius: 18px; }
    .ct-date { min-width: 0; font-size: 12px; color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ct-line { display: flex; align-items: center; gap: 6px; margin: 0; min-width: 0; font-size: 13px; color: #71717a; }
    .ct-line svg { flex-shrink: 0; opacity: .7; }
    .ct-line span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ct-line .ct-none { color: #a1a1aa; font-style: italic; }
    .ct-badges { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; margin-top: 6px; }
    .ct-badges .ct-tag { height: 22px; font-size: 11.5px; padding: 0 8px; }
    .ct-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; min-width: 0; }
    .ct-actions { position: relative; z-index: 1; display: flex; align-items: center; gap: 4px; flex-shrink: 0; pointer-events: none; }
    .ct-actions > * { pointer-events: auto; }
    .ct-act { width: 34px; height: 34px; border-radius: 999px; border: none; background: #f4f4f5; color: #52525b; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0; }
    .ct-act::before { display: none; }
    .ct-act:active { background: #ececef; color: var(--coral); }
    .ct-foot-bar { padding: 12px 14px; }

    .ct-detail { position: fixed !important; inset: 0; z-index: 950; width: auto !important; margin: 0; border-radius: 0; animation: none; }
    .ct-detail-body { padding-bottom: calc(18px + env(safe-area-inset-bottom)) !important; }
  }
`

export default function ContactsPage() {
  const router = useRouter()
  // Seed the company from the shared identity cache so a revisit resolves it
  // synchronously and skips the extra companies lookup.
  const seededCid = peekCompanyUser()?.companyId ?? null
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [outlets, setOutlets] = useState<any[]>([])
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 100
  // ── Filters (mirrors the Users tab) ───────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [showAddContact, setShowAddContact] = useState(false)
  const [fRelationship, setFRelationship] = useState('')
  const [pendingMatches, setPendingMatches] = useState<{ matches: any[]; relationship: string } | null>(null)
  const [sortBy, setSortBy] = useState<'recent_added' | 'recent_order' | 'highest_order' | 'num_orders' | 'spend' | 'loyalty'>('recent_added')
  const [fChannel, setFChannel] = useState('')
  const [fLoyalty, setFLoyalty] = useState('')
  const [fMinSpend, setFMinSpend] = useState('')
  const [fMinOrders, setFMinOrders] = useState('')
  const [fState, setFState] = useState('')
  const [fPostcode, setFPostcode] = useState('')
  const [fProduct, setFProduct] = useState('')
  const filterInput: React.CSSProperties = { display: 'block', width: '100%', marginTop: 6, padding: '9px 12px', borderRadius: 12, border: '1.5px solid transparent', fontSize: 14, fontWeight: 500, color: 'var(--ink)', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', boxShadow: '0 0 0 1px rgba(0,0,0,.06)' }
  const filtersActive = !!(fChannel || fRelationship || fLoyalty || fMinSpend || fMinOrders || fState || fPostcode || fProduct || sortBy !== 'recent_added')
  const filterCount = [fChannel, fRelationship, fLoyalty, fMinSpend, fMinOrders, fState, fPostcode, fProduct].filter(Boolean).length + (sortBy !== 'recent_added' ? 1 : 0)

  // Shared with the inbox — the same outlet stays selected across the CRM.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('colvy_location_filter')
      if (saved) setLocationFilter(saved)
    } catch {}
  }, [])
  useEffect(() => {
    try { sessionStorage.setItem('colvy_location_filter', locationFilter) } catch {}
  }, [locationFilter])

  // ── Duplicate contacts ────────────────────────────────────────────────────
  const [dupGroups, setDupGroups] = useState<any[] | null>(null)
  const [dupBusy, setDupBusy] = useState(false)
  const [linkBusy, setLinkBusy] = useState(false)

  const linkChannels = async () => {
    if (!companyId) return
    setLinkBusy(true)
    try {
      const res = await authFetch('/api/contacts/backfill-identity', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Link failed')
      alertDialog(d.linkedGroups
        ? `Linked ${d.linkedContacts} contacts into ${d.linkedGroups} people across their channels.`
        : 'No cross-channel matches found — everyone is already distinct.')
    } catch (e: any) {
      alertDialog({ title: 'Couldn’t link contacts’ channels', message: e.message || 'Please try again.' })
    } finally { setLinkBusy(false) }
  }

  const findDuplicates = async () => {
    if (!companyId) return
    setDupBusy(true)
    try {
      const res = await authFetch(`/api/contacts/duplicates?companyId=${companyId}`)
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not check')
      setDupGroups(d.groups || [])
    } catch (e: any) { alertDialog({ title: 'Couldn’t check for duplicates', message: e.message }) }
    finally { setDupBusy(false) }
  }

  const mergeGroup = async (group: any[], keepId: string) => {
    if (!companyId) return
    const mergeIds = group.filter(c => c.id !== keepId).map(c => c.id)
    if (!await confirmDialog(`Merge ${mergeIds.length} duplicate${mergeIds.length === 1 ? '' : 's'} into this contact? All their conversations and history move across — nothing is lost.`)) return
    setDupBusy(true)
    try {
      const res = await authFetch('/api/contacts/duplicates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, keepId, mergeIds }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Merge failed')
      await findDuplicates()
      if (companyId) await loadContacts(companyId)
    } catch (e: any) { alertDialog({ title: 'Couldn’t merge those contacts', message: e.message }) }
    finally { setDupBusy(false) }
  }
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Contact | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Partial<Contact>>({})
  const [saving, setSaving] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  // The linked WooCommerce order's billing, for the "Fill from order" backfill.
  const [orderBilling, setOrderBilling] = useState<any>(null)
  useEffect(() => {
    setOrderBilling(null)
    if (!editMode || !companyId) return
    const email = String((editData as any).email || selected?.email || '').trim()
    const phone = String((editData as any).phone || selected?.phone || '')
    const norm = (p: string) => (p || '').replace(/\D/g, '').slice(-9)
    const hasBilling = (o: any) => o?.billing && (o.billing.first_name || o.billing.last_name || o.billing.phone || o.billing.address_1)
    ;(async () => {
      let order: any = null
      if (email) {
        const { data } = await (supabase as any).from('woocommerce_orders')
          .select('billing, order_date').eq('company_id', companyId).ilike('customer_email', email)
          .order('order_date', { ascending: false }).limit(10)
        order = (data || []).find(hasBilling)
      }
      if (!order && norm(phone).length >= 8) {
        const { data } = await (supabase as any).from('woocommerce_orders')
          .select('billing, order_date').eq('company_id', companyId).eq('billing_phone_norm', norm(phone))
          .order('order_date', { ascending: false }).limit(10)
        order = (data || []).find(hasBilling)
      }
      setOrderBilling(order?.billing || null)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selected?.id, companyId])

  useEffect(() => {
    const init = async () => {
      let cid: string | null = seededCid
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) loadContacts(cid)
    }
    init()
  }, [])

  const loadContacts = async (cid?: string | null, q?: string) => {
    const id = cid || companyId
    if (!id) return
    // Instant paint on revisit: show the last rows we rendered for this exact
    // query while the fresh data loads in the background.
    const cacheKey = `contacts:${id}:${locationFilter}:${page}:${(q || '').trim()}:${sortBy}:${fChannel}:${fRelationship}:${fLoyalty}:${fMinSpend}:${fMinOrders}:${fState}:${fPostcode}:${fProduct}`
    const cached = readCache<{ rows: Contact[]; count: number }>(cacheKey)
    if (cached) {
      setContacts(cached.rows)
      setTotalCount(cached.count)
      setLoading(false)
    } else {
      setLoading(true)
    }
    let query = (supabase as any).from('contacts').select('*', { count: 'exact' }).eq('company_id', id)
    if (locationFilter !== 'all') query = query.eq('location_id', locationFilter)
    if (q && q.trim()) {
      // Escape PostgREST's reserved characters so odd input can't break the query.
      const clean = (s: string) => s.replace(/[,()%\\]/g, ' ').trim()
      const cq = clean(q)

      // IMPORTANT: build ONE `.or()` covering every field and every word.
      // Chaining `.or()` per word (the old approach) AND-combines the groups in
      // PostgREST, so "Panadda Wongyarit" required BOTH words to match — a record
      // stored as just "Panadda", or a search that mixed a name with an email,
      // returned nothing. That's exactly the "search can't find a contact that
      // clearly exists" bug. A single or() with OR semantics is forgiving: any
      // word matching any field surfaces the row.
      const conds: string[] = []
      // Whole query against name/email — handles multi-word names contiguously.
      conds.push(`name.ilike.%${cq}%`, `email.ilike.%${cq}%`)
      // Each word against name/email too, so partial or reordered names still hit.
      for (const w of cq.split(/\s+/).filter(Boolean)) {
        conds.push(`name.ilike.%${w}%`, `email.ilike.%${w}%`)
      }
      // Phone: numbers are stored in varying formats ("+61405123456" vs
      // "0405 123 456"), so match on the digit fragment the same way the
      // Add-contact dedup does — otherwise the list says "already exists" for a
      // contact you genuinely can't find here.
      const digitsAll = cq.replace(/\D/g, '')
      if (digitsAll.length >= 4) {
        conds.push(`phone.ilike.%${digitsAll.slice(-9)}%`)
      } else {
        conds.push(`phone.ilike.%${cq}%`)
      }
      // De-dupe identical conditions to keep the URL compact.
      query = query.or(Array.from(new Set(conds)).join(','))
    }
    // Paginated: Supabase caps a response at 1000 rows anyway, and loading
    // 12,000 contacts into the browser at once is slow and unusable. Range gives
    // a real page window that matches the total count shown above the table.
    const from = page * PAGE_SIZE
    const { data, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    let rows: Contact[] = data || []

    // Enrich with e-commerce stats (spend, orders, RFM, last order) by matching
    // the contact's email to a woocommerce_customers record — so the same
    // spend/loyalty/order filters as the Users tab work here too.
    if (filtersActive || showFilters) {
      try {
        // Only the columns the enrichment below actually reads. select('*')
        // pulled every column of up to 5000 customers — including large JSON
        // blobs — just to build an email lookup, which is the single heaviest
        // request on this page.
        const { data: custs } = await (supabase as any)
          .from('woocommerce_customers')
          .select('email, total_spend, total_orders, last_order_date, first_order_date, items_purchased, address')
          .eq('company_id', id).limit(5000)
        const byEmail = new Map<string, any>()
        for (const c of (custs || [])) if (c.email) byEmail.set(String(c.email).toLowerCase(), c)
        rows = rows.map(r => {
          const cust = r.email ? byEmail.get(String(r.email).toLowerCase()) : null
          if (!cust) return r
          const score = SegmentationService.getRFMScore(cust)
          const orders = cust.total_orders || 0
          return {
            ...r,
            total_spend: parseFloat(cust.total_spend) || 0,
            total_orders: orders,
            last_order_date: cust.last_order_date,
            rfm_category: SegmentationService.getRFMCategory(score),
            __rfm: score,
            __aov: orders > 0 ? (parseFloat(cust.total_spend) || 0) / orders : 0,
            __items: cust.items_purchased,
            __state: cust.address?.state || '',
            __postcode: cust.address?.postcode || '',
          } as any
        })
      } catch (e) { console.error('Contact enrichment failed:', e) }

      // Apply filters against the enriched rows.
      if (fChannel) rows = rows.filter(r => r.source === fChannel)
      // Relationship: treat a missing value as 'customer', which is the default
      // for every contact that predates the relationship field.
      if (fRelationship) rows = rows.filter(r => (r.relationship_type || 'customer') === fRelationship)
      if (fLoyalty) rows = rows.filter(r => r.rfm_category === fLoyalty)
      if (fMinSpend) rows = rows.filter(r => (r.total_spend || 0) >= (parseFloat(fMinSpend) || 0))
      if (fMinOrders) rows = rows.filter(r => (r.total_orders || 0) >= (parseInt(fMinOrders) || 0))
      if (fState) rows = rows.filter(r => String((r as any).__state || r.city || '').toLowerCase().includes(fState.trim().toLowerCase()))
      if (fPostcode) rows = rows.filter(r => String((r as any).__postcode || '').includes(fPostcode.trim()))
      if (fProduct) {
        const prod = fProduct.trim().toLowerCase()
        rows = rows.filter(r => {
          let ip = (r as any).__items
          if (typeof ip === 'string') { try { ip = JSON.parse(ip) } catch { ip = [ip] } }
          if (!Array.isArray(ip)) return false
          return ip.some((it: any) => {
            if (typeof it === 'string') return it.toLowerCase().includes(prod)
            return String(it.sku || '').toLowerCase().includes(prod) || String(it.name || it.title || '').toLowerCase().includes(prod)
          })
        })
      }
      // Sort.
      if (sortBy === 'recent_added') rows.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      else if (sortBy === 'recent_order') rows.sort((a, b) => +new Date(b.last_order_date || 0) - +new Date(a.last_order_date || 0))
      else if (sortBy === 'highest_order') rows.sort((a, b) => ((b as any).__aov || 0) - ((a as any).__aov || 0))
      else if (sortBy === 'num_orders') rows.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0))
      else if (sortBy === 'spend') rows.sort((a, b) => (b.total_spend || 0) - (a.total_spend || 0))
      else if (sortBy === 'loyalty') rows.sort((a, b) => ((b as any).__rfm || 0) - ((a as any).__rfm || 0))
    }

    setContacts(rows)
    setTotalCount(count || 0)
    setLoading(false)
    writeCache(cacheKey, { rows, count: count || 0 })
  }

  // Skip this effect's initial mount run: the first load is driven by `init`
  // above. Without this guard, seeding companyId would make it fire a duplicate
  // load on mount. Subsequent search/filter changes flow through here (debounced).
  const filterEffectRan = useRef(false)
  useEffect(() => {
    if (!filterEffectRan.current) { filterEffectRan.current = true; return }
    const t = setTimeout(() => { if (companyId) loadContacts(companyId, search) }, 350)
    return () => clearTimeout(t)
  }, [search, locationFilter, sortBy, fChannel, fRelationship, fLoyalty, fMinSpend, fMinOrders, fState, fPostcode, fProduct, page])

  // Any change to the search or filters puts you back on the first page —
  // otherwise you can land on page 40 of a 3-page result and see nothing.
  useEffect(() => {
    setPage(0)
  }, [search, locationFilter, sortBy, fChannel, fRelationship, fLoyalty, fMinSpend, fMinOrders, fState, fPostcode, fProduct])

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('company_locations')
        .select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false })
      setOutlets(data || [])
    })()
  }, [companyId])

  const saveContact = async () => {
    if (!companyId) return
    setSaving(true)
    if (selected?.id && editMode) {
      await (supabase as any).from('contacts').update({ ...editData, updated_at: new Date().toISOString() }).eq('id', selected.id)
      setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, ...editData } : c))
      setSelected(c => c ? { ...c, ...editData } : c)
    } else {
      const { data } = await (supabase as any).from('contacts').insert({ ...editData, company_id: companyId, source: 'manual' }).select().maybeSingle()
      if (data) { setContacts(cs => [data, ...cs]); setSelected(data) }
    }
    setEditMode(false)
    setSaving(false)
  }

  const inp: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 12, border: '1.5px solid transparent', background: '#f4f4f5', fontSize: 14, color: 'var(--ink)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }
  const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 500, color: '#8e8e93', display: 'block', marginBottom: 6 }
  // Everything back to the full list: search, location and the filters.
  const clearAll = () => { setSearch(''); setLocationFilter('all'); setSortBy('recent_added'); setFRelationship(''); setFChannel(''); setFLoyalty(''); setFMinSpend(''); setFMinOrders(''); setFState(''); setFPostcode(''); setFProduct('') }

  // Row and card actions — the desktop table and the phone cards share these,
  // so tapping a card does exactly what clicking a row does.
  const openContact = (c: Contact) => { setSelected(c); setEditData(c); setEditMode(false) }
  const editContact = (c: Contact) => { setSelected(c); setEditData(c); setEditMode(true) }
  const callContact = (c: Contact) => window.dispatchEvent(new CustomEvent('colvy:dial', { detail: { number: c.phone, name: c.name, contactId: c.id, autoStart: true } }))
  // SMS when their mobile may be texted, else email (lib/channel-choice).
  const messageContact = (c: Contact) => router.push(contactMessageHref(c, 'sms'))
  const emailContact = (c: Contact) => router.push(`/admin/inbox?contact=${c.id}&channel=email`)

  return (
    <div className="colvy-fullh ct-page">
      <style>{CONTACTS_CSS}</style>
      {/* List */}
      <div className="ct-main">
        <div className="ct-head">
          <div style={{ minWidth: 0 }}>
            <h1>Contacts</h1>
            <p>{totalCount.toLocaleString()} contact{totalCount === 1 ? '' : 's'}</p>
          </div>
          <div className="ct-head-actions">
            <button type="button" className="cv-btn ct-hbtn" onClick={findDuplicates} disabled={dupBusy} title="Find contacts that are the same person">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>
              <span>{dupBusy ? 'Checking…' : 'Find duplicates'}</span>
            </button>
            <button type="button" className="cv-btn ct-hbtn" onClick={linkChannels} disabled={linkBusy}
              title="Link the same person across live chat, SMS, Messenger, Instagram and WooCommerce by shared email/phone">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              <span>{linkBusy ? 'Linking…' : 'Link channels'}</span>
            </button>
            <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowAddContact(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New contact
            </button>
          </div>
        </div>

        <div className="ct-panel">
          <div className="ct-tools">
            <div className="ct-search">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input placeholder="Search by name, phone or email…" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search contacts" />
              {search && (
                <button type="button" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
            {outlets.length > 1 && (
              <select className={`ct-select${locationFilter !== 'all' ? ' set' : ''}`} value={locationFilter} onChange={e => setLocationFilter(e.target.value)} aria-label="Location">
                <option value="all">All locations</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
              </select>
            )}
            <button type="button" className={`ct-pill${filtersActive ? ' set' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters(v => !v)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="17" x2="14" y2="17"/></svg>
              Filters
              {filterCount > 0 && <span className="ct-count">{filterCount}</span>}
            </button>
            {(filtersActive || search || locationFilter !== 'all') && (
              <button type="button" className="ct-link" onClick={clearAll}>Clear filters</button>
            )}
          </div>

          {showFilters && (
            <div className="ct-filters">
              <div className="ct-filters-grid">
                <label>Sort by
                  <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={filterInput}>
                    <option value="recent_added">Recently added</option>
                    <option value="recent_order">Most recent order</option>
                    <option value="highest_order">Highest order value</option>
                    <option value="num_orders">Number of orders</option>
                    <option value="spend">Total spend</option>
                    <option value="loyalty">Loyalty (RFM)</option>
                  </select>
                </label>
                <label>Relationship
                  <select value={fRelationship} onChange={e => setFRelationship(e.target.value)} style={filterInput}>
                    <option value="">All types</option>
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="business">Business contact</option>
                  </select>
                </label>
                <label>Channel
                  <select value={fChannel} onChange={e => setFChannel(e.target.value)} style={filterInput}>
                    <option value="">All channels</option>
                    <option value="widget">Live chat</option>
                    <option value="woocommerce">WooCommerce</option>
                    <option value="import">Import</option>
                    <option value="manual">Manual</option>
                    <option value="email">Email</option>
                  </select>
                </label>
                <label>Loyalty segment
                  <select value={fLoyalty} onChange={e => setFLoyalty(e.target.value)} style={filterInput}>
                    <option value="">Any</option>
                    <option value="Champions">Champions</option>
                    <option value="Loyal Customers">Loyal Customers</option>
                    <option value="Potential Loyalists">Potential Loyalists</option>
                    <option value="At Risk">At Risk</option>
                    <option value="Lost">Lost</option>
                  </select>
                </label>
                <label>Min spend ($)
                  <input type="number" value={fMinSpend} onChange={e => setFMinSpend(e.target.value)} placeholder="e.g. 500" style={filterInput} />
                </label>
                <label>Min orders
                  <input type="number" value={fMinOrders} onChange={e => setFMinOrders(e.target.value)} placeholder="e.g. 3" style={filterInput} />
                </label>
                <label>State
                  <input type="text" value={fState} onChange={e => setFState(e.target.value)} placeholder="e.g. VIC" style={filterInput} />
                </label>
                <label>Postcode
                  <input type="text" value={fPostcode} onChange={e => setFPostcode(e.target.value)} placeholder="e.g. 3000" style={filterInput} />
                </label>
                <label>Purchased (SKU or title)
                  <input type="text" value={fProduct} onChange={e => setFProduct(e.target.value)} placeholder="e.g. 1132 or Pleco" style={filterInput} />
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
                <button type="button" className="ct-pill" style={{ height: 34 }}
                  onClick={() => { setSortBy('recent_added'); setFRelationship(''); setFChannel(''); setFLoyalty(''); setFMinSpend(''); setFMinOrders(''); setFState(''); setFPostcode(''); setFProduct('') }}>
                  Reset filters
                </button>
                <span style={{ fontSize: 13, color: '#8e8e93' }}>
                  {filtersActive ? `${contacts.length.toLocaleString()} contact${contacts.length === 1 ? '' : 's'} shown` : ''}
                </span>
              </div>
            </div>
          )}

          <div className="ct-list">
            {loading ? (
              <SkeletonList rows={6} />
            ) : contacts.length === 0 ? (
              <div className="ct-empty">
                {/* The same drifting cards as an empty inbox, worded for what's being looked at. */}
                <EmptyScroll kinds={['contact']}
                  title={search.trim() ? 'No matches' : (filtersActive || locationFilter !== 'all') ? 'No contacts match these filters' : 'No contacts yet'}
                  line={search.trim() ? `Nothing matches “${search.trim()}”. Try a name, phone number or email.`
                    : (filtersActive || locationFilter !== 'all') ? 'Try clearing a filter to see more.'
                    : 'Contacts are added when people chat, order or are imported. You can add them by hand too.'}
                  action={(search.trim() || filtersActive || locationFilter !== 'all')
                    ? <button type="button" className="cv-btn" onClick={clearAll}>Clear filters</button>
                    : <button type="button" className="cv-btn" onClick={() => setShowAddContact(true)}>New contact</button>} />
              </div>
            ) : (
              <>
              <table className="ct-table">
                <thead>
                  <tr>
                    {['Name', 'Phone', 'Email', 'Marketing', 'Source', 'Added', ''].map((h, i) => <th key={i}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c => {
                    const src = sourceMeta(c.source)
                    return (
                      <tr key={c.id} onClick={() => openContact(c)} className={`ct-row${selected?.id === c.id ? ' sel' : ''}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                            <span className="ct-av" style={avatarStyle(c)}>{initialsOf(c)}</span>
                            <a href={`/admin/customers/profile?id=${c.id}`} onClick={e => e.stopPropagation()} title="Open the full customer profile" className="ct-name-link">
                              {c.name || <span style={{ color: '#a1a1aa', fontStyle: 'italic', fontWeight: 500 }}>No name</span>}
                            </a>
                            {c.relationship_type && c.relationship_type !== 'customer' && (
                              <span className="ct-tag" style={{ ['--tag' as any]: '#4f46e5' }}>{RELATIONSHIP_LABELS[c.relationship_type] || c.relationship_type}</span>
                            )}
                          </div>
                        </td>
                        <td className="ct-muted">{c.phone || '—'}</td>
                        <td className="ct-muted ct-email">{c.email || '—'}</td>
                        <td><span className="ct-tag" style={{ ['--tag' as any]: c.subscribed_to_marketing ? '#16a34a' : '#a1a1aa' }}>{c.subscribed_to_marketing ? 'Subscribed' : 'Not subscribed'}</span></td>
                        <td><span className="ct-tag" style={{ ['--tag' as any]: src.color }}>{src.label}</span></td>
                        <td className="ct-muted">{fmtAdded(c.created_at)}</td>
                        <td>
                          <div className="ct-row-acts" onClick={e => e.stopPropagation()}>
                            {c.phone ? (
                              <button type="button" className="ct-icon" title={`Call ${c.phone}`} aria-label="Call" onClick={() => callContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PHONE_PATH}/></svg>
                              </button>
                            ) : <span className="ct-gap" />}
                            {c.phone ? (
                              <button type="button" className="ct-icon" title={`Message ${c.phone} in Colvy`} aria-label="Message" onClick={() => messageContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              </button>
                            ) : <span className="ct-gap" />}
                            {c.email ? (
                              <button type="button" className="ct-icon" title={`Email ${c.email} in Colvy`} aria-label="Email" onClick={() => emailContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
                              </button>
                            ) : <span className="ct-gap" />}
                            <button type="button" className="ct-icon" title="Edit contact" aria-label={`Edit ${c.name || c.email || 'contact'}`} onClick={() => editContact(c)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Phones: one card per contact instead of the 7-column table. */}
              <ul className="ct-cards" aria-label="Contacts">
                {contacts.map(c => {
                  const src = sourceMeta(c.source)
                  return (
                    <li key={c.id} className="ct-card" data-selected={selected?.id === c.id ? '' : undefined}>
                      <div className="ct-avatar" aria-hidden="true" style={avatarStyle(c)}>{initialsOf(c)}</div>
                      <div className="ct-body">
                        <div className="ct-top">
                          {/* The name is the card's button; its ::after covers the
                              whole card, so a tap anywhere opens the contact. */}
                          <button type="button" className="ct-open" onClick={() => openContact(c)}>
                            <span className="ct-name">{c.name || <span style={{ color: '#a1a1aa', fontStyle: 'italic', fontWeight: 600 }}>No name</span>}</span>
                          </button>
                        </div>
                        <p className="ct-line">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PHONE_PATH}/></svg>
                          <span className={c.phone ? undefined : 'ct-none'}>{c.phone || 'No phone'}</span>
                        </p>
                        <p className="ct-line">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
                          <span className={c.email ? undefined : 'ct-none'}>{c.email || 'No email'}</span>
                        </p>
                        <div className="ct-badges">
                          <span className="ct-tag" style={{ ['--tag' as any]: src.color }}>{src.label}</span>
                          <span className="ct-tag" style={{ ['--tag' as any]: c.subscribed_to_marketing ? '#16a34a' : '#a1a1aa' }}>{c.subscribed_to_marketing ? 'Subscribed' : 'Not subscribed'}</span>
                          {c.relationship_type && c.relationship_type !== 'customer' && (
                            <span className="ct-tag" style={{ ['--tag' as any]: '#4f46e5' }}>{RELATIONSHIP_LABELS[c.relationship_type] || c.relationship_type}</span>
                          )}
                          {(c.tags || []).slice(0, 2).map(t => <span key={t} className="ct-tag plain">{t}</span>)}
                          {(c.tags || []).length > 2 && <span className="ct-tag plain" title={(c.tags || []).slice(2).join(', ')}>+{(c.tags || []).length - 2}</span>}
                        </div>
                        <div className="ct-foot">
                          <span className="ct-date">Added {fmtAdded(c.created_at)}</span>
                          <div className="ct-actions">
                            {c.phone && (
                              <button type="button" className="ct-act" title={`Call ${c.phone}`} aria-label={`Call ${c.name || c.phone}`} onClick={() => callContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PHONE_PATH}/></svg>
                              </button>
                            )}
                            {c.phone && (
                              <button type="button" className="ct-act" title={`Message ${c.phone} in Colvy`} aria-label={`Message ${c.name || c.phone}`} onClick={() => messageContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                              </button>
                            )}
                            {c.email && (
                              <button type="button" className="ct-act" title={`Email ${c.email} in Colvy`} aria-label={`Email ${c.name || c.email}`} onClick={() => emailContact(c)}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 6L2 7"/></svg>
                              </button>
                            )}
                            <button type="button" className="ct-act" aria-label={`Edit ${c.name || c.email || 'contact'}`} onClick={() => editContact(c)}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
              </>
            )}
          </div>

          {/* Pagination — the header shows the true total, so the table needs a
              way to reach beyond the first page of it. */}
          {totalCount > PAGE_SIZE && (
            <div className="ct-foot-bar">
              <span>
                Showing {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()} of {totalCount.toLocaleString()}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button type="button" className="ct-pill" style={{ height: 34 }} onClick={() => setPage(0)} disabled={page === 0}>First</button>
                <button type="button" className="ct-icon" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} aria-label="Previous page">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                </button>
                <span className="ct-pg">Page {page + 1} of {Math.max(1, Math.ceil(totalCount / PAGE_SIZE)).toLocaleString()}</span>
                <button type="button" className="ct-icon" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= totalCount} aria-label="Next page">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
                <button type="button" className="ct-pill" style={{ height: 34 }} onClick={() => setPage(Math.max(0, Math.ceil(totalCount / PAGE_SIZE) - 1))} disabled={(page + 1) * PAGE_SIZE >= totalCount}>Last</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Contact detail panel */}
      {(selected || (editMode && !selected)) && (
        <div className="ct-detail ct-sheet" role="region" aria-label="Contact details">
          <div className="ct-detail-head">
            <h3>{!selected ? 'New contact' : editMode ? 'Edit contact' : 'Contact'}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {selected && !editMode && (
                <button type="button" className="ct-small" onClick={() => setEditMode(true)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  Edit
                </button>
              )}
              <button type="button" className="ct-icon ct-close" aria-label="Close" title="Close" onClick={() => { setSelected(null); setEditMode(false) }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <div className="ct-detail-body" style={{ flex: 1, overflowY: 'auto', padding: '18px 20px 20px' }}>
            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(() => {
                  const b = orderBilling
                  if (!b) return null
                  const billingName = `${b.first_name || ''} ${b.last_name || ''}`.trim()
                  const billingAddr = [b.address_1, b.address_2].filter(Boolean).join(', ')
                  const ed: any = editData
                  const canFill = (!ed.name && billingName) || (!ed.phone && b.phone) || (!ed.address && billingAddr) || (!ed.company_name && b.company)
                  if (!canFill) return null
                  return (
                    <button type="button" onClick={() => setEditData((d: any) => ({
                      ...d,
                      name: d.name || billingName || d.name,
                      phone: d.phone || b.phone || d.phone,
                      address: d.address || billingAddr || d.address,
                      city: d.city || b.city || d.city,
                      country: d.country || b.country || d.country,
                      company_name: d.company_name || b.company || d.company_name,
                    }))}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, height: 38, padding: '0 14px', borderRadius: 999, border: 'none', background: 'color-mix(in srgb, var(--coral) 11%, #fff)', color: 'var(--coral)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      Fill from order
                    </button>
                  )
                })()}
                {[['name', 'Full name', 'text'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel']].map(([field, label, type]) => (
                  <div key={field}>
                    <label style={labelStyle}>{label}</label>
                    <input type={type} className="ct-field" value={(editData as any)[field] || ''} onChange={e => setEditData(d => ({ ...d, [field]: e.target.value }))} style={inp} />
                  </div>
                ))}
                {/* One smart address field — mirrors the inbox contact editor.
                    Typing suggests verified addresses; picking one fills the
                    city/state/postcode/country behind the scenes, so there's no
                    separate City/Country field to fill in by hand. */}
                <div>
                  <label style={labelStyle}>Address</label>
                  <AddressAutocomplete
                    value={(editData as any).address || ''}
                    onChange={v => setEditData(d => ({ ...d, address: v }))}
                    onSelect={(parts) => setEditData(d => ({
                      ...d,
                      address: parts.line1 || parts.formatted,
                      city: parts.city || (d as any).city,
                      state: parts.state || (d as any).state,
                      postcode: parts.postcode || (d as any).postcode,
                      country: parts.country || (d as any).country,
                    }))}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Relationship</label>
                  <select
                    value={(editData as any).relationship_type || 'customer'}
                    onChange={e => {
                      const rt = e.target.value
                      // A non-customer (supplier/wholesaler/business) is excluded
                      // from marketing by default — mirror the detail panel.
                      setEditData(d => ({ ...d, relationship_type: rt, ...(rt === 'customer' ? {} : { subscribed_to_marketing: false }) }))
                    }}
                    className="ct-select" style={{ width: '100%', maxWidth: 'none' }}>
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="business">Business contact</option>
                  </select>
                  {(editData as any).relationship_type && (editData as any).relationship_type !== 'customer' && (
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8e8e93' }}>Excluded from marketing by default.</p>
                  )}
                </div>
                <label htmlFor="mkt" style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: 'var(--ink)', cursor: 'pointer' }}>
                  <input type="checkbox" id="mkt" checked={!!(editData as any).subscribed_to_marketing} onChange={e => setEditData(d => ({ ...d, subscribed_to_marketing: e.target.checked }))} style={{ width: 16, height: 16, accentColor: '#18181b' }} />
                  Subscribed to marketing
                </label>
                <textarea placeholder="Notes…" className="ct-field" value={(editData as any).notes || ''} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} />
                <button type="button" className="cv-btn cv-btn-primary" onClick={saveContact} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
                  {saving ? 'Saving…' : 'Save contact'}
                </button>
              </div>
            ) : selected && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, paddingBottom: 16, borderBottom: '1px solid #f0f0f2' }}>
                  <div style={{ ...avatarStyle(selected), width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                    {initialsOf(selected)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 17, letterSpacing: '-0.01em', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.name || 'No name'}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: '#8e8e93' }}>Added {fmtAdded(selected.created_at)}</p>
                  </div>
                </div>
                {[['Email', selected.email], ['Phone', selected.phone], ['Address', [selected.address, selected.city, selected.country].filter(Boolean).join(', ') || null]]
                  .filter(([, v]) => v)
                  .map(([label, value]) => (
                    <div key={label as string}>
                      <p style={{ ...labelStyle, marginBottom: 2 }}>{label as string}</p>
                      <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)', overflowWrap: 'anywhere' }}>{value as string}</p>
                    </div>
                  ))
                }
                <div>
                  <p style={labelStyle}>Marketing</p>
                  <span className="ct-tag" style={{ ['--tag' as any]: selected.subscribed_to_marketing ? '#16a34a' : '#a1a1aa' }}>
                    {selected.subscribed_to_marketing ? 'Subscribed' : 'Not subscribed'}
                  </span>
                </div>
                <div>
                  <p style={labelStyle}>Source</p>
                  <span className="ct-tag" style={{ ['--tag' as any]: sourceMeta(selected.source).color }}>{sourceMeta(selected.source).label}</span>
                </div>
                <div>
                  <p style={labelStyle}>Relationship</p>
                  <select value={selected.relationship_type || 'customer'}
                    onChange={async (e) => {
                      const rt = e.target.value
                      const isCustomer = rt === 'customer'
                      setSelected(c => c ? { ...c, relationship_type: rt } : c)
                      try {
                        const { error } = await (supabase as any).from('contacts')
                          .update({ relationship_type: rt, ...(isCustomer ? {} : { subscribed_to_marketing: false }) })
                          .eq('id', selected.id)
                        if (error) { alertDialog('Could not save: ' + error.message); return }
                        setContacts(cs => cs.map(c => c.id === selected.id ? { ...c, relationship_type: rt } : c))

                        // The same person is often in the list more than once
                        // (order, widget, promo capture). Offer to reclassify
                        // those too rather than leaving them mislabelled.
                        if (companyId) {
                          const matches = await findMatchingContacts(companyId, selected as any)
                          const stale = matches.filter(m => (m.relationship_type || 'customer') !== rt)
                          if (stale.length > 0) setPendingMatches({ matches: stale, relationship: rt })
                        }
                      } catch {}
                    }}
                    className="ct-select" style={{ width: '100%', maxWidth: 'none' }}>
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="wholesaler">Wholesaler</option>
                    <option value="business">Business contact</option>
                  </select>
                  {(selected.relationship_type && selected.relationship_type !== 'customer') && (
                    <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#8e8e93' }}>Excluded from marketing by default.</p>
                  )}
                </div>

                {/* History — everything that's happened with this person,
                    on every channel, without leaving the list. */}
                <div style={{ borderTop: '1px solid #f0f0f2', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>History</p>
                    <button type="button" className="ct-link" onClick={() => router.push(`/admin/customers/profile?id=${selected.id}`)}>
                      Full profile →
                    </button>
                  </div>
                  <CustomerTimeline key={selected.id} contactId={selected.id} contactName={selected.name || selected.email || undefined} compact />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicate contacts */}
      {dupGroups !== null && (
        <div onClick={() => setDupGroups(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 620, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 24, padding: 26, boxShadow: '0 24px 60px rgba(0,0,0,.22)' }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>Duplicate contacts</h2>
            <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Matched on email or phone only. Two people with the same name are <strong>not</strong> merged — silently combining two real customers would be far worse than leaving a duplicate.
            </p>

            {dupGroups.length === 0 ? (
              <p style={{ fontSize: 14, color: '#15803d', textAlign: 'center', padding: 30, fontWeight: 600 }}>
                No duplicates found.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {dupGroups.map((g: any[], i: number) => (
                  <div key={i} style={{ borderRadius: 18, padding: 14, background: '#fafafa' }}>
                    <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: '#71717a' }}>
                      Same {g[0].matched_on}: {g[0].matched_value}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {g.map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 14, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.05)' }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name || 'No name'}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                              {[c.email, c.phone].filter(Boolean).join(' · ')} · {c.conversation_count} chat{c.conversation_count === 1 ? '' : 's'}
                            </p>
                          </div>
                          <button onClick={() => mergeGroup(g, c.id)} disabled={dupBusy}
                            className="cv-btn cv-btn-primary" style={{ height: 34, padding: '0 14px', fontSize: 13, flexShrink: 0 }}>
                            Keep this one
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className="cv-btn" onClick={() => setDupGroups(null)} style={{ width: '100%', marginTop: 18 }}>Close</button>
          </div>
        </div>
      )}

      {pendingMatches && (
        <MatchingContactsModal
          matches={pendingMatches.matches}
          relationship={pendingMatches.relationship}
          onClose={() => setPendingMatches(null)}
          onApply={async (ids) => {
            const res = await applyRelationship(ids, pendingMatches.relationship)
            if (res.error) { alertDialog('Could not update: ' + res.error); return }
            const set = new Set(ids)
            setContacts(cs => cs.map(c => set.has(c.id)
              ? { ...c, relationship_type: pendingMatches.relationship,
                  subscribed_to_marketing: pendingMatches.relationship === 'customer' ? c.subscribed_to_marketing : false }
              : c))
            setPendingMatches(null)
          }}
        />
      )}

      {showAddContact && companyId && (
        <AddContactModal
          companyId={companyId}
          onClose={() => setShowAddContact(false)}
          onCreated={(c) => {
            setShowAddContact(false)
            if (c?.id) { setContacts(cs => [c, ...cs]); setSelected(c) }
            else if (companyId) loadContacts(companyId, search)
          }}
        />
      )}

    </div>
  )
}
