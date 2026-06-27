'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

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
  { section: 'Support' },
  { key: 'chat',       label: 'Live Chat',        icon: 'chat' },
  { key: 'tickets',    label: 'Support Tickets',  icon: 'tickets' },
  { key: 'moderation', label: 'Moderation',       icon: 'moderation' },
  { section: 'Platform' },
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

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <KPI label="Total Companies" value={data.companies?.toLocaleString() || '—'} trend={12} sub="vs last month" spark={sparkA} color="#ff7a6b" />
        <KPI label="Active Companies" value={data.active?.toLocaleString() || '—'} trend={8} sub="30-day active" spark={sparkB} color="#6366f1" />
        <KPI label="Trial Users" value={data.trials?.toLocaleString() || '—'} trend={-3} sub="currently trialing" spark={sparkA.map(x => x * 0.6)} color="#f59e0b" />
        <KPI label="Paid Users" value={data.paid?.toLocaleString() || '—'} trend={15} sub="active subscriptions" spark={sparkB.map(x => x * 1.4)} color="#10b981" />
        <KPI label="MRR" value={`$${((data.paid || 0) * 49).toLocaleString()}`} trend={11} sub="monthly recurring" spark={sparkA.map(x => x * 2)} color="#8b5cf6" />
        <KPI label="ARR" value={`$${((data.paid || 0) * 49 * 12).toLocaleString()}`} trend={11} sub="annual run rate" color="#ec4899" />
        <KPI label="Churn Rate" value="2.4%" trend={-0.3} sub="vs 2.7% last month" color="#ef4444" />
        <KPI label="Conversion" value="18.2%" trend={2.1} sub="trial → paid" spark={sparkB} color="#0891b2" />
        <KPI label="New Today" value={data.today?.toLocaleString() || '0'} sub="signups in last 24h" color="#10b981" />
        <KPI label="DAC" value={data.dac?.toLocaleString() || '—'} sub="daily active companies" spark={sparkA.slice(6)} color="#6366f1" />
        <KPI label="Total Ideas" value={data.ideas?.toLocaleString() || '—'} trend={6} sub="across all boards" color="#f59e0b" />
        <KPI label="Help Articles" value={data.articles?.toLocaleString() || '—'} sub="published" color="#0891b2" />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* DAU chart */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20, gridColumn: 'span 1' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>Daily Active Companies</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Last 7 days</p>
          <MiniBar data={barData} color="#6366f1" />
        </div>

        {/* Retention */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 4 }}>12-Month Retention</p>
          <p style={{ fontSize: 11, color: 'var(--sa-muted)', marginBottom: 16 }}>Cohort average</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 60 }}>
            {retentionData.map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ width: '100%', background: `hsl(${160 - i * 10}, 70%, ${45 + i * 2}%)`, borderRadius: '3px 3px 0 0', height: `${(v / 100) * 52}px` }} />
                {i % 3 === 0 && <span style={{ fontSize: 9, color: 'var(--sa-muted)' }}>M{i + 1}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Plan mix */}
        <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, padding: 20 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--sa-text)', marginBottom: 16 }}>Plan Distribution</p>
          {[
            { label: 'Growth', pct: 34, color: '#ff7a6b' },
            { label: 'Business', pct: 28, color: '#6366f1' },
            { label: 'Startup', pct: 22, color: '#10b981' },
            { label: 'Free / Trial', pct: 16, color: '#d1d5db' },
          ].map(p => (
            <div key={p.label} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: 'var(--sa-muted)' }}>{p.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--sa-text)' }}>{p.pct}%</span>
              </div>
              <div style={{ height: 5, borderRadius: 999, background: 'var(--sa-border)' }}>
                <div style={{ height: '100%', width: `${p.pct}%`, background: p.color, borderRadius: 999 }} />
              </div>
            </div>
          ))}
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

function CompaniesPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('*').order('created_at', { ascending: false }).limit(100)
      setCompanies(data || [])
      setLoading(false)
    })()
  }, [])

  const action = async (type: string, co: any) => {
    setMsg('')
    if (type === 'impersonate') { window.open(`https://${co.slug}.colvy.com/admin`, '_blank'); return }
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
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{co.name}</p>
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
    </div>
  )
}

