'use client'

// Shared bits for the Jobs & quotes screens (app/admin/jobs/*): the
// workspace, the API helper, status pills, dates in the business's time zone,
// a dialog, a toast and the styles that sit on top of AdminKit's ak-* pieces.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveCompanyUser, peekCompanyUser, readStored, writeStored, writeCache } from '@/lib/client-cache'
import { api as apiCall } from '@/components/booking/admin/shared'
import { JOB_STATUS_LABEL, JOB_STATUS_TONE, QUOTE_STATUS_LABEL, QUOTE_STATUS_TONE, type JobStatus, type QuoteStatus } from '@/lib/jobs/status'
export { api } from '@/components/booking/admin/shared'

/**
 * The workspace the signed-in person is working in. Known straight away when
 * the admin layout has already worked it out (peekCompanyUser), so pages can
 * start loading on their first render.
 */
export function useJobsCompany(): { companyId: string; ready: boolean } {
  const router = useRouter()
  const [s, setS] = useState(() => {
    const peek = peekCompanyUser()
    return peek?.companyId ? { companyId: peek.companyId, ready: true } : { companyId: '', ready: false }
  })
  useEffect(() => {
    if (s.ready) return
    let live = true
    ;(async () => {
      const { companyId: cidRaw, user } = await resolveCompanyUser()
      if (!user) { router.push('/signin'); return }
      let cid = cidRaw
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
      }
      if (live) setS({ companyId: cid || '', ready: true })
    })()
    return () => { live = false }
  }, [router, s.ready])
  return s
}

// ── Last-seen data, shown instantly while a fresh copy loads ───────────────
// Going back to the board or reopening a job paints at once instead of a
// skeleton; the server's answer replaces it a moment later. The board (one
// entry per workspace) is also kept in this browser so a fresh page load paints
// straight away; single jobs and quotes stay in the bounded in-memory cache so
// browser storage doesn't fill up with every job ever opened. All of it is
// cleared on sign-out (lib/client-cache).
export const cacheKeys = {
  list: (cid: string) => `jobs:list:${cid}`,
  job: (cid: string, id: string) => `jobs:job:${cid}:${id}`,
  quote: (cid: string, id: string) => `jobs:quote:${cid}:${id}`,
}
export const readJobsCache = <T = any>(key: string) => readStored<T>(key)
export const writeJobsCache = (key: string, v: any) => {
  try { if (key.startsWith('jobs:list:')) writeStored(key, v); else writeCache(key, v) } catch {}
}

const inflight = new Map<string, Promise<any>>()
/** Fetch into the cache ahead of a click (hovering a card, a quote row). */
export function prefetchInto(key: string, url: string) {
  if (inflight.has(key) || readStored(key)) return
  const p = apiCall(url).then(d => { writeJobsCache(key, d); return d }).catch(() => null).finally(() => inflight.delete(key))
  inflight.set(key, p)
}
export const prefetchJob = (cid: string, id: string) => prefetchInto(cacheKeys.job(cid, id), `/api/jobs/${id}?companyId=${cid}`)
export const prefetchQuote = (cid: string, id: string) => prefetchInto(cacheKeys.quote(cid, id), `/api/jobs/quotes/${id}?companyId=${cid}`)

export function StatusTag({ status }: { status: string }) {
  const s = status as JobStatus
  return <span className={`ak-tag ${JOB_STATUS_TONE[s] || ''}`}>{JOB_STATUS_LABEL[s] || status}</span>
}
export function QuoteTag({ status, expired }: { status: string; expired?: boolean }) {
  const s = status as QuoteStatus
  if (expired && s === 'sent') return <span className="ak-tag red">Expired</span>
  return <span className={`ak-tag ${QUOTE_STATUS_TONE[s] || ''}`}>{QUOTE_STATUS_LABEL[s] || status}</span>
}

// ── Dates (shown in the business's time zone) ───────────────────────────────

export const dayKeyIn = (iso: string | Date, tz: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)) } catch { return String(iso).slice(0, 10) }
}
export const fmtDay = (iso: string | null | undefined, tz: string) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso)) } catch { return '' }
}
export const fmtTime = (iso: string | null | undefined, tz: string) => {
  if (!iso) return ''
  try { return new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)).replace(' ', '').toLowerCase() } catch { return '' }
}
export const fmtWhen = (start: string | null | undefined, end: string | null | undefined, tz: string) => {
  if (!start) return ''
  const day = fmtDay(start, tz), t1 = fmtTime(start, tz)
  if (!end) return `${day}, ${t1}`
  return dayKeyIn(start, tz) === dayKeyIn(end, tz) ? `${day}, ${t1}–${fmtTime(end, tz)}` : `${day}, ${t1} – ${fmtDay(end, tz)}, ${fmtTime(end, tz)}`
}
/** A plain date ("2026-11-20") as "Fri 20 Nov 2026". */
export const fmtDate = (ymd: string | null | undefined) => {
  if (!ymd) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return ''
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}
export const fmtAgo = (iso: string | null | undefined) => {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}
/** DateTimeField's local "YYYY-MM-DDTHH:mm" ↔ an ISO time. */
const pad = (n: number) => String(n).padStart(2, '0')
export const isoToLocal = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}` : ''
}
export const localToIso = (v: string) => { if (!v) return null; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toISOString() : null }

export const newKey = () => {
  try { return crypto.randomUUID() } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` }
}

