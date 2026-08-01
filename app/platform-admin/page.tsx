'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import LegalAdminPage from '../admin/legal/page'
import PlatformBannerAdmin from '@/components/PlatformBannerAdmin'
import { SmsPricing, DEFAULT_PRICING, calculateCost, aud, audRate, parsePricingRow } from '@/lib/sms-pricing'
import { PLAN_FEATURES, PLAN_LIMITS, OVERRIDABLE_FEATURES, OVERRIDABLE_LIMITS, Plan } from '@/lib/plan'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

// The URL of the platform console. It lives at the bare host — the root
// redirects/rewrites to the panel, while the explicit /platform-admin path
// 404s — so every "back to the console" navigation must target the root.
const PLATFORM_HOME = 'https://admin.colvy.com'

// Open a company workspace WITHOUT its login screen. Supabase sessions live in
// per-origin localStorage, so the super admin's session on admin.colvy.com does
// not exist on {slug}.colvy.com — visiting it directly shows that workspace's
// sign-in page. /auth/handoff calls setSession() with the super admin's OWN
// tokens on the target origin, then forwards to `next`. The admin layout already
// grants the super admin access to any company, so this lands straight inside.
async function enterWorkspace(slug: string, next: string = '/admin') {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const at = session?.access_token, rt = session?.refresh_token
    if (at && rt) {
      window.open(`https://${slug}.colvy.com/auth/handoff#access_token=${encodeURIComponent(at)}&refresh_token=${encodeURIComponent(rt)}&next=${encodeURIComponent(next)}`, '_blank')
      return
    }
  } catch {}
  window.open(`https://${slug}.colvy.com${next}`, '_blank')
}

// Record an impersonation session (audit trail) and THEN enter the workspace,
// landing on /admin?imp=<id> so the banner shows. Used by both the full
// "Enter workspace" flow and the quick "Login as" button, so every admin entry
// is logged. Returns an error string the caller can surface.
async function auditedEnterWorkspace(
  co: { id?: string; slug: string; name?: string },
  reason: string, mode: string = 'full', minutes: number = 60
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/platform-admin/impersonate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ action: 'start', companyId: co.id, slug: co.slug, name: co.name, reason, mode, minutes }),
    })
    const d = await res.json()
    if (!res.ok) return { ok: false, error: d.error || 'Could not start session' }
    await enterWorkspace(co.slug, `/admin?imp=${d.id}`)
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Could not start session' }
  }
}

// ── Icons ──────────────────────────────────────────────────────────────────
const I = {
  overview:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  companies:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  users:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  subs:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  analytics:  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  ideas:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.76-1.58 5.16-3.9 6.37L15 17H9l-.1-1.63A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="17" x2="14.5" y2="17"/></svg>,
  roadmap:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  announce:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>,
  help:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  chat:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  tickets:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  moderation: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  billing:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  flags:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
  system:     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  audit:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  settings:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  search:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  sun:        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  chevron:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>,
  check:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>,
  x:          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  arrow_up:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>,
  arrow_down: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>,
  external:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
  copy:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  refresh:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  alert:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
}

const NAV = [
  { key: 'overview',   label: 'Overview',        icon: 'overview' },
  { section: 'Workspace' },
  { key: 'companies',  label: 'Companies',        icon: 'companies' },
  { key: 'users',      label: 'Users',            icon: 'users' },
  { key: 'subs',       label: 'Subscriptions',    icon: 'subs' },
  { key: 'analytics',  label: 'Analytics',        icon: 'analytics' },
  { section: 'Content' },
  { key: 'ideas',      label: 'Ideas',            icon: 'ideas' },
  { key: 'roadmap',    label: 'Roadmaps',         icon: 'roadmap' },
  { key: 'announce',   label: 'Announcements',    icon: 'announce' },
  { key: 'help',       label: 'Help Center',      icon: 'help' },
  { key: 'legal',      label: 'Legal Pages',      icon: 'audit' },
  { key: 'banner',     label: 'Product Banner',   icon: 'announce' },
  { section: 'Support' },
  { key: 'chat',       label: 'Live Chat',        icon: 'chat' },
  { key: 'tickets',    label: 'Support Tickets',  icon: 'tickets' },
  { key: 'moderation', label: 'Moderation',       icon: 'moderation' },
  { section: 'Operations' },
  { key: 'imp',        label: 'Impersonation',    icon: 'audit' },
  { key: 'calls',      label: 'Call Diagnostics', icon: 'chat' },
  { key: 'webhooks',   label: 'Webhook Explorer', icon: 'system' },
  { key: 'jobs',       label: 'Background Jobs',  icon: 'system' },
  { key: 'apilogs',    label: 'API Logs',         icon: 'audit' },
  { key: 'devices',    label: 'Mobile Devices',   icon: 'users' },
  { key: 'integrations', label: 'Integrations',   icon: 'system' },
  { section: 'Platform' },
  { key: 'sms',        label: 'SMS Pricing',      icon: 'billing' },
  { key: 'billing',    label: 'Billing',          icon: 'billing' },
  { key: 'flags',      label: 'Feature Flags',    icon: 'flags' },
  { key: 'system',     label: 'System Health',    icon: 'system' },
  { key: 'audit',      label: 'Audit Logs',       icon: 'audit' },
  { key: 'settings',   label: 'Settings',         icon: 'settings' },
]

// ── Mini sparkline ─────────────────────────────────────────────────────────
function Spark({ data, color = '#ff7a6b', h = 36 }: { data: number[]; color?: string; h?: number }) {
  const max = Math.max(...data, 1), min = Math.min(...data)
  const w = 80
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
    </svg>
  )
}

// ── Bar chart ──────────────────────────────────────────────────────────────
function MiniBar({ data, color = '#ff7a6b' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 60 }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <div style={{ width: '100%', background: color, borderRadius: '3px 3px 0 0', height: `${(d.value / max) * 52}px`, opacity: 0.8 + (i / data.length) * 0.2, transition: 'height 0.5s ease' }} />
          <span style={{ fontSize: 9, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ───────────────────────────────────────────────────────────────
function KPI({ label, value, sub, trend, color = '#ff7a6b', spark }: any) {
  const up = trend > 0
  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        {spark && <Spark data={spark} color={color} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--sa-text)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {trend !== undefined && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, fontWeight: 600, color: up ? '#10b981' : '#ef4444', background: up ? '#d1fae5' : '#fee2e2', padding: '2px 7px', borderRadius: 999 }}>
            <span style={{ color: up ? '#10b981' : '#ef4444' }}>{up ? I.arrow_up : I.arrow_down}</span>
            {Math.abs(trend)}%
          </span>
        )}
        {sub && <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{sub}</span>}
      </div>
    </div>
  )
}

// ── Status badge ────────────────────────────────────────────────────────────
function Badge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    active:    ['#10b981', '#d1fae5'], trial: ['#6366f1', '#e0e7ff'],
    suspended: ['#ef4444', '#fee2e2'], free:  ['#6b7280', '#f3f4f6'],
    paid:      ['#f59e0b', '#fef3c7'], churned: ['#ef4444', '#fee2e2'],
    healthy:   ['#10b981', '#d1fae5'], degraded: ['#f59e0b', '#fef3c7'],
    down:      ['#ef4444', '#fee2e2'], open: ['#6366f1', '#e0e7ff'],
    closed:    ['#10b981', '#d1fae5'], pending: ['#f59e0b', '#fef3c7'],
    enabled:   ['#10b981', '#d1fae5'], disabled: ['#6b7280', '#f3f4f6'],
  }
  const [c, bg] = map[status] || ['#6b7280', '#f3f4f6']
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: bg, color: c, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{status}</span>
}

// ── Progress bar ────────────────────────────────────────────────────────────
function Progress({ value, max = 100, color = '#ff7a6b', label }: { value: number; max?: number; color?: string; label?: string }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div>
      {label && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text)' }}>{pct.toFixed(0)}%</span>
      </div>}
      <div style={{ height: 6, borderRadius: 999, background: 'var(--sa-border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : color, borderRadius: 999, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

// ── Toggle ──────────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} style={{ width: 40, height: 22, borderRadius: 999, background: on ? '#10b981' : 'var(--sa-border)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: on ? 21 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )
}

// ── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', marginBottom: sub ? 4 : 0, letterSpacing: '-0.01em' }}>{title}</h1>
        {sub && <p style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{sub}</p>}
      </div>
      {action}
    </div>
  )
}

