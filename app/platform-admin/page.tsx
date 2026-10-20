'use client'

import { authFetch } from '@/lib/auth-fetch'
import VoicePlayer from '@/components/VoicePlayer'
import { useState, useEffect, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import LegalAdminPage from '../admin/legal/page'
import PlatformBannerAdmin from '@/components/PlatformBannerAdmin'
import BlogAdminPage from '@/components/BlogAdminPage'
import { SmsPricing, DEFAULT_PRICING, calculateCost, aud, audRate, parsePricingRow } from '@/lib/sms-pricing'
import { PLAN_FEATURES, PLAN_LIMITS, PLAN_NAMES, PLAN_PRICES, OVERRIDABLE_FEATURES, OVERRIDABLE_LIMITS, Plan } from '@/lib/plan'
import { OPERATIONAL_FLAGS } from '@/lib/feature-flags'
import { confirmDialog } from '@/components/ConfirmDialog'
import SignupsPage from '@/components/platform-admin/SignupsPage'
import EmailHealthCard from '@/components/platform-admin/EmailHealthCard'
import SignupSmsHealth from '@/components/platform-admin/SignupSmsHealth'
import WebFormsPage from '@/components/platform-admin/WebFormsPage'
import PortingQueuePage from '@/components/platform-admin/PortingQueuePage'
import BillingConfigCard from '@/components/platform-admin/BillingConfigCard'
import SmsCreditsPage from '@/components/platform-admin/SmsCreditsPage'
import CompanySmsBilling from '@/components/platform-admin/CompanySmsBilling'
import CompanyTaxInvoices from '@/components/platform-admin/CompanyTaxInvoices'
import CompanyWhatsApp from '@/components/platform-admin/CompanyWhatsApp'
import WhatsAppPage from '@/components/platform-admin/WhatsAppPage'
import { COLVY_CONTACT, isColvyNumber } from '@/lib/colvy-contact'

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
  signups:    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
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
  agent:      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="12" cy="3" r="1"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/></svg>,
  plug:       <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M6 8h12v4a6 6 0 0 1-12 0z"/><path d="M12 18v4"/></svg>,
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
  seed:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  alert:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
}