// ── Dialog and toast ────────────────────────────────────────────────────────

export function Dialog({ title, onClose, children, footer, width = 520 }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; width?: number }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="jb-ov" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="jb-dlg" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="jb-dlg-h">
          <h2>{title}</h2>
          <button type="button" className="ak-icon-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="jb-dlg-b">{children}</div>
        {footer && <div className="jb-dlg-f">{footer}</div>}
      </div>
    </div>
  )
}

export function useToast(): [string, (m: string) => void] {
  const [t, setT] = useState('')
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(''), 4200); return () => clearTimeout(id) }, [t])
  return [t, setT]
}
export const Toast = ({ text }: { text: string }) => (text ? <div className="jb-toast" role="status">{text}</div> : null)

export function SetupNote({ text }: { text: string }) {
  return (
    <div className="ak-note warn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
      <span>{text}</span>
    </div>
  )
}

export const Icon = {
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>,
  gear: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  dots: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>,
  pin: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></svg>,
  clock: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  user: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>,
  doc: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>,
  link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>,
  send: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></svg>,
  trash: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>,
  ext: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6" /><path d="M10 14 21 3" /></svg>,
  chev: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>,
  play: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>,
  pause: <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4.2" height="14" rx="1.2" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  camera: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l1.6-2.4A1.5 1.5 0 0 1 9.85 5h4.3a1.5 1.5 0 0 1 1.25.6L17 8h3a1 1 0 0 1 1 1v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.6" /></svg>,
  pen: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>,
  people: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.2A6.5 6.5 0 0 1 21.5 20" /></svg>,
  warn: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>,
}

