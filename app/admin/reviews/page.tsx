'use client'
import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import PageHeader from '@/components/PageHeader'
import { SuggestionCard, type Suggestion } from '@/components/AgentSuggestion'
import EmptyScroll from '@/components/EmptyScroll'

type Review = {
  id: string
  review_id: string
  reviewer_name: string
  reviewer_photo: string | null
  star_rating: number
  comment: string | null
  reply_comment: string | null
  review_created_at: string | null
  location_title?: string | null
  contact_id?: string | null
  contact_name?: string | null
  match_checked_at?: string | null
}

type Contact = { id: string; name: string | null; email?: string | null }
type Preset = 'all' | '7' | '30' | '90' | 'custom'
type Replies = 'all' | 'replied' | 'unreplied'
type Filters = { preset: Preset; dateFrom: string; dateTo: string; rating: number; replies: Replies }

const PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] as const
const NO_FILTERS: Filters = { preset: 'all', dateFrom: '', dateTo: '', rating: 0, replies: 'all' }
// Phones show the first reviews and add more on demand instead of a pager.
const PHONE_FIRST = 10
const PHONE_STEP = 20

function presetRange(p: Preset): { dateFrom: string; dateTo: string } {
  if (p === 'all' || p === 'custom') return { dateFrom: '', dateTo: '' }
  const now = new Date()
  const from = new Date(now.getTime() - Number(p) * 86_400_000)
  return { dateFrom: from.toISOString().slice(0, 10), dateTo: now.toISOString().slice(0, 10) }
}

function matches(r: Review, f: Filters, search: string): boolean {
  if (f.rating && r.star_rating !== f.rating) return false
  if (f.replies === 'replied' && !r.reply_comment) return false
  if (f.replies === 'unreplied' && r.reply_comment) return false
  if (f.dateFrom || f.dateTo) {
    const t = r.review_created_at ? new Date(r.review_created_at).getTime() : NaN
    if (f.dateFrom && (isNaN(t) || t < new Date(f.dateFrom).getTime())) return false
    if (f.dateTo && (isNaN(t) || t > new Date(f.dateTo).getTime() + 86_400_000)) return false
  }
  const q = search.trim().toLowerCase()
  if (q && !(r.comment || '').toLowerCase().includes(q) && !(r.reviewer_name || '').toLowerCase().includes(q)) return false
  return true
}

function fullDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

// "Today", "Yesterday", "3 days ago", "2 weeks ago", "5 months ago", "1 year ago".
// Counted in calendar days on the viewer's clock, so a review from 11pm last
// night reads "Yesterday" the next morning, not "Today".
function ago(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  // Rounded, so a daylight-saving change (a 23 or 25 hour day) still counts as one day.
  const days = Math.max(0, Math.round((dayStart(new Date()) - dayStart(d)) / 86_400_000))
  const n = (v: number, unit: string) => `${v} ${unit}${v === 1 ? '' : 's'} ago`
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return n(days, 'day')
  if (days < 30) return n(Math.floor(days / 7), 'week')
  if (days < 365) return n(Math.max(1, Math.floor(days / 30.4)), 'month')
  return n(Math.floor(days / 365), 'year')
}

const STAR = 'M12 2.6l2.85 5.94 6.53.78-4.82 4.5 1.27 6.47L12 17.08l-5.83 3.21 1.27-6.47-4.82-4.5 6.53-.78z'
function Stars({ n, size = 16 }: { n: number; size?: number }) {
  return (
    <span className="rv-stars" role="img" aria-label={`${n} out of 5 stars`} style={{ display: 'inline-flex', gap: size > 14 ? 2 : 1, verticalAlign: 'middle' }}>
      {[1, 2, 3, 4, 5].map(s => (
        <svg key={s} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={s <= n ? '#f5b301' : '#e5e7eb'} /></svg>
      ))}
    </span>
  )
}

// Long text folds to a few lines on phones (the .clamp rule only applies
// there). "More" shows only when the clamp is actually hiding something,
// measured after layout and again whenever the text box changes size.
function Fold({ text, className, open, onToggle }: { text: string; className: string; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [folds, setFolds] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setFolds(el.scrollHeight > el.clientHeight + 1)
    check()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, text])
  return (
    <>
      <p ref={ref} className={className + (open ? '' : ' clamp')}>{text}</p>
      {folds && <button type="button" className="rv-more" aria-expanded={open} onClick={onToggle}>{open ? 'Less' : 'More'}</button>}
    </>
  )
}

const GoogleG = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/><path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
)

const Icon = {
  link: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  spark: <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>,
  reply: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
  sync: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><polyline points="21 3 21 8 16 8"/><polyline points="3 21 3 16 8 16"/></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  filters: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>,
  x: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  check: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>,
  prev: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>,
  next: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>,
  star: <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill="currentColor" /></svg>,
}