const NAV = [
  { key: 'overview',   label: 'Overview',        icon: 'overview' },
  { section: 'Workspace' },
  { key: 'companies',  label: 'Companies',        icon: 'companies' },
  { key: 'users',      label: 'Users',            icon: 'users' },
  { key: 'signups',    label: 'Signups',          icon: 'signups' },
  { key: 'subs',       label: 'Subscriptions',    icon: 'subs' },
  { key: 'analytics',  label: 'Analytics',        icon: 'analytics' },
  { section: 'Content' },
  { key: 'ideas',      label: 'Ideas',            icon: 'ideas' },
  { key: 'roadmap',    label: 'Roadmaps',         icon: 'roadmap' },
  { key: 'announce',   label: 'Announcements',    icon: 'announce' },
  { key: 'help',       label: 'Help Center',      icon: 'help' },
  { key: 'blog',       label: 'Blog',             icon: 'announce' },
  { key: 'legal',      label: 'Legal Pages',      icon: 'audit' },
  { key: 'banner',     label: 'Product Banner',   icon: 'announce' },
  { section: 'Support' },
  { key: 'chat',       label: 'Live Chat',        icon: 'chat' },
  { key: 'tickets',    label: 'Support Tickets',  icon: 'tickets' },
  { key: 'moderation', label: 'Moderation',       icon: 'moderation' },
  { section: 'Operations' },
  { key: 'imp',        label: 'Impersonation',    icon: 'audit' },
  { key: 'webforms',   label: 'Web Forms',        icon: 'system' },
  { key: 'demos',      label: 'Demo Workspaces',  icon: 'companies' },
  { key: 'calls',      label: 'Call Diagnostics', icon: 'chat' },
  { key: 'porting',    label: 'Number Porting',   icon: 'tickets' },
  { key: 'webhooks',   label: 'Webhook Explorer', icon: 'system' },
  { key: 'jobs',       label: 'Background Jobs',  icon: 'system' },
  { key: 'apilogs',    label: 'API Logs',         icon: 'audit' },
  { key: 'devices',    label: 'Mobile Devices',   icon: 'users' },
  { key: 'integrations', label: 'Integrations',   icon: 'plug' },
  { key: 'agents',     label: 'AI Agents',        icon: 'agent' },
  { section: 'Platform' },
  { key: 'ai',         label: 'AI Models & Usage', icon: 'system' },
  { key: 'sms',        label: 'SMS Pricing',      icon: 'billing' },
  { key: 'smscredits', label: 'SMS Credits',      icon: 'billing' },
  { key: 'whatsapp',   label: 'WhatsApp',         icon: 'chat' },
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

// The business drawer's quick health picture (from /api/platform-admin/company-health).
function CompanyHealthPanel({ hc, onPause, onResume, msg }: { hc: any; onPause: () => void; onResume: () => void; msg: string }) {
  const box: React.CSSProperties = { padding: 12, borderRadius: 12, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', marginBottom: 12 }
  const h: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }
  if (hc === null) return <div style={box}><p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>Checking channels, agents and errors…</p></div>
  if (hc.error) return <div style={box}><p style={{ fontSize: 12.5, color: '#ef4444', margin: 0 }}>Health check unavailable: {hc.error}</p></div>
  const channels = Object.entries(hc.channels || {}) as [string, any][]
  const a = hc.agents || {}
  const act = hc.activity || {}
  const errs = [...(hc.errors?.api || []).map((e: any) => ({ k: `api-${e.id}`, src: e.source || 'api', text: e.message, at: e.created_at })),
    ...(hc.errors?.webhooks || []).map((e: any) => ({ k: `wh-${e.id}`, src: `${e.source} webhook`, text: e.error || e.event_type || e.status, at: e.created_at })),
    ...(a.recentFailures || []).map((r: any) => ({ k: `run-${r.id}`, src: `${AGENT_ROLE_LABEL[r.role_key] || r.role_key} Agent`, text: r.error || r.summary || 'Run failed', at: r.created_at }))]
    .sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 6)
  const agentsOn = (a.enabledRoles || []).length > 0
  return (
    <div>
      <div style={box}>
        <p style={h}>Channels connected</p>
        {channels.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>Nothing connected yet.</p> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {channels.map(([type, c]) => <Pill key={type} text={`${type} ${c.active}${c.total !== c.active ? `/${c.total}` : ''}${c.issues ? ` · ${c.issues} issue${c.issues === 1 ? '' : 's'}` : ''}`} color={c.issues ? '#f59e0b' : c.active ? '#10b981' : '#6b7280'} />)}
          </div>
        )}
        {(hc.connections || []).length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {hc.connections.slice(0, 5).map((c: any, i: number) => <p key={i} style={{ fontSize: 12, color: '#f59e0b', margin: 0 }} title={c.error || ''}>{c.type}: {c.note} — <span style={{ color: 'var(--sa-muted)' }}>{c.detail}</span></p>)}
          </div>
        )}
      </div>
      <div style={box}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <p style={{ ...h, margin: 0, flex: 1 }}>AI agents</p>
          {a.paused ? <button onClick={onResume} style={{ ...paBtn('#10b981'), padding: '4px 10px' }}>Resume agents…</button>
            : agentsOn ? <button onClick={onPause} style={{ ...paBtn('#ef4444'), padding: '4px 10px' }}>Pause agents…</button> : null}
        </div>
        {a.tablesMissing ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>Agent Engine not set up on this database.</p> : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {a.platformPaused ? <Pill text="Paused platform-wide" color="#ef4444" /> : a.paused ? <Pill text={`Paused by ${a.paused.by || 'someone'}`} color="#ef4444" /> : agentsOn ? <Pill text="On" color="#10b981" /> : <Pill text="Off" color="#6b7280" />}
              {agentsOn && <span style={{ fontSize: 12, color: 'var(--sa-text)' }}>{a.enabledRoles.map((k: string) => AGENT_ROLE_LABEL[k] || k).join(', ')}</span>}
            </div>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{a.runs7d || 0} runs in 7 days · <span style={{ color: a.failed7d ? '#ef4444' : 'inherit' }}>{a.failed7d || 0} failed</span> · <span style={{ color: a.pendingApprovals ? '#f59e0b' : 'inherit' }}>{a.pendingApprovals || 0} waiting for approval</span></p>
          </>
        )}
        {msg && <p style={{ fontSize: 12, color: 'var(--sa-text)', margin: '6px 0 0' }}>{msg}</p>}
      </div>
      <div style={box}>
        <p style={h}>Recent errors · 7 days</p>
        {errs.length === 0 ? <p style={{ fontSize: 12.5, color: '#10b981', margin: 0, fontWeight: 600 }}>No errors recorded.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {errs.map(e => (
              <div key={e.k} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                <span style={{ color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>{e.src}</span>
                <span style={{ color: 'var(--sa-muted)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.text}>{e.text}</span>
                <span style={{ color: 'var(--sa-muted)', flexShrink: 0 }}>{agoText(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ ...box, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[['Open conversations', act.openConversations], ['Calls · 7d', `${act.calls7d || 0}${act.missedCalls7d ? ` (${act.missedCalls7d} missed)` : ''}`], ['Bookings · 30d', act.bookings30d],
          ['Bookings · next 7d', act.bookingsNext7d], ['Pay links paid · 30d', `${act.payLinksPaid30d || 0}${act.payLinksPaidAmount30d ? ` · $${Number(act.payLinksPaidAmount30d).toLocaleString()}` : ''}`], ['Pay links pending', act.payLinksPending30d]].map(([k, v]) => (
          <div key={k as string}><p style={{ fontSize: 10.5, color: 'var(--sa-muted)', margin: 0 }}>{k}</p><p style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--sa-text)', margin: '2px 0 0' }}>{v ?? 0}</p></div>
        ))}
      </div>
    </div>
  )
}

// Business detail — a deep-dive drawer for one company with tabs. Uses only
// real data (company row, team_members, company_admin_notes).
// An id with a copy button: the Company ID is what settings like "sign-up
// leads workspace" and COLVY_WORKSPACE_ID ask for (not the owner's user id).
function CopyId({ value }: { value?: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!value) return <>—</>
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap', minWidth: 0 }}>
      <code style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11.5, fontWeight: 600, wordBreak: 'break-all' }}>{value}</code>
      <button type="button" onClick={copy} aria-label="Copy" title="Copy" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: copied ? '#059669' : 'var(--sa-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
        {copied
          ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </span>
  )
}

function BusinessDetail({ co, onClose, onAction }: { co: any; onClose: () => void; onAction: (type: string, co: any) => void }) {
  const [tab, setTab] = useState('overview')
  const [users, setUsers] = useState<any[] | null>(null)
  const [notes, setNotes] = useState<any[] | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [noteCat, setNoteCat] = useState('general')
  const [savingNote, setSavingNote] = useState(false)
  const [notesMissing, setNotesMissing] = useState(false)
  const [repair, setRepair] = useState<{ busy: boolean; log: string } | null>(null)

  // Repair customer photos embedded as inline cid: images in already-ingested
  // email (they only render once fetched from Gmail and stored). Batched +
  // idempotent — loops until nothing remains.
  const runRepair = async () => {
    if (repair?.busy) return
    setRepair({ busy: true, log: 'Starting…' })
    let totalFixed = 0
    try {
      for (let round = 0; round < 40; round++) {
        const res = await authFetch('/api/email/backfill-inline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: co.id, limit: 50 }) })
        const d = await res.json()
        if (!res.ok) { setRepair({ busy: false, log: `Error: ${d.error || 'failed'}` }); return }
        totalFixed += d.updated || 0
        setRepair({ busy: true, log: `Repaired ${totalFixed} email(s)…` })
        // Stop once a batch found nothing left to scan, or made no progress
        // (the remaining cid: messages can't be re-fetched from Gmail).
        if (!d.scanned || !d.updated) break
      }
      setRepair({ busy: false, log: `Done — repaired ${totalFixed} email${totalFixed === 1 ? '' : 's'}.` })
    } catch (e: any) { setRepair({ busy: false, log: `Error: ${e.message}` }) }
  }

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
  const delNote = async (n: any) => {
    if (!(await confirmDialog({ title: 'Delete this admin note?', message: 'It is removed for every admin. This can’t be undone.', confirmLabel: 'Delete note', tone: 'danger' }))) return
    await (supabase as any).from('company_admin_notes').delete().eq('id', n.id); loadNotes()
  }

  // ── Quick health: channels, AI agents, recent errors, activity ─────────────
  const [hc, setHc] = useState<any>(null)
  const [pauseOpen, setPauseOpen] = useState(false)
  const [hcMsg, setHcMsg] = useState('')
  const loadHealth = async () => {
    const r = await paJson(`/api/platform-admin/company-health?companyId=${co.id}`)
    setHc(r.ok ? r.data : { error: r.data.error || 'Could not load health' })
  }
  useEffect(() => { loadHealth() }, [co.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const resumeAgents = async () => {
    setHcMsg('')
    const r = await setCompanyAgentsPaused(co, false, '')
    if (r.ok) { setHcMsg('Agents resumed.'); loadHealth() } else if (r.error) setHcMsg(r.error)
  }

  // ── Subscription management (change plan, trial, complimentary) ─────────────
  const [sub, setSub] = useState({
    plan: co.plan || 'free',
    trial_ends_at: co.trial_ends_at || '',
    is_complimentary: !!co.is_complimentary,
    complimentary_reason: co.complimentary_reason || '',
  })
  // Keep the Subscription tab in step when the plan changes from the action bar.
  useEffect(() => { setSub(s => (s.plan === (co.plan || 'free') ? s : { ...s, plan: co.plan || 'free' })) }, [co.plan])
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

  // ── Account credit & referrals ──────────────────────────────────────────────
  // Super-admins can see the company's referrals (as referrer), its credit
  // balance/ledger, and grant credit — a manual top-up, a complimentary month,
  // or N free days (priced from the plan's monthly rate).
  const [credit, setCredit] = useState<any>(null)
  const [creditLoading, setCreditLoading] = useState(false)
  const [creditAmt, setCreditAmt] = useState('')
  const [creditReason, setCreditReason] = useState('')
  const [creditMsg, setCreditMsg] = useState('')
  const [creditBusy, setCreditBusy] = useState(false)
  const loadCredit = async () => {
    setCreditLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/platform-admin/company-credit?companyId=${co.id}`, { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const d = await res.json()
      setCredit(d)
    } catch (e: any) { setCreditMsg(e?.message || 'Could not load credit') } finally { setCreditLoading(false) }
  }
  const grantCredit = async (amountCents: number, reason: string) => {
    if (!Number.isFinite(amountCents) || amountCents === 0) { setCreditMsg('Enter an amount.'); return }
    if (!reason.trim()) { setCreditMsg('A reason is required (audited).'); return }
    setCreditBusy(true); setCreditMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/company-credit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ companyId: co.id, amountCents, reason: reason.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not grant credit')
      setCreditMsg(`Credit updated. New balance ${((d.balanceCents || 0) / 100).toFixed(2)}.${d.appliedToStripe ? ' Applied to Stripe balance.' : ' Ledger only (no Stripe customer).'}`)
      setCreditAmt(''); setCreditReason('')
      await loadCredit(); loadNotes()
    } catch (e: any) { setCreditMsg(e?.message || 'Could not grant credit') } finally { setCreditBusy(false) }
  }
  // Complimentary time → credit equal to N days of the plan's monthly price.
  const compDays = (days: number, label: string) => {
    const monthly = PLAN_PRICES[(co.plan || 'free') as Plan]
    if (!monthly) { setCreditMsg('This plan has no list price (enterprise/custom) — enter a manual amount instead.'); return }
    const cents = Math.round(monthly * 100 * (days / 30))
    grantCredit(cents, `Complimentary ${label} (${PLAN_NAMES[(co.plan || 'free') as Plan] || co.plan})`)
  }
  // Load credit/referrals the first time the Subscription tab is opened.
  useEffect(() => { if (tab === 'plan' && !credit && !creditLoading) loadCredit() }, [tab])

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
      // Server route (service role): the table isn't readable/writable from the
      // browser for anyone outside the company (COLVY_V347).
      try {
        const r = await authFetch(`/api/platform-admin/entitlements?companyId=${co.id}`)
        const d = await r.json()
        if (!r.ok) { if (d?.missing) setEntMissing(true) }
        else if (d?.row) { setEntFeatures(d.row.features || {}); setEntLimits(d.row.limits || {}); setEntReason(d.row.reason || '') }
      } catch {}
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
    let error: string | null = null, missing = false
    try {
      const r = await authFetch('/api/platform-admin/entitlements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: co.id, features: entFeatures, limits: entLimits, reason: entReason.trim() }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { error = d?.error || `Save failed (HTTP ${r.status})`; missing = !!d?.missing }
    } catch (e: any) { error = e?.message || 'Save failed' }
    setSavingEnt(false)
    if (error) { setEntMsg(missing ? 'Run COLVY_V222_COMPANY_ENTITLEMENTS.sql, then reload.' : error); return }
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
  if (hc && !hc.error) {
    if ((hc.connections || []).length) health -= Math.min(20, 8 * hc.connections.length)
    if (hc.agents?.failed7d) health -= 10
    if ((hc.errors?.api || []).length || (hc.errors?.webhooks || []).length) health -= 5
  }
  health = Math.max(0, Math.min(100, health))
  const healthColor = health >= 75 ? '#10b981' : health >= 45 ? '#f59e0b' : '#ef4444'

  const catColor: Record<string, string> = { general: '#6366f1', billing: '#10b981', support: '#f59e0b', technical: '#0891b2', risk: '#ef4444' }
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  const TABS = [['overview', 'Overview'], ['plan', 'Subscription'], ['ent', 'Entitlements'], ['sms', 'SMS billing'], ['invoices', 'Tax invoices'], ['whatsapp', 'WhatsApp'], ['users', `Users${users ? ` (${users.length})` : ''}`], ['notes', `Notes${notes ? ` (${notes.length})` : ''}`], ['danger', 'Danger Zone']]

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
          <button onClick={() => onAction('provision', co)} title={`Add ${co.slug}.colvy.com to Vercel and Cloudflare, then check it`} style={paBtn()}>Set up board address</button>
          {plan === 'suspended'
            ? <button onClick={() => onAction('reactivate', co)} style={paBtn()}>Reactivate…</button>
            : <button onClick={() => onAction('suspend', co)} style={paBtn('#ef4444')}>Suspend…</button>}
        </div>
        {/* tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '10px 16px 0', borderBottom: '1px solid var(--sa-border)', overflowX: 'auto', flexShrink: 0 }}>
          {TABS.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ flexShrink: 0, whiteSpace: 'nowrap', padding: '8px 12px', borderRadius: '8px 8px 0 0', border: 'none', borderBottom: tab === k ? '2px solid #ff7a6b' : '2px solid transparent', background: 'transparent', color: tab === k ? 'var(--sa-text)' : 'var(--sa-muted)', fontSize: 13, fontWeight: tab === k ? 700 : 500, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'overview' && (
            <div>
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: '1 1 auto' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>Company ID</div>
                  <div style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>For settings that ask for a company (not the owner’s user ID)</div>
                </div>
                <CopyId value={co.id} />
              </div>
              <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 10, background: healthColor + '18', border: `1px solid ${healthColor}44` }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: healthColor }}>Account health {health}/100</span>
                <span style={{ fontSize: 11.5, color: 'var(--sa-muted)', marginLeft: 8 }}>{plan === 'suspended' ? 'Suspended' : (users?.length || 0) === 0 ? 'No team members yet' : 'Looking healthy'}</span>
              </div>
              <CompanyHealthPanel hc={hc} onPause={() => setPauseOpen(true)} onResume={resumeAgents} msg={hcMsg} />
              <Row k="Business name" v={co.name} />
              <Row k="Slug" v={co.slug} />
              <Row k="Plan" v={(sub.plan || 'free') + (sub.is_complimentary ? ' · complimentary' : '')} />
              <Row k="Trial ends" v={sub.trial_ends_at ? new Date(sub.trial_ends_at).toLocaleDateString() : '—'} />
              <Row k="Industry" v={co.industry} />
              <Row k="Owner user ID" v={co.owner_id ? <span title="The owner’s login (a user), not the company. Use the Company ID above for workspace settings.">{co.owner_id}</span> : null} />
              <Row k="Business email" v={co.business_email} />
              <Row k="Business mobile" v={co.business_mobile} />
              <Row k="Website" v={co.website} />
              <Row k="Created" v={co.created_at ? new Date(co.created_at).toLocaleString() : '—'} />
              <Row k="Team members" v={users?.length ?? '…'} />
            </div>
          )}

          {tab === 'plan' && (() => {
            const PLANS = CONSOLE_PLANS
            const planColor: Record<string, string> = { free: '#6b7280', trial: '#6366f1', feedback: '#7c5cff', omnichannel: '#2b59ff', everything: '#ff6a4d', pro: '#10b981', enterprise: '#8b5cf6', suspended: '#ef4444' }
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
                        style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${sub.plan === pl ? (planColor[pl] || '#ff7a6b') : 'var(--sa-border)'}`, background: sub.plan === pl ? (planColor[pl] || '#ff7a6b') + '22' : 'transparent', color: sub.plan === pl ? (planColor[pl] || '#ff7a6b') : 'var(--sa-text)', fontSize: 12.5, fontWeight: sub.plan === pl ? 700 : 500, cursor: 'pointer' }}>{PLAN_NAMES[pl as Plan] || pl}</button>
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

                {/* Complimentary time — free days/month for a subscribed (paying)
                    account, granted as account credit at the plan's monthly rate. */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 3px' }}>Complimentary time</p>
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Give a paying customer free time as account credit, priced from their plan ({PLAN_NAMES[(co.plan || 'free') as Plan] || co.plan}{PLAN_PRICES[(co.plan || 'free') as Plan] ? ` · $${PLAN_PRICES[(co.plan || 'free') as Plan]}/mo` : ' · custom'}). Nets off their next invoice.</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => compDays(7, '7 days')} disabled={creditBusy} style={paBtn()}>Free 7 days</button>
                    <button onClick={() => compDays(14, '14 days')} disabled={creditBusy} style={paBtn()}>Free 14 days</button>
                    <button onClick={() => compDays(30, '1 month')} disabled={creditBusy} style={paBtn()}>Free 1 month</button>
                    <button onClick={() => compDays(90, '3 months')} disabled={creditBusy} style={paBtn()}>Free 3 months</button>
                  </div>
                </div>

                {/* Account credit — balance, ledger and a manual grant/claw-back. */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Account credit</p>
                    <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>{creditLoading ? '…' : `$${(((credit?.balanceCents) || 0) / 100).toFixed(2)}`}<span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sa-muted)', marginLeft: 4 }}>{(credit?.currency || 'aud').toUpperCase()}</span></span>
                  </div>
                  {credit?.needsMigration && <p style={{ fontSize: 12, color: '#f59e0b', margin: '0 0 8px' }}>Run COLVY_V314_REFERRALS.sql to enable credit.</p>}
                  {credit && !credit.needsMigration && !credit.hasStripe && <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 8px' }}>No Stripe customer — credit is recorded in the ledger only (won't auto-apply to an invoice).</p>}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input value={creditAmt} onChange={e => setCreditAmt(e.target.value)} placeholder="Amount $" inputMode="decimal" style={{ ...paInput, maxWidth: 120 }} />
                    <input value={creditReason} onChange={e => setCreditReason(e.target.value)} placeholder="Reason (required, audited)…" style={{ ...paInput, flex: 1 }} />
                  </div>
                  <button onClick={() => grantCredit(Math.round(parseFloat(creditAmt || '0') * 100), creditReason)} disabled={creditBusy} style={paBtn('#10b981', true)}>{creditBusy ? 'Saving…' : 'Add credit'}</button>
                  <span style={{ fontSize: 11, color: 'var(--sa-muted)', marginLeft: 10 }}>Tip: use a negative amount to claw back.</span>
                  {creditMsg && <p style={{ fontSize: 12, color: 'var(--sa-text)', margin: '10px 0 0' }}>{creditMsg}</p>}
                  {Array.isArray(credit?.credits) && credit.credits.length > 0 && (
                    <div style={{ marginTop: 12, borderTop: '1px solid var(--sa-border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                      {credit.credits.slice(0, 20).map((c: any) => (
                        <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                          <span style={{ color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.reason || 'Credit'}</span>
                          <span style={{ fontWeight: 700, color: (c.amount_cents || 0) >= 0 ? '#10b981' : '#ef4444', flexShrink: 0 }}>{(c.amount_cents || 0) >= 0 ? '+' : ''}${(Math.abs(c.amount_cents || 0) / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Referrals this company has made (as the referrer). */}
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Referrals made</p>
                    {credit?.stats && <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{credit.stats.qualified} qualified · {credit.stats.pending} pending</span>}
                  </div>
                  {credit?.link && <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 10px', wordBreak: 'break-all' }}>Link: {credit.link}</p>}
                  {(!credit?.referrals || credit.referrals.length === 0) ? (
                    <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: 0 }}>No referrals yet.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {credit.referrals.map((r: any) => (
                        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--sa-border)' }}>
                          <span style={{ color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.referred_name || r.referred_email || 'Referred business'}</span>
                          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', background: r.status === 'qualified' ? '#10b98122' : r.status === 'reversed' ? '#ef444422' : '#f59e0b22', color: r.status === 'qualified' ? '#10b981' : r.status === 'reversed' ? '#ef4444' : '#f59e0b' }}>{r.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
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
                <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 8px' }}>Operational features</p>
                <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>These ship ON for every company. Switch one off only to disable that behaviour for this business.</p>
                <div style={{ border: '1px solid var(--sa-border)', borderRadius: 12, overflow: 'hidden' }}>
                  {OPERATIONAL_FLAGS.map((f, i) => {
                    const ov = entFeatures[f.key]                 // undefined = default (on)
                    const off = ov === false
                    return (
                      <div key={f.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderTop: i ? '1px solid var(--sa-border)' : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, color: 'var(--sa-text)', margin: 0 }}>{f.label}</p>
                          <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '2px 0 0', lineHeight: 1.45 }}>{f.desc}</p>
                        </div>
                        <select value={off ? 'off' : 'on'} onChange={e => {
                          const v = e.target.value
                          setEntFeatures(prev => { const n = { ...prev }; if (v === 'on') delete n[f.key]; else n[f.key] = false; return n })
                        }} style={{ ...paInput, width: 'auto', padding: '6px 10px' }}>
                          <option value="on">Enabled</option>
                          <option value="off">Disabled</option>
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

          {tab === 'sms' && <CompanySmsBilling companyId={co.id} />}

          {tab === 'invoices' && <CompanyTaxInvoices companyId={co.id} />}

          {tab === 'whatsapp' && <CompanyWhatsApp companyId={co.id} />}

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

          {pauseOpen && <PauseAgentsModal co={co} onClose={() => setPauseOpen(false)} onDone={() => { setHcMsg('Agents paused.'); loadHealth() }} />}
          {tab === 'danger' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 12, border: '1px solid #ef444455', background: '#ef444410' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' }}>Suspend business</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Sets the plan to suspended. The workspace stays but is flagged.</p>
                {plan === 'suspended'
                  ? <button onClick={() => onAction('reactivate', co)} style={paBtn('#10b981', true)}>Reactivate…</button>
                  : <button onClick={() => onAction('suspend', co)} style={paBtn('#ef4444', true)}>Suspend business…</button>}
              </div>
              <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' }}>Seed sample data</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Deletes this workspace’s ideas, announcements, help articles, statuses and topics, then re-seeds examples.</p>
                <button onClick={() => onAction('seed', co)} style={paBtn('#ef4444')}>Delete & seed sample data…</button>
              </div>
              <div style={{ padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 4px' }}>Repair inline email images</p>
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 10px' }}>Re-fetches customer photos embedded as <code>cid:</code> in already-ingested emails and stores them so they render on web &amp; mobile. Idempotent — safe to run any time.</p>
                <button onClick={runRepair} disabled={!!repair?.busy} style={{ ...paBtn(), opacity: repair?.busy ? 0.6 : 1, cursor: repair?.busy ? 'default' : 'pointer' }}>{repair?.busy ? 'Repairing…' : 'Repair inline images'}</button>
                {repair && <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--sa-muted)' }}>{repair.log}</p>}
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

// ── Small shared helpers for the operations views ─────────────────────────
// GET/POST one of our platform-admin routes as the signed-in super admin.
async function paJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await authFetch(url, init)
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: res.status, data: data || {} }
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || 'Network error' } }
  }
}
function agoText(d?: string | null): string {
  if (!d) return 'never'
  const t = new Date(d).getTime()
  if (!Number.isFinite(t)) return '—'
  const m = Math.floor((Date.now() - t) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60); if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
function Pill({ text, color }: { text: string; color: string }) {
  return <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: color + '22', color, whiteSpace: 'nowrap' }}>{text}</span>
}
function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'error' | 'info'; children: React.ReactNode }) {
  const c = tone === 'error' ? '#ef4444' : tone === 'info' ? '#6366f1' : '#f59e0b'
  return <div style={{ padding: '12px 14px', borderRadius: 10, background: c + '18', border: `1px solid ${c}55`, fontSize: 13, color: 'var(--sa-text)', marginBottom: 14, lineHeight: 1.5 }}>{children}</div>
}
function StatTile({ label, value, color = 'var(--sa-text)', loading }: { label: string; value: React.ReactNode; color?: string; loading?: boolean }) {
  return (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
      <p style={{ fontSize: 24, fontWeight: 800, color, margin: 0 }}>{loading ? '…' : value}</p>
      <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{label}</p>
    </div>
  )
}
const paTh: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }
const paTd: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
function paChip(active: boolean, color?: string): React.CSSProperties {
  return { padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? (color || '#ff7a6b') : 'var(--sa-border)'}`, background: active ? (color || '#ff7a6b') + '22' : 'var(--sa-card)', color: active ? (color || '#ff7a6b') : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' }
}

// Pause / resume every AI agent for one business — the same switch the
// business has on its Agents page. Asks for a reason, then confirms.
async function setCompanyAgentsPaused(co: { id: string; name?: string }, pause: boolean, reason: string): Promise<{ ok: boolean; error?: string }> {
  const name = co.name || 'this business'
  if (pause && !reason.trim()) return { ok: false, error: 'A reason is required (audited).' }
  const yes = await confirmDialog(pause
    ? { title: `Pause all AI agents for ${name}?`, message: 'Queued agent runs are cancelled, running ones stop at their next step, and new messages won’t start agents until someone resumes them. The business sees “Agents were paused by Colvy support”. Recorded in the audit log.', confirmLabel: 'Pause agents', tone: 'danger' }
    : { title: `Resume AI agents for ${name}?`, message: 'Agents start working again with the business’s own settings. Recorded in the audit log.', confirmLabel: 'Resume agents', tone: 'primary' })
  if (!yes) return { ok: false }
  const r = await paJson('/api/platform-admin/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: pause ? 'pause' : 'resume', companyId: co.id, reason: reason.trim() }) })
  return r.ok ? { ok: true } : { ok: false, error: r.data.error || 'Could not change the pause switch' }
}

// A small modal that collects the (audited) reason before pausing agents.
function PauseAgentsModal({ co, onClose, onDone }: { co: { id: string; name?: string }; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true); setErr('')
    const r = await setCompanyAgentsPaused(co, true, reason)
    setBusy(false)
    if (r.ok) { onDone(); onClose() } else if (r.error) setErr(r.error)
  }
  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 420, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '94vw', background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 4px' }}>Pause AI agents · {co.name || 'business'}</p>
        <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>Emergency stop for this business only. Their agents stop sending, replying and acting until someone resumes them (here or on their Agents page).</p>
        <label style={paLabel}>Reason (required, audited)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Agent sending wrong order updates — investigating" style={paInput} autoFocus />
        {err && <p style={{ fontSize: 12, color: '#ef4444', margin: '10px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button onClick={onClose} disabled={busy} style={paBtn()}>Cancel</button>
          <button onClick={go} disabled={busy || !reason.trim()} style={{ ...paBtn('#ef4444', true), opacity: busy || !reason.trim() ? 0.6 : 1 }}>{busy ? 'Pausing…' : 'Pause agents…'}</button>
        </div>
      </div>
    </div>
  )
}

// Operations · Integrations — every connected channel, store and outside tool
// across all businesses, with a health note per connection. Server-side
// (/api/platform-admin/integrations) so secrets never reach the browser.
function IntegrationsPage() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [type, setType] = useState('all')
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [q, setQ] = useState('')
  const load = async () => {
    setErr('')
    const r = await paJson('/api/platform-admin/integrations')
    if (!r.ok) { setErr(r.data.error || 'Could not load integrations'); setD({ rows: [], types: [], missing: [] }); return }
    setD(r.data)
  }
  useEffect(() => { load() }, [])
  const rows: any[] = Array.isArray(d?.rows) ? d.rows : []
  const types: any[] = Array.isArray(d?.types) ? d.types : []
  const colorOf = (t: string) => types.find(x => x.type === t)?.color || '#6b7280'
  const summary = types.map(t => {
    const list = rows.filter(r => r.type === t.type)
    return { ...t, total: list.length, active: list.filter(r => r.active).length, warn: list.filter(r => r.active && r.note).length }
  }).filter(s => s.total > 0 || type === s.type)
  const list = rows.filter(r => {
    if (type !== 'all' && r.type !== type) return false
    if (onlyIssues && !(r.active && r.note)) return false
    if (q.trim()) {
      const hay = `${r.type} ${r.detail} ${r.company?.name || ''} ${r.company?.slug || ''} ${r.note} ${r.error || ''}`.toLowerCase()
      if (!hay.includes(q.trim().toLowerCase())) return false
    }
    return true
  }).sort((a, b) => Number(!!(b.active && b.note)) - Number(!!(a.active && a.note)))
  const issues = rows.filter(r => r.active && r.note).length
  return (
    <div>
      <SectionHeader title="Integrations" sub="Connected channels, stores, phone numbers and outside tools across every business"
        action={<button onClick={() => { setD(null); load() }} style={paBtn()}>Refresh</button>} />
      {err && <Notice tone="error">{err}</Notice>}
      {Array.isArray(d?.missing) && d.missing.length > 0 && <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '0 0 12px' }}>Not set up on this database (skipped): {d.missing.join(', ')}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 18 }}>
        <div onClick={() => setOnlyIssues(o => !o)} style={{ background: 'var(--sa-card)', border: `1px solid ${onlyIssues ? '#f59e0b' : 'var(--sa-border)'}`, borderRadius: 14, padding: 16, cursor: 'pointer' }}>
          <p style={{ fontSize: 24, fontWeight: 800, color: issues ? '#f59e0b' : '#10b981', margin: 0 }}>{d === null ? '…' : issues}</p>
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Need attention{onlyIssues ? ' · filtered' : ''}</p>
        </div>
        {summary.map(s => (
          <div key={s.type} onClick={() => setType(type === s.type ? 'all' : s.type)} style={{ background: 'var(--sa-card)', border: `1px solid ${type === s.type ? s.color : 'var(--sa-border)'}`, borderRadius: 14, padding: 16, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{s.type}</span>
            </div>
            <p style={{ fontSize: 24, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{s.total}</p>
            <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{s.active} active{s.warn ? ` · ${s.warn} need attention` : ''}</p>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14, alignItems: 'center' }}>
        <SearchBar placeholder="Search business, store, number, error…" value={q} onChange={setQ} />
        <button onClick={() => setType('all')} style={paChip(type === 'all')}>All types</button>
        <button onClick={() => setOnlyIssues(o => !o)} style={paChip(onlyIssues, '#f59e0b')}>Needs attention</button>
      </div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Type', 'Business', 'Detail', 'Last activity', 'Status'].map(h => <th key={h} style={paTh}>{h}</th>)}</tr></thead>
          <tbody>
            {d === null ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
            : list.length === 0 ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{rows.length === 0 ? 'No connected integrations.' : 'Nothing matches these filters.'}</td></tr>
            : list.map((r, i) => (
              <tr key={r.key || i} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                <td style={paTd}><span style={{ fontSize: 11, fontWeight: 700, color: colorOf(r.type) }}>{r.type}</span></td>
                <td style={paTd}>{r.company?.name || r.company?.slug || '—'}</td>
                <td style={{ ...paTd, color: 'var(--sa-muted)', maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.error ? `${r.detail}\n${r.error}` : r.detail}>{r.detail || '—'}</td>
                <td style={{ ...paTd, color: 'var(--sa-muted)' }} title={r.last ? new Date(r.last).toLocaleString() : ''}>{r.last ? agoText(r.last) : '—'}</td>
                <td style={paTd} title={r.error || ''}>
                  {r.active && r.note ? <Pill text={r.note} color={/expired|error|uninstalled|re-auth/i.test(r.note) ? '#ef4444' : '#f59e0b'} />
                    : r.active ? <Pill text="Connected" color="#10b981" />
                    : <Pill text={r.note || 'Inactive'} color="#6b7280" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Operations · AI Agents — the Agent Engine across every business: who has
// agents on, runs and failures, approvals waiting on people, stuck runs, the
// weekly digest and "Needs you" phone alerts, outside tools, and a per-business
// pause switch for emergencies.
const AGENT_ROLE_LABEL: Record<string, string> = { support: 'Support', reception: 'Reception', sales: 'Sales', operations: 'Operations', reputation: 'Reputation', custom: 'Custom' }
const RUN_STATUS_COLOR: Record<string, string> = { queued: '#6366f1', running: '#0891b2', awaiting_approval: '#f59e0b', completed: '#10b981', escalated: '#8b5cf6', failed: '#ef4444', cancelled: '#6b7280' }

function AgentRunDetail({ runId, onClose }: { runId: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null)
  useEffect(() => { (async () => { const r = await paJson(`/api/platform-admin/agents?runId=${runId}`); setD(r.ok ? r.data : { error: r.data.error || 'Could not load run' }) })() }, [runId])
  const run = d?.run
  const steps: any[] = Array.isArray(d?.steps) ? d.steps : []
  const Row = ({ k, v }: { k: string; v: any }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{k}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)', textAlign: 'right', wordBreak: 'break-word' }}>{v ?? '—'}</span>
    </div>
  )
  const sc = RUN_STATUS_COLOR[String(run?.status)] || '#6b7280'
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 380, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 620, maxWidth: '96vw', height: '100%', background: 'var(--sa-bg)', borderLeft: '1px solid var(--sa-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{run ? `${AGENT_ROLE_LABEL[run.role_key] || run.role_key} Agent run` : 'Agent run'}</p>
            <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: 0 }}>{run?.company?.name || '—'} · {run?.created_at ? new Date(run.created_at).toLocaleString() : ''}</p>
          </div>
          {run && <Pill text={String(run.status).replace(/_/g, ' ')} color={sc} />}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {d === null ? <p style={{ color: 'var(--sa-muted)', fontSize: 13 }}>Loading…</p> : d.error ? <Notice tone="error">{d.error}</Notice> : (
            <>
              <Row k="Business" v={run.company?.name} />
              <Row k="Agent" v={AGENT_ROLE_LABEL[run.role_key] || run.role_key} />
              <Row k="Mode" v={run.mode} />
              <Row k="Trigger" v={String(run.trigger_type || '').replace(/_/g, ' ')} />
              <Row k="Intent" v={run.intent} />
              <Row k="Outcome" v={run.outcome} />
              <Row k="Model" v={run.model} />
              <Row k="Tokens" v={`${run.tokens_in || 0} in · ${run.tokens_out || 0} out`} />
              <Row k="Finished" v={run.finished_at ? new Date(run.finished_at).toLocaleString() : '—'} />
              {run.error && <Row k="Error" v={run.error} />}
              {run.summary && <p style={{ fontSize: 13, color: 'var(--sa-text)', lineHeight: 1.55, margin: '14px 0 0', padding: '10px 12px', borderRadius: 10, background: 'var(--sa-card)', border: '1px solid var(--sa-border)' }}>{run.summary}</p>}
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '18px 0 8px' }}>Steps ({steps.length})</p>
              {steps.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>No steps recorded.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {steps.map(s => {
                    const bad = s.status === 'error' || s.decision === 'denied'
                    return (
                      <div key={s.id} style={{ padding: '8px 11px', borderRadius: 9, border: `1px solid ${bad ? '#ef444455' : 'var(--sa-border)'}`, background: 'var(--sa-card)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10.5, color: 'var(--sa-muted)', minWidth: 22 }}>#{s.seq}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', color: bad ? '#ef4444' : 'var(--sa-text)' }}>{s.kind}{s.action_key ? ` · ${s.action_key}` : ''}</span>
                          {s.decision && <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{s.decision}{s.autonomy ? ` (${s.autonomy})` : ''}</span>}
                          {s.status && <span style={{ fontSize: 11, color: bad ? '#ef4444' : 'var(--sa-muted)' }}>{s.status}</span>}
                        </div>
                        {(s.reason || s.decision_reason) && <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '4px 0 0', lineHeight: 1.45 }}>{s.reason || s.decision_reason}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentsPage() {
  const [days, setDays] = useState(7)
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState('businesses')
  const [q, setQ] = useState('')
  const [selRun, setSelRun] = useState<string | null>(null)
  const [pauseFor, setPauseFor] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const load = async () => {
    setErr('')
    const r = await paJson(`/api/platform-admin/agents?days=${days}`)
    if (!r.ok) { setErr(r.data.error || 'Could not load agent activity'); setD({ companies: [], failures: [], stuck: [], recent: [], connections: [] }); return }
    setD(r.data)
  }
  useEffect(() => { load() }, [days]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = d?.totals || {}
  const companies: any[] = (Array.isArray(d?.companies) ? d.companies : []).filter((c: any) => !q.trim() || `${c.name} ${c.slug}`.toLowerCase().includes(q.trim().toLowerCase()))
  const resume = async (c: any) => {
    setMsg('')
    const r = await setCompanyAgentsPaused(c, false, '')
    if (r.ok) { setMsg(`Agents resumed for ${c.name}.`); load() } else if (r.error) setMsg(r.error)
  }
  const n = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v || 0)
  const runTable = (rows: any[], empty: string) => (
    <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
        <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Agent', 'Trigger', 'Status', 'What happened', 'When', ''].map((h, i) => <th key={i} style={paTh}>{h}</th>)}</tr></thead>
        <tbody>
          {d === null ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
          : rows.length === 0 ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{empty}</td></tr>
          : rows.map((r, i) => (
            <tr key={r.id} onClick={() => setSelRun(r.id)} style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--sa-border)' : 'none', cursor: 'pointer' }}>
              <td style={paTd}>{r.company?.name || '—'}</td>
              <td style={paTd}>{AGENT_ROLE_LABEL[r.role_key] || r.role_key}{r.mode === 'sandbox' ? <span style={{ color: 'var(--sa-muted)' }}> · sandbox</span> : null}</td>
              <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{String(r.trigger_type || '—').replace(/_/g, ' ')}</td>
              <td style={paTd}><Pill text={String(r.status).replace(/_/g, ' ')} color={RUN_STATUS_COLOR[r.status] || '#6b7280'} /></td>
              <td style={{ ...paTd, color: r.error ? '#ef4444' : 'var(--sa-muted)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.error || r.summary || ''}>{r.error || r.summary || '—'}</td>
              <td style={{ ...paTd, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }} title={r.created_at ? new Date(r.created_at).toLocaleString() : ''}>{agoText(r.updated_at && r.status !== 'completed' ? r.updated_at : r.created_at)}</td>
              <td style={{ ...paTd, color: 'var(--sa-muted)', textAlign: 'right' }}>›</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
  const conns: any[] = Array.isArray(d?.connections) ? d.connections : []
  const TABS: [string, string][] = [
    ['businesses', `Businesses${d?.companies ? ` (${d.companies.length})` : ''}`],
    ['failures', `Failures${d?.failures ? ` (${d.failures.length})` : ''}`],
    ['stuck', `Stuck${d?.stuck ? ` (${d.stuck.length})` : ''}`],
    ['recent', 'Recent runs'],
    ['tools', `Outside tools${conns.length ? ` (${conns.length})` : ''}`],
  ]
  return (
    <div>
      <SectionHeader title="AI Agents" sub="The Agent Engine across every business — activity, failures, approvals waiting on people, and an emergency pause per business"
        action={<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[1, 7, 30].map(x => <button key={x} onClick={() => setDays(x)} style={{ ...paBtn(days === x ? '#ff7a6b' : 'var(--sa-muted)', days === x), padding: '6px 12px' }}>{x === 1 ? '24h' : `${x} days`}</button>)}
          <button onClick={() => { setD(null); load() }} style={paBtn()}>Refresh</button>
        </div>} />
      {err && <Notice tone="error">{err}</Notice>}
      {msg && <Notice tone="info">{msg}</Notice>}
      {d?.platformPaused && <Notice tone="error"><b>All agents are paused platform-wide</b> (AGENTS_DISABLED=1 in the environment). Remove it in Vercel to let agents run.</Notice>}
      {d?.missing ? <Notice>Run <b>COLVY_V353_AGENT_ENGINE.sql</b> to enable the Agent Engine. Nothing to show until then.</Notice> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 18 }}>
            <StatTile label={`Runs · ${days === 1 ? '24h' : `${days}d`}`} value={n(t.runs)} color="#6366f1" loading={d === null} />
            <StatTile label="Completed" value={n(t.completed)} color="#10b981" loading={d === null} />
            <StatTile label="Failed" value={n(t.failed)} color={t.failed ? '#ef4444' : '#10b981'} loading={d === null} />
            <StatTile label="Handed to a person" value={n(t.escalated)} color="#8b5cf6" loading={d === null} />
            <StatTile label="Approvals waiting" value={n(t.pendingApprovals)} color={t.pendingApprovals ? '#f59e0b' : 'var(--sa-text)'} loading={d === null} />
            <StatTile label="Stuck runs (15m+)" value={n(t.stuck)} color={t.stuck ? '#ef4444' : '#10b981'} loading={d === null} />
            <StatTile label="Businesses with agents on" value={n(t.companiesWithAgents)} color="#0891b2" loading={d === null} />
            <StatTile label="Paused businesses" value={n(t.paused)} color={t.paused ? '#ef4444' : 'var(--sa-text)'} loading={d === null} />
            <StatTile label="Tokens in / out" value={`${n(t.tokensIn)} / ${n(t.tokensOut)}`} loading={d === null} />
          </div>
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--sa-border)', marginBottom: 16, flexWrap: 'wrap' }}>
            {TABS.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{ padding: '8px 12px', border: 'none', borderBottom: tab === k ? '2px solid #ff7a6b' : '2px solid transparent', background: 'transparent', color: tab === k ? 'var(--sa-text)' : 'var(--sa-muted)', fontSize: 13, fontWeight: tab === k ? 700 : 500, cursor: 'pointer' }}>{l}</button>
            ))}
          </div>

          {tab === 'businesses' && (
            <>
              <div style={{ marginBottom: 12 }}><SearchBar placeholder="Search businesses…" value={q} onChange={setQ} /></div>
              <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1020 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Agents on', 'State', 'Runs', 'Failed', 'Waiting', 'Weekly digest', 'Needs-you alerts', 'Tools', ''].map((h, i) => <th key={i} style={paTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d === null ? <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                    : companies.length === 0 ? <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{(d.companies || []).length === 0 ? 'No business has set up agents yet.' : 'No businesses match.'}</td></tr>
                    : companies.map((c, i) => {
                      const on = (c.enabledRoles || []).length > 0
                      return (
                        <tr key={c.id} style={{ borderBottom: i < companies.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                          <td style={{ ...paTd, fontWeight: 600 }}>{c.name}<div style={{ fontSize: 11, color: 'var(--sa-muted)', fontWeight: 400 }}>{c.slug}</div></td>
                          <td style={{ ...paTd, color: on ? 'var(--sa-text)' : 'var(--sa-muted)' }}>{on ? c.enabledRoles.map((k: string) => AGENT_ROLE_LABEL[k] || k).join(', ') : 'None'}</td>
                          <td style={paTd} title={c.paused?.paused ? `Paused by ${c.paused.byName || 'someone'}${c.paused.at ? ` · ${new Date(c.paused.at).toLocaleString()}` : ''}` : ''}>
                            {c.paused?.paused ? <Pill text={`Paused · ${c.paused.byName || '—'}`} color="#ef4444" /> : on ? <Pill text="Active" color="#10b981" /> : <Pill text="Off" color="#6b7280" />}
                          </td>
                          <td style={paTd}>{c.runs}</td>
                          <td style={{ ...paTd, color: c.failed ? '#ef4444' : 'var(--sa-muted)', fontWeight: c.failed ? 700 : 400 }}>{c.failed}</td>
                          <td style={{ ...paTd, color: c.pendingApprovals ? '#f59e0b' : 'var(--sa-muted)' }} title={c.oldestApprovalAt ? `Oldest waiting since ${new Date(c.oldestApprovalAt).toLocaleString()}` : ''}>{c.pendingApprovals}{c.oldestApprovalAt ? <span style={{ fontSize: 11 }}> · {agoText(c.oldestApprovalAt)}</span> : null}</td>
                          <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{c.digest?.enabled === false ? 'Off' : `On${c.digest?.lastWeek ? ` · sent ${c.digest.lastWeek}` : ' · not sent yet'}`}</td>
                          <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{c.alerts?.enabled === false ? 'Off' : `On · ${c.alerts?.notified7d || 0} in 7d`}{c.alerts?.lastNotifiedAt ? <div style={{ fontSize: 11 }}>last {agoText(c.alerts.lastNotifiedAt)}</div> : null}</td>
                          <td style={{ ...paTd, color: c.connections?.errors ? '#ef4444' : 'var(--sa-muted)' }}>{c.connections?.total || 0}{c.connections?.errors ? ` · ${c.connections.errors} error` : ''}</td>
                          <td style={paTd}>
                            {c.paused?.paused
                              ? <button onClick={() => resume(c)} style={paBtn('#10b981')}>Resume…</button>
                              : <button onClick={() => setPauseFor(c)} style={paBtn('#ef4444')}>Pause agents…</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '10px 2px 0', lineHeight: 1.5 }}>Weekly digest = the Sunday agent summary email (cron/agent-digest); “sent” is the last ISO week it went out. Needs-you alerts = phone pushes from the 15-minute sweep (cron/needs-you), counted from the items it has already alerted on.</p>
            </>
          )}
          {tab === 'failures' && runTable(Array.isArray(d?.failures) ? d.failures : [], 'No failed agent runs in this period.')}
          {tab === 'stuck' && runTable(Array.isArray(d?.stuck) ? d.stuck : [], 'Nothing stuck — no run has sat queued or running for over 15 minutes.')}
          {tab === 'recent' && runTable(Array.isArray(d?.recent) ? d.recent : [], 'No agent runs in this period.')}
          {tab === 'tools' && (
            d?.connectionsMissing ? <Notice>Run <b>COLVY_V355_AGENT_CONNECTIONS.sql</b> to let businesses connect outside tools (MCP).</Notice> : (
              <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Connection', 'Server', 'Tools on', 'Agents', 'Last checked', 'Status'].map(h => <th key={h} style={paTh}>{h}</th>)}</tr></thead>
                  <tbody>
                    {d === null ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                    : conns.length === 0 ? <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No outside tools connected yet.</td></tr>
                    : conns.map((x, i) => (
                      <tr key={x.id} style={{ borderBottom: i < conns.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                        <td style={paTd}>{x.company?.name || '—'}</td>
                        <td style={{ ...paTd, fontWeight: 600 }}>{x.name}</td>
                        <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{x.server_name || x.host || '—'}</td>
                        <td style={paTd}>{x.toolsOn} / {x.tools}</td>
                        <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{(x.roles || []).map((k: string) => AGENT_ROLE_LABEL[k] || k).join(', ') || '—'}</td>
                        <td style={{ ...paTd, color: 'var(--sa-muted)' }}>{agoText(x.synced_at)}</td>
                        <td style={paTd} title={x.last_error || ''}>{!x.enabled ? <Pill text="Off" color="#6b7280" /> : (x.status === 'error' || x.last_error) ? <Pill text="Error" color="#ef4444" /> : x.status === 'ok' ? <Pill text="OK" color="#10b981" /> : <Pill text="Not checked" color="#f59e0b" />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>
      )}
      {selRun && <AgentRunDetail runId={selRun} onClose={() => setSelRun(null)} />}
      {pauseFor && <PauseAgentsModal co={pauseFor} onClose={() => setPauseFor(null)} onDone={() => { setMsg(`Agents paused for ${pauseFor.name}.`); load() }} />}
    </div>
  )
}

// Operations · Call Diagnostics — every voice call across the platform, with a
// per-call detail drawer (status, hangup cause, recording, transcript, sentiment,
// AI to-dos). Real data only, from the `calls` table (COLVY_V115_TELNYX + ALTERs).
function CallDetail({ call, coName, onClose }: { call: any; coName: string; onClose: () => void }) {
  // Admin AI overview: cached on the row (call.ai_admin_review) or generated on
  // demand. Kept in local state so the panel updates without a page refetch.
  const [review, setReview] = useState<any>(call.ai_admin_review || null)
  const [reviewAt, setReviewAt] = useState<string | null>(call.ai_admin_review_at || null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewErr, setReviewErr] = useState('')
  // Device-handoff ("Switch device") timeline for this call.
  const [handoffs, setHandoffs] = useState<any[] | null>(null)
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('call_handoff_events')
          .select('*').eq('call_id', call.id).order('created_at', { ascending: true })
        setHandoffs(data || [])
      } catch { setHandoffs([]) }
    })()
  }, [call.id])
  const genReview = async (force = false) => {
    setReviewBusy(true); setReviewErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/call-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ callId: call.id, force }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not analyse this call')
      setReview(data.review); setReviewAt(data.at || new Date().toISOString())
      if (data.warning) setReviewErr(data.warning)
    } catch (e: any) { setReviewErr(e.message) } finally { setReviewBusy(false) }
  }
  const dur = (s: number) => {
    if (!s && s !== 0) return '—'
    const m = Math.floor(s / 60), r = s % 60
    return m > 0 ? `${m}m ${r}s` : `${r}s`
  }
  const qualColor: Record<string, string> = { good: '#10b981', fair: '#f59e0b', poor: '#ef4444', unknown: '#6b7280' }
  const sevColor: Record<string, string> = { high: '#ef4444', medium: '#f59e0b', low: '#6b7280' }
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
          {/* Agent's post-call thumbs (calls.rating: 1 good / -1 bad). */}
          {(call.rating === 1 || call.rating === -1) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Agent rating</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: (call.rating === 1 ? '#10b981' : '#ef4444') + '22', color: call.rating === 1 ? '#10b981' : '#ef4444' }}>
                {call.rating === 1 ? '👍 Good' : '👎 Bad'}{call.rating_at ? ` · ${new Date(call.rating_at).toLocaleDateString()}` : ''}
              </span>
            </div>
          )}
          <Row k="Started" v={call.started_at ? new Date(call.started_at).toLocaleString() : '—'} />
          <Row k="Ended" v={call.ended_at ? new Date(call.ended_at).toLocaleString() : '—'} />
          <Row k="Voicemail" v={call.is_voicemail ? 'Yes' : 'No'} />
          {/* Routing reason — the inbound webhook stamps WHY a call went to
              voicemail / how it was rung into calls.transcription as a bracketed
              marker (e.g. "[to voicemail: nobody online]", "[ring failed: …]",
              "[ringing N device(s)]"). Surface it to diagnose calls that never
              reached an agent. Real transcripts don't start with "[". */}
          {typeof call.transcription === 'string' && call.transcription.trim().startsWith('[') && (
            <Row k="Routing" v={call.transcription} />
          )}
          {call.sentiment && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--sa-border)' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Sentiment</span>
              <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sentColor(call.sentiment) + '22', color: sentColor(call.sentiment) }}>{call.sentiment}</span>
            </div>
          )}

          {call.recording_url ? (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: '0 0 8px' }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>Recording{call.recording_duration ? ` · ${dur(call.recording_duration)}` : ''}</p>
                <a href={call.recording_url} download target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, fontWeight: 600, color: '#6366f1', textDecoration: 'none' }}>Download ↓</a>
              </div>
              <VoicePlayer src={call.recording_url} name="Call recording" />
              {call.conference_recording_url && (
                <VoicePlayer src={call.conference_recording_url} name="Call recording (after transfer)" style={{ marginTop: 8 }} />
              )}
            </div>
          ) : call.recording_error ? (
            <p style={{ marginTop: 18, fontSize: 12, color: '#f59e0b' }}>Recording unavailable: {call.recording_error}</p>
          ) : null}

          {/* ── Device-handoff timeline ("Switch device") ─────────────────────── */}
          {handoffs && handoffs.length > 0 && (
            <div style={{ marginTop: 18, padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)', background: 'var(--sa-card)' }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 10px' }}>🔀 Device handoff</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {handoffs.map((h: any) => {
                  const tone: Record<string, string> = { requested: '#6366f1', accept_attempt: '#0ea5e9', promoted: '#0ea5e9', joining: '#f59e0b', confirmed: '#10b981', cancelled: 'var(--sa-muted)', error: '#ef4444' }
                  return (
                    <div key={h.id} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12 }}>
                      <span style={{ color: 'var(--sa-muted)', flexShrink: 0, minWidth: 62 }}>{new Date(h.created_at).toLocaleTimeString()}</span>
                      <span style={{ fontWeight: 800, color: tone[h.event] || 'var(--sa-text)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.03em', flexShrink: 0, minWidth: 96 }}>{String(h.event).replace(/_/g, ' ')}</span>
                      <span style={{ color: 'var(--sa-muted)' }}>{[h.platform, h.detail].filter(Boolean).join(' · ') || '—'}</span>
                    </div>
                  )
                })}
              </div>
              {!handoffs.some((h: any) => h.event === 'confirmed') && handoffs.some((h: any) => h.event === 'joining') && (
                <p style={{ fontSize: 11.5, color: '#f59e0b', margin: '10px 0 0' }}>Promoted to a conference but the target device never confirmed its join — the new device likely didn't complete the conference join.</p>
              )}
              {!handoffs.some((h: any) => ['accept_attempt', 'promoted', 'joining', 'confirmed'].includes(h.event)) && handoffs.some((h: any) => h.event === 'requested') && (
                <p style={{ fontSize: 11.5, color: '#f59e0b', margin: '10px 0 0' }}>Requested but the target never attempted to accept — the other device didn't pick up the handoff.</p>
              )}
            </div>
          )}

          {/* ── Admin AI overview ─────────────────────────────────────────────
              How the call went + likely technical/sound issues, for ops. */}
          <div style={{ marginTop: 18, padding: 14, borderRadius: 12, border: '1px solid var(--sa-border)', background: 'var(--sa-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: review ? 10 : 0 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: 0 }}>✨ AI overview <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}>(admin)</span></p>
              <button onClick={() => genReview(!!review)} disabled={reviewBusy}
                style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: '#7c5cff', cursor: reviewBusy ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 600, opacity: reviewBusy ? 0.6 : 1 }}>
                {reviewBusy ? 'Analysing…' : review ? 'Regenerate' : 'Generate'}
              </button>
            </div>
            {reviewErr && <p style={{ fontSize: 11.5, color: '#f59e0b', margin: '0 0 8px' }}>{reviewErr}</p>}
            {!review && !reviewBusy && !reviewErr && (
              <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>Generate an admin summary of how this call went — including any signs of dropped audio, poor sound quality, routing problems or the agent never connecting.</p>
            )}
            {review && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 9px', borderRadius: 999, background: (qualColor[review.quality] || '#6b7280') + '22', color: qualColor[review.quality] || '#6b7280' }}>{review.quality || 'unknown'}</span>
                  {reviewAt && <span style={{ fontSize: 10.5, color: 'var(--sa-muted)' }}>{new Date(reviewAt).toLocaleString()}</span>}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--sa-text)', margin: 0, lineHeight: 1.55 }}>{review.overview}</p>
                {Array.isArray(review.issues) && review.issues.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {review.issues.map((it: any, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '7px 10px', borderRadius: 8, border: '1px solid var(--sa-border)' }}>
                        <span style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 6px', borderRadius: 6, background: (sevColor[it.severity] || '#6b7280') + '22', color: sevColor[it.severity] || '#6b7280', whiteSpace: 'nowrap' }}>{it.severity}</span>
                        <span style={{ fontSize: 12, color: 'var(--sa-text)', lineHeight: 1.45 }}><b style={{ textTransform: 'capitalize' }}>{it.type}:</b> {it.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                {review.sound_quality && (
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}><b style={{ color: 'var(--sa-text)' }}>Sound:</b> {review.sound_quality}</p>
                )}
                {review.recommendation && review.recommendation !== 'none' && (
                  <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}><b style={{ color: 'var(--sa-text)' }}>Recommendation:</b> {review.recommendation}</p>
                )}
              </div>
            )}
          </div>

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

// Operations · Background Jobs — health of the scheduled workers with cadence,
// duration, throughput and failures. Real data from job_runs (COLVY_V218).
// The registry mirrors EVERY cron in vercel.json (plus the hourly demo reset).
// `staleMs` is the age past which "no run" is a problem — a generous multiple of
// the job's cadence. `logs` says how the worker reports in:
//   always — writes a job_runs row every run (idle runs too)
//   work   — writes a row only when it actually did something, so silence is
//            normal ("Quiet"), not a failure
//   none   — doesn't call logJobRun yet, so this console can't see it run
// Any job key that appears in job_runs but isn't listed here still gets a card.
type JobDef = { key: string; label: string; schedule: string; desc: string; color: string; staleMs?: number; logs: 'always' | 'work' | 'none'; path: string }
const JOBS: JobDef[] = [
  { key: 'email-sync', label: 'Email Sync', schedule: 'Every 5 min', desc: 'Pulls new mail into every connected Gmail mailbox', color: '#8b5cf6', staleMs: 20 * 60000, logs: 'always', path: '/api/cron/email-sync' },
  { key: 'order-sync', label: 'Order Sync', schedule: 'Every 3 min', desc: 'Pulls WooCommerce orders and reconciles the board to the store (recovers paid-but-cancelled, applies terminal states)', color: '#0ea5e9', staleMs: 15 * 60000, logs: 'always', path: '/api/cron/order-sync' },
  { key: 'campaigns-process', label: 'Campaign Worker', schedule: 'Every 2 min', desc: 'Starts scheduled campaigns and drips the next sending batch', color: '#ff7a6b', staleMs: 10 * 60000, logs: 'always', path: '/api/campaigns/process' },
  { key: 'send-scheduled', label: 'Scheduled Messages', schedule: 'Every minute', desc: 'Sends messages agents scheduled for later', color: '#10b981', staleMs: 8 * 60000, logs: 'always', path: '/api/cron/send-scheduled' },
  { key: 'transcode-worker', label: 'Transcode Worker', schedule: 'Every minute', desc: 'Drains the video transcode queue and reclaims stuck jobs', color: '#ec4899', staleMs: 8 * 60000, logs: 'always', path: '/api/cron/transcode-worker' },
  { key: 'agent-worker', label: 'Agent Worker', schedule: 'Every minute', desc: 'Runs queued AI agent work and expires old approvals (logs only when it ran something)', color: '#6366f1', staleMs: 6 * 3600000, logs: 'work', path: '/api/cron/agent-worker' },
  { key: 'import-worker', label: 'Import Worker', schedule: 'Every minute', desc: 'Processes contact / data import jobs (logs only when it ran something)', color: '#0891b2', staleMs: 7 * 86400000, logs: 'work', path: '/api/cron/import-worker' },
  { key: 'task-reminders', label: 'Task Reminders', schedule: 'Every 15 min', desc: 'Pushes a reminder when a task becomes due', color: '#f59e0b', staleMs: 45 * 60000, logs: 'always', path: '/api/cron/task-reminders' },
  { key: 'sweep-stale-calls', label: 'Stale-Call Sweep', schedule: 'Every 15 min', desc: 'Closes calls stuck live after a lost hangup webhook', color: '#14b8a6', staleMs: 45 * 60000, logs: 'always', path: '/api/cron/sweep-stale-calls' },
  { key: 'ai-knowledge', label: 'AI Knowledge Refresh', schedule: 'Hourly (:25)', desc: 'Re-indexes business knowledge the AI answers from', color: '#7c5cff', staleMs: 150 * 60000, logs: 'always', path: '/api/cron/ai-knowledge' },
  { key: 'demo-seed', label: 'Demo Reset', schedule: 'Hourly', desc: 'Rebuilds the public Harbour & Bean showcase workspace', color: '#6366f1', staleMs: 150 * 60000, logs: 'always', path: '/api/demo/seed' },
  { key: 'sync-reviews', label: 'Review Sync', schedule: 'Every 6 hours', desc: 'Pulls new Google reviews into connected businesses', color: '#eab308', staleMs: 8 * 3600000, logs: 'always', path: '/api/cron/sync-reviews' },
  { key: 'refresh-meta-tokens', label: 'Meta Token Refresh', schedule: 'Daily 04:00 UTC', desc: 'Refreshes Facebook / Instagram page tokens and flags ones that need reconnecting', color: '#0866ff', staleMs: 26 * 3600000, logs: 'always', path: '/api/cron/refresh-meta-tokens' },
  { key: 'trial-nudges', label: 'Trial Nudges', schedule: 'Daily', desc: 'Emails trial owners at T-3 days, expiry, and T+3 to drive conversion', color: '#f59e0b', staleMs: 26 * 3600000, logs: 'always', path: '/api/cron/trial-nudges' },
  { key: 'signup-retention', label: 'Sign-up Retention', schedule: 'Daily 03:50 UTC', desc: 'Deletes abandoned sign-up attempts (not suspicious or spam) after 180 days quiet', color: '#6b7280', staleMs: 26 * 3600000, logs: 'always', path: '/api/cron/signup-retention' },
  { key: 'expire-media', label: 'Media Expiry', schedule: 'Daily', desc: 'Purges expired share links and 30-day-old trashed media', color: '#0891b2', staleMs: 26 * 3600000, logs: 'always', path: '/api/cron/expire-media' },
  // Not reporting to job_runs yet — listed so nothing scheduled is invisible.
  { key: 'needs-you', label: 'Needs-you Phone Alerts', schedule: 'Every 15 min', desc: 'Pushes a phone alert for anything newly urgent on “Needs you” (missed goals, drafts waiting, unpicked hand-overs). Per-business counts are on AI Agents.', color: '#ef4444', logs: 'none', path: '/api/cron/needs-you' },
  { key: 'agent-digest', label: 'Weekly Agent Digest', schedule: 'Sundays 21:30 UTC', desc: 'Emails each business a summary of what its agents did. Per-business “last sent” is on AI Agents.', color: '#8b5cf6', logs: 'none', path: '/api/cron/agent-digest' },
  { key: 'operations', label: 'Operations Agent Sweep', schedule: 'Every 3 hours', desc: 'Operations Agent looks for orders that need a customer update', color: '#0ea5e9', logs: 'none', path: '/api/cron/operations' },
  { key: 'booking-reminders', label: 'Booking Reminders', schedule: 'Every 10 min', desc: 'Sends booking reminders to customers', color: '#10b981', logs: 'none', path: '/api/cron/booking-reminders' },
  { key: 'calendar-reminders', label: 'Calendar Reminders', schedule: 'Every 10 min', desc: 'Reminds staff about calendar events', color: '#14b8a6', logs: 'none', path: '/api/calendar/reminders' },
  { key: 'waitlist', label: 'Waitlist', schedule: 'Every 5 min', desc: 'Sends back-in-stock texts held until sending hours', color: '#0891b2', logs: 'none', path: '/api/cron/waitlist' },
  { key: 'cart-recovery', label: 'Cart Recovery', schedule: 'Every 10 min', desc: 'Follows up abandoned carts', color: '#f59e0b', logs: 'none', path: '/api/cron/cart-recovery' },
  { key: 'reviews-dispatch', label: 'Review Requests', schedule: 'Every 10 min', desc: 'Sends queued review-request messages', color: '#eab308', logs: 'none', path: '/api/reviews/dispatch' },
  { key: 'ticket-sla', label: 'Ticket SLA', schedule: 'Every 5 min', desc: 'Flags tickets that breach their response / resolution targets', color: '#ef4444', logs: 'none', path: '/api/cron/ticket-sla' },
  { key: 'shopify-sync', label: 'Shopify Sync', schedule: 'Every 15 min', desc: 'Pulls Shopify orders, products and checkouts (store health is on Integrations)', color: '#5e8e3e', logs: 'none', path: '/api/cron/shopify-sync' },
  { key: 'shopify-tokens', label: 'Shopify Token Refresh', schedule: 'Daily 04:40 UTC', desc: 'Refreshes expiring Shopify app tokens', color: '#5e8e3e', logs: 'none', path: '/api/cron/shopify-tokens' },
]
const DEFAULT_STALE_MS = 3600000 // 1h fallback for jobs without an explicit cadence
const prettyJob = (k: string) => k.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
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
  // Union of the known registry and any job key seen in job_runs, so a worker
  // that started logging (e.g. order-sync) is observable even before it's added
  // to the registry above.
  const registryKeys = new Set(JOBS.map(j => j.key))
  const derivedJobs = Array.from(new Set(all.map(r => r.job).filter(Boolean)))
    .filter(k => !registryKeys.has(k))
    .map(k => ({ key: k as string, label: prettyJob(k as string), schedule: 'Scheduled', desc: 'Background worker', color: '#6366f1', staleMs: undefined as number | undefined, logs: 'always' as const, path: '' }))
  const cards: JobDef[] = [...JOBS, ...derivedJobs]
  // Instrumented first; the not-yet-logging crons go last.
  const silent = (j: JobDef) => j.logs === 'none' && !all.some(r => r.job === j.key)
  cards.sort((a, b) => Number(silent(a)) - Number(silent(b)))
  const unlogged = cards.filter(silent)
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
          {unlogged.length > 0 && (
            <Notice tone="info">{unlogged.length} scheduled job{unlogged.length === 1 ? ' doesn’t' : 's don’t'} report to job_runs yet ({unlogged.map(j => j.label).join(', ')}), so they show as “Not logged”. They still run on Vercel’s schedule — add a <code>logJobRun()</code> call to each cron route to see their heartbeat here.</Notice>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 14, marginBottom: 22 }}>
            {cards.map(j => {
              const s = stat(j.key)
              const lastColor = s.last ? (JOB_STATUS_COLOR[String(s.last.status)] || '#6b7280') : '#6b7280'
              const stale = s.last?.created_at ? (Date.now() - new Date(s.last.created_at).getTime()) > (j.staleMs ?? DEFAULT_STALE_MS) : true
              return (
                <div key={j.key} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: j.color + '22', color: j.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{j.label[0]}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{j.label}</p>
                      <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}>{j.schedule}</p>
                    </div>
                    {rows !== null && (() => {
                      // Not reporting yet → can't judge; "work"-only loggers are quiet when idle.
                      const [txt, c] = !s.last
                        ? (j.logs === 'none' ? ['Not logged', '#6b7280'] : j.logs === 'work' ? ['Quiet', '#6b7280'] : ['No runs', '#f59e0b'])
                        : s.last.status === 'error' ? ['Failing', '#ef4444']
                        : stale ? (j.logs === 'work' ? ['Quiet', '#6b7280'] : ['Stale', '#f59e0b'])
                        : ['Healthy', '#10b981']
                      return <span title={j.path ? `${j.path} · ${j.logs === 'none' ? 'does not write job_runs yet' : j.logs === 'work' ? 'logs only when it did work' : 'logs every run'}` : ''} style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: c + '22', color: c }}>{txt}</span>
                    })()}
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
            {cards.map(j => <button key={j.key} onClick={() => setJobFilter(j.key)} style={chip(jobFilter === j.key)}>{j.label}</button>)}
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
// Merges impersonation sessions (an admin entered a workspace), company admin
// notes, and the server-side super_admin_audit log (plan/trial/credit/
// entitlement/AI-model/agent-pause changes made through the audited routes).
function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')
  const [auditNote, setAuditNote] = useState('')
  const load = async () => {
    const [co, imp, notes, sa] = await Promise.all([
      (supabase as any).from('companies').select('id,name,slug'),
      (supabase as any).from('impersonation_sessions').select('*').order('started_at', { ascending: false }).limit(200),
      (supabase as any).from('company_admin_notes').select('*').order('created_at', { ascending: false }).limit(200),
      paJson('/api/platform-admin/audit?limit=200'),
    ])
    setAuditNote(sa.ok ? (sa.data.needsMigration ? 'Run COLVY_V319_SUPER_ADMIN_AUDIT.sql to record plan, credit, entitlement, AI and agent-pause changes here.' : '') : `Admin action log unavailable: ${sa.data.error || 'error'}`)
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
    // super_admin_audit — written by the audited server routes (plan / trial
    // changes, credit, entitlements, AI model choices, agent pause, impersonation).
    ;((sa.ok && Array.isArray(sa.data.entries)) ? sa.data.entries : []).forEach((e: any) => {
      if (String(e.action || '').startsWith('impersonate_')) return   // already listed from impersonation_sessions
      events.push({
        id: `sa-${e.id}`, kind: 'admin', at: e.created_at,
        actor: e.admin_email || 'admin',
        business: e.company_id ? (coMap[e.company_id]?.name || coMap[e.company_id]?.slug || '—') : 'Platform',
        detail: `${String(e.action || '').replace(/[._]/g, ' ')}${e.summary ? ` — ${e.summary}` : ''}`,
      })
    })
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
    admin: { label: 'Admin action', color: '#8b5cf6' },
  }
  const th: React.CSSProperties = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }
  const td: React.CSSProperties = { padding: '11px 16px', fontSize: 12.5, color: 'var(--sa-text)' }
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 9, border: `1px solid ${active ? '#ff7a6b' : 'var(--sa-border)'}`, background: active ? '#ff7a6b22' : 'var(--sa-card)', color: active ? '#ff7a6b' : 'var(--sa-text)', fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: 'pointer' })
  return (
    <div>
      <SectionHeader title="Audit Logs" sub="A trail of privileged platform actions across every business"
        action={<button onClick={() => { setRows(null); load() }} style={paBtn()}>Refresh</button>} />
      {auditNote && <Notice>{auditNote}</Notice>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <SearchBar placeholder="Search actor, business, detail…" value={q} onChange={setQ} />
        <div style={{ display: 'flex', gap: 6 }}>
          {[['all', 'All'], ['admin', 'Admin actions'], ['impersonation', 'Impersonation'], ['note', 'Admin notes']].map(([k, l]) => (
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

// Operations · Demo Workspaces — create and manage the public showcase and
// private, branded prospect demos. Backed by /api/platform-admin/demos.
const DEMO_TYPE_META: Record<string, { label: string; color: string }> = {
  shared_showcase: { label: 'Shared showcase', color: '#10b981' },
  private_sales: { label: 'Private sales', color: '#6366f1' },
  internal_testing: { label: 'Internal testing', color: '#f59e0b' },
  trial: { label: 'Trial', color: '#0891b2' },
}
const DEMO_STATUS_COLOR: Record<string, string> = { active: '#10b981', disabled: '#6b7280', expired: '#f59e0b', converted: '#8b5cf6' }
const DEMO_TEMPLATES = [['cafe', 'Café & hospitality'], ['retail', 'Retail & ecommerce'], ['automotive', 'Automotive workshop'], ['aquarium', 'Aquarium & pet store']]

function DemoWorkspacesPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [missing, setMissing] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState<any>({ businessName: '', template: 'cafe', demoType: 'private_sales', contactName: '', contactEmail: '', salesperson: '', days: 14, notes: '' })
  const [creating, setCreating] = useState(false)

  const authFetch = async (init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch('/api/platform-admin/demos', { ...init, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}`, ...(init?.headers || {}) } })
  }
  const load = async () => {
    try {
      const res = await authFetch()
      const d = await res.json()
      if (d.missing) { setMissing(true); setRows([]); return }
      setRows(d.demos || [])
      setAnalytics(d.analytics || null)
    } catch { setRows([]) }
  }
  useEffect(() => { load() }, [])

  const act = async (op: string, id: string, extra?: any) => {
    setBusy(id + op); setMsg('')
    try {
      const res = await authFetch({ method: 'POST', body: JSON.stringify({ op, id, ...extra }) })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || 'Action failed'); return }
      setMsg(`Done: ${op}`)
      await load()
    } finally { setBusy('') }
  }
  const create = async () => {
    if (!form.businessName.trim()) { setMsg('Business name is required.'); return }
    setCreating(true); setMsg('')
    try {
      const res = await authFetch({ method: 'POST', body: JSON.stringify({ op: 'create', ...form }) })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error || 'Could not create demo'); return }
      setShowNew(false); setForm({ businessName: '', template: 'cafe', demoType: 'private_sales', contactName: '', contactEmail: '', salesperson: '', days: 14, notes: '' })
      setMsg(`Created ${d.slug} (${Object.values(d.counts || {}).reduce((a: any, b: any) => a + b, 0)} sample records)`)
      await load()
    } finally { setCreating(false) }
  }

  const list = rows || []
  const byType = (t: string) => list.filter(r => r.demo_type === t).length
  const th: React.CSSProperties = { padding: '12px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12.5, color: 'var(--sa-text)' }
  const expLabel = (r: any) => { const e = r.expires_at || r.company?.demo_expires_at; if (!e) return '—'; const days = Math.ceil((new Date(e).getTime() - Date.now()) / 86400000); return days < 0 ? 'expired' : `${days}d` }

  return (
    <div>
      <SectionHeader title="Demo Workspaces" sub="The public showcase and private, branded prospect demos"
        action={<button onClick={() => setShowNew(true)} style={paBtn('#ff7a6b', true)}>+ New demo</button>} />
      {msg && <div style={{ padding: '9px 12px', borderRadius: 9, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', fontSize: 12.5, color: 'var(--sa-text)', marginBottom: 12 }}>{msg}</div>}
      {missing ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)' }}>Run <b>COLVY_V223_DEMO.sql</b> to enable demo workspaces.</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12, marginBottom: 18 }}>
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
              <p style={{ fontSize: 24, fontWeight: 800, color: '#6366f1', margin: 0 }}>{rows === null ? '…' : list.length}</p>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>Total demos</p>
            </div>
            {Object.keys(DEMO_TYPE_META).map(t => (
              <div key={t} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16 }}>
                <p style={{ fontSize: 24, fontWeight: 800, color: DEMO_TYPE_META[t].color, margin: 0 }}>{rows === null ? '…' : byType(t)}</p>
                <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '2px 0 0' }}>{DEMO_TYPE_META[t].label}</p>
              </div>
            ))}
          </div>
          {analytics && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: '12px 16px', marginBottom: 16, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center' }}>Demo activity</span>
              {[
                { label: 'Sessions', v: analytics.byEvent?.session_start || 0, c: '#10b981' },
                { label: 'Created', v: analytics.byEvent?.demo_created || 0, c: '#6366f1' },
                { label: 'Resets', v: (analytics.byEvent?.demo_reset || 0) + (analytics.byEvent?.seed_reset || 0), c: '#0891b2' },
                { label: 'Conversions', v: analytics.byEvent?.demo_converted || 0, c: '#8b5cf6' },
                { label: 'Blocked sends', v: analytics.byEvent?.blocked_send || 0, c: '#ef4444' },
              ].map(s => (
                <span key={s.label} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>{s.label}</span>
                </span>
              ))}
            </div>
          )}
          <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
              <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Type', 'Template', 'Slug', 'Status', 'Expiry', 'Contact', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {rows === null ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
                : list.length === 0 ? <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>No demo workspaces yet. Create one, or seed the public showcase from the SMS-free /demo page.</td></tr>
                : list.map((r, i) => {
                  const tm = DEMO_TYPE_META[r.demo_type] || { label: r.demo_type, color: '#6b7280' }
                  const sc = DEMO_STATUS_COLOR[r.status] || '#6b7280'
                  const slug = r.slug || r.company?.slug
                  return (
                    <tr key={r.id} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{r.business_name || r.company?.name || '—'}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, color: tm.color }}>{tm.label}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)', textTransform: 'capitalize' }}>{r.template || '—'}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{slug || '—'}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999, background: sc + '22', color: sc }}>{r.status}</span></td>
                      <td style={{ ...td, color: 'var(--sa-muted)' }}>{expLabel(r)}</td>
                      <td style={{ ...td, color: 'var(--sa-muted)', maxWidth: 160, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.contact_email || ''}>{r.contact_name || r.contact_email || '—'}</td>
                      <td style={td}>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {slug && <button onClick={() => enterWorkspace(slug)} style={paBtn('#6366f1')}>Open</button>}
                          <button onClick={async () => { if (await confirmDialog({ title: `Reset ${r.business_name || r.company?.name || 'this demo'}?`, message: 'Wipes the demo’s data and re-seeds the sample records.', confirmLabel: 'Reset demo', tone: 'danger' })) act('reset', r.id) }} disabled={!!busy} style={paBtn()}>{busy === r.id + 'reset' ? '…' : 'Reset…'}</button>
                          <button onClick={() => act('extend', r.id, { days: 14 })} disabled={!!busy} style={paBtn()}>+14d</button>
                          {r.status === 'disabled'
                            ? <button onClick={() => act('enable', r.id)} disabled={!!busy} style={paBtn('#10b981')}>Enable</button>
                            : <button onClick={async () => { if (await confirmDialog({ title: 'Disable this demo workspace?', message: 'Anyone using its link loses access until you enable it again.', confirmLabel: 'Disable', tone: 'danger' })) act('disable', r.id) }} disabled={!!busy} style={paBtn('#f59e0b')}>Disable…</button>}
                          {r.status !== 'converted' && <button onClick={async () => { if (await confirmDialog({ title: 'Convert this demo to a real workspace?', message: 'It stops being a demo (no expiry, no sample-data resets). Use this when the prospect signs up.', confirmLabel: 'Convert', tone: 'primary' })) act('convert', r.id) }} disabled={!!busy} style={paBtn('#8b5cf6')}>Convert…</button>}
                          <button onClick={async () => { if (await confirmDialog('Delete this demo workspace and all its sample data? This cannot be undone.')) act('delete', r.id) }} disabled={!!busy} style={paBtn('#ef4444')}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showNew && (
        <div onClick={() => setShowNew(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, maxWidth: '96vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--sa-bg)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
            <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 14px' }}>New demo workspace</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Business name *</label><input value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Bright Auto" style={paInput} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Industry template</label>
                  <select value={form.template} onChange={e => setForm({ ...form, template: e.target.value })} style={paInput}>{DEMO_TEMPLATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Demo type</label>
                  <select value={form.demoType} onChange={e => setForm({ ...form, demoType: e.target.value })} style={paInput}>
                    <option value="private_sales">Private sales</option>
                    <option value="internal_testing">Internal testing</option>
                    <option value="trial">Trial (sending on)</option>
                  </select></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Contact name</label><input value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} style={paInput} /></div>
                <div style={{ flex: 1 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Contact email</label><input value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} style={paInput} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Salesperson</label><input value={form.salesperson} onChange={e => setForm({ ...form, salesperson: e.target.value })} style={paInput} /></div>
                <div style={{ width: 110 }}><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Expiry (days)</label><input type="number" value={form.days} onChange={e => setForm({ ...form, days: parseInt(e.target.value) || 14 })} style={paInput} /></div>
              </div>
              <div><label style={{ fontSize: 11.5, color: 'var(--sa-muted)' }}>Internal notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ ...paInput, resize: 'vertical' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={paBtn()}>Cancel</button>
              <button onClick={create} disabled={creating || !form.businessName.trim()} style={paBtn('#ff7a6b', true)}>{creating ? 'Creating & seeding…' : 'Create & seed'}</button>
            </div>
          </div>
        </div>
      )}
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

function OverviewPage({ data, pulse, onRefresh, onGo }: { data: any; pulse: any; onRefresh: () => void; onGo: (page: string) => void }) {
  const abandoned = pulse?.signupLeads?.abandoned24h || 0
  return (
    <div>
      <SectionHeader title="Overview" sub={`Last updated ${new Date().toLocaleTimeString()}`}
        action={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {abandoned > 0 && (
            <button onClick={() => onGo('signups')} title="People who asked for a sign-up code in the last 24 hours and didn't finish" style={{ padding: '6px 12px', borderRadius: 999, background: '#f59e0b20', color: '#d97706', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              ● {abandoned} abandoned sign-up{abandoned === 1 ? '' : 's'} · 24h
            </button>
          )}
          <button onClick={onRefresh} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--sa-border)', background: 'var(--sa-card)', color: 'var(--sa-muted)', fontSize: 13, cursor: 'pointer' }}>
            {I.refresh} Refresh
          </button>
          </div>
        }
      />

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(230px, 100%), 1fr))', gap: 12, marginBottom: 24 }}>
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', gap: 14, marginBottom: 24 }}>
        <KPI label="Total Companies" value={data.companies?.toLocaleString() ?? '—'} sub="all workspaces" color="#ff7a6b" />
        <KPI label="Active Companies" value={data.active?.toLocaleString() ?? '—'} sub="active in 30 days" color="#6366f1" />
        <KPI label="On trial" value={data.trials?.toLocaleString() ?? '—'} sub="on trial plan" color="#f59e0b" />
        <KPI label="New Today" value={data.today?.toLocaleString() ?? '0'} sub="signups in last 24h" color="#10b981" />
        <KPI label="DAC" value={data.dac?.toLocaleString() ?? '—'} sub="active companies today" color="#6366f1" />
        <KPI label="Total Ideas" value={data.ideas?.toLocaleString() ?? '—'} sub="across all boards" color="#f59e0b" />
        <KPI label="Help Articles" value={data.articles?.toLocaleString() ?? '—'} sub="published" color="#0891b2" />
      </div>

      {/* Revenue & growth (SaaS metrics) */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px' }}>Revenue & growth</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: 14 }}>
          <KPI label="MRR" value={`$${(data.mrr ?? 0).toLocaleString()}`} sub={data.mrrSource === 'subscriptions' ? 'live from Stripe subs' : 'est. from plans'} color="#8b5cf6" />
          <KPI label="ARR" value={`$${(data.arr ?? 0).toLocaleString()}`} sub="annual run rate" color="#ec4899" />
          <KPI label="ARPA" value={`$${(data.arpa ?? 0).toLocaleString()}`} sub="avg revenue / account" color="#8b5cf6" />
          <KPI label="Paying customers" value={data.paid?.toLocaleString() ?? '—'} sub="on a paid plan" color="#10b981" />
          <KPI label="New paid · 30d" value={data.newPaidLast30?.toLocaleString() ?? '—'} sub="subscriptions started" color="#10b981" />
          <KPI label="Churn · 30d" value={data.churn != null ? `${data.churn}%` : '—'} sub={`${data.canceledLast30 ?? 0} cancelled`} color="#ef4444" />
          <KPI label="Active trials" value={data.activeTrials?.toLocaleString() ?? '—'} sub="not yet expired" color="#f59e0b" />
          <KPI label="Trials ending · 7d" value={data.trialsEndingSoon?.toLocaleString() ?? '—'} sub="reach out to convert" color="#f59e0b" />
          <KPI label="Trial → paid" value={data.conversion != null ? `${data.conversion}%` : '—'} sub="paid ÷ (paid + trial)" color="#0891b2" />
          <KPI label="Expired trials" value={data.expiredTrials?.toLocaleString() ?? '—'} sub="lapsed, not converted" color="#6b7280" />
          <KPI label="Sales logged · 30d" value={`$${(data.salesLogged30d ?? 0).toLocaleString()}`} sub={`${data.salesCount30d ?? 0} in-chat sales`} color="#16a34a" />
          <KPI label="Pay links paid · 30d" value={data.payLinksPaid30d != null ? data.payLinksPaid30d.toLocaleString() : '—'} sub="Stripe pay links in chat" color="#635bff" />
          <KPI label="Bookings · 30d" value={data.bookings30d != null ? data.bookings30d.toLocaleString() : '—'} sub="booked across all workspaces" color="#0891b2" />
        </div>
        {/* Top workspaces by revenue tenants attribute to Colvy (in-chat sales). */}
        {Array.isArray(data.topSalesCompanies) && data.topSalesCompanies.length > 0 && (
          <div style={{ marginTop: 12, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 18 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 3px' }}>Revenue generated via Colvy · last 30 days</p>
            <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 12px' }}>Top workspaces by in-chat sales logged (incl. bank transfers)</p>
            {data.topSalesCompanies.map((c: any) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--sa-border)' }}>
                <span style={{ fontSize: 13, color: 'var(--sa-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', whiteSpace: 'nowrap' }}>${Number(c.total || 0).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Attention Required */}
      <AttentionPanel />

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14, marginBottom: 24 }}>
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
            const order = ['enterprise', 'everything', 'omnichannel', 'feedback', 'growth', 'pro', 'business', 'startup', 'trial', 'free', 'suspended']
            const colors: Record<string, string> = { enterprise: '#8b5cf6', everything: '#ff6a4d', omnichannel: '#2b59ff', feedback: '#7c5cff', growth: '#ff7a6b', pro: '#10b981', business: '#2563eb', startup: '#0891b2', trial: '#f59e0b', free: '#d1d5db', suspended: '#ef4444' }
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

      {/* Platform health (real, last 24h) + recent admin activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Platform health</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 14 }}>Failures in the last 24 hours · click a row to dig in</p>
          {pulse === null ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Checking…</p>
          : pulse?.error ? <p style={{ fontSize: 12.5, color: '#ef4444' }}>Couldn’t load health: {pulse.error}</p>
          : [
            { label: 'Background jobs', value: `${pulse.jobs?.errors || 0} failed / ${pulse.jobs?.runs || 0} runs`, bad: (pulse.jobs?.errors || 0) > 0, go: 'jobs' },
            { label: 'API errors', value: `${pulse.api?.errors || 0} errors · ${pulse.api?.warnings || 0} warnings`, bad: (pulse.api?.errors || 0) > 0, go: 'apilogs' },
            { label: 'Webhooks', value: `${pulse.webhooks?.errors || 0} errors / ${pulse.webhooks?.total || 0} received`, bad: (pulse.webhooks?.errors || 0) > 0, go: 'webhooks' },
            { label: 'AI agent runs', value: `${pulse.agents?.failed || 0} failed · ${pulse.agents?.stuck || 0} stuck / ${pulse.agents?.runs || 0}`, bad: (pulse.agents?.failed || 0) + (pulse.agents?.stuck || 0) > 0 || !!pulse.agents?.platformPaused, go: 'agents' },
            { label: 'Connections', value: `${pulse.connections?.broken || 0} need attention / ${pulse.connections?.total || 0}`, bad: (pulse.connections?.broken || 0) > 0, go: 'integrations' },
            { label: 'Stripe events', value: `${pulse.stripe?.events || 0} received`, bad: false, go: 'system' },
            ...(pulse.emailReceiving ? [{ label: 'Reading received email', value: pulse.emailReceiving.status === 'working' ? 'Working' : pulse.emailReceiving.status === 'blocked' ? 'Blocked: key can only send' : pulse.emailReceiving.label, bad: pulse.emailReceiving.status !== 'working', go: 'system' }] : []),
            ...(pulse.signupLeads && !pulse.signupLeads.missing ? [{ label: 'Sign-ups not finished', value: `${pulse.signupLeads.abandoned24h} abandoned · ${pulse.signupLeads.suspicious24h} suspicious`, bad: false, go: 'signups', tag: pulse.signupLeads.abandoned24h || pulse.signupLeads.suspicious24h ? 'Follow up' : 'None' }] : []),
          ].map((r: any) => (
            <div key={r.label} onClick={() => onGo(r.go)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid var(--sa-border)', cursor: 'pointer' }}>
              <span style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>{r.label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sa-text)' }}>{r.value}</span>
                {r.tag ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: r.tag === 'None' ? 'var(--sa-hover)' : '#f59e0b20', color: r.tag === 'None' ? 'var(--sa-muted)' : '#d97706', whiteSpace: 'nowrap' }}>{r.tag}</span> : <Badge status={r.bad ? 'degraded' : 'healthy'} />}
              </span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 14 }}>Recent activity</p>
          {pulse === null ? <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Loading…</p> : (() => {
            const items = [
              ...((pulse?.audit || []) as any[]).map(a => ({ k: `a-${a.id}`, at: a.created_at, color: '#8b5cf6', action: a.summary || String(a.action || '').replace(/[._]/g, ' '), detail: [a.company, a.admin_email].filter(Boolean).join(' · ') })),
              ...((pulse?.signups || []) as any[]).map(c => ({ k: `c-${c.id}`, at: c.created_at, color: '#10b981', action: 'New company signed up', detail: `${c.name || c.slug} · ${c.slug}.colvy.com · ${c.plan || 'free'}` })),
            ].sort((x, y) => String(y.at).localeCompare(String(x.at))).slice(0, 9)
            if (items.length === 0) return <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Nothing recorded yet.</p>
            return items.map(a => (
              <div key={a.k} style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, marginTop: 5, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, color: 'var(--sa-text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.action}>{a.action}</p>
                  <p style={{ fontSize: 12, color: 'var(--sa-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.detail}</p>
                </div>
                <span style={{ fontSize: 11, color: 'var(--sa-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{agoText(a.at)}</span>
              </div>
            ))
          })()}
          {pulse?.auditMissing && <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: 0 }}>Admin actions appear here once COLVY_V319_SUPER_ADMIN_AUDIT.sql has run.</p>}
        </div>
      </div>

      {/* Sign-up code texts: sent vs delivered, top error codes */}
      {pulse?.signupSms && <div style={{ marginTop: 14 }}><SignupSmsHealth sms={pulse.signupSms} onOpen={() => onGo('signups')} /></div>}

      {/* Email health: recover customer replies saved with an empty body */}
      <div style={{ marginTop: 14 }}><EmailHealthCard /></div>
    </div>
  )
}

// Plans the console can set (lib/plan). Legacy values still display as-is.
const CONSOLE_PLANS = ['free', 'trial', 'feedback', 'omnichannel', 'everything', 'enterprise', 'suspended']

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

// Safe impersonation: capture a reason + mode, record an audited session, then
// open the workspace with the session id so it shows the banner. Shared by
// Companies ("Enter workspace") and Users ("Login as").
function ImpersonateModal({ co, onClose }: { co: { id?: string; slug: string; name?: string }; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [mode, setMode] = useState('full')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const start = async () => {
    if (!reason.trim()) { setErr('A reason is required.'); return }
    setBusy(true); setErr('')
    const r = await auditedEnterWorkspace(co, reason.trim(), mode, minutes)
    if (!r.ok) { setBusy(false); setErr(r.error || 'Could not start session'); return }
    onClose()
  }
  return (
    <div onClick={() => !busy && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '94vw', background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 24 }}>
        <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: '0 0 4px' }}>Enter {co.name || co.slug} workspace</p>
        <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>You'll enter as super admin using your own account. This session is recorded in the audit log, and a banner shows inside the workspace until you exit.</p>
        <label style={paLabel}>Reason (required)</label>
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Investigating support ticket #1042" style={paInput} autoFocus />
        <label style={paLabel}>Mode</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['full', 'Full support'], ['read_only', 'Read-only']].map(([v, l]) => (
            <button key={v} onClick={() => setMode(v)} style={{ flex: 1, padding: '9px', borderRadius: 9, border: `1px solid ${mode === v ? '#ff7a6b' : 'var(--sa-border)'}`, background: mode === v ? '#ff7a6b22' : 'transparent', color: mode === v ? '#ff7a6b' : 'var(--sa-muted)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{l}</button>
          ))}
        </div>
        <label style={paLabel}>Auto-expire after</label>
        <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} style={paInput}>
          {[15, 30, 60, 120, 240].map(m => <option key={m} value={m}>{m} minutes</option>)}
        </select>
        {err && <p style={{ fontSize: 12, color: '#ef4444', margin: '12px 0 0' }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} disabled={busy} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={start} disabled={busy} style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#ff7a6b', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Entering…' : 'Enter workspace →'}</button>
        </div>
      </div>
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
  // Assigning an existing (already-purchased) Twilio number to this company.
  const [assignNum, setAssignNum] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')
  // The company's currently-assigned numbers, shown in the drawer so the admin
  // can see what's on file (the assign box above is an action input, not state).
  const [coNumbers, setCoNumbers] = useState<any[]>([])
  const [coNumbersLoading, setCoNumbersLoading] = useState(false)

  const loadCoNumbers = async (companyId: string) => {
    setCoNumbersLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/admin/assign-number?companyId=${companyId}`, {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setCoNumbers(res.ok ? (data.numbers || []) : [])
    } catch { setCoNumbers([]) } finally { setCoNumbersLoading(false) }
  }

  const assignExistingNumber = async () => {
    if (!editCo || !assignNum.trim()) return
    setAssigning(true); setAssignMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/assign-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ companyId: editCo.id, phoneNumber: assignNum.trim(), makePrimary: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not assign number')
      setAssignMsg(`✓ ${data.phoneNumber} assigned and routed to Twilio.`)
      setAssignNum('')
      // Reflect the carrier switch the endpoint performed.
      setForm((f: any) => ({ ...f, number_provider: 'twilio' }))
      setCompanies(prev => prev.map(c => c.id === editCo.id ? { ...c, number_provider: 'twilio', sms_provider: 'twilio', voice_provider: 'twilio' } : c))
      loadCoNumbers(editCo.id) // refresh the "current numbers" list
    } catch (e: any) { setAssignMsg(`✕ ${e.message}`) } finally { setAssigning(false) }
  }

  const openEdit = (co: any) => {
    setAssignNum(''); setAssignMsg(''); setCoNumbers([]); loadCoNumbers(co.id)
    setEditErr('')
    setForm({
      name: co.name || '', slug: co.slug || '', plan: co.plan || 'free',
      business_phone: co.business_phone || '', assigned_admin_email: co.assigned_admin_email || '',
      board_domain: co.board_domain || '', help_domain: co.help_domain || '',
      accent_color: co.accent_color || '#ff7a6b', owner_email: '', notes: co.notes || '',
      number_provider: co.number_provider || 'twilio',
      free_number_credits: co.free_number_credits ?? 0,
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

  // Deep-link: "#companies/<id-or-slug>" opens that company's detail directly
  // (used by the "View workspace" link on a contact in any admin workspace).
  useEffect(() => {
    if (loading || detailCo) return
    try {
      const parts = window.location.hash.replace(/^#/, '').split('/')
      if (parts[0] === 'companies' && parts[1]) {
        const co = companies.find(c => c.id === parts[1] || c.slug === parts[1])
        if (co) setDetailCo(co)
      }
    } catch {}
  }, [loading])

  // "Set up board address": what Vercel said about <slug>.colvy.com.
  const [prov, setProv] = useState<{ co: any; busy: boolean; ok?: boolean; summary?: string; steps?: string[]; url?: string; raw?: any } | null>(null)

  const action = async (type: string, co: any) => {
    setMsg('')
    if (type === 'provision') {
      setDetailCo(null)
      setProv({ co, busy: true })
      const r = await paJson('/api/platform-admin/provision-domain', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: co.id }) })
      if (!r.ok) { setProv({ co, busy: false, ok: false, summary: r.data.error || `Request failed (${r.status || 'network'})`, steps: [] }); return }
      setProv({ co, busy: false, ok: !!r.data.ok, summary: r.data.summary, steps: r.data.steps || [], url: r.data.url, raw: { vercel: r.data.vercel, cloudflare: r.data.cloudflare, check: r.data.check } })
      return
    }
    // Safe impersonation: capture a reason + mode, record an audit session,
    // then open the workspace with the session id so it shows the banner.
    if (type === 'impersonate') { setImp({ co }); return }
    if (type === 'view') { window.open(`https://${co.slug}.colvy.com`, '_blank'); return }
    // Plan changes go through the audited server route (super_admin_audit).
    const setPlan = async (plan: string, done: string) => {
      const r = await paJson('/api/platform-admin/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: co.id, patch: { plan } }) })
      if (!r.ok) { setMsg(`Could not update ${co.name}: ${r.data.error || 'failed'}`); return }
      setCompanies(prev => prev.map(c => c.id === co.id ? { ...c, plan } : c))
      setDetailCo((d: any) => d && d.id === co.id ? { ...d, plan } : d)
      setMsg(done)
    }
    if (type === 'suspend') {
      if (!(await confirmDialog({ title: `Suspend ${co.name}?`, message: 'Sets the plan to “suspended”, which switches off every paid feature for this business. Recorded in the audit log; reactivate any time.', confirmLabel: 'Suspend', tone: 'danger' }))) return
      await setPlan('suspended', `${co.name} suspended`)
    }
    if (type === 'reactivate') {
      if (!(await confirmDialog({ title: `Reactivate ${co.name}?`, message: 'Puts the business back on the Free plan. Change the plan afterwards in the business’s Subscription tab if they should be on a paid plan.', confirmLabel: 'Reactivate', tone: 'primary' }))) return
      await setPlan('free', `${co.name} reactivated (Free plan)`)
    }
    if (type === 'seed') {
      if (!(await confirmDialog({ title: `Reset ${co.name}'s board with sample data?`, message: 'This DELETES the workspace’s ideas, announcements, help articles, statuses and topics, then adds example content. Only use it on test or demo workspaces.', confirmLabel: 'Delete & re-seed', tone: 'danger' }))) return
      const r = await paJson('/api/seed-company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: co.id, companyName: co.name, clearFirst: true }) })
      setMsg(r.ok ? `Sample data seeded for ${co.name}` : `Seeding failed: ${r.data.error || 'error'}`)
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

      {prov && (
        <div role="status" aria-live="polite" style={{ padding: '14px 16px', borderRadius: 12, marginBottom: 16, border: `1px solid ${prov.busy ? 'var(--sa-border)' : prov.ok ? '#10b981' : '#f59e0b'}`, background: 'var(--sa-card)', color: 'var(--sa-text)', fontSize: 13 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ color: prov.busy ? 'var(--sa-muted)' : prov.ok ? '#10b981' : '#f59e0b', marginTop: 1, flexShrink: 0 }}>{prov.busy ? I.refresh : prov.ok ? I.check : I.alert}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {prov.busy ? `Setting up ${prov.co.slug}.colvy.com…` : prov.summary}
              </p>
              {!prov.busy && !!prov.steps?.length && (
                <ol style={{ margin: '8px 0 0', paddingLeft: 18, color: 'var(--sa-text)', lineHeight: 1.55 }}>
                  {prov.steps.map((st, i) => <li key={i}>{st}</li>)}
                </ol>
              )}
              {!prov.busy && prov.raw && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--sa-muted)', fontSize: 12 }}>What Vercel and Cloudflare said</summary>
                  <pre style={{ margin: '6px 0 0', padding: 10, borderRadius: 8, background: 'var(--sa-hover)', color: 'var(--sa-muted)', fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(prov.raw, null, 2)}</pre>
                </details>
              )}
            </div>
            {!prov.busy && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {prov.url && <a href={prov.url} target="_blank" rel="noopener" style={{ ...paBtn(), textDecoration: 'none' }}>Open</a>}
                <button onClick={() => action('provision', prov.co)} style={paBtn()}>Check again</button>
                <button onClick={() => setProv(null)} aria-label="Dismiss" style={{ ...paBtn(), padding: '6px 8px' }}>{I.x}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Safe impersonation modal */}
      {imp && <ImpersonateModal co={imp.co} onClose={() => setImp(null)} />}

      {detailCo && <BusinessDetail co={detailCo} onClose={() => setDetailCo(null)} onAction={action} />}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' as const }}>
        <SearchBar placeholder="Search companies..." value={search} onChange={setSearch} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
          {['all', ...CONSOLE_PLANS].map(f => (
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
                    <button onClick={() => action('provision', co)} disabled={prov?.busy} title={`Set up board address: add ${co.slug}.colvy.com to Vercel and Cloudflare, then check it`} aria-label={`Set up ${co.slug}.colvy.com`} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#6366f1', cursor: prov?.busy ? 'wait' : 'pointer', fontSize: 12 }}>{I.refresh}</button>
                    <button onClick={() => action('seed', co)} title="Delete content and seed sample data (test workspaces only)" aria-label={`Seed sample data for ${co.name}`} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 12 }}>{I.seed}</button>
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
                {Array.from(new Set([...CONSOLE_PLANS, form.plan].filter(Boolean))).map(p => <option key={p} value={p}>{PLAN_NAMES[p as Plan] || p}</option>)}
              </select>

              {/* Which carrier backs this company's phone-number provisioning +
                  telephony. Transparent to the customer; Telnyx is the default. */}
              <label style={paLabel}>Number carrier</label>
              <select value={form.number_provider || 'twilio'} onChange={e => setForm({ ...form, number_provider: e.target.value })} style={paInput}>
                <option value="telnyx">Telnyx (default)</option>
                <option value="twilio">Twilio (real MMS)</option>
              </select>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '-4px 0 4px' }}>
                Which carrier the “Get a business number” flow uses for this company. The customer never sees it. Existing numbers keep working.
              </p>

              {/* What's currently on the company, so the drawer reflects state. */}
              <label style={paLabel}>Current numbers</label>
              {coNumbersLoading ? (
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 6px' }}>Loading…</p>
              ) : coNumbers.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--sa-muted)', margin: '0 0 6px' }}>No numbers assigned yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '0 0 8px' }}>
                  {coNumbers.map((n: any) => (
                    <div key={n.phone_number} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', borderRadius: 8, border: '1px solid var(--sa-border)', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--sa-fg, #111)' }}>{n.phone_number}</span>
                      {n.is_primary && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: '#dcfce7', color: '#059669' }}>PRIMARY</span>}
                      <span style={{ fontSize: 10.5, color: 'var(--sa-muted)', textTransform: 'uppercase' }}>{n.provider}</span>
                      {(n.is_free || Number(n.monthly_cost) === 0) && <span style={{ fontSize: 10.5, color: '#059669', fontWeight: 700 }}>· Free</span>}
                      <span style={{ marginLeft: 'auto', fontSize: 10.5, color: n.status === 'active' ? '#059669' : 'var(--sa-muted)' }}>{n.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Attach a number already bought in Colvy's Twilio account to this
                  company — no purchase flow, no Stripe. Sets webhooks + routing. */}
              <label style={paLabel}>Assign an existing Twilio number</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  value={assignNum}
                  onChange={e => setAssignNum(e.target.value)}
                  placeholder="+61468012345"
                  style={{ ...paInput, marginBottom: 0, flex: 1 }}
                />
                <button type="button" onClick={assignExistingNumber} disabled={assigning || !assignNum.trim()}
                  style={{ padding: '9px 14px', borderRadius: 8, border: 'none', background: '#ff7a6b', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: assigning || !assignNum.trim() ? 'default' : 'pointer', opacity: assigning || !assignNum.trim() ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                  {assigning ? 'Assigning…' : 'Assign'}
                </button>
              </div>
              <p style={{ fontSize: 11.5, margin: '6px 0 4px', color: assignMsg.startsWith('✕') ? '#dc2626' : assignMsg.startsWith('✓') ? '#059669' : 'var(--sa-muted)' }}>
                {assignMsg || 'The number must already exist in Colvy’s platform Twilio account. It becomes this company’s primary number and routes calls + SMS to them.'}
              </p>
              {/* Colvy's own workspace: its public number (lib/colvy-contact.ts)
                  reaches the Colvy inbox once it's assigned here. */}
              {editCo.slug === (process.env.NEXT_PUBLIC_COLVY_SUPPORT_SLUG || 'colvy') && !coNumbers.some((n: any) => isColvyNumber(n.phone_number)) && (
                <button type="button" onClick={() => setAssignNum(COLVY_CONTACT.phoneE164)}
                  style={{ margin: '0 0 8px', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-text)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  Use Colvy’s public number ({COLVY_CONTACT.phoneDisplay})
                </button>
              )}

              {/* Grant this business one or more free numbers. While the balance
                  is > 0, the "Get a business number" flow skips payment and
                  provisions directly, consuming one credit per number. */}
              <label style={paLabel}>Free number credits</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number" min={0} step={1}
                  value={form.free_number_credits ?? 0}
                  onChange={e => setForm({ ...form, free_number_credits: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                  style={{ ...paInput, marginBottom: 0, width: 100 }}
                />
                <button type="button" onClick={() => setForm({ ...form, free_number_credits: (Number(form.free_number_credits) || 0) + 1 })}
                  style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: '#ff7a6b', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>+1 free number</button>
                {(Number(form.free_number_credits) || 0) > 0 && (
                  <button type="button" onClick={() => setForm({ ...form, free_number_credits: 0 })}
                    style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>Clear</button>
                )}
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', margin: '6px 0 4px' }}>
                Numbers this business can provision for free — one credit is used per number, no card required. Set to 0 to require payment.
              </p>

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
  const [companies, setCompanies] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [onlyOrphans, setOnlyOrphans] = useState(false)
  // "Add to workspace" repair modal state.
  const [attachFor, setAttachFor] = useState<any>(null)
  const [attachCompanyId, setAttachCompanyId] = useState('')
  const [attachRole, setAttachRole] = useState('editor')   // 'editor' == Agent
  const [attachBusy, setAttachBusy] = useState(false)
  const [attachMsg, setAttachMsg] = useState('')
  const [loginAs, setLoginAs] = useState<any>(null)

  const load = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/users', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load users')
      setUsers(data.users || [])
    } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('companies').select('id,name,slug').order('name', { ascending: true }).limit(1000)
        setCompanies(data || [])
      } catch {}
    })()
  }, [])

  // An "orphan" owns no company AND belongs to no workspace — an account that
  // can log in but lands nowhere (the Logan/Dip case).
  const isOrphan = (u: any) => (u.companies?.length || 0) === 0 && (u.memberships?.length || 0) === 0

  const filtered = users.filter(u => {
    if (onlyOrphans && !isOrphan(u)) return false
    if (!search) return true
    const s = search.toLowerCase()
    return (u.name || '').toLowerCase().includes(s)
      || (u.email || '').toLowerCase().includes(s)
      || (u.companies || []).some((c: any) => (c.name || '').toLowerCase().includes(s) || (c.slug || '').toLowerCase().includes(s))
      || (u.memberships || []).some((c: any) => (c.name || '').toLowerCase().includes(s) || (c.slug || '').toLowerCase().includes(s))
  })
  const orphanCount = users.filter(isOrphan).length

  const openAttach = (u: any) => {
    setAttachFor(u)
    setAttachCompanyId('')
    setAttachRole('editor')
    setAttachMsg('')
  }
  const submitAttach = async () => {
    if (!attachFor || !attachCompanyId) { setAttachMsg('Pick a workspace first.'); return }
    setAttachBusy(true); setAttachMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/platform-admin/attach-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ userId: attachFor.id, email: attachFor.email, companyId: attachCompanyId, role: attachRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not attach member')
      setAttachFor(null)
      await load()
    } catch (e: any) { setAttachMsg(e.message) } finally { setAttachBusy(false) }
  }

  const roleLabel = (r: string) => r === 'admin' ? 'Admin' : r === 'viewer' ? 'Viewer' : 'Agent'

  return (
    <div>
      <SectionHeader title="Users" sub={`All registered accounts (${users.length})`} />
      <div style={{ marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ flex: 1 }}><SearchBar placeholder="Search by name, email, or workspace..." value={search} onChange={setSearch} /></div>
        <button onClick={() => setOnlyOrphans(o => !o)}
          style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--sa-border)', background: onlyOrphans ? '#fee2e2' : 'transparent', color: onlyOrphans ? '#dc2626' : 'var(--sa-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {onlyOrphans ? '✓ ' : ''}Orphaned only ({orphanCount})
        </button>
      </div>
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['User', 'Email', 'Owns', 'Member of', 'Last sign-in', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.length === 0 ? <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>No users found</td></tr>
            : filtered.map((u, i) => {
              const orphan = isOrphan(u)
              return (
              <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ff7a6b, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                      {(u.name || u.email || '?')[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{u.name}</span>
                    {orphan && <span title="This account owns no workspace and belongs to no team — it can log in but lands nowhere." style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 6px', borderRadius: 6 }}>ORPHAN</span>}
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.email}{!u.confirmed && <span style={{ marginLeft: 6, fontSize: 10, color: '#f59e0b' }}>(unconfirmed)</span>}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-text)' }}>
                  {(u.companies?.length || 0) === 0 ? <span style={{ color: 'var(--sa-muted)' }}>—</span> : u.companies.map((c: any) => c.name).join(', ')}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-text)' }}>
                  {(u.memberships?.length || 0) === 0 ? <span style={{ color: 'var(--sa-muted)' }}>—</span>
                    : u.memberships.map((m: any) => `${m.name} (${roleLabel(m.role)})`).join(', ')}
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : 'never'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => openAttach(u)} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: orphan ? '#ecfdf5' : 'transparent', color: '#059669', cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' }}>+ Workspace</button>
                    {u.companies?.[0]?.slug && <button onClick={() => setLoginAs(u.companies[0])} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>Login as</button>}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {loginAs && <ImpersonateModal co={{ id: loginAs.id, slug: loginAs.slug, name: loginAs.name }} onClose={() => setLoginAs(null)} />}

      {/* Add-to-workspace repair modal */}
      {attachFor && (
        <div onClick={() => !attachBusy && setAttachFor(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Add to workspace</div>
            <div style={{ fontSize: 12, color: 'var(--sa-muted)', marginBottom: 16 }}>{attachFor.name} · {attachFor.email}</div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Workspace</label>
            <select value={attachCompanyId} onChange={e => setAttachCompanyId(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg, #fff)', color: 'var(--sa-text)', fontSize: 13, marginBottom: 14 }}>
              <option value="">Select a workspace…</option>
              {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}
            </select>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Role</label>
            <select value={attachRole} onChange={e => setAttachRole(e.target.value)}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg, #fff)', color: 'var(--sa-text)', fontSize: 13, marginBottom: 16 }}>
              <option value="admin">Admin</option>
              <option value="editor">Agent</option>
              <option value="viewer">Viewer</option>
            </select>
            {attachMsg && <div style={{ padding: '8px 11px', borderRadius: 8, background: '#fee2e2', color: '#dc2626', fontSize: 12, marginBottom: 12 }}>{attachMsg}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAttachFor(null)} disabled={attachBusy}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-text)', cursor: 'pointer', fontSize: 13 }}>Cancel</button>
              <button onClick={submitAttach} disabled={attachBusy || !attachCompanyId}
                style={{ padding: '8px 14px', borderRadius: 9, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: (attachBusy || !attachCompanyId) ? 0.6 : 1 }}>
                {attachBusy ? 'Adding…' : 'Add member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AnalyticsPage() {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  // Real, platform-wide metrics from our own tables. (Live product-usage funnels
  // live in PostHog — this reflects the same operational activity from the DB so
  // it's accurate without a PostHog round-trip.)
  const [growth, setGrowth] = useState<{ label: string; value: number }[] | null>(null)
  const [ops, setOps] = useState<{ orders: number; shipped: number; calls: number; companies: number } | null>(null)
  // Live product analytics pulled from PostHog's Query API via our server route.
  const [ph, setPh] = useState<any>(null)      // { configured, funnel, trend, totals, errors } | { error }
  useEffect(() => {
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        const res = await fetch('/api/platform-admin/posthog-insights', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        setPh(await res.json())
      } catch { setPh({ error: 'unreachable' }) }
    })()
  }, [])
  useEffect(() => {
    ;(async () => {
      try {
        const since = new Date(Date.now() - 30 * 864e5).toISOString()
        const count = async (q: any) => { try { const { count } = await q; return count || 0 } catch { return 0 } }
        // Company growth: last 12 months, bucketed from companies.created_at.
        const buckets: { label: string; value: number }[] = []
        const now = new Date()
        for (let i = 11; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
          const next = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
          buckets.push({ label: MONTHS[d.getMonth()], value: await count(
            (supabase as any).from('companies').select('*', { count: 'exact', head: true })
              .gte('created_at', d.toISOString()).lt('created_at', next.toISOString())
          ) })
        }
        setGrowth(buckets)
        const [orders, shipped, calls, companies] = await Promise.all([
          count((supabase as any).from('orders').select('*', { count: 'exact', head: true }).gte('created_at', since)),
          count((supabase as any).from('orders').select('*', { count: 'exact', head: true }).eq('status', 'shipped').gte('shipped_at', since)),
          count((supabase as any).from('calls').select('*', { count: 'exact', head: true }).gte('created_at', since)),
          count((supabase as any).from('companies').select('*', { count: 'exact', head: true })),
        ])
        setOps({ orders, shipped, calls, companies })
      } catch { setGrowth([]); setOps({ orders: 0, shipped: 0, calls: 0, companies: 0 }) }
    })()
  }, [])
  const gMax = Math.max(1, ...(growth || []).map(g => g.value))
  return (
    <div>
      <SectionHeader title="Analytics" sub="Platform-wide activity from Colvy's own data, plus live PostHog funnels below" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Company Growth</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>New companies per month (last 12)</p>
          {growth === null ? <p style={{ fontSize: 12, color: 'var(--sa-muted)' }}>Loading…</p> : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 80 }}>
              {growth.map((g, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${g.value} new`}>
                  <div style={{ width: '100%', background: 'linear-gradient(to top, #ff7a6b, #ff9a8b)', borderRadius: '4px 4px 0 0', height: `${(g.value / gMax) * 68}px`, minHeight: g.value ? 2 : 0, transition: 'height 0.4s ease' }} />
                  <span style={{ fontSize: 9, color: 'var(--sa-muted)' }}>{g.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Operations · last 30 days</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Order & call activity across every workspace</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: 'Orders imported', value: ops?.orders, color: '#0ea5e9' },
              { label: 'Orders shipped', value: ops?.shipped, color: '#10b981' },
              { label: 'Calls handled', value: ops?.calls, color: '#8b5cf6' },
              { label: 'Total companies', value: ops?.companies, color: '#ff7a6b' },
            ].map(m => (
              <div key={m.label} style={{ padding: '12px 14px', borderRadius: 12, border: '1px solid var(--sa-border)' }}>
                <p style={{ fontSize: 11, color: 'var(--sa-muted)', margin: '0 0 4px' }}>{m.label}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: m.color, margin: 0 }}>{ops === null ? '…' : (m.value ?? 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Live product analytics from PostHog */}
      <div style={{ marginTop: 14 }}>
        <SectionHeader title="Product analytics · live from PostHog" sub="Fulfilment funnel and shipped-order trend, queried live (last 30 / 14 days)" />
        {ph === null ? (
          <p style={{ fontSize: 12.5, color: 'var(--sa-muted)' }}>Loading…</p>
        ) : ph.error ? (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: '#ef444418', border: '1px solid #ef444455', fontSize: 12.5, color: 'var(--sa-text)' }}>Couldn’t reach PostHog: {String(ph.error)}</div>
        ) : ph.configured === false ? (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 12.5, color: 'var(--sa-text)', lineHeight: 1.6 }}>
            Live PostHog analytics aren’t configured. Set <b>POSTHOG_API_KEY</b> (a personal API key with query read scope) and <b>POSTHOG_PROJECT_ID</b> in the environment, then reload. (Optional: <b>POSTHOG_API_HOST</b> if not on US/EU cloud.)
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Funnel */}
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Packed → Shipped funnel</p>
              <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Unique orders, last 30 days</p>
              {(!ph.funnel || ph.funnel.length === 0) ? (
                <p style={{ fontSize: 12, color: 'var(--sa-muted)' }}>No funnel data yet.</p>
              ) : (() => {
                const top = Math.max(1, ...ph.funnel.map((s: any) => s.count))
                const first = ph.funnel[0]?.count || 0
                return ph.funnel.map((s: any, i: number) => {
                  const conv = first ? Math.round((s.count / first) * 100) : 0
                  return (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--sa-muted)', textTransform: 'capitalize' }}>{i + 1}. {s.name}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sa-text)' }}>{s.count.toLocaleString()}{i > 0 && <span style={{ color: 'var(--sa-muted)', fontWeight: 500 }}> · {conv}%</span>}</span>
                      </div>
                      <div style={{ height: 8, borderRadius: 999, background: 'var(--sa-border)' }}>
                        <div style={{ height: '100%', width: `${(s.count / top) * 100}%`, background: i === 0 ? '#6366f1' : '#10b981', borderRadius: 999 }} />
                      </div>
                    </div>
                  )
                })
              })()}
            </div>
            {/* Trend + totals */}
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Orders shipped / day</p>
              <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Last 14 days</p>
              {(!ph.trend || ph.trend.length === 0) ? (
                <p style={{ fontSize: 12, color: 'var(--sa-muted)' }}>No trend data yet.</p>
              ) : (() => {
                const tMax = Math.max(1, ...ph.trend.map((d: any) => d.value))
                return (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 70, marginBottom: 14 }}>
                    {ph.trend.map((d: any, i: number) => (
                      <div key={i} style={{ flex: 1, background: 'linear-gradient(to top,#10b981,#34d399)', borderRadius: '3px 3px 0 0', height: `${(d.value / tMax) * 60}px`, minHeight: d.value ? 2 : 0 }} title={`${d.label}: ${d.value}`} />
                    ))}
                  </div>
                )
              })()}
              {ph.totals && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { k: 'shipped', label: 'Shipped · 30d' },
                    { k: 'labels', label: 'Labels printed' },
                    { k: 'pageviews', label: 'Pageviews' },
                    { k: 'visitors', label: 'Visitors' },
                  ].map(m => (
                    <div key={m.k} style={{ padding: '8px 10px', borderRadius: 10, border: '1px solid var(--sa-border)' }}>
                      <p style={{ fontSize: 10.5, color: 'var(--sa-muted)', margin: '0 0 2px' }}>{m.label}</p>
                      <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--sa-text)', margin: 0 }}>{Number(ph.totals[m.k] || 0).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Platform · Feature Flags — the REAL per-business switches: every
// company_entitlements override (features forced on/off, custom limits, and
// operational features switched off). Read-only here; each business is edited
// in its drawer (Companies → business → Entitlements), which is audited.
function FeatureFlagsPage() {
  const [d, setD] = useState<any>(null)
  const [q, setQ] = useState('')
  useEffect(() => { (async () => { const r = await paJson('/api/platform-admin/entitlements'); setD(r.ok ? r.data : { error: r.data.error || 'Could not load overrides', missing: !!r.data.missing, rows: [] }) })() }, [])
  const rows: any[] = Array.isArray(d?.rows) ? d.rows : []
  const label = (k: string) => OVERRIDABLE_FEATURES.find(f => f.key === k)?.label || OPERATIONAL_FLAGS.find(f => f.key === k)?.label || k
  const limitLabel = (k: string) => OVERRIDABLE_LIMITS.find(l => l.key === k)?.label || k
  const isOperational = (k: string) => OPERATIONAL_FLAGS.some(f => f.key === k)
  const list = rows.filter(r => !q.trim() || `${r.company?.name || ''} ${r.company?.slug || ''} ${r.reason || ''}`.toLowerCase().includes(q.trim().toLowerCase()))
  const opOff = OPERATIONAL_FLAGS.map(f => ({ ...f, n: rows.filter(r => r.features?.[f.key] === false).length }))
  return (
    <div>
      <SectionHeader title="Feature Flags" sub="Per-business feature and limit overrides on top of each plan — edit a business in Companies → Entitlements" />
      {d?.missing ? <Notice>Run <b>COLVY_V222_COMPANY_ENTITLEMENTS.sql</b> to store per-business overrides.</Notice> : d?.error ? <Notice tone="error">{d.error}</Notice> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12, marginBottom: 18 }}>
        <StatTile label="Businesses with overrides" value={rows.length} color="#6366f1" loading={d === null} />
        {opOff.map(f => <StatTile key={f.key} label={`${f.label} · switched off`} value={f.n} color={f.n ? '#f59e0b' : 'var(--sa-text)'} loading={d === null} />)}
      </div>
      <div style={{ marginBottom: 12 }}><SearchBar placeholder="Search business or reason…" value={q} onChange={setQ} /></div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--sa-border)' }}>{['Business', 'Plan', 'Overrides', 'Reason', 'Updated'].map(h => <th key={h} style={paTh}>{h}</th>)}</tr></thead>
          <tbody>
            {d === null ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading…</td></tr>
            : list.length === 0 ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--sa-muted)' }}>{rows.length === 0 ? 'No overrides — every business is on its plan defaults.' : 'No businesses match.'}</td></tr>
            : list.map((r, i) => {
              const feats = Object.entries(r.features || {}).filter(([k]) => k !== 'brandingAddon')
              const lims = Object.entries(r.limits || {})
              return (
                <tr key={r.company_id} style={{ borderBottom: i < list.length - 1 ? '1px solid var(--sa-border)' : 'none', verticalAlign: 'top' }}>
                  <td style={{ ...paTd, fontWeight: 600 }}>{r.company?.name || 'Deleted business'}<div style={{ fontSize: 11, color: 'var(--sa-muted)', fontWeight: 400 }}>{r.company?.slug || ''}</div></td>
                  <td style={paTd}><Badge status={r.company?.plan || 'free'} /></td>
                  <td style={paTd}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {r.features?.brandingAddon && <Pill text="Branding add-on (paid)" color="#8b5cf6" />}
                      {feats.map(([k, v]) => <Pill key={k} text={`${label(k)}: ${v ? 'on' : 'off'}`} color={v ? '#10b981' : isOperational(k) ? '#f59e0b' : '#ef4444'} />)}
                      {lims.map(([k, v]) => <Pill key={k} text={`${limitLabel(k)}: ${v}`} color="#0891b2" />)}
                      {!feats.length && !lims.length && !r.features?.brandingAddon && <span style={{ color: 'var(--sa-muted)' }}>None (plan defaults)</span>}
                    </div>
                  </td>
                  <td style={{ ...paTd, color: 'var(--sa-muted)', maxWidth: 260 }}>{r.reason || '—'}</td>
                  <td style={{ ...paTd, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }} title={r.updated_by || ''}>{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SystemPage({ onGo }: { onGo?: (p: any) => void }) {
  const [checks, setChecks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pulse, setPulse] = useState<any>(null)
  useEffect(() => { (async () => { const r = await paJson('/api/platform-admin/pulse'); setPulse(r.ok ? r.data : { error: r.data.error || 'Could not load' }) })() }, [])

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

      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', margin: '4px 0 10px' }}>Failures · last 24 hours</p>
      {pulse === null ? <p style={{ color: 'var(--sa-muted)', marginBottom: 26 }}>Loading…</p> : pulse.error ? <Notice tone="error">{pulse.error}</Notice> : (
        <>
          {(pulse.issues || []).length > 0 && <Notice>{pulse.issues.join(' · ')}</Notice>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
            {[
              { label: 'Background jobs', value: `${pulse.jobs?.errors || 0} failed`, note: `${pulse.jobs?.runs || 0} runs logged`, bad: (pulse.jobs?.errors || 0) > 0, go: 'jobs' },
              { label: 'API errors', value: String(pulse.api?.errors || 0), note: `${pulse.api?.warnings || 0} warnings`, bad: (pulse.api?.errors || 0) > 0, go: 'apilogs' },
              { label: 'Webhook errors', value: String(pulse.webhooks?.errors || 0), note: `${pulse.webhooks?.total || 0} received`, bad: (pulse.webhooks?.errors || 0) > 0, go: 'webhooks' },
              { label: 'AI agent runs', value: `${pulse.agents?.failed || 0} failed`, note: `${pulse.agents?.stuck || 0} stuck · ${pulse.agents?.runs || 0} runs${pulse.agents?.platformPaused ? ' · PAUSED platform-wide' : ''}`, bad: (pulse.agents?.failed || 0) + (pulse.agents?.stuck || 0) > 0 || !!pulse.agents?.platformPaused, go: 'agents' },
              { label: 'Connections', value: `${pulse.connections?.broken || 0} need attention`, note: `${pulse.connections?.total || 0} active connections`, bad: (pulse.connections?.broken || 0) > 0, go: 'integrations' },
              { label: 'Stripe events', value: String(pulse.stripe?.events || 0), note: 'Webhook deliveries received (server count)', bad: false, go: '' },
              ...(pulse.emailReceiving ? [{
                label: 'Reading received email',
                value: pulse.emailReceiving.status === 'working' ? 'Working' : pulse.emailReceiving.status === 'blocked' ? 'Blocked' : pulse.emailReceiving.status === 'no-key' ? 'Not set up' : 'Unknown',
                note: pulse.emailReceiving.status === 'working' ? `Customer replies are fetched from Resend (${pulse.emailReceiving.keyName})`
                  : pulse.emailReceiving.status === 'blocked' ? `The key can only send. ${pulse.emailReceiving.help || ''}`
                  : pulse.emailReceiving.help || pulse.emailReceiving.label,
                bad: pulse.emailReceiving.status !== 'working', go: '',
              }] : []),
            ].map(m => (
              <div key={m.label} onClick={m.go && onGo ? () => onGo(m.go) : undefined} title={m.go ? 'Open the full log' : undefined}
                style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18, cursor: m.go && onGo ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{m.label}</span>
                  <Badge status={m.bad ? 'degraded' : 'healthy'} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', marginBottom: 4 }}>{m.value}</div>
                <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{m.note}</span>
              </div>
            ))}
          </div>
          {/* What actually failed — the latest few of each kind. */}
          {(() => {
            const re = pulse.recentErrors || {}
            const rows: { kind: string; go: string; at: string; title: string; detail: string }[] = [
              ...(re.api || []).map((r: any) => ({ kind: 'API', go: 'apilogs', at: r.at, title: [r.source, r.route].filter(Boolean).join(' · ') || 'API', detail: [r.message, r.company].filter(Boolean).join(' — ') })),
              ...(re.webhooks || []).map((r: any) => ({ kind: r.status === 'rejected' ? 'Webhook rejected' : 'Webhook', go: 'webhooks', at: r.at, title: [r.source, r.event].filter(Boolean).join(' · '), detail: [r.error || 'No error message recorded', r.company].filter(Boolean).join(' — ') })),
              ...(re.jobs || []).map((r: any) => ({ kind: 'Job', go: 'jobs', at: r.at, title: r.job || 'Background job', detail: r.error || 'No error message recorded' })),
            ].sort((a, b) => String(b.at).localeCompare(String(a.at)))
            if (!rows.length) return null
            return (
              <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: '6px 16px', marginBottom: 14 }}>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '10px 0 4px' }}>Latest errors</p>
                {rows.map((r, i) => (
                  <div key={i} onClick={onGo ? () => onGo(r.go) : undefined}
                    style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '9px 0', borderTop: i ? '1px solid var(--sa-border)' : 'none', cursor: onGo ? 'pointer' : 'default' }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#b45309', background: 'rgba(245,158,11,0.12)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>{r.kind}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)' }}>{r.title}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--sa-muted)', wordBreak: 'break-word' }}>{r.detail}</p>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--sa-muted)', whiteSpace: 'nowrap' }}>{r.at ? new Date(r.at).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : ''}</span>
                  </div>
                ))}
              </div>
            )
          })()}
          {(pulse.connections?.sample || []).length > 0 && (
            <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 16, marginBottom: 26 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sa-text)', margin: '0 0 8px' }}>Connections needing attention</p>
              {pulse.connections.sample.map((c: any, i: number) => <p key={i} style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '0 0 4px' }}><b style={{ color: '#f59e0b' }}>{c.note}</b> · {c.type} · {c.company || '—'} · {c.detail}</p>)}
            </div>
          )}
        </>
      )}

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
  const [config, setConfig] = useState<any>(null)
  const [lastAlert, setLastAlert] = useState<any>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/platform-admin/ops?view=billing', { headers: { 'Authorization': `Bearer ${session?.access_token}` } })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load')
        setPays(data.payments || []); setPaid(data.paid || 0); setPending(data.pending || 0)
        setConfig(data.config || null); setLastAlert(data.lastAlert || null)
      } catch (e: any) { setErr(e.message) } finally { setLoading(false) }
    })()
  }, [])

  const STATUS_COLOR: Record<string, string> = { paid: '#10b981', pending: '#f59e0b', failed: '#ef4444', cancelled: '#9ca3af' }
  return (
    <div>
      <SectionHeader title="Billing" sub="Colvy’s own billing setup, and in-chat payments collected across all companies" />
      {err && <div style={{ padding: '10px 14px', borderRadius: 9, background: '#fee2e2', color: '#dc2626', fontSize: 13, marginBottom: 14 }}>{err}</div>}
      <BillingConfigCard status={config} lastAlert={lastAlert} />
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
  const [saveErr, setSaveErr] = useState('')
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
    setSaving(true); setSaveErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await (supabase as any).from('platform_settings').upsert({
        key: 'sms_pricing', value: p, updated_by: session?.user?.email || null, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      if (error) { if (/does not exist|schema cache/i.test(error.message)) { setMissing(true); return } throw error }
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e: any) { setSaveErr('Could not save: ' + (e?.message || 'error')) } finally { setSaving(false) }
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
        action={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{saveErr ? <span style={{ fontSize: 12, color: '#ef4444' }}>{saveErr}</span> : savedAt && <span style={{ fontSize: 12, color: '#10b981' }}>Saved {savedAt}</span>}<button onClick={save} disabled={saving} style={paBtn('#ff7a6b', true)}>{saving ? 'Saving…' : 'Save pricing'}</button></div>} />
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

// ── AI models & usage (lib/ai-models.ts) ─────────────────────────────────
// Which model does each AI job, and what the AI costs per business and job.
function AiModelsPage() {
  const [days, setDays] = useState(30)
  const [d, setD] = useState<any>(null)
  const [picks, setPicks] = useState<Record<string, string>>({})
  const [prices, setPrices] = useState<Record<string, { in: string; out: string }>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const load = async () => {
    try {
      const r = await authFetch(`/api/platform-admin/ai?days=${days}`)
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || 'Could not load'); return }
      j.jobs = Array.isArray(j.jobs) ? j.jobs : []; j.models = Array.isArray(j.models) ? j.models : []; j.companies = Array.isArray(j.companies) ? j.companies : []
      j.total = j.total || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0, costKnown: true }
      setD(j)
      setPicks(Object.fromEntries(j.jobs.map((x: any) => [x.key, x.picked || x.default])))
      setPrices(Object.fromEntries(j.models.map((m: any) => [m.id, { in: m.price?.in != null ? String(m.price.in) : '', out: m.price?.out != null ? String(m.price.out) : '' }])))
    } catch { setMsg('Could not load') }
  }
  useEffect(() => { load() }, [days]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!d && (d.jobs.some((x: any) => (picks[x.key] || x.default) !== (x.picked || x.default)) || d.models.some((m: any) => {
    const p = prices[m.id] || { in: '', out: '' }
    return p.in !== (m.price?.in != null ? String(m.price.in) : '') || p.out !== (m.price?.out != null ? String(m.price.out) : '')
  }))
  const save = async () => {
    setSaving(true); setMsg('')
    try {
      const body = {
        models: Object.fromEntries(d.jobs.map((x: any) => [x.key, picks[x.key] === x.default ? null : picks[x.key]])),
        prices: Object.fromEntries(Object.entries(prices).map(([id, p]) => [id, p.in === '' || p.out === '' ? null : { in: Number(p.in), out: Number(p.out) }])),
      }
      const r = await authFetch('/api/platform-admin/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json()
      if (!r.ok) { setMsg(j.error || 'Could not save'); return }
      setMsg(`Saved ${new Date().toLocaleTimeString()} — new calls use it within a minute.`); await load()
    } catch { setMsg('Could not save') } finally { setSaving(false) }
  }
  const label = (id: string) => d?.models.find((m: any) => m.id === id)?.label || id
  const n = (v: number) => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v)
  const usd = (a: any) => a.calls === 0 ? '—' : a.costKnown ? `$${a.cost.toFixed(a.cost < 10 ? 2 : 0)}` : `${a.cost > 0 ? `$${a.cost.toFixed(2)}+` : '—'}`
  const card: React.CSSProperties = { background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, marginBottom: 14 }
  const th: React.CSSProperties = { textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '6px 10px', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { fontSize: 13, color: 'var(--sa-text)', padding: '9px 10px', borderTop: '1px solid var(--sa-border)', verticalAlign: 'top' }
  const input: React.CSSProperties = { padding: '7px 10px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-bg)', color: 'var(--sa-text)', fontSize: 13, boxSizing: 'border-box' }
  if (!d) return <div><SectionHeader title="AI Models & Usage" sub="Which model does each job, and what the AI costs" /><p style={{ color: 'var(--sa-muted)' }}>{msg || 'Loading…'}</p></div>
  const groups = Array.from(new Set(d.jobs.map((x: any) => x.group))) as string[]
  return (
    <div style={{ maxWidth: 1080 }}>
      <SectionHeader title="AI Models & Usage" sub="Pick the model for each AI job. Every AI call in Colvy goes through these choices."
        action={<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>{msg && <span style={{ fontSize: 12, color: /Saved/.test(msg) ? '#10b981' : '#ef4444' }}>{msg}</span>}<button onClick={save} disabled={saving || !dirty} style={paBtn('#ff7a6b', true)}>{saving ? 'Saving…' : 'Save changes'}</button></div>} />
      {d.missing && <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b55', fontSize: 13, color: 'var(--sa-text)', marginBottom: 14 }}>Run <b>COLVY_V358_AI_USAGE_LOG.sql</b> to start recording AI usage. Model choices work without it.</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[['AI calls', n(d.total.calls)], ['Tokens in', n(d.total.tokensIn)], ['Tokens out', n(d.total.tokensOut)], ['Estimated cost (USD)', usd(d.total)]].map(([k, v]) => (
          <div key={k} style={{ ...card, marginBottom: 0, padding: 16 }}><div style={{ fontSize: 11.5, color: 'var(--sa-muted)', fontWeight: 700 }}>{k}</div><div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', marginTop: 4 }}>{v}</div></div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[7, 30, 90].map(x => <button key={x} onClick={() => setDays(x)} style={{ ...paBtn(days === x ? '#ff7a6b' : 'var(--sa-muted)', days === x), padding: '6px 12px' }}>Last {x} days</button>)}
      </div>
      {!d.total.costKnown && d.total.calls > 0 && <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', margin: '-6px 0 14px' }}>Some models have no price yet, so costs marked “+” are a minimum. Add their prices below (from anthropic.com/pricing).</p>}

      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 15, color: 'var(--sa-text)' }}>Model for each job</p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--sa-muted)' }}>Defaults are what each feature used before. Jobs that use newer AI options only offer Claude 5-generation models. A cheaper model saves money but can make that feature less careful — change one at a time and keep an eye on it.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead><tr><th style={th}>Job</th><th style={th}>Model</th><th style={th}>Calls</th><th style={th}>Tokens</th><th style={th}>Est. cost</th></tr></thead>
            <tbody>
              {groups.map(g => (
                <Fragment key={g}>
                  <tr><td colSpan={5} style={{ ...td, fontSize: 11, fontWeight: 800, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', paddingTop: 14 }}>{g}</td></tr>
                  {d.jobs.filter((x: any) => x.group === g).map((x: any) => (
                    <tr key={x.key}>
                      <td style={td}><div style={{ fontWeight: 700 }}>{x.label}</div><div style={{ fontSize: 12, color: 'var(--sa-muted)', marginTop: 2 }}>{x.about}</div></td>
                      <td style={td}>
                        <select value={picks[x.key] || x.default} onChange={e => setPicks(p => ({ ...p, [x.key]: e.target.value }))} style={{ ...input, minWidth: 190 }} aria-label={`Model for ${x.label}`}>
                          {Array.from(new Set([x.default, ...x.options])).map((id: string) => <option key={id} value={id}>{label(id)}{id === x.default ? ' (default)' : ''}</option>)}
                        </select>
                      </td>
                      <td style={td}>{n(x.usage.calls)}</td>
                      <td style={td}>{n(x.usage.tokensIn + x.usage.tokensOut)}</td>
                      <td style={td}>{usd(x.usage)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 12px', fontWeight: 800, fontSize: 15, color: 'var(--sa-text)' }}>By business</p>
        {!d.companies.length ? <p style={{ fontSize: 13, color: 'var(--sa-muted)', margin: 0 }}>No AI usage recorded in this period.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead><tr><th style={th}>Business</th><th style={th}>Calls</th><th style={th}>Tokens in</th><th style={th}>Tokens out</th><th style={th}>Est. cost</th></tr></thead>
              <tbody>{d.companies.map((c: any) => (
                <tr key={c.id || 'none'}><td style={{ ...td, fontWeight: 700, color: c.id ? 'var(--sa-text)' : 'var(--sa-muted)' }}>{c.name}</td><td style={td}>{n(c.calls)}</td><td style={td}>{n(c.tokensIn)}</td><td style={td}>{n(c.tokensOut)}</td><td style={td}>{usd(c)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {Array.isArray(d.otherModels) && d.otherModels.length > 0 && (
        <div style={card}>
          <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 15, color: 'var(--sa-text)' }}>Other models seen</p>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--sa-muted)' }}>Calls recorded on models that aren’t in the switchboard list (older code paths or env overrides). Their cost isn’t estimated.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead><tr><th style={th}>Model</th><th style={th}>Calls</th><th style={th}>Tokens in</th><th style={th}>Tokens out</th></tr></thead>
              <tbody>{d.otherModels.map((m: any) => (
                <tr key={m.id}><td style={{ ...td, fontWeight: 700 }}>{m.id}</td><td style={td}>{n(m.usage?.calls || 0)}</td><td style={td}>{n(m.usage?.tokensIn || 0)}</td><td style={td}>{n(m.usage?.tokensOut || 0)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      <div style={card}>
        <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 15, color: 'var(--sa-text)' }}>Prices (USD per million tokens)</p>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--sa-muted)' }}>Used only for the cost estimates. Leave blank if you don’t know a price.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
            <thead><tr><th style={th}>Model</th><th style={th}>Input</th><th style={th}>Output</th><th style={th}>Calls</th></tr></thead>
            <tbody>{d.models.map((m: any) => (
              <tr key={m.id}>
                <td style={{ ...td, fontWeight: 700 }}>{m.label}<div style={{ fontSize: 11.5, color: 'var(--sa-muted)', fontWeight: 500 }}>{m.id}</div></td>
                {(['in', 'out'] as const).map(k => (
                  <td key={k} style={td}><input type="number" min={0} step="0.01" value={prices[m.id]?.[k] ?? ''} onChange={e => setPrices(p => ({ ...p, [m.id]: { ...(p[m.id] || { in: '', out: '' }), [k]: e.target.value } }))} style={{ ...input, width: 100 }} aria-label={`${m.label} ${k === 'in' ? 'input' : 'output'} price`} /></td>
                ))}
                <td style={td}>{n(m.usage.calls)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
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
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>Plan list prices (per month)</p>
          {(['feedback', 'omnichannel', 'everything', 'enterprise'] as Plan[]).map(k => (
            <Row key={k} label={PLAN_NAMES[k]} value={PLAN_PRICES[k] == null ? 'Custom' : `$${PLAN_PRICES[k]}`} />
          ))}
          <p style={{ fontSize: 11.5, color: 'var(--sa-muted)', marginTop: 10 }}>From <code>lib/plan.ts</code>. The overview MRR uses live Stripe subscription amounts when there are any, and these list prices only as an estimate otherwise.</p>
        </div>
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 22 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 6 }}>Integrations status</p>
          <p style={{ fontSize: 12.5, color: 'var(--sa-muted)', lineHeight: 1.6 }}>Platform keys (Stripe, Telnyx, Resend and the Colvy Shopify app's SHOPIFY_API_KEY / SHOPIFY_API_SECRET) are configured via Vercel environment variables; each workspace's own store connections live with that workspace. This panel doesn't expose secrets. Use the Subscriptions page's "Sync from Stripe" to verify Stripe connectivity.</p>
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchIdx, setSearchIdx] = useState(0)
  const [pulse, setPulse] = useState<any>(null)

  // Overview numbers + live health signals (both service-role server routes).
  const loadDashboard = async () => {
    const [a, p] = await Promise.all([paJson('/api/platform-admin/analytics'), paJson('/api/platform-admin/pulse')])
    if (a.ok) setData(a.data)
    setPulse(p.ok ? p.data : { error: p.data.error || 'Could not load health', issues: [] })
  }

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
    // Phones: start with the narrow icon sidebar so pages get the width.
    try { if (window.innerWidth < 768) setCollapsed(true) } catch {}
    try {
      // Hash may carry a sub-target (e.g. "companies/<id>" deep-links straight to
      // a company's detail) — the page key is just the first segment.
      const h = window.location.hash.replace(/^#/, '')
      if (h) setPageState(h.split('/')[0])
    } catch {}
  }, [])

  // Global ⌘K / Ctrl+K opens the nav search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (searchOpen) { setSearchQ(''); setSearchIdx(0) } }, [searchOpen])

  // Flat list of navigable destinations (skip section headers).
  const searchItems = NAV.filter((n: any) => !n.section) as { key: string; label: string; icon: string }[]
  const searchResults = (() => {
    const s = searchQ.trim().toLowerCase()
    if (!s) return searchItems
    return searchItems.filter(it => it.label.toLowerCase().includes(s) || it.key.toLowerCase().includes(s))
  })()
  const goSearch = (key: string) => { setSearchOpen(false); setPage(key) }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }: any) => {
      const u = s?.session?.user
      if (!u || u.email !== SUPER_ADMIN) {
        // Redirect to main signin (admin.colvy.com/signin would 404). to=console
        // brings the super admin back here afterwards instead of to a workspace.
        window.location.href = 'https://colvy.com/signin?to=console'
        return
      }
      setAuthed(true)
      // Real, computed stats (analytics: companies, subscriptions, MRR…) and
      // health signals (pulse: failures across jobs, logs, webhooks, agents).
      loadDashboard()
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
      <a href="https://colvy.com/signin?to=console" style={{ color: '#ff7a6b', fontSize: 13, textDecoration: 'underline' }}>Sign in at colvy.com →</a>
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
        @media (max-width: 640px) {
          .pa-content { padding: 16px 12px !important; }
          .pa-topbar { padding: 0 12px !important; }
          .pa-topsearch { display: none; }
        }
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
          {/* Search / command palette — jumps to any section. */}
          <button onClick={() => setSearchOpen(true)} title="Search (⌘K)"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 9,
              padding: collapsed ? '9px' : '8px 10px', justifyContent: collapsed ? 'center' : 'flex-start',
              borderRadius: 9, border: '1px solid var(--sa-border)', cursor: 'pointer', marginBottom: 8,
              background: 'var(--sa-hover)', color: 'var(--sa-muted)', fontSize: 13,
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            {!collapsed && <>
              <span style={{ flex: 1, textAlign: 'left' }}>Search…</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, border: '1px solid var(--sa-border)', borderRadius: 5, padding: '1px 5px' }}>⌘K</span>
            </>}
          </button>
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

      {/* ── SEARCH PALETTE ──────────────────────────────────────────────────── */}
      {searchOpen && (
        <div onClick={() => setSearchOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 520, margin: '0 16px', background: 'var(--sa-bg)', border: '1px solid var(--sa-border)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '68vh' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--sa-border)' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--sa-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input autoFocus value={searchQ}
                onChange={e => { setSearchQ(e.target.value); setSearchIdx(0) }}
                onKeyDown={e => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setSearchIdx(i => Math.min(i + 1, searchResults.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchIdx(i => Math.max(i - 1, 0)) }
                  else if (e.key === 'Enter') { e.preventDefault(); const r = searchResults[searchIdx]; if (r) goSearch(r.key) }
                  else if (e.key === 'Escape') { setSearchOpen(false) }
                }}
                placeholder="Search sections…"
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent', color: 'var(--sa-text)' }} />
              <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>Esc</span>
            </div>
            <div style={{ overflowY: 'auto', padding: 6 }}>
              {searchResults.length === 0 ? (
                <p style={{ padding: 22, textAlign: 'center', color: 'var(--sa-muted)', fontSize: 14 }}>No matches for “{searchQ}”.</p>
              ) : searchResults.map((r, i) => (
                <button key={r.key} onMouseEnter={() => setSearchIdx(i)} onClick={() => goSearch(r.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', background: i === searchIdx ? '#ff7a6b18' : 'transparent', color: i === searchIdx ? '#ff7a6b' : 'var(--sa-text)' }}>
                  <span style={{ flexShrink: 0, opacity: 0.8 }}>{(I as any)[r.icon]}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <main style={{ marginLeft: SIDEBAR_W, flex: 1, minWidth: 0, background: 'var(--sa-bg)', minHeight: '100vh', transition: 'margin-left 0.2s ease' }}>
        {/* Topbar */}
        <div className="pa-topbar" style={{ height: 54, borderBottom: '1px solid var(--sa-border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 12, background: 'var(--sa-sidebar)', position: 'sticky', top: 0, zIndex: 30 }}>
          <div className="pa-topsearch" style={{ flex: 1, position: 'relative', maxWidth: 400 }}>
            <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--sa-muted)' }}>{I.search}</div>
            <input readOnly onFocus={e => { e.currentTarget.blur(); setSearchOpen(true) }} onClick={() => setSearchOpen(true)} placeholder="Jump to a section… (⌘K)" style={{ cursor: 'pointer', width: '100%', padding: '7px 12px 7px 34px', borderRadius: 9, border: '1px solid var(--sa-border)', background: 'var(--sa-hover)', color: 'var(--sa-text)', fontSize: 13, outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', minWidth: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(() => {
              const issues: string[] = Array.isArray(pulse?.issues) ? pulse.issues : []
              const [txt, c] = pulse === null ? ['● Checking…', '#6b7280'] : pulse.error ? ['● Health unavailable', '#6b7280'] : issues.length ? [`● ${issues.length} issue${issues.length === 1 ? '' : 's'} · 24h`, '#f59e0b'] : ['● All systems operational', '#10b981']
              return <button onClick={() => setPage(issues.length ? 'system' : 'overview')} title={issues.join('\n') || 'No failures in the last 24 hours'} style={{ padding: '4px 10px', borderRadius: 999, background: c + '20', color: c, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer' }}>{txt}</button>
            })()}
          </div>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ff7a6b, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>B</div>
        </div>

        {/* Page content */}
        {/* Signups uses the full width (no side gap on wide screens). */}
        <div className="pa-content" style={{ padding: '28px 28px', maxWidth: page === 'signups' || page === 'webforms' || page === 'smscredits' ? 'none' : 1400 }}>
          {page === 'overview'   && <OverviewPage data={data} pulse={pulse} onRefresh={() => { setPulse(null); loadDashboard() }} onGo={setPage} />}
          {page === 'companies'  && <CompaniesPage />}
          {page === 'users'      && <UsersPage />}
          {page === 'signups'    && <SignupsPage />}
          {page === 'analytics'  && <AnalyticsPage />}
          {page === 'flags'      && <FeatureFlagsPage />}
          {page === 'system'     && <SystemPage onGo={setPage} />}
          {page === 'audit'      && <AuditPage />}
          {page === 'subs'       && <SubscriptionsPage />}
          {page === 'ideas'      && <CrossCompanyContent title="Ideas" sub="All ideas across every company board" table="ideas" extraCol={{ header: 'Votes', render: (r) => <span>{r.votes ?? 0}</span> }} />}
          {page === 'roadmap'    && <CrossCompanyContent title="Roadmaps" sub="All roadmap items across all companies" table="ideas" statusFilter={['planned', 'in_progress', 'shipped']} extraCol={{ header: 'Votes', render: (r) => <span>{r.votes ?? 0}</span> }} />}
          {page === 'announce'   && <CrossCompanyContent title="Announcements" sub="All announcements and changelog posts" table="announcements" />}
          {page === 'help'       && <CrossCompanyContent title="Help Center" sub="Help articles across all companies" table="help_articles" extraCol={{ header: 'Views', render: (r) => <span>{r.views ?? 0}</span> }} />}
          {page === 'blog'       && <BlogAdminPage />}
          {page === 'chat'       && <LiveChatPage />}
          {page === 'tickets'    && <TicketsPage />}
          {page === 'moderation' && <ModerationPage />}
          {page === 'imp'          && <ImpersonationSessionsPage />}
          {page === 'webforms'     && <WebFormsPage />}
          {page === 'demos'        && <DemoWorkspacesPage />}
          {page === 'calls'        && <CallDiagnosticsPage />}
          {page === 'porting'      && <PortingQueuePage />}
          {page === 'webhooks'     && <WebhookExplorerPage />}
          {page === 'jobs'         && <BackgroundJobsPage />}
          {page === 'apilogs'      && <ApiLogsPage />}
          {page === 'devices'      && <MobileDevicesPage />}
          {page === 'integrations' && <IntegrationsPage />}
          {page === 'agents'       && <AgentsPage />}
          {page === 'billing'    && <BillingPage />}
          {page === 'legal'      && <LegalAdminPage />}
          {page === 'banner'     && <PlatformBannerAdmin />}
          {page === 'ai'         && <AiModelsPage />}
          {page === 'sms'        && <SmsPricingPage />}
          {page === 'smscredits' && <SmsCreditsPage />}
          {page === 'whatsapp'   && <WhatsAppPage />}
          {page === 'settings'   && <SettingsPage />}
        </div>
      </main>
    </div>
  )
}