// ── Answers with their body, for the 409s the field screens act on ──────────
// (a clash to confirm, a signature to collect).
export async function apiRaw(path: string, init?: RequestInit & { json?: any }): Promise<{ ok: boolean; status: number; data: any }> {
  const { data: sess } = await supabase.auth.getSession()
  const t = sess?.session?.access_token
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(init?.headers || {}) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

/** Upload a file to this job's own folder; returns its public URL. */
export async function putJobFile(companyId: string, jobId: string, file: File | Blob, name = 'file'): Promise<string> {
  const { data: sess } = await supabase.auth.getSession()
  const t = sess?.session?.access_token
  const fd = new FormData()
  fd.append('file', file instanceof File ? file : new File([file], name, { type: file.type || 'application/octet-stream' }))
  fd.append('prefix', `chat-attachments/${companyId}/jobs/${jobId}`)
  const res = await fetch('/api/storage/put', { method: 'POST', body: fd, headers: t ? { Authorization: `Bearer ${t}` } : {} })
  const d = await res.json().catch(() => ({}))
  if (!res.ok || !d?.url) throw new Error(d?.error || (res.status === 413 ? 'That file is too large.' : 'Upload failed. Please try again.'))
  return d.url as string
}

// ── People ──────────────────────────────────────────────────────────────────
const AV_TONES = ['#4f6bed', '#13a07e', '#e26d3d', '#9b5de5', '#d6457a', '#2a9d8f', '#c08a1e', '#5a6acf']
export const initialsOf = (name: string) => (String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase()
const toneOf = (id: string) => { let h = 0; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV_TONES[h % AV_TONES.length] }
export function Avatar({ id, name, url, size = 28, ring }: { id: string; name: string; url?: string | null; size?: number; ring?: boolean }) {
  const st: React.CSSProperties = { width: size, height: size, fontSize: Math.round(size * 0.4), background: url ? undefined : toneOf(id), boxShadow: ring ? '0 0 0 2px var(--card,#fff)' : undefined }
  return url
    ? <img className="jb-av" src={url} alt="" width={size} height={size} style={st} title={name} />
    : <span className="jb-av" style={st} title={name} aria-hidden>{initialsOf(name)}</span>
}
export function AvatarStack({ people, max = 3, size = 24 }: { people: { id: string; name: string; avatar_url?: string | null }[]; max?: number; size?: number }) {
  if (!people?.length) return null
  const shown = people.slice(0, max)
  return (
    <span className="jb-avs" aria-label={people.map(p => p.name).join(', ')}>
      {shown.map(p => <Avatar key={p.id} id={p.id} name={p.name} url={p.avatar_url} size={size} ring />)}
      {people.length > max && <span className="jb-av jb-av-more" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>+{people.length - max}</span>}
    </span>
  )
}

export const JB_CSS = `
.jb-av{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:50%;color:#fff;font-weight:700;letter-spacing:-.02em;object-fit:cover;user-select:none}
.jb-avs{display:inline-flex;align-items:center}
.jb-avs .jb-av+.jb-av{margin-left:-7px}
.jb-av-more{background:var(--f2,#e4e4e7);color:var(--ink)}

.jb-ov{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:4vh 12px;background:rgba(15,15,20,.38);overflow-y:auto;animation:jbFade .18s ease both}
.jb-dlg{width:100%;max-height:92vh;display:flex;flex-direction:column;border-radius:24px;background:var(--card,#fff);color:var(--ink);box-shadow:0 24px 64px rgba(0,0,0,.24);animation:jbIn .32s cubic-bezier(.22,1,.36,1) both}
.jb-dlg-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 6px}
.jb-dlg-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.03em}
.jb-dlg-b{padding:10px 20px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.jb-dlg-f{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;box-shadow:0 -1px 0 var(--line,#ececee)}
.jb-dlg{--f:#f4f4f5;--f2:#ececef;--line:#ececee;--mut:#71717a;--soft:#8e8e93}
[data-theme="dark"] .jb-dlg{--f:#2a2a2e;--f2:#333337;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
.jb-dlg .ak-field,.jb-dlg .ak-select{width:100%;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid transparent;background-color:var(--f);outline:none;font:inherit;font-size:14.5px;color:var(--ink);box-sizing:border-box}
.jb-dlg textarea.ak-field{height:auto;min-height:96px;padding:11px 14px;line-height:1.5;resize:vertical}
.jb-dlg .ak-field:focus{background-color:var(--card,#fff);border-color:var(--f2)}
.jb-dlg .ak-label{display:block;margin:0 0 7px;font-size:13px;font-weight:650}
.jb-dlg .ak-hint{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--soft)}
@media(max-width:600px){.jb-ov{padding:0;align-items:flex-end}.jb-dlg{border-radius:24px 24px 0 0;max-height:94dvh;animation-name:jbUp}}
@keyframes jbFade{from{opacity:0}to{opacity:1}}
@keyframes jbIn{from{opacity:0;transform:translate3d(0,12px,0) scale(.98)}to{opacity:1;transform:none}}
@keyframes jbUp{from{transform:translate3d(0,100%,0)}to{transform:none}}
.jb-toast{position:fixed;left:50%;bottom:28px;z-index:1100;transform:translateX(-50%);max-width:min(92vw,460px);padding:11px 18px;border-radius:999px;background:var(--ink);color:var(--card,#fff);font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,.2);animation:jbIn .3s cubic-bezier(.22,1,.36,1) both}
.jb-two{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}
.jb-side{position:sticky;top:16px;display:flex;flex-direction:column;gap:14px}
.jb-side>.ak-panel{margin:0}
@media(max-width:1000px){.jb-two{grid-template-columns:minmax(0,1fr)}.jb-side{position:static}}
.jb-kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px 14px;font-size:14px}
.jb-kv dt{color:var(--mut)}
.jb-kv dd{margin:0;min-width:0;overflow-wrap:anywhere}
.jb-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:var(--mut)}
.jb-meta span{display:inline-flex;align-items:center;gap:5px;min-width:0}
.jb-num{font-variant-numeric:tabular-nums}
.jb-menu{position:absolute;z-index:60;min-width:200px;padding:6px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 16px 40px rgba(0,0,0,.16);animation:jbIn .2s cubic-bezier(.22,1,.36,1) both}
.jb-menu button{display:flex;align-items:center;gap:9px;width:100%;padding:9px 11px;border:none;border-radius:11px;background:none;font:inherit;font-size:14px;font-weight:550;color:var(--ink);text-align:left;cursor:pointer}
.jb-menu button:hover,.jb-menu button:focus-visible{background:var(--f)}
.jb-menu button.danger{color:#b91c1c}
.jb-menu .jb-menu-l{padding:6px 11px 4px;font-size:11.5px;font-weight:650;letter-spacing:.02em;text-transform:uppercase;color:var(--soft)}
.jb-pre{white-space:pre-wrap;font-size:14px;line-height:1.6;color:var(--ink);margin:0}
.jb-muted{color:var(--mut)}
`