// Desktop keeps the two-column dashboard (list + Google summary rail) and its
// numbered pager. Below 1024px (portrait tablets) the rail would squeeze the
// list, so the list takes the full width under a summary strip and the
// review-link settings move below it. At 767px and below the page becomes a
// phone layout: header with Sync under the title, the summary strip, a sticky
// search with a row of quick-filter chips and a Filters sheet, compact cards
// and "Load more". Phone-only and desktop-only pieces are switched with CSS,
// so nothing flashes.
const REVIEWS_CSS = `
  .rv-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:12px; font-weight:700; font-size:13.5px; padding:10px 18px; cursor:pointer; border:1px solid transparent; transition: background .15s ease, border-color .15s ease, transform .06s ease, box-shadow .15s ease; line-height:1; font-family:inherit; white-space:nowrap; }
  .rv-btn:active { transform: translateY(1px); }
  .rv-btn:disabled { opacity:.6; cursor:default; }
  .rv-btn-primary { background: var(--coral); color:#fff; box-shadow: 0 1px 2px rgba(255,122,107,0.35); }
  .rv-btn-primary:hover:not(:disabled) { background: var(--coral-hover); box-shadow: 0 4px 12px rgba(255,122,107,0.32); }
  .rv-btn-ghost { background: var(--card, #fff); color: var(--ink); border-color: var(--border); }
  .rv-btn-ghost:hover:not(:disabled) { background: var(--canvas); border-color:#e2e2e2; }
  .rv-btn-ai { background: linear-gradient(135deg,#f6f0ff,#fff1f5); color:#7c3aed; border-color:#efe6ff; }
  .rv-btn-ai:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(124,58,237,0.16); }
  .rv-chip { display:inline-flex; align-items:center; gap:6px; border-radius:999px; font-size:12px; font-weight:700; padding:5px 12px; cursor:pointer; border:1px solid var(--border); background: var(--card, #fff); color:var(--slate); transition: all .15s; font-family:inherit; flex-shrink:0; }
  .rv-chip:hover { border-color: var(--coral); color: var(--coral); background: var(--peach); }
  .rv-chip.on { border-color: var(--coral); color: var(--coral); background: var(--peach); }
  .rv-preset { padding:8px 14px; border-radius:999px; border:1px solid var(--border); background: var(--card, #fff); color:var(--slate); font-size:12.5px; font-weight:700; cursor:pointer; transition: all .15s; font-family:inherit; }
  .rv-preset:hover { border-color: var(--coral); color: var(--coral); }
  .rv-preset.on { background: var(--peach); border-color: var(--coral); color: var(--coral); }
  .rv-page-btn { min-width:38px; height:38px; padding:0 10px; border-radius:11px; border:1px solid var(--border); background: var(--card, #fff); color:var(--ink); font-size:13.5px; font-weight:700; cursor:pointer; transition: all .15s; display:inline-flex; align-items:center; justify-content:center; font-family:inherit; }
  .rv-page-btn:hover:not(:disabled):not(.on) { border-color: var(--coral); color: var(--coral); }
  .rv-page-btn.on { background: var(--coral); border-color: var(--coral); color:#fff; }
  .rv-page-btn:disabled { opacity:.4; cursor:default; }
  .rv-input { padding:10px 13px; border-radius:11px; border:1px solid var(--border); font-size:13.5px; outline:none; background: var(--card, #fff); color:var(--ink); transition: border-color .15s; font-family:inherit; }
  .rv-input:focus { border-color: var(--coral); }

  .rv-grid { display:grid; grid-template-columns: minmax(0, 1fr) 320px; gap:20px; align-items:start; }
  .rv-panel { background: var(--card, #fff); border:1px solid var(--border); border-radius:16px; }
  .rv-filters { padding:16px 18px; margin-bottom:16px; }
  .rv-empty { padding:12px; text-align:center; color:var(--slate); }

  /* Review card (desktop look). */
  .rv-card { background: var(--card, #fff); border:1px solid var(--border); border-radius:16px; padding:18px 20px; margin-bottom:14px; transition: box-shadow .4s; min-width:0; }
  .rv-card.hot { box-shadow: 0 0 0 3px var(--coral); }
  .rv-head { display:flex; align-items:center; gap:12px; margin-bottom:12px; min-width:0; }
  .rv-av { width:42px; height:42px; border-radius:50%; flex-shrink:0; object-fit:cover; background: var(--peach); color: var(--coral); display:flex; align-items:center; justify-content:center; font-weight:800; font-size:17px; }
  .rv-who { min-width:0; }
  .rv-name-row { display:flex; align-items:center; gap:8px; min-width:0; }
  .rv-name { margin:0; font-weight:800; font-size:15px; color: var(--ink); min-width:0; }
  .rv-match { margin:2px 0 0; font-size:12px; color: var(--slate); }
  .rv-match.on { color: var(--coral); font-style: italic; }
  .rv-g { display:inline-flex; align-items:center; flex-shrink:0; text-decoration:none; }
  .rv-g-d { margin-left:auto; }
  .rv-body { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; background: var(--canvas); border-radius:12px; padding:14px 16px; }
  .rv-text-wrap { flex:1; min-width:0; }
  .rv-text { margin:0; font-size:13.5px; line-height:1.6; color: var(--ink); overflow-wrap:anywhere; }
  .rv-text .rv-none { color: var(--slate); font-style: italic; }
  .rv-rate { text-align:right; flex-shrink:0; }
  .rv-rate p { margin:6px 0 0; font-size:11.5px; color: var(--slate); font-style: italic; }
  .rv-reply { margin-top:12px; padding:12px 15px; background: var(--peach); border-radius:12px; border-left:3px solid var(--coral); }
  .rv-reply-h { margin:0 0 3px; font-size:11px; font-weight:800; color: var(--coral); }
  .rv-reply-t { margin:0; font-size:13px; color: var(--ink); overflow-wrap:anywhere; }
  .rv-composer { margin-top:12px; }
  .rv-composer textarea { width:100%; padding:12px 14px; border-radius:12px; border:1px solid var(--border); font-size:13.5px; resize:vertical; box-sizing:border-box; outline:none; font-family:inherit; background: var(--card, #fff); color: var(--ink); }
  .rv-composer textarea:focus { border-color: var(--coral); }
  .rv-composer-actions { display:flex; gap:8px; margin-top:10px; justify-content:flex-end; }
  .rv-foot { display:flex; align-items:center; gap:10px; margin-top:12px; flex-wrap:wrap; min-width:0; }
  .rv-agsg { margin-top:12px; }
  .rv-agsg .agsg { max-width:none; margin-left:0; }
  .rv-more { display:none; }

  /* Phone-only pieces are hidden on desktop. */
  .rv-m, .rv-strip, .rv-bar, .rv-count-m, .rv-loadmore-wrap, .rv-newer-wrap, .rv-meta, .rv-link-m, .rv-foot.rv-foot-m { display:none; }

  .rv-rail { padding:20px; position:sticky; top:20px; }
  .rv-pager { display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; margin-top:18px; }

  /* Link-to-customer dialog. */
  .rv-linkmodal { position:fixed; inset:0; background:rgba(0,0,0,0.4); display:flex; align-items:center; justify-content:center; z-index:100; padding:16px; }
  .rv-linkmodal-panel { background: var(--card, #fff); border-radius:18px; width:420px; max-width:100%; max-height:80vh; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.25); overflow:hidden; }

  /* Filters sheet (opened from the phone toolbar). */
  @keyframes rvSheetIn { from { transform: translateY(100%); } to { transform: none; } }
  @keyframes rvFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .rv-sheet-backdrop { position:fixed; inset:0; z-index:1000; background:rgba(15,23,42,.42); display:flex; align-items:flex-end; justify-content:center; animation: rvFadeIn .18s ease both; }
  .rv-sheet { width:100%; max-width:560px; max-height:88dvh; overflow-y:auto; overscroll-behavior:contain; background: var(--card, #fff); border-radius:20px 20px 0 0; padding:0 16px; box-sizing:border-box; animation: rvSheetIn .26s cubic-bezier(.22,1,.36,1) both; box-shadow: 0 -12px 40px rgba(15,23,42,.18); }
  .rv-sheet-grab { width:40px; height:4px; border-radius:4px; background:#e4e4e7; margin:8px auto 4px; }
  .rv-sheet-head { display:flex; align-items:center; justify-content:space-between; padding:6px 0 10px; }
  .rv-sheet-head h2 { margin:0; font-size:17px; font-weight:800; color: var(--ink); }
  .rv-icon-btn { width:36px; height:36px; border-radius:10px; border:1px solid var(--border); background: var(--card, #fff); color: var(--slate); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; padding:0; flex-shrink:0; }
  .rv-sheet-label { margin:14px 0 8px; font-size:11.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; color: var(--slate); }
  .rv-sheet-presets { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; }
  .rv-sheet-presets .rv-preset { padding:10px 8px; font-size:13.5px; }
  .rv-sheet-dates { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top:10px; }
  .rv-sheet-field { display:flex; flex-direction:column; gap:5px; font-size:12.5px; font-weight:700; color: var(--slate); min-width:0; }
  .rv-sheet-field .rv-input { width:100%; min-width:0; box-sizing:border-box; font-size:16px; padding:10px 12px; color: var(--ink); }
  .rv-sheet .modal-sticky-foot .rv-btn { flex:1 1 0; padding:13px 12px; font-size:14.5px; }

  @media (min-width: 768px) {
    .rv-sheet-backdrop { align-items:center; }
    .rv-sheet { border-radius:20px; padding-bottom:0; }
  }

  /* Summary strip: average, total (shows everything), to reply (filters). */
  .rv-tile { display:flex; flex-direction:column; align-items:flex-start; gap:2px; padding:10px 12px; border-radius:14px; border:1px solid var(--border); background: var(--card, #fff); font-family:inherit; text-align:left; min-width:0; color: var(--ink); -webkit-tap-highlight-color: transparent; }
  button.rv-tile { cursor:pointer; }
  button.rv-tile.on { border-color: var(--coral); background: var(--peach); }
  .rv-tile-n { display:inline-flex; align-items:center; gap:4px; font-size:19px; font-weight:800; line-height:1.15; }
  .rv-tile-n svg { color:#f5b301; }
  .rv-tile-l { font-size:11.5px; font-weight:600; color: var(--slate); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }

  /* Portrait tablets (and phones): one full-width column. The strip stands
     in for the rail's stats; the rail's settings sit below the list. */
  @media (max-width: 1023px) {
    .rv-grid { grid-template-columns: minmax(0, 1fr); }
    .rv-strip { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:10px; margin-bottom:14px; }
    .rv-rail { position:static; }
    .rv-rail-stats { display:none; }
  }

  @media (max-width: 767px) {
    /* The admin's content column is a scroll container that never scrolls
       (the page does), which stops anything sticking. Clip sideways instead,
       so the search bar can stick under the top bar while you scroll. */
    .admin-main:has(.rv-page) { overflow-x: clip !important; overflow-y: visible !important; }

    .rv-page { padding: 0 12px 16px !important; }
    .rv-page .ph-root { margin: 0 -12px 12px !important; padding: 14px 12px 12px !important; }
    .rv-page .ph-row { flex-wrap: wrap; }
    .rv-page .ph-actions { flex: 1 1 100% !important; }
    .rv-sync-wrap { width:100%; flex-direction: column-reverse !important; align-items: stretch !important; gap:6px !important; }
    .rv-sync-wrap [role="status"] { max-width:none !important; text-align:center; }
    .rv-sync { width:100%; padding:11px 14px; }

    .rv-d { display:none !important; }
    .rv-m { display:inline-flex; }
    /* The page moves the reader itself when results change, and "Show newer"
       should open where you are looking, so the browser's own scroll
       anchoring must not pick a card and fight it. */
    .rv-results { overflow-anchor: none; }
    .rv-foot.rv-foot-m { display:flex; }
    .rv-grid { gap:12px; }
    .rv-strip { gap:8px; margin-bottom:10px; }

    /* Sticky search + quick filters. */
    .rv-bar { display:block; position:sticky; top:56px; z-index:20; margin:0 -12px 8px; padding:8px 12px; background: color-mix(in srgb, var(--canvas) 94%, transparent); backdrop-filter: saturate(180%) blur(10px); -webkit-backdrop-filter: saturate(180%) blur(10px); border-bottom:1px solid var(--border); }
    .rv-bar-row { display:flex; gap:8px; align-items:center; }
    .rv-search { flex:1; min-width:0; position:relative; display:flex; align-items:center; }
    .rv-search > svg { position:absolute; left:12px; color: var(--slate); pointer-events:none; }
    .rv-search input { width:100%; min-width:0; box-sizing:border-box; height:42px; padding:0 38px 0 36px; border-radius:12px; border:1px solid var(--border); background: var(--card, #fff); color: var(--ink); font-size:16px; outline:none; font-family:inherit; -webkit-appearance:none; appearance:none; }
    .rv-search input:focus { border-color: var(--coral); }
    .rv-search input::-webkit-search-cancel-button { display:none; }
    .rv-search-clear { position:absolute; right:4px; width:34px; height:34px; border:none; background:none; color: var(--slate); display:flex; align-items:center; justify-content:center; cursor:pointer; padding:0; }
    .rv-filter-btn { position:relative; height:42px; padding:0 13px; border-radius:12px; border:1px solid var(--border); background: var(--card, #fff); color: var(--ink); display:inline-flex; align-items:center; gap:6px; font-size:13.5px; font-weight:700; cursor:pointer; flex-shrink:0; font-family:inherit; }
    .rv-filter-btn.on { border-color: var(--coral); color: var(--coral); background: var(--peach); }
    .rv-badge { min-width:18px; height:18px; padding:0 5px; border-radius:9px; background: var(--coral); color:#fff; font-size:11px; font-weight:800; display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; }
    .rv-chips { display:flex; gap:6px; margin:8px -12px 0; padding:0 12px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; }
    .rv-chips::-webkit-scrollbar { display:none; }
    .rv-chips .rv-chip { padding:7px 12px; font-size:12.5px; white-space:nowrap; }
    .rv-chips .rv-chip svg { color:#f5b301; }
    .rv-chip-sep { flex:0 0 1px; align-self:stretch; background: var(--border); margin:4px 2px; }
    .rv-count-m { display:flex; align-items:center; gap:8px; margin:0 2px 8px; font-size:12.5px; color: var(--slate); }
    .rv-link-btn { border:none; background:none; padding:0; color: var(--coral); font-weight:700; font-size:12.5px; cursor:pointer; font-family:inherit; }

    .rv-filters { display:none; }

    /* Compact card. */
    .rv-card { padding:12px; border-radius:14px; margin-bottom:8px; }
    .rv-head { align-items:flex-start; gap:10px; margin-bottom:8px; }
    .rv-av { width:38px; height:38px; font-size:15px; }
    .rv-who { flex:1; }
    .rv-name-row { justify-content:space-between; }
    .rv-name { font-size:14.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rv-meta { display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px; font-size:12px; color: var(--slate); }
    .rv-dot { width:3px; height:3px; border-radius:50%; background:#c4c4c8; flex-shrink:0; }
    .rv-status { font-weight:700; }
    .rv-status.todo { color:#c2410c; }
    .rv-status.done { color:#15803d; }
    .rv-status.draft { color:#7c3aed; }
    .rv-body { display:block; background:none; padding:0; border-radius:0; }
    .rv-text { font-size:14px; line-height:1.5; }
    .rv-text.clamp { display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden; }
    .rv-more { display:inline-block; border:none; background:none; padding:4px 0 0; color: var(--coral); font-weight:700; font-size:13px; cursor:pointer; font-family:inherit; }
    .rv-reply { margin-top:10px; padding:9px 12px; border-radius:10px; }
    .rv-reply-t.clamp { display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .rv-composer textarea { font-size:16px; padding:10px 12px; }
    .rv-composer-actions .rv-btn { flex:1 1 0; padding:11px 12px; }
    .rv-agsg { margin-top:10px; }
    .rv-foot { margin-top:10px; gap:8px; flex-wrap:nowrap; }
    .rv-foot .rv-btn { padding:9px 12px; font-size:13px; border-radius:10px; flex-shrink:0; }
    .rv-link-m { display:inline-flex; align-items:center; gap:5px; margin-left:auto; min-width:0; max-width:46%; height:30px; padding:0 10px; border-radius:999px; border:1px solid var(--border); background: var(--card, #fff); color: var(--slate); font-size:12px; font-weight:700; cursor:pointer; font-family:inherit; }
    .rv-link-m svg { flex-shrink:0; }
    .rv-link-m span { min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .rv-link-m.on { color: var(--coral); border-color: color-mix(in srgb, var(--coral) 35%, var(--border)); background: var(--peach); }

    /* Below 390px (SE, mini, small Androids) "Link to customer" no longer fits
       beside the reply buttons, so the chip says just "Link". */
    @media (max-width: 389px) { .rv-link-xs { display:none; } }

    .rv-pager { display:none; }
    .rv-loadmore-wrap, .rv-newer-wrap { display:flex; flex-direction:column; align-items:stretch; gap:6px; margin-top:4px; text-align:center; font-size:12.5px; color: var(--slate); }
    .rv-newer-wrap { margin:0 0 10px; }
    .rv-loadmore-wrap .rv-btn, .rv-newer-wrap .rv-btn { width:100%; padding:12px; font-size:14px; }

    .rv-rail { padding:16px; }

    .rv-linkmodal { align-items:flex-end; padding:0; }
    .rv-linkmodal-panel { width:100%; max-height:85dvh; border-radius:18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom); }
    .rv-linkmodal-panel input { font-size:16px !important; }

    /* While a reply is being written the AI orb steps aside so it can't sit on Post reply. */
    body:has(.rv-composer) .colvy-ai-orb-wrap { opacity:0; pointer-events:none; }
  }
`