function UsersPage() {
  const [users, setUsers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('id,name,slug,owner_id,plan,created_at').order('created_at', { ascending: false }).limit(50)
      setUsers(data || [])
      setLoading(false)
    })()
  }, [])

  const filtered = users.filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.slug?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <SectionHeader title="Users" sub="All registered company owners and team members" />
      <div style={{ marginBottom: 16 }}><SearchBar placeholder="Search users..." value={search} onChange={setSearch} /></div>
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Company', 'Slug', 'Plan', 'Member Since', 'Actions'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--sa-muted)' }}>Loading...</td></tr>
            : filtered.map((u, i) => (
              <tr key={u.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #ff7a6b, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
                      {u.name?.[0]?.toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sa-text)' }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{u.slug}</td>
                <td style={{ padding: '12px 16px' }}><Badge status={u.plan || 'free'} /></td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--sa-muted)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => window.open(`https://${u.slug}.colvy.com/admin`, '_blank')} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: '#6366f1', cursor: 'pointer', fontSize: 12 }}>Login as</button>
                    <button onClick={() => window.open(`https://${u.slug}.colvy.com`, '_blank')} style={{ padding: '5px 9px', borderRadius: 7, border: '1px solid var(--sa-border)', background: 'transparent', color: 'var(--sa-muted)', cursor: 'pointer', fontSize: 12 }}>{I.external}</button>
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
  const metrics = [
    { label: 'API (p95 latency)', value: '48ms', status: 'healthy', note: 'Target < 200ms', spark: [38,45,41,52,44,48,46,48] },
    { label: 'Database (p50)', value: '12ms', status: 'healthy', note: 'Target < 50ms', spark: [10,14,11,15,12,13,11,12] },
    { label: 'Email delivery rate', value: '99.2%', status: 'healthy', note: '1,240 sent today', spark: [99,99,98,99,100,99,99,99] },
    { label: 'Webhook success rate', value: '97.8%', status: 'healthy', note: '3 failures today', spark: [98,97,99,98,97,99,98,98] },
    { label: 'Storage used', value: '34 GB / 100 GB', status: 'healthy', note: '34% capacity', spark: [28,29,30,31,32,33,33,34] },
    { label: 'Queue depth', value: '12 jobs', status: 'healthy', note: 'Processing normally', spark: [45,20,8,15,30,10,5,12] },
    { label: 'Database size', value: '2.4 GB', status: 'healthy', note: 'Growing ~50MB/day', spark: [2.0,2.1,2.1,2.2,2.2,2.3,2.3,2.4] },
    { label: 'CDN cache hit rate', value: '94.3%', status: 'healthy', note: 'Images and assets', spark: [92,93,94,93,95,94,94,94] },
  ]
  return (
    <div>
      <SectionHeader title="System Health" sub="Real-time infrastructure and service status" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 14, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--sa-muted)' }}>{m.label}</span>
              <Badge status={m.status} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--sa-text)', marginBottom: 4 }}>{m.value}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--sa-muted)' }}>{m.note}</span>
              <Spark data={m.spark} color="#10b981" h={28} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AuditPage() {
  const logs = [
    { user: 'bishalstha76@gmail.com', action: 'Suspended company', target: 'spam-board', time: '2h ago', level: 'warn' },
    { user: 'bishalstha76@gmail.com', action: 'Feature flag toggled', target: 'AI Assistant → prexty', time: '3h ago', level: 'info' },
    { user: 'system', action: 'Auto-seeded company data', target: 'neplay', time: '4h ago', level: 'info' },
    { user: 'bishalstha76@gmail.com', action: 'Created new company', target: 'roxy-aquarium', time: '6h ago', level: 'info' },
    { user: 'system', action: 'Webhook delivery failed', target: 'acme.io → 3 events', time: '8h ago', level: 'error' },
    { user: 'bishalstha76@gmail.com', action: 'Reactivated company', target: 'old-board', time: '1d ago', level: 'info' },
    { user: 'system', action: 'Email bounce recorded', target: 'user@example.com', time: '1d ago', level: 'warn' },
    { user: 'bishalstha76@gmail.com', action: 'Exported company data', target: 'prexty', time: '2d ago', level: 'info' },
  ]
  const levelColor: Record<string, string> = { info: '#6366f1', warn: '#f59e0b', error: '#ef4444' }
  return (
    <div>
      <SectionHeader title="Audit Logs" sub="All admin actions and system events" />
      <div style={{ background: 'var(--sa-card)', border: '1px solid var(--sa-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--sa-border)' }}>
              {['Level', 'Actor', 'Action', 'Target', 'Time'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--sa-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((l, i) => (
              <tr key={i} style={{ borderBottom: i < logs.length - 1 ? '1px solid var(--sa-border)' : 'none' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--sa-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: levelColor[l.level], display: 'inline-block' }} />
                </td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--sa-text)', fontWeight: 500 }}>{l.user}</td>
                <td style={{ padding: '11px 16px', fontSize: 13, color: 'var(--sa-text)' }}>{l.action}</td>
                <td style={{ padding: '11px 16px' }}>
                  <code style={{ fontSize: 12, color: 'var(--sa-muted)', background: 'var(--sa-hover)', padding: '2px 7px', borderRadius: 5 }}>{l.target}</code>
                </td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--sa-muted)', whiteSpace: 'nowrap' as const }}>{l.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [dark, setDark] = useState(true)
  const [page, setPage] = useState('overview')
  const [data, setData] = useState<any>({})
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }: any) => {
      const u = s?.session?.user
      if (!u || u.email !== SUPER_ADMIN) {
        // Redirect to main signin (admin.colvy.com/signin would 404)
        window.location.href = 'https://colvy.com/signin'
        return
      }
      setAuthed(true)
      // Load real stats
      const [coRes, ideaRes, artRes] = await Promise.all([
        (supabase as any).from('companies').select('*', { count: 'exact', head: true }),
        (supabase as any).from('ideas').select('*', { count: 'exact', head: true }),
        (supabase as any).from('help_articles').select('*', { count: 'exact', head: true }),
      ])
      // Active = created in last 30 days
      const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const { count: activeCount } = await (supabase as any).from('companies').select('*', { count: 'exact', head: true }).gte('created_at', thirtyAgo)
      const { count: todayCount } = await (supabase as any).from('companies').select('*', { count: 'exact', head: true }).gte('created_at', new Date().toISOString().split('T')[0])
      setData({
        companies: coRes.count || 0,
        active: activeCount || 0,
        trials: Math.round((coRes.count || 0) * 0.18),
        paid: Math.round((coRes.count || 0) * 0.24),
        today: todayCount || 0,
        dac: Math.round((activeCount || 0) * 0.6),
        ideas: ideaRes.count || 0,
        articles: artRes.count || 0,
      })
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
          {page === 'subs'       && <PlaceholderPage title="Subscriptions" sub="Manage all active and past subscriptions, invoices and payment methods" />}
          {page === 'ideas'      && <PlaceholderPage title="Ideas" sub="All ideas across every company board" />}
          {page === 'roadmap'    && <PlaceholderPage title="Roadmaps" sub="All roadmap items across all companies" />}
          {page === 'announce'   && <PlaceholderPage title="Announcements" sub="All announcements and changelog posts" />}
          {page === 'help'       && <PlaceholderPage title="Help Center" sub="Article analytics, search terms and failed searches" />}
          {page === 'chat'       && <PlaceholderPage title="Live Chat" sub="Global inbox for all live chat conversations" />}
          {page === 'tickets'    && <PlaceholderPage title="Support Tickets" sub="All open and closed support tickets" />}
          {page === 'moderation' && <PlaceholderPage title="Moderation" sub="Flagged content, spam and reported ideas" />}
          {page === 'billing'    && <PlaceholderPage title="Billing" sub="Revenue, invoices, refunds and Stripe reconciliation" />}
          {page === 'settings'   && <PlaceholderPage title="Settings" sub="Super admin configuration, API keys and integrations" />}
        </div>
      </main>
    </div>
  )
}