// ── Search input ────────────────────────────────────────────────────────────
function SearchBar({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
      <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-muted)' }}>{I.search}</div>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const }} />
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE COMPONENTS
// ══════════════════════════════════════════════════════════════════════════════

// Business detail — a deep-dive drawer for one company with tabs. Uses only
// real data (company row, team_members, company_admin_notes).
function BusinessDetail({ co, onClose, onAction }: { co: any; onClose: () => void; onAction: (type: string, co: any) => void }) {
  const [tab, setTab] = useState('overview')
  const [users, setUsers] = useState<any[] | null>(null)
  const [notes, setNotes] = useState<any[] | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [noteCat, setNoteCat] = useState('general')
  const [savingNote, setSavingNote] = useState(false)
  const [notesMissing, setNotesMissing] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await (supabase as any).from('team_members').select('*').eq('company_id', co.id)
      if (active) setUsers(data || [])
    })()
    return () => { active = false }
  }, [co.id])

  const loadNotes = async () => {
    const { data, error } = await (supabase as any).from('company_admin_notes').select('*')
      .eq('company_id', co.id).order('pinned', { ascending: false }).order('created_at', { ascending: false })
    if (error) { if (/does not exist|schema cache/i.test(error.message)) setNotesMissing(true); setNotes([]) }
    else { setNotesMissing(false); setNotes(data || []) }
  }
  useEffect(() => { loadNotes() }, [co.id])

  const addNote = async () => {
    if (!noteBody.trim() || savingNote) return
    setSavingNote(true)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await (supabase as any).from('company_admin_notes').insert({
      company_id: co.id, author_id: session?.user?.id || null, author_email: session?.user?.email || null,
      body: noteBody.trim(), category: noteCat,
    })
    setSavingNote(false)
    if (error) { if (/does not exist|schema cache/i.test(error.message)) setNotesMissing(true); return }
    setNoteBody(''); loadNotes()
  }
  const togglePin = async (n: any) => { await (supabase as any).from('company_admin_notes').update({ pinned: !n.pinned }).eq('id', n.id); loadNotes() }
  const delNote = async (n: any) => { await (supabase as any).from('company_admin_notes').delete().eq('id', n.id); loadNotes() }

  // ── Subscription management (change plan, trial, complimentary) ─────────────
  const [sub, setSub] = useState({
    plan: co.plan || 'free',
    trial_ends_at: co.trial_ends_at || '',
    is_complimentary: !!co.is_complimentary,
    complimentary_reason: co.complimentary_reason || '',
  })
  const [savingSub, setSavingSub] = useState('')
  const [subMsg, setSubMsg] = useState('')
  const subErr = (e: any) => setSubMsg(/does not exist|schema cache|column/i.test(e?.message || '') ? 'Run COLVY_V221_COMPANY_SUBSCRIPTION_FIELDS.sql, then reload.' : (e?.message || 'Could not save'))
  // Every subscription change is recorded as an admin note so it shows in Audit Logs.
  const auditChange = async (body: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await (supabase as any).from('company_admin_notes').insert({
        company_id: co.id, author_id: session?.user?.id || null, author_email: session?.user?.email || null,
        body, category: 'billing',
      })
    } catch {}
    loadNotes()
  }
  const applyPlan = async (newPlan: string) => {
    if (newPlan === sub.plan) return
    setSavingSub('plan'); setSubMsg('')
    const { error } = await (supabase as any).from('companies').update({ plan: newPlan, plan_changed_at: new Date().toISOString() }).eq('id', co.id)
    setSavingSub('')
    if (error) { subErr(error); return }
    co.plan = newPlan; setSub(s => ({ ...s, plan: newPlan }))
    await auditChange(`Changed plan: ${sub.plan} → ${newPlan}`)
    setSubMsg(`Plan set to ${newPlan}.`)
  }
  const extendTrial = async (days: number) => {
    const base = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : Date.now()
    const end = new Date(Math.max(base, Date.now()) + days * 86400000).toISOString()
    setSavingSub('trial'); setSubMsg('')
    const upd: any = { trial_ends_at: end }
    if (sub.plan !== 'trial') upd.plan = 'trial'
    const { error } = await (supabase as any).from('companies').update(upd).eq('id', co.id)
    setSavingSub('')
    if (error) { subErr(error); return }
    co.trial_ends_at = end; if (upd.plan) co.plan = upd.plan
    setSub(s => ({ ...s, trial_ends_at: end, plan: upd.plan || s.plan }))
    await auditChange(`Extended trial by ${days} days → ${new Date(end).toLocaleDateString()}`)
    setSubMsg(`Trial now ends ${new Date(end).toLocaleDateString()}.`)
  }
  const toggleComp = async () => {
    const next = !sub.is_complimentary
    if (next && !sub.complimentary_reason.trim()) { setSubMsg('A reason is required to comp an account.'); return }
    setSavingSub('comp'); setSubMsg('')
    const { error } = await (supabase as any).from('companies').update({
      is_complimentary: next, complimentary_reason: next ? sub.complimentary_reason.trim() : null,
    }).eq('id', co.id)
    setSavingSub('')
    if (error) { subErr(error); return }
    co.is_complimentary = next; setSub(s => ({ ...s, is_complimentary: next }))
    await auditChange(next ? `Marked complimentary — ${sub.complimentary_reason.trim()}` : 'Removed complimentary status')
    setSubMsg(next ? 'Account marked complimentary.' : 'Complimentary status removed.')
  }

  // ── Entitlements & limits overrides ────────────────────────────────────────
  // features/limits maps hold ONLY explicit overrides; an absent key = plan default.
  const [entFeatures, setEntFeatures] = useState<Record<string, boolean>>({})
  const [entLimits, setEntLimits] = useState<Record<string, any>>({})
  const [entReason, setEntReason] = useState('')
  const [entLoaded, setEntLoaded] = useState(false)
  const [entMissing, setEntMissing] = useState(false)
  const [savingEnt, setSavingEnt] = useState(false)
  const [entMsg, setEntMsg] = useState('')
  useEffect(() => {
    ;(async () => {
      const { data, error } = await (supabase as any).from('company_entitlements').select('*').eq('company_id', co.id).maybeSingle()
      if (error) { if (/does not exist|schema cache/i.test(error.message)) setEntMissing(true) }
      else if (data) { setEntFeatures(data.features || {}); setEntLimits(data.limits || {}); setEntReason(data.reason || '') }
      setEntLoaded(true)
    })()
  }, [co.id])
  const planKey = (co.plan || 'free') as Plan
  const planHasFeature = (k: string) => {
    const f = PLAN_FEATURES[planKey] || []
    return planKey === 'enterprise' || f.includes('*') || f.includes(k)
  }
  const planLimit = (k: string) => (PLAN_LIMITS[planKey] || {})[k]
  const fmtLimit = (v: any) => v === Infinity || v === 'unlimited' ? 'unlimited' : (v == null ? '—' : String(v))
  const saveEnt = async () => {
    if (!entReason.trim()) { setEntMsg('A reason is required (audited).'); return }
    setSavingEnt(true); setEntMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await (supabase as any).from('company_entitlements').upsert({
      company_id: co.id, features: entFeatures, limits: entLimits, reason: entReason.trim(),
      updated_by: session?.user?.email || null, updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })
    setSavingEnt(false)
    if (error) { setEntMsg(/does not exist|schema cache/i.test(error.message) ? 'Run COLVY_V222_COMPANY_ENTITLEMENTS.sql, then reload.' : error.message); return }
    const fCount = Object.keys(entFeatures).length, lCount = Object.keys(entLimits).length
    await auditChange(`Updated entitlements (${fCount} feature + ${lCount} limit override${fCount + lCount === 1 ? '' : 's'}) — ${entReason.trim()}`)
    setEntMsg('Overrides saved.')
  }

  // Simple account-health heuristic from real signals.
  const ageDays = co.created_at ? (Date.now() - new Date(co.created_at).getTime()) / 86400000 : 0
  const plan = String(co.plan || '').toLowerCase()
  let health = 100
  if (plan === 'suspended') health -= 60
  if (plan === 'trial' && ageDays > 21) health -= 25
  if ((users?.length || 0) === 0) health -= 20
  if (plan === 'free' && ageDays > 45) health -= 10
  health = Math.max(0, Math.min(100, health))
  const healthColor = health >= 75 ? '#10b981' : health >= 45 ? '#f59e0b' : '#ef4444'

  const catColor: Record<string, string> = { general: '#6366f1', billing: '#10b981', support: '#f59e0b', technical: '#0891b2', risk: '#ef4444' }
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  const TABS = [['overview', 'Overview'], ['plan', 'Subscription'], ['ent', 'Entitlements'], ['users', `Users${users ? ` (${users.length})` : ''}`], ['notes', `Notes${notes ? ` (${notes.length})` : ''}`], ['danger', 'Danger Zone']]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: co.accent_color || '#ff7a6b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{co.name?.[0]?.toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{co.name}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{co.slug}.colvy.com · {plan || 'free'}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: healthColor, padding: '3px 10px', borderRadius: 999, background: healthColor + '22' }}>{health}/100</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        {/* action bar */}
        <div style={{ display: 'flex', gap: 8, padding: '12px 20px', borderBottom: '1px solid var(--sa-border)', flexWrap: 'wrap' }}>
          <button onClick={() => onAction('impersonate', co)} style={paBtn('#ff7a6b', true)}>Enter workspace</button>
          <a href={`https://${co.slug}.colvy.com`} target="_blank" rel="noopener" style={{ ...paBtn(), textDecoration: 'none' }}>View public</a>
          {plan === 'suspended'
            ? <button onClick={() => { onAction('reactivate', co); onClose() }} style={paBtn()}>Reactivate</button>
            : <button onClick={() => { onAction('suspend', co); onClose() }} style={paBtn('#ef4444')}>Suspend</button>}
        </div>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid var(--sa-border)' }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 12px', borderRadius: '8px 8px 0 0', border: 'none', borderBottom: tab === k ? '2px solid #ff7a6b' : '2px solid transparent', background: 'transparent', color: tab === k ? 'var(--sa-text)' : 'var(--sa-muted)', fontSize: 13, fontWeight: tab === k ? 700 : 500, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'overview' && (
            <div>
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: healthColor + '18', border: `1px solid ${healthColor}44` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: healthColor }}>Account health {health}/100</span>
                <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', marginLeft: 8 }}>{plan === 'suspended' ? 'Suspended' : (users?.length || 0) === 0 ? 'No team members yet' : 'Looking healthy'}</span>
              </div>
              <Row k="Business name" v={co.name} />
              <Row k="Slug" v={co.slug} />
              <Row k="Plan" v={(sub.plan || 'free') + (sub.is_complimentary ? ' · complimentary' : '')} />
              <Row k="Trial ends" v={sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : '—'} />
              <Row k="Industry" v={co.industry} />
              <Row k="Owner ID" v={co.owner_id} />
              <Row k="Business email" v={co.business_email} />
              <Row k="Business mobile" v={co.business_mobile} />
              <Row k="Website" v={co.website} />
              <Row k="Created" v={co.created_at ? new Date(co.created_at).toLocaleString() : '—'} />
              <Row k="Team members" v={users?.length ?? '…'} />
            </div>
          )}

          {tab === 'plan' && (() => {
            const PLANS = ['free', 'trial', 'pro', 'enterprise', 'suspended']
            const planColor: Record<string, string> = { free: '#6b7280', trial: '#6366f1', pro: '#10b981', enterprise: '#8b5cf6', suspended: '#ef4444' }
            const trialLeft = sub.trial_ends_at ? Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000) : null
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {subMsg && <div style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 12.5, color: 'var(--sa-text)' }}>{subMsg}</div>}

                {/* Current state */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)', background: 'var(--sa-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: planColor[sub.plan] || 'var(--sa-text)' }}>{(sub.plan || 'free').toUpperCase()}</span>
                    {sub.is_complimentary && <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: '#10b98122', color: '#10b981' }}>COMPLIMENTARY</span>}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>
                    {sub.trial_ends_at ? `Trial ends ${new Date(sub.trial_ends_at).toLocaleDateString()}${trialLeft != null ? ` (${trialLeft} day${trialLeft === 1 ? '' : 's'} left)` : ''}` : 'No trial end set'}
                    {co.stripe_customer_id ? ' · Stripe customer linked' : ' · no Stripe customer'}
                  </p>
                  {co.stripe_customer_id && <a href={`https://dashboard.stripe.com/customers/${co.stripe_customer_id}`} target="_blank" rel="noopener" style={{ fontSize: 12.5, color: '#635BFF', fontWeight: 600 }}>Open in Stripe ↗</a>}
                </div>

                {/* Change plan */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 3px' }}>Change plan</p>
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Sets the company's plan directly. Recorded in the audit log.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {PLANS.map(pl => (
                      <button key={pl} onClick={() => applyPlan(pl)} disabled={savingSub === 'plan'}
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${sub.plan === pl ? (planColor[pl] || '#ff7a6b') : 'var(--sa-border)'}`, background: sub.plan === pl ? (planColor[pl] || '#ff7a6b') + '22' : 'transparent', color: sub.plan === pl ? (planColor[pl] || '#ff7a6b') : 'var(--sa-text)', fontSize: 12.5, fontWeight: sub.plan === pl ? 700 : 500, cursor: 'pointer', textTransform: 'capitalize' }}>{pl}</button>
                    ))}
                  </div>
                </div>

                {/* Trial */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 3px' }}>Extend trial</p>
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Pushes the trial end date out and puts the account on the trial plan.</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[7, 14, 30].map(d => (
                      <button key={d} onClick={() => extendTrial(d)} disabled={savingSub === 'trial'} style={paBtn()}>+{d} days</button>
                    ))}
                  </div>
                </div>

                {/* Complimentary */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 3px' }}>Make complimentary</p>
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Flags the account as comped (e.g. partner, internal). Doesn't change the plan; a reason is required.</p>
                  {!sub.is_complimentary && (
                    <input value={sub.complimentary_reason} onChange={e => setSub(s => ({ ...s, complimentary_reason: e.target.value }))} placeholder="Reason (required)…" style={{ ...paInput, marginBottom: 8 }} />
                  )}
                  {sub.is_complimentary && sub.complimentary_reason && <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 8px' }}>Reason: {sub.complimentary_reason}</p>}
                  <button onClick={toggleComp} disabled={savingSub === 'comp'} style={paBtn(sub.is_complimentary ? '#ef4444' : '#10b981', true)}>{sub.is_complimentary ? 'Remove complimentary' : 'Mark complimentary'}</button>
                </div>
              </div>
            )
          })()}

          {tab === 'ent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0, lineHeight: 1.5 }}>Override features and usage limits for this business without changing its plan ({co.plan || 'free'}). Blank = use the plan default. Every change is audited.</p>
              {entMissing && <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 12.5, color: 'var(--sa-text)' }}>Run <b>COLVY_V222_COMPANY_ENTITLEMENTS.sql</b> to store entitlement overrides, then reload.</div>}
              {entMsg && <div style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 12.5, color: 'var(--sa-text)' }}>{entMsg}</div>}
              <input value={entReason} onChange={e => setEntReason(e.target.value)} placeholder="Reason for these overrides (required, audited)…" style={paInput} />

              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Feature overrides</p>
                <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden' }}>
                  {OVERRIDABLE_FEATURES.map((f, i) => {
                    const def = planHasFeature(f.key)
                    const ov = entFeatures[f.key]                  // undefined = default
                    const val = ov === undefined ? 'default' : (ov ? 'on' : 'off')
                    return (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--sa-text)' }}>{f.label}</span>
                        <span style={{ fontSize: 11, color: def ? '#10b981' : 'var(--sa-muted)' }}>plan: {def ? 'on' : 'off'}</span>
                        <select value={val} onChange={e => {
                          const v = e.target.value
                          setEntFeatures(prev => { const n = { ...prev }; if (v === 'default') delete n[f.key]; else n[f.key] = v === 'on'; return n })
                        }} style={{ ...paInput, width: 'auto', padding: '6px 10px' }}>
                          <option value="default">Plan default</option>
                          <option value="on">Force on</option>
                          <option value="off">Force off</option>
                        </select>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div>
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Usage-limit overrides</p>
                <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden' }}>
                  {OVERRIDABLE_LIMITS.map((l, i) => {
                    const has = entLimits[l.key] !== undefined
                    return (
                      <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                        <span style={{ flex: 1, fontSize: 13, color: 'var(--sa-text)' }}>{l.label} <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>plan: {fmtLimit(planLimit(l.key))}</span></span>
                        <select value={has ? 'custom' : 'default'} onChange={e => {
                          setEntLimits(prev => { const n = { ...prev }; if (e.target.value === 'default') delete n[l.key]; else n[l.key] = typeof planLimit(l.key) === 'number' && isFinite(planLimit(l.key)) ? planLimit(l.key) : 0; return n })
                        }} style={{ ...paInput, width: 'auto', padding: '6px 10px' }}>
                          <option value="default">Plan default</option>
                          <option value="custom">Custom</option>
                        </select>
                        {has && <input type="number" value={entLimits[l.key]} onChange={e => setEntLimits(prev => ({ ...prev, [l.key]: parseInt(e.target.value) || 0 }))} style={{ ...paInput, width: 90, padding: '6px 10px' }} />}
                      </div>
                    )
                  })}
                </div>
              </div>

              <button onClick={saveEnt} disabled={savingEnt || !entLoaded} style={{ ...paBtn('#ff7a6b', true), alignSelf: 'flex-start' }}>{savingEnt ? 'Saving…' : 'Save overrides'}</button>
            </div>
          )}

          {tab === 'users' && (
            users === null ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
            : users.length === 0 ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>No team members.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {users.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--sa-border)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{(u.email || '?')[0]?.toUpperCase()}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', margin: 0 }}>{u.email || '—'}</p>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: 0 }}>{u.role || 'member'} · {u.status || 'active'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {tab === 'notes' && (
            <div>
              {notesMissing ? (
                <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.5, padding: '10px 12px', borderRadius: 9, border: '1px solid #f59e0b55', background: '#f59e0b18' }}>Admin notes need a database update — run <b>COLVY_V216_ADMIN_NOTES.sql</b>, then reload.</p>
              ) : (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} placeholder="Add an internal note about this business…" rows={3} style={{ ...paInput, resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <select value={noteCat} onChange={e => setNoteCat(e.target.value)} style={{ ...paInput, width: 'auto', padding: '7px 10px' }}>
                        {['general', 'billing', 'support', 'technical', 'risk'].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button onClick={addNote} disabled={savingNote || !noteBody.trim()} style={{ ...paBtn('#ff7a6b', true), marginLeft: 'auto' }}>{savingNote ? 'Saving…' : 'Add note'}</button>
                    </div>
                  </div>
                  {notes === null ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p>
                  : notes.length === 0 ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>No notes yet.</p>
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {notes.map(n => (
                        <div key={n.id} style={{ padding: '11px 13px', borderRadius: 10, border: `1px solid ${n.pinned ? '#ff7a6b55' : 'var(--sa-border)'}`, background: n.pinned ? '#ff7a6b12' : 'transparent' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '1px 7px', borderRadius: 5, background: (catColor[n.category] || '#6366f1') + '22', color: catColor[n.category] || '#6366f1' }}>{n.category || 'general'}</span>
                            <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{n.author_email || 'admin'} · {new Date(n.created_at).toLocaleDateString()}</span>
                            <button onClick={() => togglePin(n)} title={n.pinned ? 'Unpin' : 'Pin'} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: n.pinned ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 13 }}>📌</button>
                            <button onClick={() => delNote(n)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 13 }}>🗑</button>
                          </div>
                          <p style={{ fontSize: 13, color: 'var(--sa-text)', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {tab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 12, border: '1px solid #ef444455', background: '#ef444410' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' }}>Suspend business</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Sets the plan to suspended. The workspace stays but is flagged.</p>
                {plan === 'suspended'
                  ? <button onClick={() => { onAction('reactivate', co); onClose() }} style={paBtn('#10b981', true)}>Reactivate</button>
                  : <button onClick={() => { onAction('suspend', co); onClose() }} style={paBtn('#ef4444', true)}>Suspend business</button>}
              </div>
              <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' }}>Seed sample data</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Clears and re-seeds example ideas for this workspace.</p>
                <button onClick={() => { onAction('seed', co); onClose() }} style={paBtn()}>Seed sample data</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Operations · Impersonation Sessions — the audit trail of admins entering
// customer workspaces (real data from impersonation_sessions).
function ImpersonationSessionsPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    ;(async () => {
      const { data, error } = await (supabase as any).from('impersonation_sessions').select('*').order('started_at', { ascending: false }).limit(200)
      if (error) { if (/does not exist|schema cache/i.test(error.message)) setMissing(true); setRows([]) }
      else setRows(data || [])
    })()
  }, [])
  const now = Date.now()
  const statusOf = (s: any) => s.ended_at ? { l: 'Ended', c: '#6b7280' } : (s.expires_at && new Date(s.expires_at).getTime() < now ? { l: 'Expired', c: '#f59e0b' } : { l: 'Active', c: '#10b981' })
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  return (
    <div>
      <SectionHeader title="Impersonation Sessions" sub="Every time an admin entered a customer workspace" />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V215_IMPERSONATION.sql</b> to start recording impersonation sessions.</div>
      ) : (
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Admin', 'Business', 'Reason', 'Mode', 'Started', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows === null ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No impersonation sessions yet.</td></tr>
              : rows.map((s, i) => {
                const st = statusOf(s)
                return (
                  <tr key={s.id} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                    <td style={td}>{s.admin_email || '—'}</td>
                    <td style={td}>{s.company_name || s.company_slug || '—'}</td>
                    <td style={{ ...td, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={s.reason}>{s.reason || '—'}</td>
                    <td style={td}>{s.mode === 'read_only' ? 'Read-only' : 'Full'}</td>
                    <td style={{ ...td, color: 'var(--sa-muted)' }}>{s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</td>
                    <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: st.c + '22', color: st.c }}>{st.l}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Operations · Integrations — connected channels across every business, with
// status (real data: email_channels, woocommerce_integrations, telnyx).
function IntegrationsPage() {
  const [cos, setCos] = useState<Record<string, any>>({})
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    ;(async () => {
      const [c, e, w, t] = await Promise.all([
        (supabase as any).from('companies').select('id,name,slug'),
        (supabase as any).from('email_channels').select('*'),
        (supabase as any).from('woocommerce_integrations').select('*'),
        (supabase as any).from('telnyx_integrations').select('*'),
      ])
      const map: Record<string, any> = {}; (c.data || []).forEach((x: any) => { map[x.id] = x })
      setCos(map)
      const staleDays = (d: string) => d ? (Date.now() - new Date(d).getTime()) / 86400000 : Infinity
      const all: any[] = [
        ...(e.data || []).map((x: any) => ({ type: 'Email', color: '#8b5cf6', company_id: x.company_id, detail: x.inbound_address, active: x.is_active !== false, last: x.created_at, note: '' })),
        ...(w.data || []).map((x: any) => ({ type: 'WooCommerce', color: '#96588a', company_id: x.company_id, detail: x.store_url, active: x.is_active !== false, last: x.last_synced_at || x.created_at, note: staleDays(x.last_synced_at) > 2 ? 'Sync stale' : '' })),
        ...(t.data || []).map((x: any) => ({ type: 'Phone (Telnyx)', color: '#0891b2', company_id: x.company_id, detail: x.phone_number, active: x.is_active === true, last: x.created_at, note: x.is_active ? '' : 'Inactive' })),
      ]
      setRows(all)
    })()
  }, [])
  const list = rows || []
  const byType = (t: string) => list.filter(r => r.type === t)
  const summary = [
    { type: 'Email', color: '#8b5cf6' },
    { type: 'WooCommerce', color: '#96588a' },
    { type: 'Phone (Telnyx)', color: '#0891b2' },
  ].map(s => ({ ...s, total: byType(s.type).length, active: byType(s.type).filter(r => r.active).length, warn: byType(s.type).filter(r => r.note).length }))
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  return (
    <div>
      <SectionHeader title="Integrations" sub="Connected channels across every business" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
        {summary.map(s => (
          <div key={s.type} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{s.type}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{rows === null ? '…' : s.total}</p>
            <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{s.active} active{s.warn ? ` · ${s.warn} need attention` : ''}</p>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Type', 'Business', 'Detail', 'Last activity', 'Status'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
            : list.length === 0 ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No connected integrations.</td></tr>
            : list.map((r, i) => (
              <tr key={i} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{r.type}</span></td>
                <td style={td}>{cos[r.company_id]?.name || cos[r.company_id]?.slug || '—'}</td>
                <td style={{ ...td, color: 'var(--sa-muted)', maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.detail}>{r.detail || '—'}</td>
                <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.last ? new Date(r.last).toLocaleDateString() : '—'}</td>
                <td style={td}>
                  {r.note
                    ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#f59e0b22', color: '#f59e0b' }}>{r.note}</span>
                    : r.active
                      ? <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#10b98122', color: '#10b981' }}>Connected</span>
                      : <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: '#6b728022', color: '#6b7280' }}>Inactive</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Operations · Call Diagnostics — every voice call across the platform, with a
// per-call detail drawer (status, hangup cause, recording, transcript, sentiment,
// AI to-dos). Real data only, from the `calls` table (COLVY_V115_TELNYX + ALTERs).
function CallDetail({ call, coName, onClose }: { call: any; coName: string; onClose: () => void }) {
  const dur = (s: number) => {
    if (!s && s !== 0) return '—'
    const m = Math.floor(s / 60), r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${r}s`
  }
  const statusColor: Record<string, string> = {
    completed: '#10b981', answered: '#10b981', ringing: '#f59e0b', initiated: '#6366f1',
    busy: '#f59e0b', failed: '#ef4444', 'no-answer': '#ef4444',
  }
  const sc = statusColor[String(call.status)] || '#6b7280'
  const sentColor = (v: string) => v === 'positive' ? '#10b981' : v === 'negative' ? '#ef4444' : '#6b7280'
  const segs: any[] = Array.isArray(call.transcript_segments) ? call.transcript_segments : []
  const todos: any[] = Array.isArray(call.ai_todos) ? call.ai_todos : []
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: call.direction === 'inbound' ? '#6366f1' : '#0891b2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{call.direction === 'inbound' ? '↙' : '↗'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{call.direction === 'inbound' ? 'Inbound call' : 'Outbound call'}{call.is_voicemail ? ' · Voicemail' : ''}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{coName} · {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: sc, padding: '3px 10px', borderRadius: 999, background: sc + '22' }}>{call.status || '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <Row k="Direction" v={call.direction === 'inbound' ? 'Inbound' : 'Outbound'} />
          <Row k="From" v={call.from_number} />
          <Row k="To" v={call.to_number} />
          <Row k="Caller" v={call.caller_name || call.contact_name} />
          <Row k="Status" v={call.status} />
          <Row k="Hangup cause" v={call.cause} />
          <Row k="Duration" v={dur(call.duration_seconds)} />
          <Row k="Answered by" v={call.answered_by} />
          <Row k="Started" v={call.started_at ? new Date(call.started_at).toLocaleString() : '—'} />
          <Row k="Ended" v={call.ended_at ? new Date(call.ended_at).toLocaleString() : '—'} />
          <Row k="Voicemail" v={call.is_voicemail ? 'Yes' : 'No'} />
          {call.sentiment && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Sentiment</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sentColor(call.sentiment) + '22', color: sentColor(call.sentiment) }}>{call.sentiment}</span>
            </div>
          )}

          {call.recording_url ? (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Recording{call.recording_duration ? ` · ${dur(call.recording_duration)}` : ''}</p>
              <audio controls src={call.recording_url} style={{ width: '100%' }} />
            </div>
          ) : call.recording_error ? (
            <p style={{ marginTop: 18, fontSize: 12, color: '#f59e0b' }}>Recording unavailable: {call.recording_error}</p>
          ) : null}

          {todos.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>AI follow-ups</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {todos.map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--sa-border)' }}>
                    <span style={{ color: '#6366f1', fontSize: 13 }}>›</span>
                    <span style={{ fontSize: 12.5, color: 'var(--sa-text)', lineHeight: 1.4 }}>{typeof t === 'string' ? t : (t.text || t.task || JSON.stringify(t))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {segs.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Transcript</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {segs.map((s, i) => (
                  <div key={i} style={{ padding: '8px 11px', borderRadius: 9, background: 'var(--sa-card)', border: '1px solid var(--sa-border)' }}>
                    <p style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sa-muted)', margin: '0 0 3px' }}>{s.speaker || 'Speaker'}{s.start != null ? ` · ${dur(Math.floor(Number(s.start)))}` : ''}</p>
                    <p style={{ fontSize: 12.5, color: 'var(--sa-text)', margin: 0, lineHeight: 1.5 }}>{s.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CallDiagnosticsPage() {
  const [cos, setCos] = useState<Record<string, any>>({})
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [q, setQ] = useState('')
  const [dir, setDir] = useState('all')
  const [stat, setStat] = useState('all')
  const [sel, setSel] = useState<any>(null)
  useEffect(() => {
    ;(async () => {
      const [c, r] = await Promise.all([
        (supabase as any).from('companies').select('id,name,slug'),
        (supabase as any).from('calls').select('*').order('created_at', { ascending: false }).limit(300),
      ])
      const map: Record<string, any> = {}; (c.data || []).forEach((x: any) => { map[x.id] = x })
      setCos(map)
      if (r.error) { if (/does not exist|schema cache/i.test(r.error.message)) setMissing(true); setRows([]) }
      else setRows(r.data || [])
    })()
  }, [])
  const coName = (id: string) => cos[id]?.name || cos[id]?.slug || '—'
  const all = rows || []
  const answered = (s: string) => s === 'completed' || s === 'answered'
  const list = all.filter(r => {
    if (dir !== 'all' && r.direction !== dir) return false
    if (stat === 'answered' && !answered(r.status)) return false
    if (stat === 'missed' && answered(r.status)) return false
    if (stat === 'voicemail' && !r.is_voicemail) return false
    if (q.trim()) {
      const hay = `${r.from_number} ${r.to_number} ${r.caller_name || ''} ${r.contact_name || ''} ${coName(r.company_id)}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const answeredN = all.filter(r => answered(r.status)).length
  const answerRate = all.length ? Math.round((answeredN / all.length) * 100) : 0
  const durs = all.filter(r => answered(r.status) && r.duration_seconds).map(r => r.duration_seconds)
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0
  const kpis = [
    { label: 'Total calls', value: all.length, color: '#6366f1' },
    { label: 'Answer rate', value: `${answerRate}%`, color: '#10b981' },
    { label: 'Avg duration', value: avgDur ? `${Math.floor(avgDur / 60)}m ${avgDur % 60}s` : '—', color: '#0891b2' },
    { label: 'Voicemails', value: all.filter(r => r.is_voicemail).length, color: '#f59e0b' },
    { label: 'Failed / missed', value: all.filter(r => !answered(r.status) && !r.is_voicemail).length, color: '#ef4444' },
  ]
  const statusColor: Record<string, string> = {
    completed: '#10b981', answered: '#10b981', ringing: '#f59e0b', initiated: '#6366f1',
    busy: '#f59e0b', failed: '#ef4444', 'no-answer': '#ef4444',
  }
  const dur = (s: number) => {
    if (!s && s !== 0) return '—'
    const m = Math.floor(s / 60), r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${r}s`
  }
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? '#ff7a6b' : 'var(--sa-border)'}`, background: active ? '#ff7a6b22' : 'var(--sa-card)', color: active ? '#ff7a6b' : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  return (
    <div>
      <SectionHeader title="Call Diagnostics" sub="Every voice call across the platform — status, recordings and transcripts" />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Voice calling isn't set up yet — run <b>COLVY_V115_TELNYX.sql</b> to start recording calls.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12, marginBottom: 18 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: k.color, margin: 0 }}>{rows === null ? '…' : k.value}</p>
                <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{k.label}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <SearchBar placeholder="Search number, caller, business…" value={q} onChange={setQ} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'All'], ['inbound', 'Inbound'], ['outbound', 'Outbound']].map(([k, l]) => (
                <button key={k} onClick={() => setDir(k)} style={chip(dir === k)}>{l}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'Any status'], ['answered', 'Answered'], ['missed', 'Missed'], ['voicemail', 'Voicemail']].map(([k, l]) => (
                <button key={k} onClick={() => setStat(k)} style={chip(stat === k)}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Direction', 'From', 'To', 'Status', 'Duration', 'Started', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{all.length === 0 ? 'No calls recorded yet.' : 'No calls match these filters.'}</td></tr>
                : list.map((r, i) => {
                  const sc = statusColor[String(r.status)] || '#6b7280'
                  return (
                    <tr key={r.id} onClick={() => setSel(r)} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
                      <td style={td}>{coName(r.company_id)}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: r.direction === 'inbound' ? '#6366f1' : '#0891b2' }}>{r.direction === 'inbound' ? '↙ Inbound' : '↗ Outbound'}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.from_number || '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.to_number || '—'}</td>
                      <td style={td}>
                        <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sc + '22', color: sc }}>{r.is_voicemail ? 'voicemail' : (r.status || '—')}</span>
                      </td>
                      <td style={td}>{dur(r.duration_seconds)}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && <CallDetail call={sel} coName={coName(sel.company_id)} onClose={() => setSel(null)} />}
    </div>
  )
}

// Operations · Webhook Explorer — a live feed of every inbound webhook Colvy
// receives (Telnyx, Stripe, Meta, WooCommerce, email), with per-event payload
// inspection. Real data from webhook_events (COLVY_V217).
const WH_SOURCES: Record<string, { label: string; color: string }> = {
  telnyx: { label: 'Telnyx', color: '#0891b2' },
  stripe: { label: 'Stripe', color: '#635bff' },
  meta: { label: 'Meta', color: '#0866ff' },
  woocommerce: { label: 'WooCommerce', color: '#96588a' },
  email: { label: 'Email', color: '#8b5cf6' },
}

function WebhookDetail({ ev, coName, onClose }: { ev: any; coName: string; onClose: () => void }) {
  const src = WH_SOURCES[ev.source] || { label: ev.source, color: '#6b7280' }
  const pretty = (() => { try { return JSON.stringify(ev.payload, null, 2) } catch { return String(ev.payload) } })()
  const [copied, setCopied] = useState(false)
  const copy = () => { try { navigator.clipboard.writeText(pretty); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {} }
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  const statusColor: Record<string, string> = { received: '#6366f1', processed: '#10b981', ignored: '#6b7280', error: '#ef4444', rejected: '#f59e0b' }
  const sc = statusColor[String(ev.status)] || '#6b7280'
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: src.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{src.label[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{src.label}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.event_type || '—'}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: sc, padding: '3px 10px', borderRadius: 999, background: sc + '22' }}>{ev.status || '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <Row k="Source" v={src.label} />
          <Row k="Event type" v={ev.event_type} />
          <Row k="Business" v={coName} />
          <Row k="Status" v={ev.status} />
          {ev.error && <Row k="Error" v={ev.error} />}
          <Row k="Received" v={ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'} />
          <div style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Payload</p>
              {ev.payload != null && <button onClick={copy} style={{ marginLeft: 'auto', ...paBtn() }}>{copied ? 'Copied' : 'Copy'}</button>}
            </div>
            {ev.payload == null ? (
              <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>No payload captured for this event.</p>
            ) : (
              <pre style={{ margin: 0, padding: 14, borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--sa-text)', overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{pretty}</pre>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function WebhookExplorerPage() {
  const [cos, setCos] = useState<Record<string, any>>({})
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [q, setQ] = useState('')
  const [src, setSrc] = useState('all')
  const [stat, setStat] = useState('all')
  const [sel, setSel] = useState<any>(null)
  const load = async () => {
    const [c, r] = await Promise.all([
      (supabase as any).from('companies').select('id,name,slug'),
      (supabase as any).from('webhook_events').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    const map: Record<string, any> = {}; (c.data || []).forEach((x: any) => { map[x.id] = x })
    setCos(map)
    if (r.error) { if (/does not exist|schema cache/i.test(r.error.message)) setMissing(true); setRows([]) }
    else setRows(r.data || [])
  }
  useEffect(() => { load() }, [])
  const coName = (id: string) => cos[id]?.name || cos[id]?.slug || '—'
  const all = rows || []
  const list = all.filter(r => {
    if (src !== 'all' && r.source !== src) return false
    if (stat === 'errors' && !['error', 'rejected'].includes(r.status)) return false
    if (stat === 'ok' && ['error', 'rejected'].includes(r.status)) return false
    if (q.trim()) {
      const hay = `${r.source} ${r.event_type || ''} ${r.error || ''} ${coName(r.company_id)}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const errors = all.filter(r => ['error', 'rejected'].includes(r.status)).length
  const bySource = Object.keys(WH_SOURCES).map(k => ({ k, ...WH_SOURCES[k], n: all.filter(r => r.source === k).length }))
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean, color?: string): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? (color || '#ff7a6b') : 'var(--sa-border)'}`, background: active ? (color || '#ff7a6b') + '22' : 'var(--sa-card)', color: active ? (color || '#ff7a6b') : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  const statusColor: Record<string, string> = { received: '#6366f1', processed: '#10b981', ignored: '#6b7280', error: '#ef4444', rejected: '#f59e0b' }
  return (
    <div>
      <SectionHeader title="Webhook Explorer" sub="Live feed of every inbound webhook across the platform"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V217_WEBHOOK_EVENTS.sql</b> to start capturing inbound webhooks. New events appear here automatically once the table exists.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', margin: 0 }}>{rows === null ? '…' : all.length}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Recent events</p>
            </div>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: errors ? '#ef4444' : '#10b981', margin: 0 }}>{rows === null ? '…' : errors}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Errors / rejected</p>
            </div>
            {bySource.map(s => (
              <div key={s.k} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: s.color, margin: 0 }}>{rows === null ? '…' : s.n}</p>
                <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{s.label}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <SearchBar placeholder="Search type, business, error…" value={q} onChange={setQ} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setSrc('all')} style={chip(src === 'all')}>All sources</button>
              {Object.keys(WH_SOURCES).map(k => (
                <button key={k} onClick={() => setSrc(k)} style={chip(src === k, WH_SOURCES[k].color)}>{WH_SOURCES[k].label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'Any'], ['ok', 'OK'], ['errors', 'Errors']].map(([k, l]) => (
                <button key={k} onClick={() => setStat(k)} style={chip(stat === k)}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Source', 'Event type', 'Business', 'Status', 'Received', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{all.length === 0 ? 'No webhooks received yet.' : 'No events match these filters.'}</td></tr>
                : list.map((r, i) => {
                  const s = WH_SOURCES[r.source] || { label: r.source, color: '#6b7280' }
                  const sc = statusColor[String(r.status)] || '#6b7280'
                  return (
                    <tr key={r.id} onClick={() => setSel(r)} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.label}</span></td>
                      <td style={{ ...td, maxWidth: 240, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.event_type}>{r.event_type || '—'}</td>
                      <td style={td}>{coName(r.company_id)}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sc + '22', color: sc }}>{r.status || '—'}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && <WebhookDetail ev={sel} coName={coName(sel.company_id)} onClose={() => setSel(null)} />}
    </div>
  )
}

// Operations · Background Jobs — health of the scheduled workers (email sync,
// campaign sender) with cadence, duration, throughput and failures. Real data
// from job_runs (COLVY_V218). The registry lists the jobs Colvy actually runs.
const JOBS: { key: string; label: string; schedule: string; desc: string; color: string }[] = [
  { key: 'email-sync', label: 'Email Sync', schedule: 'Every 5 min', desc: 'Pulls new mail into every connected Gmail mailbox', color: '#8b5cf6' },
  { key: 'campaigns-process', label: 'Campaign Worker', schedule: 'Every 2 min', desc: 'Starts scheduled campaigns and drips the next sending batch', color: '#ff7a6b' },
]
const JOB_STATUS_COLOR: Record<string, string> = { success: '#10b981', idle: '#6b7280', error: '#ef4444', running: '#6366f1' }

function JobRunDetail({ run, onClose }: { run: any; onClose: () => void }) {
  const job = JOBS.find(j => j.key === run.job)
  const sc = JOB_STATUS_COLOR[String(run.status)] || '#6b7280'
  const pretty = (() => { try { return JSON.stringify(run.detail, null, 2) } catch { return String(run.detail) } })()
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: job?.color || '#6366f1', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>{(job?.label || run.job)[0]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{job?.label || run.job}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{run.started_at ? new Date(run.started_at).toLocaleString() : '—'}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: sc, padding: '3px 10px', borderRadius: 999, background: sc + '22' }}>{run.status || '—'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <Row k="Job" v={job?.label || run.job} />
          <Row k="Status" v={run.status} />
          <Row k="Started" v={run.started_at ? new Date(run.started_at).toLocaleString() : '—'} />
          <Row k="Finished" v={run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'} />
          <Row k="Duration" v={run.duration_ms != null ? `${run.duration_ms} ms` : '—'} />
          {run.error && <Row k="Error" v={run.error} />}
          {run.detail != null && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Run summary</p>
              <pre style={{ margin: 0, padding: 14, borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--sa-text)', overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{pretty}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BackgroundJobsPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [jobFilter, setJobFilter] = useState('all')
  const [sel, setSel] = useState<any>(null)
  const load = async () => {
    const { data, error } = await (supabase as any).from('job_runs').select('*').order('created_at', { ascending: false }).limit(300)
    if (error) { if (/does not exist|schema cache/i.test(error.message)) setMissing(true); setRows([]) }
    else setRows(data || [])
  }
  useEffect(() => { load() }, [])
  const all = rows || []
  const dayAgo = Date.now() - 86400000
  const stat = (key: string) => {
    const runs = all.filter(r => r.job === key)
    const last = runs[0]
    const last24 = runs.filter(r => r.created_at && new Date(r.created_at).getTime() > dayAgo)
    const errored = last24.filter(r => r.status === 'error').length
    const worked = last24.filter(r => r.status === 'success' || r.status === 'idle').length
    const durs = runs.filter(r => r.duration_ms != null).slice(0, 30).map(r => r.duration_ms)
    const avg = durs.length ? Math.round(durs.reduce((a: number, b: number) => a + b, 0) / durs.length) : null
    const rate = last24.length ? Math.round((worked / last24.length) * 100) : null
    return { last, runs24: last24.length, errored, avg, rate }
  }
  const list = all.filter(r => jobFilter === 'all' || r.job === jobFilter)
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? '#ff7a6b' : 'var(--sa-border)'}`, background: active ? '#ff7a6b22' : 'var(--sa-card)', color: active ? '#ff7a6b' : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  const ago = (d: string) => {
    if (!d) return 'never'
    const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }
  return (
    <div>
      <SectionHeader title="Background Jobs" sub="Health of the scheduled workers that keep Colvy running"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V218_JOB_RUNS.sql</b> to start recording job runs. The workers keep running either way — this just gives them a visible heartbeat here.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 22 }}>
            {JOBS.map(j => {
              const s = stat(j.key)
              const lastColor = s.last ? (JOB_STATUS_COLOR[String(s.last.status)] || '#6b7280') : '#6b7280'
              const stale = s.last?.created_at ? (Date.now() - new Date(s.last.created_at).getTime()) > 3600000 : true
              return (
                <div key={j.key} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: j.color + '22', color: j.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{j.label[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{j.label}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}>{j.schedule}</p>
                    </div>
                    {rows !== null && (
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: (s.last && !stale ? '#10b981' : s.last ? '#f59e0b' : '#6b7280') + '22', color: s.last && !stale ? '#10b981' : s.last ? '#f59e0b' : '#6b7280' }}>{s.last ? (stale ? 'Stale' : 'Healthy') : 'No runs'}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 14px', lineHeight: 1.4 }}>{j.desc}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 2px' }}>Last run</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: lastColor, margin: 0 }}>{rows === null ? '…' : s.last ? `${s.last.status} · ${ago(s.last.created_at)}` : 'never'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 2px' }}>Runs (24h)</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>{rows === null ? '…' : s.runs24}{s.errored ? <span style={{ color: '#ef4444' }}> · {s.errored} failed</span> : null}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 2px' }}>Avg duration</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>{rows === null ? '…' : s.avg != null ? `${s.avg} ms` : '—'}</p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 2px' }}>Success (24h)</p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: s.rate != null && s.rate < 90 ? '#f59e0b' : '#10b981', margin: 0 }}>{rows === null ? '…' : s.rate != null ? `${s.rate}%` : '—'}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setJobFilter('all')} style={chip(jobFilter === 'all')}>All jobs</button>
            {JOBS.map(j => <button key={j.key} onClick={() => setJobFilter(j.key)} style={chip(jobFilter === j.key)}>{j.label}</button>)}
          </div>
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Job', 'Status', 'Started', 'Duration', 'Summary', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No job runs recorded yet.</td></tr>
                : list.map((r, i) => {
                  const job = JOBS.find(j => j.key === r.job)
                  const sc = JOB_STATUS_COLOR[String(r.status)] || '#6b7280'
                  const summary = r.detail ? Object.entries(r.detail).filter(([k]) => !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''
                  return (
                    <tr key={r.id} onClick={() => setSel(r)} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
                      <td style={td}><span style={{ fontWeight: 600 }}>{job?.label || r.job}</span></td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sc + '22', color: sc }}>{r.status || '—'}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{r.started_at ? new Date(r.started_at).toLocaleString() : (r.created_at ? new Date(r.created_at).toLocaleString() : '—')}</td>
                      <td style={td}>{r.duration_ms != null ? `${r.duration_ms} ms` : '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.error || summary}>{r.error ? <span style={{ color: '#ef4444' }}>{r.error}</span> : (summary || '—')}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && <JobRunDetail run={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

// Operations · API Logs — the stream of server-side warnings and errors from
// across the API routes and libraries (captured from console.error/warn via
// instrumentation.ts). Real data from api_logs (COLVY_V219).
const LOG_LEVEL_COLOR: Record<string, string> = { error: '#ef4444', warn: '#f59e0b', info: '#6366f1' }

function ApiLogDetail({ row, coName, onClose }: { row: any; coName: string; onClose: () => void }) {
  const lc = LOG_LEVEL_COLOR[String(row.level)] || '#6b7280'
  const meta = (() => { try { return row.meta != null ? JSON.stringify(row.meta, null, 2) : null } catch { return String(row.meta) } })()
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 10px', borderRadius: 8, background: lc + '22', color: lc }}>{row.level}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{row.source || 'app'}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <Row k="Level" v={row.level} />
          <Row k="Source" v={row.source} />
          {row.route && <Row k="Route" v={row.route} />}
          {row.company_id && <Row k="Business" v={coName} />}
          <Row k="Time" v={row.created_at ? new Date(row.created_at).toLocaleString() : '—'} />
          <div style={{ marginTop: 18 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Message</p>
            <pre style={{ margin: 0, padding: 14, borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--sa-text)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{row.message || '—'}</pre>
          </div>
          {meta && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Metadata</p>
              <pre style={{ margin: 0, padding: 14, borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--sa-text)', overflowX: 'auto', whiteSpace: 'pre', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{meta}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ApiLogsPage() {
  const [cos, setCos] = useState<Record<string, any>>({})
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [q, setQ] = useState('')
  const [level, setLevel] = useState('all')
  const [source, setSource] = useState('all')
  const [sel, setSel] = useState<any>(null)
  const load = async () => {
    const [c, r] = await Promise.all([
      (supabase as any).from('companies').select('id,name,slug'),
      (supabase as any).from('api_logs').select('*').order('created_at', { ascending: false }).limit(300),
    ])
    const map: Record<string, any> = {}; (c.data || []).forEach((x: any) => { map[x.id] = x })
    setCos(map)
    if (r.error) { if (/does not exist|schema cache/i.test(r.error.message)) setMissing(true); setRows([]) }
    else setRows(r.data || [])
  }
  useEffect(() => { load() }, [])
  const coName = (id: string) => cos[id]?.name || cos[id]?.slug || '—'
  const all = rows || []
  const dayAgo = Date.now() - 86400000
  const in24 = (r: any) => r.created_at && new Date(r.created_at).getTime() > dayAgo
  const sources = Array.from(new Set(all.map(r => r.source || 'app')))
    .map(s => ({ s, n: all.filter(r => (r.source || 'app') === s).length }))
    .sort((a, b) => b.n - a.n).slice(0, 8)
  const list = all.filter(r => {
    if (level !== 'all' && r.level !== level) return false
    if (source !== 'all' && (r.source || 'app') !== source) return false
    if (q.trim()) {
      const hay = `${r.source || ''} ${r.message || ''} ${r.route || ''}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const errors24 = all.filter(r => r.level === 'error' && in24(r)).length
  const warns24 = all.filter(r => r.level === 'warn' && in24(r)).length
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean, color?: string): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? (color || '#ff7a6b') : 'var(--sa-border)'}`, background: active ? (color || '#ff7a6b') + '22' : 'var(--sa-card)', color: active ? (color || '#ff7a6b') : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  return (
    <div>
      <SectionHeader title="API Logs" sub="Server-side warnings and errors from across the platform"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V219_API_LOGS.sql</b> to start capturing server logs. Once the table exists, every warning and error from the API routes flows here automatically.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: errors24 ? '#ef4444' : '#10b981', margin: 0 }}>{rows === null ? '…' : errors24}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Errors (24h)</p>
            </div>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: warns24 ? '#f59e0b' : '#10b981', margin: 0 }}>{rows === null ? '…' : warns24}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Warnings (24h)</p>
            </div>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', margin: 0 }}>{rows === null ? '…' : sources.length}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Active sources</p>
            </div>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--sa-text)', margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rows === null ? '…' : (sources[0]?.s || '—')}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Noisiest source{sources[0] ? ` · ${sources[0].n}` : ''}</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <SearchBar placeholder="Search message, source, route…" value={q} onChange={setQ} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'All'], ['error', 'Errors'], ['warn', 'Warnings']].map(([k, l]) => (
                <button key={k} onClick={() => setLevel(k)} style={chip(level === k, k === 'error' ? '#ef4444' : k === 'warn' ? '#f59e0b' : undefined)}>{l}</button>
              ))}
            </div>
            {sources.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setSource('all')} style={chip(source === 'all')}>All sources</button>
                {sources.map(s => <button key={s.s} onClick={() => setSource(s.s)} style={chip(source === s.s)}>{s.s}</button>)}
              </div>
            )}
          </div>
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Level', 'Source', 'Message', 'Time', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{all.length === 0 ? 'No logs captured yet — nothing has errored since the table was created.' : 'No logs match these filters.'}</td></tr>
                : list.map((r, i) => {
                  const lc = LOG_LEVEL_COLOR[String(r.level)] || '#6b7280'
                  return (
                    <tr key={r.id} onClick={() => setSel(r)} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
                      <td style={td}><span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, background: lc + '22', color: lc }}>{r.level}</span></td>
                      <td style={td}><span style={{ fontWeight: 600 }}>{r.source || 'app'}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)', maxWidth: 460, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5 }} title={r.message}>{r.message || '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{r.created_at ? new Date(r.created_at).toLocaleString() : '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {sel && <ApiLogDetail row={sel} coName={coName(sel.company_id)} onClose={() => setSel(null)} />}
    </div>
  )
}

// Operations · Mobile Devices — the fleet of registered mobile apps (push_tokens)
// cross-referenced with live agent heartbeats (agent_presence). All real data,
// no new backend: push_tokens = devices reachable by push, agent_presence =
// who has a live session (browser or app) right now.
const PRESENCE_WINDOW_MS = 120000   // "online" = heartbeat in the last 2 minutes

function MobileDeviceDetail({ d, onClose }: { d: any; onClose: () => void }) {
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  const plat = String(d.platform || '').toLowerCase()
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: plat === 'ios' ? '#111' : '#3ddc84', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{plat === 'ios' ? '' : '🤖'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{d.device_name || 'Unnamed device'}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{d.coName}</p>
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: d.online ? '#10b981' : '#6b7280', padding: '3px 10px', borderRadius: 999, background: (d.online ? '#10b981' : '#6b7280') + '22' }}>{d.online ? 'Online' : 'Offline'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <Row k="Device" v={d.device_name} />
          <Row k="Platform" v={plat ? (plat === 'ios' ? 'iOS' : plat[0].toUpperCase() + plat.slice(1)) : '—'} />
          <Row k="Business" v={d.coName} />
          <Row k="User" v={d.email} />
          <Row k="Live session" v={d.online ? `Yes · heartbeat ${d.lastSeenAgo}` : (d.lastSeenAgo ? `No · last seen ${d.lastSeenAgo}` : 'No heartbeat recorded')} />
          <Row k="Push reachable" v="Yes (registered token)" />
          <Row k="Registered" v={d.created_at ? new Date(d.created_at).toLocaleString() : '—'} />
          <Row k="Last updated" v={d.updated_at ? new Date(d.updated_at).toLocaleString() : '—'} />
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 6px' }}>Push token</p>
            <p style={{ fontSize: 11, color: 'var(--sa-text)', margin: 0, wordBreak: 'break-all', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: 12, borderRadius: 9, background: 'var(--sa-card)', border: '1px solid var(--sa-border)' }}>{d.expo_token || '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function MobileDevicesPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [missing, setMissing] = useState(false)
  const [onlineAgents, setOnlineAgents] = useState<number | null>(null)
  const [q, setQ] = useState('')
  const [plat, setPlat] = useState('all')
  const [sel, setSel] = useState<any>(null)
  const load = async () => {
    const [co, pt, ap, tm] = await Promise.all([
      (supabase as any).from('companies').select('id,name,slug'),
      (supabase as any).from('push_tokens').select('*').order('updated_at', { ascending: false }).limit(500),
      (supabase as any).from('agent_presence').select('company_id,user_id,last_seen_at'),
      (supabase as any).from('team_members').select('user_id, email'),
    ])
    if (pt.error) { if (/does not exist|schema cache/i.test(pt.error.message)) setMissing(true); setRows([]); return }
    const coMap: Record<string, any> = {}; (co.data || []).forEach((x: any) => { coMap[x.id] = x })
    const emailMap: Record<string, string> = {}; (tm.data || []).forEach((x: any) => { if (x.user_id) emailMap[x.user_id] = x.email })
    const presMap: Record<string, string> = {}
    ;(ap.data || []).forEach((x: any) => { if (x.user_id) presMap[`${x.company_id}:${x.user_id}`] = x.last_seen_at })
    setOnlineAgents((ap.data || []).filter((x: any) => x.last_seen_at && (Date.now() - new Date(x.last_seen_at).getTime()) < PRESENCE_WINDOW_MS).length)
    const ago = (d: string) => {
      if (!d) return ''
      const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
      if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`
      const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`
      return `${Math.floor(h / 24)}d ago`
    }
    const list = (pt.data || []).map((d: any) => {
      const seen = presMap[`${d.company_id}:${d.user_id}`]
      const online = seen ? (Date.now() - new Date(seen).getTime()) < PRESENCE_WINDOW_MS : false
      return { ...d, coName: coMap[d.company_id]?.name || coMap[d.company_id]?.slug || '—', email: emailMap[d.user_id] || null, online, lastSeenAgo: seen ? ago(seen) : '' }
    })
    setRows(list)
  }
  useEffect(() => { load() }, [])
  const all = rows || []
  const list = all.filter(d => {
    if (plat !== 'all' && String(d.platform || '').toLowerCase() !== plat) return false
    if (q.trim()) {
      const hay = `${d.device_name || ''} ${d.coName || ''} ${d.email || ''} ${d.platform || ''}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const ios = all.filter(d => String(d.platform || '').toLowerCase() === 'ios').length
  const android = all.filter(d => String(d.platform || '').toLowerCase() !== 'ios').length
  const businesses = new Set(all.map(d => d.company_id)).size
  const onlineDevices = all.filter(d => d.online).length
  const kpis = [
    { label: 'Registered devices', value: all.length, color: '#6366f1' },
    { label: 'Online now', value: onlineDevices, color: '#10b981' },
    { label: 'iOS', value: ios, color: '#111827' },
    { label: 'Android', value: android, color: '#3ddc84' },
    { label: 'Businesses with app', value: businesses, color: '#f59e0b' },
    { label: 'Live agent sessions', value: onlineAgents ?? '…', color: '#0891b2' },
  ]
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? '#ff7a6b' : 'var(--sa-border)'}`, background: active ? '#ff7a6b22' : 'var(--sa-card)', color: active ? '#ff7a6b' : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  return (
    <div>
      <SectionHeader title="Mobile Devices" sub="Registered mobile apps across every business, with live status"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Mobile push isn't set up yet — run <b>COLVY_V122_PUSH.sql</b> to start tracking registered devices.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
            {kpis.map(k => (
              <div key={k.label} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: k.color, margin: 0 }}>{rows === null ? '…' : k.value}</p>
                <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{k.label}</p>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
            <SearchBar placeholder="Search device, business, user…" value={q} onChange={setQ} />
            <div style={{ display: 'flex', gap: 6 }}>
              {[['all', 'All'], ['ios', 'iOS'], ['android', 'Android']].map(([k, l]) => (
                <button key={k} onClick={() => setPlat(k)} style={chip(plat === k)}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Status', 'Device', 'Platform', 'Business', 'User', 'Registered', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{all.length === 0 ? 'No mobile devices registered yet.' : 'No devices match these filters.'}</td></tr>
                : list.map((d, i) => {
                  const p = String(d.platform || '').toLowerCase()
                  return (
                    <tr key={d.id} onClick={() => setSel(d)} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
                      <td style={td}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: d.online ? '#10b981' : '#6b7280' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: d.online ? '#10b981' : '#9ca3af' }} />{d.online ? 'Online' : 'Offline'}</span></td>
                      <td style={td}>{d.device_name || 'Unnamed device'}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: p === 'ios' ? 'var(--sa-text)' : '#0a7d43' }}>{p === 'ios' ? 'iOS' : (p ? p[0].toUpperCase() + p.slice(1) : '—')}</span></td>
                      <td style={td}>{d.coName}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{d.email || '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '12px 2px 0' }}>Online status reflects a live agent heartbeat (browser or app) in the last 2 minutes. Every registered device is reachable by push notification even when offline.</p>
        </>
      )}
      {sel && <MobileDeviceDetail d={sel} onClose={() => setSel(null)} />}
    </div>
  )
}

// Platform · Audit Logs — a chronological trail of privileged platform actions.
// Merges the two records that actually capture admin activity and are readable
// cross-company: impersonation sessions (an admin entered a workspace) and
// company admin notes (an admin annotated a business). Both are real data.
function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const load = async () => {
    const [co, imp, notes] = await Promise.all([
      (supabase as any).from('companies').select('id,name,slug'),
      (supabase as any).from('impersonation_sessions').select('*').order('started_at', { ascending: false }).limit(200),
      (supabase as any).from('company_admin_notes').select('*').order('created_at', { ascending: false }).limit(200),
    ])
    const coMap: Record<string, any> = {}; (co.data || []).forEach((x: any) => { coMap[x.id] = x })
    const events: any[] = []
    ;(imp.data || []).forEach((s: any) => events.push({
      id: `imp-${s.id}`, kind: 'impersonation', at: s.started_at || s.created_at,
      actor: s.admin_email || 'admin',
      business: s.company_name || s.company_slug || coMap[s.company_id]?.name || '—',
      detail: `Entered workspace${s.mode === 'read_only' ? ' (read-only)' : ''}${s.reason ? ` — ${s.reason}` : ''}`,
    }))
    ;(notes.data || []).forEach((n: any) => events.push({
      id: `note-${n.id}`, kind: 'note', at: n.created_at,
      actor: n.author_email || 'admin',
      business: coMap[n.company_id]?.name || coMap[n.company_id]?.slug || '—',
      detail: `Added ${n.category || 'general'} note — ${String(n.body || '').slice(0, 120)}`,
    }))
    events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
    setRows(events)
  }
  useEffect(() => { load() }, [])
  const all = rows || []
  const list = all.filter(e => {
    if (kind !== 'all' && e.kind !== kind) return false
    if (q.trim()) {
      const hay = `${e.actor} ${e.business} ${e.detail}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  })
  const meta: Record<string, { label: string; color: string }> = {
    impersonation: { label: 'Impersonation', color: '#f59e0b' },
    note: { label: 'Admin note', color: '#6366f1' },
  }
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? '#ff7a6b' : 'var(--sa-border)'}`, background: active ? '#ff7a6b22' : 'var(--sa-card)', color: active ? '#ff7a6b' : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  return (
    <div>
      <SectionHeader title="Audit Logs" sub="A trail of privileged platform actions across every business"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <SearchBar placeholder="Search actor, business, detail…" value={q} onChange={setQ} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', 'All'], ['impersonation', 'Impersonation'], ['note', 'Admin notes']].map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} style={chip(kind === k)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Action', 'Admin', 'Business', 'Detail', 'When'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows === null ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
            : list.length === 0 ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{all.length === 0 ? 'No privileged actions recorded yet.' : 'No entries match these filters.'}</td></tr>
            : list.map((e, i) => {
              const m = meta[e.kind] || { label: e.kind, color: '#6b7280' }
              return (
                <tr key={e.id} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                  <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: m.color + '22', color: m.color }}>{m.label}</span></td>
                  <td style={td}>{e.actor}</td>
                  <td style={td}>{e.business}</td>
                  <td style={{ ...td, color: 'var(--sa-muted)', maxWidth: 340, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={e.detail}>{e.detail}</td>
                  <td style={{ ...td, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{e.at ? new Date(e.at).toLocaleString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Attention Required — surfaces businesses that need a look right now, computed
// purely from companies.plan + created_at (no invented columns, no backend).
function AttentionPanel() {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('companies').select('id,name,slug,plan,created_at').limit(1000)
        if (active) setRows(data || [])
      } catch { if (active) setRows([]) }
    })()
    return () => { active = false }
  }, [])

  const now = Date.now()
  const ageDays = (d: string) => d ? (now - new Date(d).getTime()) / 86400000 : 0
  const list = rows || []
  const p = (c: any) => String(c.plan || '').toLowerCase()
  const buckets = [
    { key: 'suspended', color: '#ef4444', icon: '⛔', label: 'Suspended businesses', hint: 'Review or reactivate',
      items: list.filter(c => p(c) === 'suspended') },
    { key: 'trial_ending', color: '#f59e0b', icon: '⏳', label: 'Trials ending soon', hint: 'Assuming a 14-day trial — under ~3 days left',
      items: list.filter(c => p(c) === 'trial' && ageDays(c.created_at) >= 11 && ageDays(c.created_at) <= 14) },
    { key: 'trial_stale', color: '#ef4444', icon: '💤', label: 'Stale trials', hint: 'On trial 21+ days and never converted',
      items: list.filter(c => p(c) === 'trial' && ageDays(c.created_at) > 21) },
    { key: 'new_signup', color: '#10b981', icon: '✨', label: 'New signups to onboard', hint: 'Joined in the last 2 days',
      items: list.filter(c => ['trial', 'free'].includes(p(c)) && ageDays(c.created_at) < 2) },
    { key: 'free_long', color: '#6366f1', icon: '📈', label: 'Long-time free (upsell)', hint: 'On the free plan 45+ days',
      items: list.filter(c => p(c) === 'free' && ageDays(c.created_at) > 45) },
  ].filter(b => b.items.length > 0)
  const total = buckets.reduce((n, b) => n + b.items.length, 0)

  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Attention Required</p>
        {rows !== null && (
          <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: total ? '#ef444422' : '#10b98122', color: total ? '#ef4444' : '#10b981' }}>{total}</span>
        )}
      </div>
      <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 14px' }}>Businesses that need a look right now</p>
      {rows === null ? (
        <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Loading…</p>
      ) : buckets.length === 0 ? (
        <p style={{ fontSize: 13, color: '#10b981', fontWeight: 600, margin: 0 }}>✓ All clear — nothing needs attention.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {buckets.map(b => (
            <div key={b.key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: b.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{b.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)' }}>{b.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: b.color + '22', color: b.color }}>{b.items.length}</span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '2px 0 7px' }}>{b.hint}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {b.items.slice(0, 10).map((c: any) => (
                    <a key={c.id} href={`https://${c.slug}.colvy.com/admin`} target="_blank" rel="noopener"
                      title={`Open ${c.name || c.slug} workspace`}
                      style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-text)', textDecoration: 'none' }}>
                      {c.name || c.slug || 'Untitled'}
                    </a>
                  ))}
                  {b.items.length > 10 && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', alignSelf: 'center' }}>+{b.items.length - 10} more</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OverviewPage({ data }: { data: any }) {
  const sparkA = [12,18,15,22,19,28,25,32,30,38,35,42]
  const sparkB = [5,8,6,11,9,14,12,16,14,19,17,22]
  const barData = [
    { label: 'Mon', value: 42 }, { label: 'Tue', value: 58 }, { label: 'Wed', value: 51 },
    { label: 'Thu', value: 67 }, { label: 'Fri', value: 73 }, { label: 'Sat', value: 38 }, { label: 'Sun', value: 29 },
  ]
  const retentionData = [100, 72, 61, 54, 49, 45, 42, 40, 38, 37, 36, 35]

  return (
    <div>
      <SectionHeader title="Overview" sub={`Last updated ${new Date().toLocaleTimeString()}`}
        action={
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 13, cursor: 'pointer' }}>
            {I.refresh} Refresh
          </button>
        }
      />

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginBottom: 24 }}>
        <a href="https://colvy.com/admin" target="_blank" rel="noopener" style={paQuick('#ff7a6b')}>
          <span style={{ fontSize: 20 }}>🏠</span>
          <div><p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>Manage colvy.com</p><p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>Widget, help centre & content for the main site</p></div>
        </a>
        <a href="https://colvy.com" target="_blank" rel="noopener" style={paQuick('#6366f1')}>
          <span style={{ fontSize: 20 }}>🌐</span>
          <div><p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>View colvy.com</p><p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>Open the public marketing site</p></div>
        </a>
        <a href="https://colvy.com/admin/create-company" target="_blank" rel="noopener" style={paQuick('#10b981')}>
          <span style={{ fontSize: 20 }}>➕</span>
          <div><p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--sa-text)' }}>New company</p><p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>Provision a new customer workspace</p></div>
        </a>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <KPI label="Total Companies" value={data.companies?.toLocaleString() ?? '—'} sub="all workspaces" color="#ff7a6b" />
        <KPI label="Active Companies" value={data.active?.toLocaleString() ?? '—'} sub="active in 30 days" color="#6366f1" />
        <KPI label="Trial" value={data.trials?.toLocaleString() ?? '—'} sub="on trial plan" color="#f59e0b" />
        <KPI label="Paid" value={data.paid?.toLocaleString() ?? '—'} sub="paid plans" color="#10b981" />
        <KPI label="MRR" value={`$${(data.mrr ?? 0).toLocaleString()}`} sub={data.mrrSource === 'subscriptions' ? 'from Stripe subs' : 'est. from plans'} color="#8b5cf6" />
        <KPI label="ARR" value={`$${(data.arr ?? 0).toLocaleString()}`} sub="annual run rate" color="#ec4899" />
        <KPI label="Conversion" value={data.conversion != null ? `${data.conversion}%` : '—'} sub="paid ÷ (paid + trial)" color="#0891b2" />
        <KPI label="New Today" value={data.today?.toLocaleString() ?? '0'} sub="signups in last 24h" color="#10b981" />
        <KPI label="DAC" value={data.dac?.toLocaleString() ?? '—'} sub="active companies today" color="#6366f1" />
        <KPI label="Total Ideas" value={data.ideas?.toLocaleString() ?? '—'} sub="across all boards" color="#f59e0b" />
        <KPI label="Help Articles" value={data.articles?.toLocaleString() ?? '—'} sub="published" color="#0891b2" />
      </div>

      {/* Attention Required */}
      <AttentionPanel />

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Daily active companies (REAL: activity in conversations + ideas) */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Daily Active Companies</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Last 7 days · companies with chat or idea activity</p>
          <MiniBar data={(data.activeSeries || []).map((d: any) => ({ label: new Date(d.day).toLocaleDateString([], { weekday: 'short' }), value: d.count }))} color="#6366f1" />
        </div>

        {/* Plan distribution (REAL: companies.plan) */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 16 }}>Plan Distribution</p>
          {(() => {
            const dist = data.planDistribution || {}
            const order = ['growth', 'business', 'startup', 'trial', 'free', 'enterprise', 'suspended']
            const colors: Record<string, string> = { growth: '#ff7a6b', business: '#6366f1', startup: '#10b981', trial: '#f59e0b', free: '#d1d5db', enterprise: '#8b5cf6', suspended: '#ef4444' }
            const total = Object.values(dist).reduce((a: number, b: any) => a + b, 0) as number
            const keys = Object.keys(dist).sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
            if (total === 0) return <p style={{ fontSize: 12, color: 'var(--sa-muted)' }}>No companies yet.</p>
            return keys.map(k => {
              const pct = Math.round((dist[k] / total) * 100)
              return (
                <div key={k} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: 'var(--sa-muted)', textTransform: 'capitalize' }}>{k} ({dist[k]})</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text)' }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--sa-border)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: colors[k] || '#9ca3af', borderRadius: 999 }} />
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>

      {/* System health + activity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* System health */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 16 }}>System Health</p>
          {[
            { label: 'API Latency', value: '48ms', status: 'healthy', pct: 95 },
            { label: 'Database', value: '12ms', status: 'healthy', pct: 98 },
            { label: 'Storage Used', value: '34%', status: 'healthy', pct: 34 },
            { label: 'Email Delivery', value: '99.2%', status: 'healthy', pct: 99 },
            { label: 'Webhook Success', value: '97.8%', status: 'healthy', pct: 98 },
            { label: 'Queue Depth', value: '12 jobs', status: 'healthy', pct: 5 },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ flex: 1, marginRight: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text)' }}>{s.value}</span>
                </div>
                <Progress value={s.pct} color="#10b981" />
              </div>
              <Badge status={s.status} />
            </div>
          ))}
        </div>

        {/* Activity feed */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 16 }}>Recent Activity</p>
          {[
            { action: 'New company signed up', detail: 'prexty.colvy.com', time: '2m ago', color: '#10b981' },
            { action: 'Subscription upgraded', detail: 'Free → Growth plan', time: '8m ago', color: '#6366f1' },
            { action: 'Support ticket opened', detail: '#1042 — Help center not loading', time: '14m ago', color: '#f59e0b' },
            { action: 'Company suspended', detail: 'spam-board.colvy.com', time: '31m ago', color: '#ef4444' },
            { action: 'New company signed up', detail: 'neplay.colvy.com', time: '45m ago', color: '#10b981' },
            { action: 'Feature flag toggled', detail: 'AI Assistant → enabled for roxy', time: '1h ago', color: '#8b5cf6' },
            { action: 'Webhook failure', detail: '3 failed deliveries — acme.io', time: '2h ago', color: '#ef4444' },
            { action: 'Subscription renewed', detail: 'Growth plan — $149/mo', time: '3h ago', color: '#10b981' },
          ].map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, marginTop: 5, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: 'var(--sa-text)', marginBottom: 2 }}>{a.action}</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</p>
              </div>
              <span style={{ fontSize: 11, color: 'var(--sa-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function paBtn(color = 'var(--sa-muted)', filled = false): React.CSSProperties {
  return { padding: '7px 13px', borderRadius: 9, border: filled ? 'none' : '1px solid var(--sa-border)', background: filled ? color : 'transparent', color: filled ? '#fff' : color, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-block' }
}
const paLabel: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--sa-muted)', marginTop: 14, marginBottom: 5 }
const paInput: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13.5, boxSizing: 'border-box', fontFamily: 'inherit' }
function paQuick(color: string): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 14, border: '1px solid var(--sa-border)', borderLeft: `3px solid ${color}`, background: 'var(--sa-card)', textDecoration: 'none', cursor: 'pointer' }
}
function paField(label: string, value: string, onChange: (v: string) => void, placeholder = '', hint = '') {
  return (
    <div>
      <label style={paLabel}>{label}</label>
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={paInput} />
      {hint && <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [editCo, setEditCo] = useState<any>(null)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [editErr, setEditErr] = useState('')

  const openEdit = (co: any) => {
    setEditErr('')
    setForm({
      name: co.name || '', slug: co.slug || '', plan: co.plan || 'free',
      business_phone: co.business_phone || '', assigned_admin_email: co.assigned_admin_email || '',
      board_domain: co.board_domain || '', help_domain: co.help_domain || '',
      accent_color: co.accent_color || '#ff7a6b', owner_email: '', notes: co.notes || '',
    })
    setEditCo(co)
  }

  const saveEdit = async () => {
    if (!editCo) return
    setSaving(true); setEditErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ companyId: editCo.id, patch: form }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      setCompanies(prev => prev.map(c => c.id === editCo.id ? { ...c, ...data.company } : c))
      setMsg(`${data.company?.name || 'Company'} updated`)
      setEditCo(null)
    } catch (e: any) { setEditErr(e.message) } finally { setSaving(false) }
  }

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('*').order('created_at', { ascending: false }).limit(100)
      setCompanies(data || [])
      setLoading(false)
    })()
  }, [])

  const [imp, setImp] = useState<any>(null)
  const [detailCo, setDetailCo] = useState<any>(null)
  const startImpersonation = async () => {
    if (!imp?.reason?.trim()) { setImp((s: any) => ({ ...s, err: 'A reason is required.' })); return }
    setImp((s: any) => ({ ...s, busy: true, err: '' }))
    const r = await auditedEnterWorkspace(imp.co, imp.reason, imp.mode, imp.minutes)
    if (!r.ok) { setImp((s: any) => ({ ...s, busy: false, err: r.error })); return }
    setImp(null)
  }

  const action = async (type: string, co: any) => {
    setMsg('')
    // Safe impersonation: capture a reason + mode, record an audit session,
    // then open the workspace with the session id so it shows the banner.
    if (type === 'impersonate') { setImp({ co, reason: '', mode: 'full', minutes: 60, busy: false, err: '' }); return }
    if (type === 'view') { window.open(`https://${co.slug}.colvy.com`, '_blank'); return }
    if (type === 'suspend') {
      await (supabase as any).from('companies').update({ plan: 'suspended' }).eq('id', co.id)
      setCompanies(prev => prev.map(c => c.id === co.id ? { ...c, plan: 'suspended' } : c))
      setMsg(`${co.name} suspended`)
    }
    if (type === 'reactivate') {
      await (supabase as any).from('companies').update({ plan: 'free' }).eq('id', co.id)
      setCompanies(prev => prev.map(c => c.id === co.id ? { ...c, plan: 'free' } : c))
      setMsg(`${co.name} reactivated`)
    }
    if (type === 'seed') {
      await fetch('/api/seed-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: co.id, companyName: co.name, clearFirst: true }) })
      setMsg(`Sample data seeded for ${co.name}`)
    }
  }

  const filtered = companies.filter(c => {
    if (filter !== 'all' && c.plan !== filter) return false
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.slug?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div>
      <SectionHeader title="Companies" sub={`${companies.length} total companies on the platform`}
        action={<div style={{ display: 'flex', gap: 8 }}>
          <a href="https://colvy.com/admin/create-company" style={{ padding: '8px 14px', borderRadius: 10, background: '#ff7a6b', color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>+ New Company</a>
        </div>}
      />
      {msg && <div style={{ padding: '10px 16px', borderRadius: 10, background: '#d1fae5', color: '#065f46', fontSize: 13, marginBottom: 16, fontWeight: 500 }}>{msg}</div>}

      {/* Safe impersonation modal */}
      {imp && (
        <div onClick={() => !imp.busy && setImp(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '94vw', background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 24 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 4px' }}>Enter {imp.co.name} workspace</p>
            <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>You'll enter as super admin using your own account. This session is recorded in the audit log, and a banner shows inside the workspace until you exit.</p>
            <label style={paLabel}>Reason (required)</label>
            <input value={imp.reason} onChange={e => setImp((s: any) => ({ ...s, reason: e.target.value }))} placeholder="e.g. Investigating support ticket #1042" style={paInput} autoFocus />
            <label style={paLabel}>Mode</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['full', 'Full support'], ['read_only', 'Read-only']].map(([v, l]) => (
                <button key={v} onClick={() => setImp((s: any) => ({ ...s, mode: v }))} style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1px solid ${imp.mode === v ? '#ff7a6b' : 'var(--sa-border)'}`, background: imp.mode === v ? '#ff7a6b22' : 'transparent', color: imp.mode === v ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
              ))}
            </div>
            <label style={paLabel}>Auto-expire after</label>
            <select value={imp.minutes} onChange={e => setImp((s: any) => ({ ...s, minutes: Number(e.target.value) }))} style={paInput}>
              {[15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            {imp.err && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{imp.err}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button onClick={() => setImp(null)} disabled={imp.busy} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={startImpersonation} disabled={imp.busy} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#ff7a6b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{imp.busy ? 'Entering…' : 'Enter workspace →'}</button>
            </div>
          </div>
        </div>
      )}

      {detailCo && <BusinessDetail co={detailCo} onClose={() => setDetailCo(null)} onAction={action} />}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <SearchBar placeholder="Search companies..." value={search} onChange={setSearch} />
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'free', 'trial', 'startup', 'business', 'growth', 'suspended'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--sa-border)', background: filter === f ? '#ff7a6b' : 'var(--sa-card)', color: filter === f ? '#fff' : 'var(--sa-muted)', fontSize: 12, fontWeight: filter === f ? 700 : 400, cursor: 'pointer', textTransform: 'capitalize' as const }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Company', 'Slug', 'Plan', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No companies found</td></tr>
            ) : filtered.map((co, i) => (
              <tr key={co.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: co.accent_color || '#ff7a6b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                      {co.name?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p onClick={() => setDetailCo(co)} title="Open business detail" style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ff7a6b')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--sa-text)')}>{co.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{co.industry || 'No industry'}</p>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <code style={{ fontSize: 12, color: 'var(--sa-muted)', background: 'var(--sa-hover)', padding: '2px 7px', borderRadius: 5 }}>{co.slug}.colvy.com</code>
                </td>
                <td style={{ padding: '12px 16px' }}><Badge status={co.plan || 'free'} /></td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>
                  {new Date(co.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openEdit(co)} title="Edit company" style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#ff7a6b', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Edit</button>
                    <button onClick={() => action('view', co)} title="View board" style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 12 }}>{I.external}</button>
                    <button onClick={() => action('impersonate', co)} title="Impersonate admin" style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 12 }}>{I.users}</button>
                    <button onClick={() => action('seed', co)} title="Seed sample data" style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>{I.refresh}</button>
                    {co.plan === 'suspended'
                      ? <button onClick={() => action('reactivate', co)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #10b981', background: '#d1fae5', color: '#065f46', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Restore</button>
                      : <button onClick={() => action('suspend', co)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid #fca5a5', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Suspend</button>
                    }
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit company drawer */}
      {editCo && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }} onClick={() => setEditCo(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 460, maxWidth: '100%', height: '100%', background: 'var(--sa-card)', borderLeft: '1px solid var(--sa-border)', overflowY: 'auto' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--sa-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--sa-card)' }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--sa-text)' }}>Edit {editCo.name}</h2>
              <button onClick={() => setEditCo(null)} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer' }}>{I.x}</button>
            </div>
            <div style={{ padding: 22 }}>
              {editErr && <div style={{ padding: '9px 12px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 12.5, marginBottom: 14 }}>{editErr}</div>}

              {paField('Company name', form.name, v => setForm({ ...form, name: v }))}
              {paField('Slug (subdomain)', form.slug, v => setForm({ ...form, slug: v }), 'company', `Board URL: ${form.slug || '…'}.colvy.com`)}
              {paField('Business phone', form.business_phone, v => setForm({ ...form, business_phone: v }), '+61…')}
              {paField('Assigned admin (email)', form.assigned_admin_email, v => setForm({ ...form, assigned_admin_email: v }), 'staff@company.com', 'Who manages this account (informational).')}
              {paField('Reassign owner (email)', form.owner_email, v => setForm({ ...form, owner_email: v }), 'newowner@company.com', 'Transfers ownership. The user must already have a Colvy account. Leave blank to keep current owner.')}
              {paField('Custom board domain', form.board_domain, v => setForm({ ...form, board_domain: v }), 'feedback.company.com')}
              {paField('Custom help domain', form.help_domain, v => setForm({ ...form, help_domain: v }), 'help.company.com')}

              <label style={paLabel}>Plan</label>
              <select value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })} style={paInput}>
                {['free', 'trial', 'startup', 'business', 'growth', 'suspended'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>

              <label style={paLabel}>Accent colour</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.accent_color} onChange={e => setForm({ ...form, accent_color: e.target.value })} style={{ width: 44, height: 38, border: '1px solid var(--sa-border)', borderRadius: 8, background: 'none', cursor: 'pointer' }} />
                <input value={form.accent_color} onChange={e => setForm({ ...form, accent_color: e.target.value })} style={{ ...paInput, marginBottom: 0 }} />
              </div>

              <label style={paLabel}>Internal notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...paInput, resize: 'vertical' }} />

              <button onClick={saveEdit} disabled={saving} style={{ width: '100%', padding: 12, borderRadius: 10, background: '#ff7a6b', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginTop: 10 }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/platform-admin/users', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load users')
        setUsers(data.users || [])
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const filtered = users.filter(u => !search
    || (u.name || '').toLowerCase().includes(search.toLowerCase())
    || (u.email || '').toLowerCase().includes(search.toLowerCase())
    || (u.companies || []).some((c: any) => (c.name || '').toLowerCase().includes(search.toLowerCase()) || (c.slug || '').toLowerCase().includes(search.toLowerCase())))

  return (
    <div>
      <SectionHeader title="Users" sub={`All registered accounts (${users.length})`} />
      <div style={{ marginBottom: 16 }}><SearchBar placeholder="Search by name, email, or company..." value={search} onChange={setSearch} /></div>
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['User', 'Email', 'Owns', 'Joined', 'Last sign-in', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>No users found</td></tr>
            : filtered.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ff7a6b, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                      {(u.name || u.email || '?')[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.email}{!u.confirmed && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>(unconfirmed)</span>}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-text)' }}>
                  {u.companies.length === 0 ? <span style={{ color: 'var(--sa-muted)' }}>—</span> : u.companies.map((c: any) => c.name).join(', ')}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'never'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {u.companies[0]?.slug && <button onClick={async () => {
                      const co = u.companies[0]
                      const reason = window.prompt(`Reason for entering ${co.name || co.slug} as an admin — recorded in the audit log:`, 'Support / troubleshooting')
                      if (!reason || !reason.trim()) return
                      const r = await auditedEnterWorkspace({ id: co.id, slug: co.slug, name: co.name }, reason.trim())
                      if (!r.ok) alert(r.error || 'Could not start session')
                    }} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>Login as</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AnalyticsPage() {
  const growth = [12, 19, 15, 25, 22, 31, 28, 38, 35, 42, 39, 48]
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const features = [
    { name: 'Ideas Board', adoption: 98, color: '#ff7a6b' },
    { name: 'Roadmap', adoption: 74, color: '#6366f1' },
    { name: 'Announcements', adoption: 61, color: '#10b981' },
    { name: 'Help Center', adoption: 48, color: '#f59e0b' },
    { name: 'Live Chat', adoption: 29, color: '#8b5cf6' },
    { name: 'AI Assistant', adoption: 22, color: '#ec4899' },
    { name: 'Custom Domain', adoption: 18, color: '#0891b2' },
    { name: 'API Access', adoption: 15, color: '#14b8a6' },
  ]
  return (
    <div>
      <SectionHeader title="Analytics" sub="Platform-wide usage and growth metrics" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Company Growth</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>New companies per month</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 80 }}>
            {growth.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', background: 'linear-gradient(to top, #ff7a6b, #ff9a8b)', borderRadius: '4px 4px 0 0', height: `${(v / 48) * 68}px`, transition: 'height 0.4s ease' }} />
                <span style={{ fontSize: 9, color: 'var(--sa-muted)' }}>{months[i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Feature Adoption</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>% of companies using each feature</p>
          {features.map(f => (
            <div key={f.name} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{f.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sa-text)' }}>{f.adoption}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--sa-border)' }}>
                <div style={{ height: '100%', width: `${f.adoption}%`, background: f.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
        <KPI label="Avg Session" value="8.4m" trend={12} sub="per user" color="#6366f1" />
        <KPI label="Ideas / Company" value="34" trend={8} sub="average" color="#ff7a6b" />
        <KPI label="Vote Rate" value="67%" trend={5} sub="ideas with votes" color="#10b981" />
        <KPI label="NPS Score" value="71" trend={3} sub="platform average" color="#f59e0b" />
      </div>
    </div>
  )
}

function FeatureFlagsPage({ data }: { data: any }) {
  const [flags, setFlags] = useState<Record<string, boolean>>({
    help_center: true, live_chat: true, ideas_board: true, roadmaps: true,
    announcements: true, ai_assistant: false, whatsapp: false, white_label: false,
    custom_domain: false, api_access: false, sso: false,
  })
  const [companies, setCompanies] = useState<any[]>([])
  const [selCo, setSelCo] = useState<string>('global')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data: cos } = await (supabase as any).from('companies').select('id,name,slug').order('name')
      setCompanies(cos || [])
    })()
  }, [])

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  const flagConfig = [
    { key: 'help_center', label: 'Help Center', desc: 'Public knowledge base and support docs', plan: 'all' },
    { key: 'ideas_board', label: 'Ideas Board', desc: 'Customer feedback and idea voting', plan: 'all' },
    { key: 'roadmaps', label: 'Roadmaps', desc: 'Public roadmap kanban board', plan: 'all' },
    { key: 'announcements', label: 'Announcements', desc: 'Changelog and release notes', plan: 'all' },
    { key: 'live_chat', label: 'Live Chat', desc: 'Real-time customer support chat', plan: 'startup+' },
    { key: 'ai_assistant', label: 'AI Assistant', desc: 'GPT-powered idea summarization and triage', plan: 'business+' },
    { key: 'white_label', label: 'White Label', desc: 'Remove Colvy branding from board', plan: 'business+' },
    { key: 'custom_domain', label: 'Custom Domain', desc: 'Use your own domain (help.yourco.com)', plan: 'business+' },
    { key: 'api_access', label: 'API Access', desc: 'REST API and webhook access', plan: 'growth' },
    { key: 'whatsapp', label: 'WhatsApp Integration', desc: 'Collect feedback via WhatsApp', plan: 'growth' },
    { key: 'sso', label: 'SSO / SAML', desc: 'Single sign-on via Google, SAML 2.0', plan: 'enterprise' },
  ]

  return (
    <div>
      <SectionHeader title="Feature Flags" sub="Enable or disable features globally or per company"
        action={
          <button onClick={save} style={{ padding: '8px 18px', borderRadius: 10, background: saved ? '#10b981' : '#ff7a6b', color: '#fff', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            {saved ? '✓ Saved' : 'Save Changes'}
          </button>
        }
      />
      {/* Scope selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' as const }}>
        <button onClick={() => setSelCo('global')} style={{ padding: '7px 14px', borderRadius: 9, border: `1.5px solid ${selCo === 'global' ? '#ff7a6b' : 'var(--sa-border)'}`, background: selCo === 'global' ? '#ff7a6b18' : 'var(--sa-card)', color: selCo === 'global' ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Global defaults
        </button>
        <select value={selCo} onChange={e => setSelCo(e.target.value)}
          style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="global">Global defaults</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        {flagConfig.map((f, i) => (
          <div key={f.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: i < flagConfig.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--sa-text)' }}>{f.label}</span>
                <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 999, background: 'var(--sa-hover)', color: 'var(--sa-muted)', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{f.plan}</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{f.desc}</p>
            </div>
            <Toggle on={flags[f.key]} onChange={() => setFlags(p => ({ ...p, [f.key]: !p[f.key] }))} />
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemPage() {
  const [checks, setChecks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const results: any[] = []
      // Real: database connectivity + latency (round-trip of a tiny query).
      const t0 = performance.now()
      try {
        await (supabase as any).from('companies').select('id', { count: 'exact', head: true })
        const ms = Math.round(performance.now() - t0)
        results.push({ label: 'Database', value: `${ms}ms`, status: ms < 500 ? 'healthy' : 'warn', note: 'Live round-trip from your browser', real: true })
      } catch {
        results.push({ label: 'Database', value: 'unreachable', status: 'error', note: 'Query failed', real: true })
      }
      // Real: recent stripe events processed (a health signal for billing).
      try {
        const since = new Date(Date.now() - 86400000).toISOString()
        const { count } = await (supabase as any).from('stripe_events').select('*', { count: 'exact', head: true }).gte('created_at', since)
        results.push({ label: 'Stripe events (24h)', value: String(count || 0), status: 'healthy', note: 'Webhook deliveries received', real: true })
      } catch {
        results.push({ label: 'Stripe events (24h)', value: 'n/a', status: 'warn', note: 'Table not available', real: true })
      }
      // Real: total DB rows in key tables (rough size signal).
      try {
        const [{ count: convs }, { count: msgs }] = await Promise.all([
          (supabase as any).from('conversations').select('*', { count: 'exact', head: true }),
          (supabase as any).from('messages').select('*', { count: 'exact', head: true }),
        ])
        results.push({ label: 'Conversations', value: (convs || 0).toLocaleString(), status: 'healthy', note: 'Total records', real: true })
        results.push({ label: 'Messages', value: (msgs || 0).toLocaleString(), status: 'healthy', note: 'Total records', real: true })
      } catch {}
      setChecks(results); setLoading(false)
    })()
  }, [])

  // Infra metrics we can't measure from the app — shown honestly, not faked.
  const notMonitored = [
    { label: 'API latency (p95)', note: 'Use Vercel Analytics' },
    { label: 'Email delivery', note: 'Use Resend dashboard' },
    { label: 'Storage used', note: 'Use Supabase dashboard' },
    { label: 'CDN cache hit rate', note: 'Use your CDN provider' },
  ]

  return (
    <div>
      <SectionHeader title="System Health" sub="Live checks from your data — infra metrics link out to their dashboards" />
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '4px 0 10px' }}>Live checks</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 26 }}>
        {loading ? <p style={{ color: 'var(--sa-muted)' }}>Running checks…</p> : checks.map(m => (
          <div key={m.label} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{m.label}</span>
              <Badge status={m.status} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', marginBottom: 4 }}>{m.value}</div>
            <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{m.note}</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '4px 0 10px' }}>Not monitored here</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {notMonitored.map(m => (
          <div key={m.label} style={{ background: 'var(--sa-card)', border: '1px dashed var(--sa-border)', borderRadius: 14, padding: 18, opacity: 0.75 }}>
            <span style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{m.label}</span>
            <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '6px 0 0' }}>{m.note}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// Aggregates content of one type across every company, with the company name
// resolved for each row. Used by the Ideas / Roadmaps / Announcements / Help pages.
function CrossCompanyContent({ title, sub, table, statusFilter, titleField, extraCol }: {
  title: string; sub: string; table: string; statusFilter?: string[]; titleField?: string; extraCol?: { header: string; render: (r: any) => React.ReactNode }
}) {
  const [rows, setRows] = useState<any[]>([])
  const [companies, setCompanies] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data: cos } = await (supabase as any).from('companies').select('id, name, slug')
        const map: Record<string, any> = {}
        ;(cos || []).forEach((c: any) => { map[c.id] = c })
        setCompanies(map)

        let q = (supabase as any).from(table).select('*').order('created_at', { ascending: false }).limit(200)
        if (statusFilter && statusFilter.length) q = q.in('status', statusFilter)
        const { data, error } = await q
        if (error) throw new Error(error.message)
        setRows(data || [])
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [table])

  const tf = titleField || 'title'
  const filtered = rows.filter(r => {
    if (!search) return true
    const co = companies[r.company_id]
    const hay = [r[tf], r.status, co?.name, co?.slug].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(search.toLowerCase())
  })

  return (
    <div>
      <SectionHeader title={title} sub={`${sub} (${rows.length})`} />
      <div style={{ marginBottom: 16 }}><SearchBar placeholder={`Search ${title.toLowerCase()}...`} value={search} onChange={setSearch} /></div>
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Title', 'Company', 'Status', extraCol?.header || 'Created'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Nothing here yet</td></tr>
            : filtered.map((r, i) => {
              const co = companies[r.company_id]
              return (
                <tr key={r.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--sa-text)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[tf] || '(untitled)'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>
                    {co ? <button onClick={() => window.open(`https://${co.slug}.colvy.com`, '_blank')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, padding: 0 }}>{co.name}</button> : '—'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>{r.status ? <Badge status={r.status} /> : <span style={{ color: 'var(--sa-muted)', fontSize: 12 }}>—</span>}</td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{extraCol ? extraCol.render(r) : (r.created_at ? new Date(r.created_at).toLocaleDateString() : '—')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([])
  const [mrr, setMrr] = useState(0)
  const [arr, setArr] = useState(0)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/subscriptions', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load subscriptions')
      setSubs(data.subscriptions || []); setMrr(data.mrr || 0); setArr(data.arr || 0)
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const sync = async () => {
    setSyncing(true); setMsg(''); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/subscriptions', { method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Sync failed')
      setMsg(`Synced ${data.synced} subscription${data.synced === 1 ? '' : 's'} from Stripe${data.skipped ? ` (${data.skipped} skipped — no matching user)` : ''}.`)
      await load()
    } catch (e: any) { setErr(e.message) } finally { setSyncing(false) }
  }

  const STATUS_COLOR: Record<string, string> = { active: '#10b981', trialing: '#6366f1', past_due: '#f59e0b', canceled: '#ef4444' }

  return (
    <div>
      <SectionHeader title="Subscriptions" sub="Live Stripe subscriptions and recurring revenue"
        action={<button onClick={sync} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none', background: '#635BFF', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{I.refresh} {syncing ? 'Syncing…' : 'Sync from Stripe'}</button>} />

      {msg && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#ecfdf5', color: '#059669', fontSize: 13, marginBottom: 14 }}>{msg}</div>}
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {/* MRR / ARR summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPI label="MRR" value={`$${mrr.toLocaleString()}`} sub="from active subscriptions" color="#8b5cf6" />
        <KPI label="ARR" value={`$${arr.toLocaleString()}`} sub="annual run rate" color="#ec4899" />
        <KPI label="Active subs" value={subs.filter(s => s.status === 'active').length.toLocaleString()} sub="paying now" color="#10b981" />
        <KPI label="Total subs" value={subs.length.toLocaleString()} sub="incl. trials / past due" color="#6366f1" />
      </div>

      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Company', 'Plan', 'Amount', 'Monthly', 'Renews', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : subs.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No subscriptions yet. Click "Sync from Stripe" to pull existing ones.</td></tr>
            : subs.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: i < subs.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{s.company?.name || <span style={{ color: 'var(--sa-muted)', fontWeight: 400 }}>Unlinked</span>}</td>
                <td style={{ padding: '12px 16px' }}><Badge status={s.tier || 'free'} /></td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--sa-text)' }}>{s.currency} ${s.amount.toLocaleString()} / {s.interval}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--sa-text)' }}>${s.monthly.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: STATUS_COLOR[s.status] || '#6b7280', textTransform: 'capitalize' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[s.status] || '#6b7280' }} />{s.status.replace('_', ' ')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TicketsPage() {
  const [tickets, setTickets] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')

  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/tickets', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load tickets')
      setTickets(data.tickets || []); setCounts(data.counts || {})
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const changeStatus = async (ticketId: string, status: string) => {
    setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status } : t))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/platform-admin/tickets', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ ticketId, status }) })
    } catch {}
  }

  const PRIORITY_COLOR: Record<string, string> = { low: '#9ca3af', normal: '#6366f1', high: '#f59e0b', urgent: '#ef4444' }
  const filtered = tickets.filter(t => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false
    if (!search) return true
    const hay = [t.ticket_number, t.subject, t.description, t.company?.name, t.contact?.name, t.contact?.email].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(search.toLowerCase())
  })

  return (
    <div>
      <SectionHeader title="Support Tickets" sub={`All tickets across every company (${tickets.length})`}
        action={<button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 13, cursor: 'pointer' }}>{I.refresh} Refresh</button>} />

      {/* Status summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'All', tickets.length], ['open', 'Open', counts.open || 0], ['in_progress', 'In Progress', counts.in_progress || 0], ['resolved', 'Resolved', counts.resolved || 0], ['closed', 'Closed', counts.closed || 0]].map(([key, label, n]: any) => (
          <button key={key} onClick={() => setStatusFilter(key)}
            style={{ padding: '8px 14px', borderRadius: 10, border: statusFilter === key ? '2px solid #ff7a6b' : '1px solid var(--sa-border)', background: statusFilter === key ? 'rgba(255,122,107,0.1)' : 'var(--sa-card)', color: statusFilter === key ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {label} <span style={{ opacity: 0.7 }}>({n})</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}><SearchBar placeholder="Search ticket #, subject, company, customer..." value={search} onChange={setSearch} /></div>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 13 }}>
          <option value="all">All priorities</option>
          <option value="urgent">Urgent</option><option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
        </select>
      </div>

      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Ticket', 'Company', 'Customer', 'Priority', 'Created', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>No tickets found</td></tr>
            : filtered.map((t, i) => (
              <tr key={t.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{t.ticket_number}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sa-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject || '(no subject)'}</p>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>
                  {t.company ? <button onClick={() => window.open(`https://${t.company.slug}.colvy.com/admin/inbox`, '_blank')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, padding: 0 }}>{t.company.name}</button> : '—'}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{t.contact?.name || t.contact?.email || '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: PRIORITY_COLOR[t.priority] || '#6366f1', textTransform: 'capitalize' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[t.priority] || '#6366f1' }} />{t.priority}
                  </span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{t.created_at ? new Date(t.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <select value={t.status} onChange={e => changeStatus(t.id, e.target.value)}
                    style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 12, cursor: 'pointer' }}>
                    <option value="open">Open</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LiveChatPage() {
  const [convs, setConvs] = useState<any[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/platform-admin/ops?view=chat', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load conversations')
        setConvs(data.conversations || []); setCounts(data.counts || {})
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const STATUS_COLOR: Record<string, string> = { open: '#f59e0b', assigned: '#6366f1', resolved: '#10b981', closed: '#9ca3af' }
  const filtered = convs.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (!search) return true
    return [c.subject, c.last_message, c.company?.name].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div>
      <SectionHeader title="Live Chat" sub={`All conversations across every company (${convs.length})`} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['all', 'All', convs.length], ['open', 'Open', counts.open || 0], ['assigned', 'Assigned', counts.assigned || 0], ['resolved', 'Resolved', counts.resolved || 0], ['closed', 'Closed', counts.closed || 0]].map(([k, label, n]: any) => (
          <button key={k} onClick={() => setStatusFilter(k)} style={{ padding: '8px 14px', borderRadius: 10, border: statusFilter === k ? '2px solid #ff7a6b' : '1px solid var(--sa-border)', background: statusFilter === k ? 'rgba(255,122,107,0.1)' : 'var(--sa-card)', color: statusFilter === k ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{label} <span style={{ opacity: 0.7 }}>({n})</span></button>
        ))}
      </div>
      <div style={{ marginBottom: 16 }}><SearchBar placeholder="Search conversations..." value={search} onChange={setSearch} /></div>
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Conversation', 'Company', 'Channel', 'Last activity', 'Status'].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>No conversations</td></tr>
            : filtered.map((c, i) => (
              <tr key={c.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', maxWidth: 320 }}>
                  <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)' }}>{c.subject || 'Conversation'}{c.is_unread && <span style={{ marginLeft: 6, width: 7, height: 7, borderRadius: '50%', background: '#ff7a6b', display: 'inline-block' }} />}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.last_message || '—'}</p>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{c.company ? <button onClick={() => window.open(`https://${c.company.slug}.colvy.com/admin/inbox`, '_blank')} style={{ background: 'none', border: 'none', color: '#6366f1', cursor: 'pointer', fontSize: 12, padding: 0 }}>{c.company.name}</button> : '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)', textTransform: 'capitalize' }}>{c.channel}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : '—'}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: STATUS_COLOR[c.status] || '#6b7280', textTransform: 'capitalize' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[c.status] || '#6b7280' }} />{c.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ModerationPage() {
  const [spam, setSpam] = useState<any[]>([])
  const [flaggedIdeas, setFlaggedIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/ops?view=moderation', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load')
      setSpam(data.spam || []); setFlaggedIdeas(data.flaggedIdeas || [])
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const act = async (action: string, id: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/platform-admin/ops', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` }, body: JSON.stringify({ action, id }) })
    if (action === 'unspam') setSpam(prev => prev.filter(s => s.id !== id))
    if (action === 'unflag_idea') setFlaggedIdeas(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div>
      <SectionHeader title="Moderation" sub="Spam-flagged conversations and reported content" action={<button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 13, cursor: 'pointer' }}>{I.refresh} Refresh</button>} />
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '8px 0 10px' }}>Spam conversations ({spam.length})</p>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden', marginBottom: 24 }}>
        {loading ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</p>
        : spam.length === 0 ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--sa-muted)' }}>Nothing flagged as spam. </p>
        : spam.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < spam.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.last_message || s.subject || 'Conversation'}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>{s.company?.name || '—'} · {s.channel}</p>
            </div>
            <button onClick={() => act('unspam', s.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Not spam</button>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '8px 0 10px' }}>Flagged ideas ({flaggedIdeas.length})</p>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        {flaggedIdeas.length === 0 ? <p style={{ padding: 24, textAlign: 'center', color: 'var(--sa-muted)' }}>No flagged ideas.</p>
        : flaggedIdeas.map((it, i) => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: i < flaggedIdeas.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--sa-text)' }}>{it.title}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--sa-muted)' }}>{it.company?.name || '—'}</p>
            </div>
            <button onClick={() => act('unflag_idea', it.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: '#10b981', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Clear flag</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function BillingPage() {
  const [pays, setPays] = useState<any[]>([])
  const [paid, setPaid] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/platform-admin/ops?view=billing', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load')
        setPays(data.payments || []); setPaid(data.paid || 0); setPending(data.pending || 0)
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const STATUS_COLOR: Record<string, string> = { paid: '#10b981', pending: '#f59e0b', failed: '#ef4444', cancelled: '#9ca3af' }
  return (
    <div>
      <SectionHeader title="Billing" sub="In-chat payments collected across all companies" />
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <KPI label="Collected" value={`$${paid.toLocaleString()}`} sub="paid via chat" color="#10b981" />
        <KPI label="Pending" value={`$${pending.toLocaleString()}`} sub="awaiting payment" color="#f59e0b" />
        <KPI label="Payments" value={pays.length.toLocaleString()} sub="total records" color="#6366f1" />
      </div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Description', 'Company', 'Amount', 'Date', 'Status', ''].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : pays.length === 0 ? <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No chat payments yet.</td></tr>
            : pays.map((p, i) => (
              <tr key={p.id} style={{ borderBottom: i < pays.length - 1 ? '1px solid var(--sa-border)' : 'none' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--sa-text)' }}>{p.description || 'Payment'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{p.company?.name || '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)' }}>{p.currency} ${p.amount.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td style={{ padding: '12px 16px' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: STATUS_COLOR[p.status] || '#6b7280', textTransform: 'capitalize' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[p.status] || '#6b7280' }} />{p.status}</span></td>
                <td style={{ padding: '12px 16px' }}>{p.receipt_url && <a href={p.receipt_url} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#6366f1' }}>Receipt</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Platform · SMS Pricing — the GLOBAL SMS pricing set by the super admin, which
// applies to every organisation. Stored in platform_settings (key 'sms_pricing')
// and read by the campaign cost estimator (resolveSmsPricing). Moved here from
// the customer dashboard: what a customer is charged is a platform decision.
function SmsPricingPage() {
  const [p, setP] = useState<SmsPricing>(DEFAULT_PRICING)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    ;(async () => {
      try {
        const { data, error } = await (supabase as any).from('platform_settings').select('value').eq('key', 'sms_pricing').maybeSingle()
        if (error) { if (/does not exist|schema cache/i.test(error.message)) setMissing(true) }
        else if (data?.value) setP(parsePricingRow(data.value))
      } finally { setLoading(false) }
    })()
  }, [])
  const save = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await (supabase as any).from('platform_settings').upsert({
        key: 'sms_pricing', value: p, updated_by: session?.user?.email || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      if (error) { if (/does not exist|schema cache/i.test(error.message)) { setMissing(true); return } throw error }
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) { alert('Could not save: ' + e.message) } finally { setSaving(false) }
  }
  const costAud = p.fx_rate > 0 ? p.carrier_cost / p.fx_rate : 0
  const marginAt = (price: number) => {
    const ex = p.gst_inclusive ? price / (1 + p.gst_rate) : price
    const m = ex - costAud
    return { ex, m, pct: ex > 0 ? (m / ex) * 100 : 0 }
  }
  const std = marginAt(p.price_per_part)
  const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, marginBottom: 14 }
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box' }
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 10 }
  const sub: React.CSSProperties = { fontSize: 12.5, color: 'var(--sa-muted)', display: 'block', marginBottom: 5 }
  const mColor = (pct: number) => pct > 25 ? '#10b981' : pct > 10 ? '#f59e0b' : '#ef4444'
  if (loading) return <div><SectionHeader title="SMS Pricing" sub="Global pricing for all organisations" /><p style={{ color: 'var(--sa-muted)' }}>Loading…</p></div>
  return (
    <div style={{ maxWidth: 860 }}>
      <SectionHeader title="SMS Pricing" sub="Global SMS pricing — applies to every organisation's campaign cost estimates"
        action={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{savedAt && <span style={{ fontSize: 12, color: '#10b981' }}>Saved {savedAt}</span>}<button onClick={save} disabled={saving} style={paBtn('#ff7a6b', true)}>{saving ? 'Saving…' : 'Save pricing'}</button></div>} />
      {missing && <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)', marginBottom: 14 }}>Run <b>COLVY_V220_PLATFORM_SETTINGS.sql</b> to store the global pricing. Until then the built-in default applies.</div>}
      <div style={card}>
        <label style={label}>Price charged to customers</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div><span style={sub}>Per SMS part (AUD)</span><input type="number" step="0.001" value={p.price_per_part} onChange={e => setP(v => ({ ...v, price_per_part: parseFloat(e.target.value) || 0 }))} style={input} /></div>
          <div><span style={sub}>GST rate</span><input type="number" step="0.01" value={p.gst_rate} onChange={e => setP(v => ({ ...v, gst_rate: parseFloat(e.target.value) || 0 }))} style={input} /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, cursor: 'pointer', color: 'var(--sa-text)', fontSize: 13 }}>
          <input type="checkbox" checked={p.gst_inclusive} onChange={e => setP(v => ({ ...v, gst_inclusive: e.target.checked }))} /> Price includes GST
        </label>
      </div>
      <div style={card}>
        <label style={label}>Platform cost</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div><span style={sub}>Carrier cost / part</span><input type="number" step="0.001" value={p.carrier_cost} onChange={e => setP(v => ({ ...v, carrier_cost: parseFloat(e.target.value) || 0 }))} style={input} /></div>
          <div><span style={sub}>Currency</span><input value={p.carrier_currency} onChange={e => setP(v => ({ ...v, carrier_currency: e.target.value }))} style={input} /></div>
          <div><span style={sub}>AUD/{p.carrier_currency} rate</span><input type="number" step="0.001" value={p.fx_rate} onChange={e => setP(v => ({ ...v, fx_rate: parseFloat(e.target.value) || 0 }))} style={input} /></div>
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--sa-muted)' }}>Cost per part in AUD: <b style={{ color: 'var(--sa-text)' }}>{audRate(costAud)}</b> · margin at standard rate: <b style={{ color: mColor(std.pct) }}>{audRate(std.m)} ({std.pct.toFixed(1)}%)</b></p>
      </div>
      <div style={card}>
        <label style={label}>Volume discounts</label>
        {p.volume_tiers.map((t, i) => {
          const m = marginAt(t.price)
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <input type="number" value={t.min} onChange={e => setP(v => { const tiers = [...v.volume_tiers]; tiers[i] = { ...tiers[i], min: parseInt(e.target.value) || 0 }; return { ...v, volume_tiers: tiers } })} style={{ ...input, width: 120 }} />
              <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>parts and above →</span>
              <input type="number" step="0.001" value={t.price} onChange={e => setP(v => { const tiers = [...v.volume_tiers]; tiers[i] = { ...tiers[i], price: parseFloat(e.target.value) || 0 }; return { ...v, volume_tiers: tiers } })} style={{ ...input, width: 110 }} />
              <span style={{ fontSize: 12, color: mColor(m.pct), fontWeight: 600 }}>{m.pct.toFixed(1)}% margin</span>
              <button onClick={() => setP(v => ({ ...v, volume_tiers: v.volume_tiers.filter((_, j) => j !== i) }))} style={{ border: 'none', background: 'none', color: '#ef4444', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Remove</button>
            </div>
          )
        })}
        <button onClick={() => setP(v => ({ ...v, volume_tiers: [...v.volume_tiers, { min: 1000, price: v.price_per_part }] }))} style={paBtn()}>+ Add tier</button>
      </div>
      <div style={card}>
        <label style={label}>What campaigns would cost</label>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--sa-muted)' }}>{['Campaign', 'Parts', 'Rate', 'Charged', 'Margin'].map(h => <th key={h} style={{ padding: '5px 6px', fontWeight: 700 }}>{h}</th>)}</tr></thead>
          <tbody>
            {[[1, 300], [1, 842], [1, 1240], [3, 200], [1, 5000]].map(([seg, rec], i) => {
              const c = calculateCost(p, seg, rec)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--sa-border)' }}>
                  <td style={{ padding: '6px', color: 'var(--sa-text)' }}>{seg} seg × {rec.toLocaleString()}</td>
                  <td style={{ padding: '6px', color: 'var(--sa-muted)' }}>{c.parts.toLocaleString()}</td>
                  <td style={{ padding: '6px', color: 'var(--sa-muted)' }}>{audRate(c.pricePerPart)}</td>
                  <td style={{ padding: '6px', color: 'var(--sa-text)', fontWeight: 600 }}>{aud(c.totalIncGst)}</td>
                  <td style={{ padding: '6px', color: mColor(c.marginPct), fontWeight: 600 }}>{aud(c.margin)} ({c.marginPct.toFixed(0)}%)</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SettingsPage() {
  const [me, setMe] = useState<any>(null)
  useEffect(() => { supabase.auth.getSession().then(({ data }: any) => setMe(data?.session?.user || null)) }, [])

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--sa-text)', fontWeight: 600 }}>{value}</span>
    </div>
  )

  return (
    <div>
      <SectionHeader title="Settings" sub="Platform configuration" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>Super admin</p>
          <Row label="Signed in as" value={me?.email || '—'} />
          <Row label="Platform domain" value="colvy.com" />
          <Row label="Admin panel" value="admin.colvy.com" />
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>Plan pricing (MRR basis, AUD/mo)</p>
          <Row label="Startup" value="$19" />
          <Row label="Business" value="$49" />
          <Row label="Growth" value="$149" />
          <Row label="Enterprise" value="$399" />
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', marginTop: 10 }}>Used only when a company has no live Stripe subscription. Real subscriptions use the actual billed amount. Edit these in <code>app/api/platform-admin/analytics/route.ts</code>.</p>
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>Integrations status</p>
          <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.6 }}>Stripe, Telnyx, WooCommerce, Shopify and Resend keys are configured via Vercel environment variables. This panel doesn't expose secrets. Use the Subscriptions page's "Sync from Stripe" to verify Stripe connectivity.</p>
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 10 }}>Quick links</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <a href="https://colvy.com/admin" target="_blank" rel="noopener" style={{ fontSize: 13, color: '#6366f1' }}>Manage colvy.com →</a>
            <a href="https://colvy.com/admin/create-company" target="_blank" rel="noopener" style={{ fontSize: 13, color: '#6366f1' }}>Create a company →</a>
            <a href="https://dashboard.stripe.com" target="_blank" rel="noopener" style={{ fontSize: 13, color: '#6366f1' }}>Stripe dashboard →</a>
            <a href="https://supabase.com/dashboard" target="_blank" rel="noopener" style={{ fontSize: 13, color: '#6366f1' }}>Supabase dashboard →</a>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlaceholderPage({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <SectionHeader title={title} sub={sub} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 20, animation: `pulse 2s ${i * 0.15}s ease-in-out infinite alternate` }}>
            <div style={{ height: 12, borderRadius: 6, background: 'var(--sa-border)', marginBottom: 12, width: '60%' }} />
            <div style={{ height: 28, borderRadius: 6, background: 'var(--sa-border)', marginBottom: 8, width: '80%' }} />
            <div style={{ height: 10, borderRadius: 6, background: 'var(--sa-border)', width: '50%' }} />
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 48, textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--sa-hover)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sa-muted)' }}>
          {I.settings}
        </div>
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>{title}</p>
        <p style={{ fontSize: 14, color: 'var(--sa-muted)' }}>{sub} — data will populate here.</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function SuperAdmin() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  // Default to LIGHT. The choice is remembered in localStorage so it no longer
  // flips back on every reload. Initial state is deterministic (light) for SSR,
  // then the stored preference is applied on mount below.
  const [dark, setDarkState] = useState(false)
  // The active tab is mirrored in the URL hash so a reload stays on the same
  // page instead of snapping back to Overview.
  const [page, setPageState] = useState('overview')
  const [data, setData] = useState<any>({})
  const [collapsed, setCollapsed] = useState(false)

  const setDark = (v: boolean) => {
    setDarkState(v)
    try { localStorage.setItem('colvy:pa-theme', v ? 'dark' : 'light') } catch {}
  }
  const setPage = (p: string) => {
    setPageState(p)
    try { window.history.replaceState(null, '', `#${p}`) } catch {}
  }

  // On mount: restore the remembered theme and the tab from the URL hash.
  useEffect(() => {
    try {
      const t = localStorage.getItem('colvy:pa-theme')
      if (t === 'dark') setDarkState(true)
    } catch {}
    try {
      const h = window.location.hash.replace(/^#/, '')
      if (h) setPageState(h)
    } catch {}
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }: any) => {
      const u = s?.session?.user
      if (!u || u.email !== SUPER_ADMIN) {
        // Redirect to main signin (admin.colvy.com/signin would 404)
        window.location.href = 'https://colvy.com/signin'
        return
      }
      setAuthed(true)
      // Load real, computed stats from the analytics endpoint (service-role:
      // reads across all companies + subscriptions, computes activity/MRR).
      try {
        const res = await fetch('/api/platform-admin/analytics', { headers: { 'Authorization': `Bearer ${s.session.access_token}` } })
        const d = await res.json()
        if (res.ok) setData(d)
      } catch {}
    })
  }, [])

  // ── CSS vars ────────────────────────────────────────────────────────────────
  const css = dark ? {
    '--sa-bg': '#0a0a0a',
    '--sa-sidebar': '#111111',
    '--sa-card': '#161616',
    '--sa-border': '#2a2a2a',
    '--sa-text': '#f0f0f0',
    '--sa-muted': '#6b6b70',
    '--sa-hover': '#1e1e1e',
    '--sa-active': '#1a1a2e',
  } : {
    '--sa-bg': '#f4f5f7',
    '--sa-sidebar': '#ffffff',
    '--sa-card': '#ffffff',
    '--sa-border': '#e8e8eb',
    '--sa-text': '#0d0d0d',
    '--sa-muted': '#6b6b80',
    '--sa-hover': '#f8f8f8',
    '--sa-active': '#fff4f1',
  }

  if (!authed) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', gap: 16 }}>
      <div style={{ width: 36, height: 36, border: '2px solid #ff7a6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#6b6b70', fontSize: 14 }}>Checking authentication...</p>
      <a href="https://colvy.com/signin" style={{ color: '#ff7a6b', fontSize: 13, textDecoration: 'underline' }}>Sign in at colvy.com →</a>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  const SIDEBAR_W = collapsed ? 64 : 220

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", "Segoe UI", sans-serif', ...css as any } as any}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--sa-border); border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }
        button { font-family: inherit; }
        input { font-family: inherit; }
        select { font-family: inherit; }
      `}</style>

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <aside style={{
        width: SIDEBAR_W, flexShrink: 0, background: 'var(--sa-sidebar)',
        borderRight: '1px solid var(--sa-border)',
        position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.2s ease', overflow: 'hidden', zIndex: 40,
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg, #ff7a6b, #ff5247)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          {!collapsed && (
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--sa-text)', lineHeight: 1.2 }}>Colvy</p>
              <p style={{ fontSize: 10, color: 'var(--sa-muted)', fontWeight: 500 }}>Super Admin</p>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sa-muted)', padding: 4, flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {NAV.map((item: any, idx) => {
            if (item.section) {
              if (collapsed) return null
              return <p key={idx} style={{ fontSize: 10, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '14px 10px 4px' }}>{item.section}</p>
            }
            const active = page === item.key
            return (
              <button key={item.key} onClick={() => setPage(item.key)}
                title={collapsed ? item.label : undefined}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                  padding: collapsed ? '9px' : '8px 10px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  borderRadius: 9, border: 'none', cursor: 'pointer', marginBottom: 1,
                  background: active ? '#ff7a6b18' : 'transparent',
                  color: active ? '#ff7a6b' : 'var(--sa-muted)',
                  fontSize: 13, fontWeight: active ? 600 : 400,
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--sa-hover)'; e.currentTarget.style.color = 'var(--sa-text)' }}
                onMouseLeave={e => { e.currentTarget.style.background = active ? '#ff7a6b18' : 'transparent'; e.currentTarget.style.color = active ? '#ff7a6b' : 'var(--sa-muted)' }}>
                <span style={{ flexShrink: 0 }}>{(I as any)[item.icon]}</span>
                {!collapsed && item.label}
              </button>
            )
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--sa-border)', flexShrink: 0 }}>
          <button onClick={() => setDark(!dark)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: collapsed ? '9px' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: 9, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--sa-muted)', fontSize: 13 }}>
            <span>{dark ? I.sun : I.moon}</span>
            {!collapsed && (dark ? 'Light mode' : 'Dark mode')}
          </button>
          {!collapsed && (
            <div style={{ padding: '8px 10px', marginTop: 4 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text)' }}>Bikiran</p>
              <p style={{ fontSize: 11, color: 'var(--sa-muted)' }}>bishalstha76@gmail.com</p>
            </div>
          )}
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main style={{ marginLeft: SIDEBAR_W, flex: 1, background: 'var(--sa-bg)', minHeight: '100vh', transition: 'margin-left 0.2s ease' }}>
        {/* Topbar */}
        <div style={{ height: 54, borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, background: 'var(--sa-sidebar)', position: 'sticky', top: 0, zIndex: 30 }}>
          <div style={{ flex: 1, position: 'relative', maxWidth: 400 }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-muted)' }}>{I.search}</div>
            <input placeholder="Search companies, users..." style={{ width: '100%', padding: '7px 12px 7px 34px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-hover)', color: 'var(--sa-text)', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <span style={{ padding: '4px 10px', borderRadius: 999, background: '#10b98120', color: '#10b981', fontSize: 11, fontWeight: 700 }}>● All systems operational</span>
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ff7a6b, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>B</div>
        </div>

        {/* Page content */}
        <div style={{ padding: '28px 28px', maxWidth: 1400 }}>
          {page === 'overview'   && <OverviewPage data={data} />}
          {page === 'companies'  && <CompaniesPage />}
          {page === 'users'      && <UsersPage />}
          {page === 'analytics'  && <AnalyticsPage />}
          {page === 'flags'      && <FeatureFlagsPage data={data} />}
          {page === 'system'     && <SystemPage />}
          {page === 'audit'      && <AuditPage />}
          {page === 'subs'       && <SubscriptionsPage />}
          {page === 'ideas'      && <CrossCompanyContent title="Ideas" sub="All ideas across every company board" table="ideas" extraCol={{ header: 'Votes', render: (r) => <span>{r.votes ?? 0}</span> }} />}
          {page === 'roadmap'    && <CrossCompanyContent title="Roadmaps" sub="All roadmap items across all companies" table="ideas" statusFilter={['planned', 'in_progress', 'shipped']} extraCol={{ header: 'Votes', render: (r) => <span>{r.votes ?? 0}</span> }} />}
          {page === 'announce'   && <CrossCompanyContent title="Announcements" sub="All announcements and changelog posts" table="announcements" />}
          {page === 'help'       && <CrossCompanyContent title="Help Center" sub="Help articles across all companies" table="help_articles" extraCol={{ header: 'Views', render: (r) => <span>{r.views ?? 0}</span> }} />}
          {page === 'chat'       && <LiveChatPage />}
          {page === 'tickets'    && <TicketsPage />}
          {page === 'moderation' && <ModerationPage />}
          {page === 'imp'          && <ImpersonationSessionsPage />}
          {page === 'calls'        && <CallDiagnosticsPage />}
          {page === 'webhooks'     && <WebhookExplorerPage />}
          {page === 'jobs'         && <BackgroundJobsPage />}
          {page === 'apilogs'      && <ApiLogsPage />}
          {page === 'devices'      && <MobileDevicesPage />}
          {page === 'integrations' && <IntegrationsPage />}
          {page === 'billing'    && <BillingPage />}
          {page === 'legal'      && <LegalAdminPage />}
          {page === 'banner'     && <PlatformBannerAdmin />}
          {page === 'sms'        && <SmsPricingPage />}
          {page === 'settings'   && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