export default function ReviewsPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededReviews = seededCid ? readCache<Review[]>(`reviews:${seededCid}`) : undefined
  const [reviews, setReviews] = useState<Review[]>(seededReviews ?? [])
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  // Replies the Reputation Agent drafted, waiting for a person (by Google review id).
  const [drafts, setDrafts] = useState<Record<string, Suggestion>>({})
  const loadDrafts = async (cid: string) => {
    try {
      const r = await authFetch(`/api/agent/approvals?companyId=${cid}`)
      if (!r.ok) return
      const d = await r.json()
      const map: Record<string, Suggestion> = {}
      for (const a of d.approvals || []) if (a.action_key === 'reply_to_review' && a.run?.input?.reviewId) map[a.run.input.reviewId] = a
      setDrafts(map)
    } catch {}
  }
  useEffect(() => { if (companyId) loadDrafts(companyId) }, [companyId])
  const [companyName, setCompanyName] = useState('')
  const [reviewLink, setReviewLink] = useState<string>('')
  const [savingLink, setSavingLink] = useState(false)
  const [linkSaved, setLinkSaved] = useState(false)
  const [loading, setLoading] = useState(!seededReviews)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState(0)
  const [repliesFilter, setRepliesFilter] = useState<Replies>('all')
  // Same breakpoint as the CSS; only decides pager (desktop) vs "Load more" (phones).
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const check = () => setIsPhone(mq.matches)
    check(); mq.addEventListener('change', check)
    return () => mq.removeEventListener('change', check)
  }, [])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [preset, setPreset] = useState<Preset>('all')
  const [syncing, setSyncing] = useState(false)

  // Pagination (desktop) and "Load more" (phones). Both start on the same
  // first reviews, so the first paint is identical whichever applies.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [phoneCount, setPhoneCount] = useState(PHONE_FIRST)
  // Phones render the window filtered[phoneStart, phoneStart + phoneCount).
  // It starts at 0, except after a ?review= deep link to an older review,
  // which opens the window at that review with "Show newer" above it.
  const [phoneStart, setPhoneStart] = useState(0)
  const barRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  // Long comments and replies the person has unfolded on a phone.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggleExpanded = (key: string) => setExpanded(s => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  // Filters sheet (phones): edits a draft, applied with "Show N reviews".
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  // Deep-link from the inbox: ?review=<db id> → jump to and highlight that row.
  const [highlightReviewId, setHighlightReviewId] = useState<string | null>(null)

  // Customer matching
  const [linkFor, setLinkFor] = useState<Review | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [contactLoading, setContactLoading] = useState(false)

  useEffect(() => {
    try { const rid = new URLSearchParams(window.location.search).get('review'); if (rid) setHighlightReviewId(rid) } catch {}
    const init = async () => {
      let cid: string | null = seededCid
      let nameResolved = false
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id, name').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) { cid = co.id; setCompanyName(co.name); nameResolved = true }
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id, name').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) { cid = ownCo.id; setCompanyName(ownCo.name); nameResolved = true }
        }
      }
      setCompanyId(cid)
      if (cid) {
        if (!nameResolved) {
          ;(supabase as any).from('companies').select('name').eq('id', cid).maybeSingle()
            .then(({ data }: any) => { if (data?.name) setCompanyName(data.name) })
        }
        // The business's Google "leave a review" link — opens the listing on Google.
        ;(supabase as any).from('google_business_accounts').select('review_link').eq('company_id', cid).maybeSingle()
          .then(({ data }: any) => { if (data?.review_link) setReviewLink(data.review_link) })
        await load(cid)
      }
      setLoading(false)
    }
    init()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('google_reviews')
      .select('*').eq('company_id', cid).order('review_created_at', { ascending: false }).limit(5000)
    setReviews(data || [])
    writeCache(`reviews:${cid}`, data || [])
  }

  // A sync saves only new or changed reviews and stops before the server's time
  // limit; when it reports `partial` we simply call it again to carry on.
  const [syncNote, setSyncNote] = useState('')
  const [syncError, setSyncError] = useState(false)
  const sync = async () => {
    if (!companyId || syncing) return
    setSyncing(true); setSyncNote(''); setSyncError(false)
    try {
      let added = 0
      for (let round = 0; round < 6; round++) {
        const res = await authFetch('/api/google/reviews', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, action: 'sync' }),
        })
        // A timed-out request comes back as a plain-text platform error, not
        // JSON — never show that raw text to the user.
        const text = await res.text()
        let d: any = {}
        try { d = text ? JSON.parse(text) : {} } catch { d = { error: 'Google took too long to answer. Your reviews are saved so far — tap Sync again to carry on.' } }
        if (!res.ok || d.error) throw new Error(d.error || 'Sync failed')
        added += d.new || 0
        if (!d.partial) break
        setSyncNote(`Syncing… ${added} new so far`)
      }
      await load(companyId)
      setSyncNote(added ? `${added} new review${added === 1 ? '' : 's'} synced` : 'Up to date')
      setTimeout(() => setSyncNote(''), 4000)
    } catch (e: any) {
      await load(companyId).catch(() => {})
      setSyncError(true)
      setSyncNote(e.message || 'Could not sync reviews')
    } finally { setSyncing(false) }
  }

  const draftReply = async (review: Review) => {
    if (!companyId) return
    setDrafting(review.id)
    try {
      const res = await authFetch('/api/google/reviews/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, reviewId: review.review_id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not draft a reply')
      setReplyingTo(review.id)
      setReplyText(d.reply || d.draft || '')
    } catch (e: any) {
      alert(e.message)
    } finally { setDrafting(null) }
  }

  const postReply = async (review: Review) => {
    if (!companyId || !replyText.trim()) return
    setPosting(true)
    try {
      const res = await authFetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'reply', reviewId: review.review_id, comment: replyText.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not post reply')
      setReviews(rs => rs.map(r => r.id === review.id ? { ...r, reply_comment: replyText.trim() } : r))
      setReplyingTo(null); setReplyText('')
    } catch (e: any) {
      alert(e.message)
    } finally { setPosting(false) }
  }

  const saveReviewLink = async () => {
    if (!companyId) return
    setSavingLink(true); setLinkSaved(false)
    try {
      await authFetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'save_review_link', reviewLink: reviewLink.trim() }),
      })
      setLinkSaved(true)
      setTimeout(() => setLinkSaved(false), 2500)
    } catch { /* keep the typed value */ } finally { setSavingLink(false) }
  }

  // ── Customer matching ──────────────────────────────────────────────────────
  const openLink = (review: Review) => {
    // Prime the search with the reviewer's name so the likely match is one tap away.
    setLinkFor(review)
    setContactSearch(review.reviewer_name && review.reviewer_name !== 'Anonymous' ? review.reviewer_name : '')
  }

  // Server-side contact search (debounced) — queries the whole contact list,
  // not a capped in-memory slice, so any customer is findable. Ranks real
  // prefix matches (name starts with the query) above mere substring hits.
  useEffect(() => {
    if (!linkFor || !companyId) return
    let cancelled = false
    setContactLoading(true)
    const q = contactSearch.trim()
    const t = setTimeout(async () => {
      let query = (supabase as any).from('contacts').select('id, name, email').eq('company_id', companyId)
      // Commas/parens are PostgREST or() delimiters — strip them from the term.
      const safeQ = q.replace(/[,()]/g, ' ').trim()
      if (safeQ) query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
      const { data } = await query.order('name', { ascending: true }).limit(40)
      if (cancelled) return
      const ql = q.toLowerCase()
      const rank = (c: Contact) => {
        const n = (c.name || '').toLowerCase()
        if (ql && n.startsWith(ql)) return 0
        if (ql && n.includes(ql)) return 1
        if (ql && (c.email || '').toLowerCase().includes(ql)) return 2
        return 3
      }
      setContactResults([...(data || [])].sort((a, b) => rank(a) - rank(b)).slice(0, 25))
      setContactLoading(false)
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [contactSearch, linkFor, companyId])

  const setLink = async (review: Review, contact: Contact | null) => {
    if (!companyId) return
    const patch = { contact_id: contact?.id || null, contact_name: contact?.name || null, match_checked_at: new Date().toISOString() }
    setReviews(rs => rs.map(r => r.id === review.id ? { ...r, ...patch } : r))
    setLinkFor(null)
    try {
      await authFetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'link_contact', reviewId: review.review_id, contactId: contact?.id || null, contactName: contact?.name || null }),
      })
    } catch { /* optimistic; a resync would re-derive */ }
  }

  // Back to the first page (and the first few on phones) whenever the result
  // set changes. On phones the sticky bar lets people filter while scrolled
  // far down; the list then gets shorter and would leave the new results
  // above the screen, so bring their start up to just under the bar.
  // A layout effect, so the reader never sees the in-between position.
  const resetMounted = useRef(false)
  useLayoutEffect(() => {
    setPage(1); setPhoneCount(PHONE_FIRST); setPhoneStart(0)
    if (!resetMounted.current) { resetMounted.current = true; return }
    if (!window.matchMedia('(max-width: 767px)').matches) return
    const bar = barRef.current?.getBoundingClientRect()
    const res = resultsRef.current?.getBoundingClientRect()
    // The bar keeps an 8px gap below it; only move if the results start is hidden.
    if (bar && res && bar.height && res.top < bar.bottom + 7) {
      window.scrollBy({ top: res.top - (bar.bottom + 8), behavior: 'instant' as ScrollBehavior })
    }
  }, [ratingFilter, repliesFilter, dateFrom, dateTo, search, pageSize])

  const applyPreset = (p: 'all' | '7' | '30' | '90') => {
    setPreset(p)
    const r = presetRange(p)
    setDateFrom(r.dateFrom); setDateTo(r.dateTo)
  }

  const current: Filters = { preset, dateFrom, dateTo, rating: ratingFilter, replies: repliesFilter }
  // A custom range with both dates cleared is no date filter at all.
  const presetFor = (p: Preset, from: string, to: string): Preset => (p === 'custom' && !from && !to ? 'all' : p)
  const applyFilters = (f: Filters) => {
    setPreset(presetFor(f.preset, f.dateFrom, f.dateTo)); setDateFrom(f.dateFrom); setDateTo(f.dateTo); setRatingFilter(f.rating); setRepliesFilter(f.replies)
  }
  // Also back to the newest reviews, even when no filter was on (after a deep link).
  const clearFilters = () => { applyFilters(NO_FILTERS); setSearch(''); setPhoneStart(0); setPhoneCount(PHONE_FIRST) }
  // Presets always set both dates, so the dates alone say whether a date filter is on.
  const activeCount = (dateFrom || dateTo ? 1 : 0) + (ratingFilter ? 1 : 0) + (repliesFilter !== 'all' ? 1 : 0)
  const filteredView = activeCount > 0 || !!search.trim()

  const filtered = reviews.filter(r => matches(r, current, search))

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClamped = Math.min(page, totalPages)
  const phoneFrom = Math.min(phoneStart, Math.max(0, filtered.length - 1))
  const phoneTo = Math.min(filtered.length, phoneFrom + phoneCount)
  const pageItems = isPhone
    ? filtered.slice(phoneFrom, phoneTo)
    : filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize)
  // "Show newer" (phones, after a deep link): the next newer reviews appear
  // right under the button, where the reader is looking.
  const showNewer = () => {
    const from = Math.max(0, phoneFrom - PHONE_STEP)
    setPhoneCount(phoneTo - from); setPhoneStart(from)
  }

  // Filters sheet: open on a copy of the live filters; count what the draft would show.
  const openSheet = () => { setDraft(current); setSheetOpen(true) }
  const draftCount = sheetOpen ? reviews.filter(r => matches(r, draft, search)).length : 0
  useEffect(() => {
    if (!sheetOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false) }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [sheetOpen])

  // When deep-linked with ?review=, clear filters, page to the row, and scroll
  // it into view. The highlight ring fades after a few seconds.
  useEffect(() => {
    if (!highlightReviewId || reviews.length === 0) return
    const idx = reviews.findIndex((r: any) => r.id === highlightReviewId)
    if (idx < 0) return
    setRatingFilter(0); setRepliesFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); setPreset('all')
    setPage(Math.floor(idx / pageSize) + 1)
    // Phones: open the list at the linked review (with "Show newer" above)
    // rather than rendering every review down to it.
    // A recent review just extends the first batch.
    const near = idx < PHONE_FIRST + PHONE_STEP
    setPhoneStart(near ? 0 : idx)
    setPhoneCount(near ? Math.max(PHONE_FIRST, idx + 1) : PHONE_FIRST)
    const t = setTimeout(() => {
      try { document.getElementById(`review-${highlightReviewId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {}
    }, 300)
    const clear = setTimeout(() => setHighlightReviewId(null), 6000)
    return () => { clearTimeout(t); clearTimeout(clear) }
  }, [highlightReviewId, reviews.length])   // eslint-disable-line react-hooks/exhaustive-deps

  const avg = reviews.length ? (reviews.reduce((a, r) => a + (r.star_rating || 0), 0) / reviews.length) : 0
  const repliedCount = reviews.filter(r => r.reply_comment).length
  const pendingCount = reviews.length - repliedCount

  // Page-number list with ellipses, e.g. 1 … 4 5 [6] 7 8 … 52
  const pageList: (number | '…')[] = (() => {
    const out: (number | '…')[] = []
    const add = (n: number) => out.push(n)
    const near = (n: number) => Math.abs(n - pageClamped) <= 1
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || near(n)) add(n)
      else if (out[out.length - 1] !== '…') out.push('…')
    }
    return out
  })()

  const googleMark = (cls: string) => reviewLink
    ? <a href={reviewLink} target="_blank" rel="noopener noreferrer" title="Open on Google" aria-label="Open on Google" className={'rv-g ' + cls}><GoogleG size={18} /></a>
    : <span title="Google review" className={'rv-g ' + cls}><GoogleG size={18} /></span>

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading reviews…</div>

  return (
    <div className="rv-page" style={{ padding: '28px 32px' }}>
      <style>{REVIEWS_CSS}</style>

      <PageHeader
        title="Review Dashboard"
        subtitle="Google reviews, ratings and replies in one place."
        bleed={32}
        bleedTop={28}
        sticky={false}
        action={
          <span className="rv-sync-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {syncNote && <span role="status" style={{ fontSize: 12.5, fontWeight: 600, color: syncError ? '#dc2626' : 'var(--slate)', maxWidth: 320 }}>{syncNote}</span>}
            <button onClick={sync} disabled={syncing} className="rv-btn rv-btn-primary rv-sync">
              <span className="rv-m">{Icon.sync}</span>
              {syncing ? 'Syncing…' : 'Sync Google reviews'}
            </button>
          </span>
        }
      />

      <div className="rv-grid">
        <div style={{ minWidth: 0 }}>
          {/* Phones: summary strip. "Reviews" shows everything; "To reply" filters. */}
          {reviews.length > 0 && (
            <div className="rv-strip">
              <div className="rv-tile">
                <span className="rv-tile-n">{Icon.star}{avg.toFixed(1)}</span>
                <span className="rv-tile-l">Average</span>
              </div>
              <button type="button" className={'rv-tile' + (!filteredView ? ' on' : '')} aria-pressed={!filteredView} onClick={clearFilters}>
                <span className="rv-tile-n">{reviews.length}</span>
                <span className="rv-tile-l">Reviews</span>
              </button>
              <button type="button" className={'rv-tile' + (repliesFilter === 'unreplied' ? ' on' : '')} aria-pressed={repliesFilter === 'unreplied'}
                onClick={() => setRepliesFilter(f => f === 'unreplied' ? 'all' : 'unreplied')}>
                <span className="rv-tile-n" style={{ color: pendingCount ? '#dc2626' : undefined }}>{pendingCount}</span>
                <span className="rv-tile-l">To reply</span>
              </button>
            </div>
          )}

          {/* Phones: sticky search, Filters sheet button and quick-filter chips. */}
          <div className="rv-bar" ref={barRef}>
            <div className="rv-bar-row">
              <label className="rv-search">
                {Icon.search}
                <input type="search" enterKeyHint="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…" aria-label="Search reviews" />
                {search && <button type="button" className="rv-search-clear" aria-label="Clear search" onClick={() => setSearch('')}>{Icon.x}</button>}
              </label>
              <button type="button" className={'rv-filter-btn' + (activeCount ? ' on' : '')} onClick={openSheet} aria-haspopup="dialog">
                {Icon.filters}<span>Filters</span>{activeCount > 0 && <span className="rv-badge" aria-label={`${activeCount} active`}>{activeCount}</span>}
              </button>
            </div>
            <div className="rv-chips" role="toolbar" aria-label="Quick filters">
              <button type="button" className={'rv-chip' + (repliesFilter === 'unreplied' ? ' on' : '')} aria-pressed={repliesFilter === 'unreplied'}
                onClick={() => setRepliesFilter(f => f === 'unreplied' ? 'all' : 'unreplied')}>Needs reply</button>
              {PRESETS.map(([v, label]) => (
                <button key={v} type="button" className={'rv-chip' + (preset === v ? ' on' : '')} aria-pressed={preset === v}
                  onClick={() => applyPreset(preset === v ? 'all' : v)}>{label}</button>
              ))}
              <span className="rv-chip-sep" aria-hidden="true" />
              {[5, 4, 3, 2, 1].map(n => (
                <button key={n} type="button" className={'rv-chip' + (ratingFilter === n ? ' on' : '')} aria-pressed={ratingFilter === n}
                  aria-label={`${n} star${n === 1 ? '' : 's'}`} onClick={() => setRatingFilter(r => r === n ? 0 : n)}>{Icon.star}{n}</button>
              ))}
            </div>
          </div>
          <div className="rv-results" ref={resultsRef}>
          {filteredView && (
            <div className="rv-count-m" role="status">
              <span>Showing {filtered.length} of {reviews.length}</span>
              <button type="button" className="rv-link-btn" onClick={clearFilters}>Clear filters</button>
            </div>
          )}

          {/* Desktop filters */}
          <div className="rv-panel rv-filters">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Filters</span>
              <span style={{ fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>Showing {filtered.length} of {reviews.length}</span>
            </div>

            {/* Quick date presets */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {([['all', 'All time'], ...PRESETS] as const).map(([v, label]) => (
                <button key={v} className={'rv-preset' + (preset === v ? ' on' : '')} onClick={() => applyPreset(v)}>{label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={ratingFilter} onChange={e => setRatingFilter(Number(e.target.value))} className="rv-input" style={{ minWidth: 130 }} aria-label="Rating">
                <option value={0}>All ratings</option>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
              </select>
              <select value={repliesFilter} onChange={e => setRepliesFilter(e.target.value as Replies)} className="rv-input" style={{ minWidth: 130 }} aria-label="Replies">
                <option value="all">All replies</option>
                <option value="replied">Replied</option>
                <option value="unreplied">Not replied</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset(presetFor('custom', e.target.value, dateTo)) }} title="From date" aria-label="From date" className="rv-input" />
              <span style={{ color: 'var(--slate)', fontSize: 13 }}>to</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset(presetFor('custom', dateFrom, e.target.value)) }} title="To date" aria-label="To date" className="rv-input" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…" aria-label="Search reviews" className="rv-input" style={{ flex: 1, minWidth: 180 }} />
            </div>
          </div>

          {/* Phones, after a deep link to an older review */}
          {phoneFrom > 0 && pageItems.length > 0 && (
            <div className="rv-newer-wrap">
              <button type="button" className="rv-btn rv-btn-ghost" onClick={showNewer}>Show newer reviews</button>
              <span>Starting at review {phoneFrom + 1} of {filtered.length}</span>
            </div>
          )}

          {/* Review list */}
          {pageItems.length === 0 ? (
            <div className="rv-panel rv-empty">
              {reviews.length === 0
                ? <EmptyScroll kinds={['review']} title="No reviews yet" line="Connect Google, then sync to bring your reviews in. You can reply to them right here." />
                : <EmptyScroll kinds={['review']} title={search.trim() ? 'No matches' : 'No reviews match these filters'}
                    line={search.trim() ? `Nothing matches “${search.trim()}”. Try a name or a word from the review.` : 'Try another rating, date or reply filter.'}
                    action={<button type="button" className="cv-btn" onClick={() => { setRatingFilter(0); setRepliesFilter('all'); setDateFrom(''); setDateTo(''); setSearch(''); setPreset('all'); setPage(1) }}>Clear filters</button>} />}
            </div>
          ) : pageItems.map(review => {
            const linked = !!review.contact_id
            const hot = review.id === highlightReviewId
            const draftFor = drafts[review.review_id] && companyId ? drafts[review.review_id] : null
            const composing = !review.reply_comment && replyingTo === review.id
            const showActions = !review.reply_comment && !composing && !draftFor
            const textOpen = expanded.has(review.id)
            const replyOpen = expanded.has('r:' + review.id)
            return (
            <article key={review.id} id={`review-${review.id}`} className={'rv-card' + (hot ? ' hot' : '')}>
              <div className="rv-head">
                {review.reviewer_photo
                  ? <img src={review.reviewer_photo} alt={review.reviewer_name} referrerPolicy="no-referrer" className="rv-av" />
                  : <span className="rv-av" aria-hidden="true">{(review.reviewer_name || '?').charAt(0).toUpperCase()}</span>}
                <div className="rv-who">
                  <div className="rv-name-row">
                    <p className="rv-name">{review.reviewer_name || 'Anonymous'}</p>
                    {googleMark('rv-m')}
                  </div>
                  {/* Phones: stars, when, and where the reply stands — on one line. */}
                  <div className="rv-meta">
                    <Stars n={review.star_rating} size={13} />
                    {review.review_created_at && <><span className="rv-dot" aria-hidden="true" /><span title={fullDate(review.review_created_at)}>{ago(review.review_created_at)}</span></>}
                    <span className="rv-dot" aria-hidden="true" />
                    {review.reply_comment
                      ? <span className="rv-status done">Replied</span>
                      : draftFor ? <span className="rv-status draft">Draft ready</span>
                      : <span className="rv-status todo">Needs reply</span>}
                  </div>
                  {linked
                    ? <p className="rv-match on rv-d">Linked with {review.contact_name}</p>
                    : <p className="rv-match rv-d">Not matched to a customer</p>}
                </div>
                <button className="rv-chip rv-d" onClick={() => openLink(review)} title="Match this review to a customer">
                  {Icon.link}
                  {linked ? 'Update link' : 'Link'}
                </button>
                {googleMark('rv-g-d rv-d')}
              </div>

              <div className="rv-body">
                <div className="rv-text-wrap">
                  {review.comment
                    ? <Fold text={review.comment} className="rv-text" open={textOpen} onToggle={() => toggleExpanded(review.id)} />
                    : <p className="rv-text"><span className="rv-none">No written comment</span></p>}
                </div>
                <div className="rv-rate rv-d">
                  <Stars n={review.star_rating} />
                  <p>{fullDate(review.review_created_at)}</p>
                </div>
              </div>

              {review.reply_comment ? (
                <div className="rv-reply">
                  <p className="rv-reply-h">Your reply</p>
                  <Fold text={review.reply_comment} className="rv-reply-t" open={replyOpen} onToggle={() => toggleExpanded('r:' + review.id)} />
                </div>
              ) : composing ? (
                <div className="rv-composer">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
                    placeholder="Write your reply…" aria-label={`Reply to ${review.reviewer_name || 'this review'}`} />
                  <div className="rv-composer-actions">
                    <button onClick={() => { setReplyingTo(null); setReplyText('') }} className="rv-btn rv-btn-ghost">Cancel</button>
                    <button onClick={() => postReply(review)} disabled={posting || !replyText.trim()} className="rv-btn rv-btn-primary">{posting ? 'Posting…' : 'Post reply'}</button>
                  </div>
                </div>
              ) : draftFor && companyId ? (
                <div className="rv-agsg">
                  <SuggestionCard s={draftFor} companyId={companyId} compact onDone={() => {
                    setDrafts(d => { const n = { ...d }; delete n[review.review_id]; return n })
                    setTimeout(() => { load(companyId); loadDrafts(companyId) }, 600)
                  }} />
                </div>
              ) : null}

              {/* Reply actions; on phones the row also carries "Link to customer". */}
              <div className={'rv-foot' + (showActions ? '' : ' rv-foot-m')}>
                {showActions && (
                  <>
                    <button onClick={() => draftReply(review)} disabled={drafting === review.id} className="rv-btn rv-btn-ai">
                      {Icon.spark}
                      {drafting === review.id ? 'Drafting…' : <><span className="rv-d">Generate AI Reply</span><span className="rv-m">AI reply</span></>}
                    </button>
                    <button onClick={() => { setReplyingTo(review.id); setReplyText('') }} className="rv-btn rv-btn-ghost">
                      <span className="rv-m">{Icon.reply}</span>
                      <span className="rv-d">Compose Reply</span><span className="rv-m">Reply</span>
                    </button>
                  </>
                )}
                <button type="button" className={'rv-link-m' + (linked ? ' on' : '')} onClick={() => openLink(review)}
                  aria-label={linked ? `Linked to ${review.contact_name || 'a customer'}. Change link` : 'Link to customer'}>
                  {Icon.link}<span>{linked ? (review.contact_name || 'Linked') : <>Link<span className="rv-link-xs"> to customer</span></>}</span>
                </button>
              </div>
            </article>
          )})}

          {/* Pagination (desktop) */}
          {filtered.length > pageSize && (
            <div className="rv-pager">
              <button className="rv-page-btn" aria-label="Previous page" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>{Icon.prev}</button>
              {pageList.map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ color: 'var(--slate)', padding: '0 4px' }}>…</span>
                : <button key={n} className={'rv-page-btn' + (n === pageClamped ? ' on' : '')} onClick={() => setPage(n)}>{n}</button>)}
              <button className="rv-page-btn" aria-label="Next page" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>{Icon.next}</button>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="rv-input" style={{ marginLeft: 6 }} aria-label="Reviews per page">
                {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
              </select>
            </div>
          )}

          {/* Load more (phones) */}
          {(filtered.length > PHONE_FIRST || phoneFrom > 0) && (
            <div className="rv-loadmore-wrap">
              {phoneTo < filtered.length && (
                <button type="button" className="rv-btn rv-btn-ghost rv-loadmore" onClick={() => setPhoneCount(c => c + PHONE_STEP)}>
                  Load more reviews
                </button>
              )}
              <span>{phoneFrom > 0
                ? `Showing ${phoneFrom + 1}–${phoneTo} of ${filtered.length}`
                : phoneTo < filtered.length ? `Showing ${phoneTo} of ${filtered.length}` : `All ${filtered.length} reviews shown`}</span>
            </div>
          )}
          </div>
        </div>

        {/* Right rail — Google summary (desktop); below 1024px only the review-link settings show, below the list. */}
        <div className="rv-panel rv-rail">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <GoogleG size={26} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>Google Reviews</span>
          </div>
          <div className="rv-rail-stats">
            <Stars n={Math.round(avg)} size={22} />
            {reviews.length > 0 ? (
              <>
                {companyName && <p style={{ margin: '12px 0 4px', fontWeight: 800, fontSize: 15 }}>{companyName}</p>}
                <p style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 800, color: '#16a34a' }}>
                  {avg.toFixed(1)} Star &nbsp;|&nbsp; {reviews.length} Reviews
                </p>
                <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                  Your business has received <strong>{reviews.length}</strong> reviews and on average a <strong>{avg.toFixed(1)} star</strong> rating for the services.
                </p>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>Replied</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>{repliedCount}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                    <span style={{ fontSize: 13, color: 'var(--slate)' }}>Yet to reply</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: pendingCount ? '#dc2626' : 'var(--ink)' }}>{pendingCount}</span>
                  </div>
                </div>
              </>
            ) : (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                Connect Google and sync to see your ratings here.
              </p>
            )}
          </div>
          <a href="/admin/crm-settings/channels/google-reviews"
            style={{ display: 'block', textAlign: 'center', marginTop: 16, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontWeight: 700, fontSize: 13 }}>
            Manage Connected Accounts
          </a>

          {/* Google review link — powers the Google mark on each review card and
              is the link customers tap in a review request. */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Google review link</p>
            <input value={reviewLink} onChange={e => { setReviewLink(e.target.value); setLinkSaved(false) }}
              placeholder="https://g.page/r/…" aria-label="Google review link" className="rv-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            <button onClick={saveReviewLink} disabled={savingLink} className="rv-btn rv-btn-ghost" style={{ width: '100%', marginTop: 8 }}>
              {savingLink ? 'Saving…' : linkSaved ? <>{Icon.check} Saved</> : 'Save link'}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.45 }}>
              Opens your listing from each review's Google mark. Find it in your Business Profile → “Ask for reviews”.
            </p>
          </div>
        </div>
      </div>

      {/* Filters sheet (phones) */}
      {sheetOpen && (
        <div className="rv-sheet-backdrop" onClick={() => setSheetOpen(false)}>
          <div className="rv-sheet" role="dialog" aria-modal="true" aria-labelledby="rv-sheet-title" onClick={e => e.stopPropagation()}>
            <div className="rv-sheet-grab" aria-hidden="true" />
            <div className="rv-sheet-head">
              <h2 id="rv-sheet-title">Filters</h2>
              <button type="button" className="rv-icon-btn" aria-label="Close filters" onClick={() => setSheetOpen(false)}>{Icon.x}</button>
            </div>

            <p className="rv-sheet-label">Date</p>
            <div className="rv-sheet-presets">
              {([['all', 'All time'], ...PRESETS] as const).map(([v, label]) => (
                <button key={v} type="button" className={'rv-preset' + (draft.preset === v ? ' on' : '')} aria-pressed={draft.preset === v}
                  onClick={() => setDraft(d => ({ ...d, preset: v, ...presetRange(v) }))}>{label}</button>
              ))}
            </div>
            <div className="rv-sheet-dates">
              <label className="rv-sheet-field">From
                <input type="date" className="rv-input" value={draft.dateFrom} max={draft.dateTo || undefined}
                  onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value, preset: presetFor('custom', e.target.value, d.dateTo) }))} />
              </label>
              <label className="rv-sheet-field">To
                <input type="date" className="rv-input" value={draft.dateTo} min={draft.dateFrom || undefined}
                  onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value, preset: presetFor('custom', d.dateFrom, e.target.value) }))} />
              </label>
            </div>

            <p className="rv-sheet-label">Rating and replies</p>
            <div className="rv-sheet-dates" style={{ marginTop: 0 }}>
              <label className="rv-sheet-field">Rating
                <select className="rv-input" value={draft.rating} onChange={e => setDraft(d => ({ ...d, rating: Number(e.target.value) }))}>
                  <option value={0}>All ratings</option>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
                </select>
              </label>
              <label className="rv-sheet-field">Replies
                <select className="rv-input" value={draft.replies} onChange={e => setDraft(d => ({ ...d, replies: e.target.value as Replies }))}>
                  <option value="all">All replies</option>
                  <option value="replied">Replied</option>
                  <option value="unreplied">Not replied</option>
                </select>
              </label>
            </div>

            <div className="modal-sticky-foot">
              <button type="button" className="rv-btn rv-btn-ghost" onClick={() => setDraft(NO_FILTERS)}>Clear all</button>
              <button type="button" className="rv-btn rv-btn-primary" onClick={() => { applyFilters(draft); setSheetOpen(false) }}>
                Show {draftCount} review{draftCount === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link-to-customer modal */}
      {linkFor && (
        <div className="rv-linkmodal" onClick={() => setLinkFor(null)}>
          <div className="rv-linkmodal-panel" role="dialog" aria-modal="true" aria-label="Match to a customer" onClick={e => e.stopPropagation()}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Match to a customer</h3>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: linkFor.contact_id ? 'var(--peach)' : '#f3f4f6', color: linkFor.contact_id ? 'var(--coral)' : 'var(--slate)' }}>
                    {linkFor.contact_id ? 'Matched' : 'Not matched'}
                  </span>
                  <button type="button" className="rv-icon-btn" style={{ width: 32, height: 32 }} aria-label="Close" onClick={() => setLinkFor(null)}>{Icon.x}</button>
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
                Review by <strong>{linkFor.reviewer_name}</strong>
                {linkFor.match_checked_at ? ` · last checked ${fullDate(linkFor.match_checked_at)}` : ''}
              </p>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search customers…" aria-label="Search customers" className="rv-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
              {linkFor.contact_id && (
                <button onClick={() => setLink(linkFor, null)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {Icon.x} Remove current link
                </button>
              )}
              {contactLoading && contactResults.length === 0 ? (
                <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>Searching customers…</p>
              ) : (() => {
                const list = contactResults
                if (list.length === 0) return <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>No customers found{contactSearch.trim() ? ` for “${contactSearch.trim()}”` : ''}.</p>
                return list.map(c => (
                  <button key={c.id} onClick={() => setLink(linkFor, c)}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: 'none', background: linkFor.contact_id === c.id ? 'var(--peach)' : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}
                    onMouseEnter={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'var(--canvas)') }}
                    onMouseLeave={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'transparent') }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || 'Unnamed'}</span>
                      {c.email && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>}
                    </span>
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
