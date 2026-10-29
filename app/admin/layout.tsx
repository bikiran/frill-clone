'use client'

import { authFetch } from '@/lib/auth-fetch'
import React from 'react'
import UploadQueueIndicator from '@/components/UploadQueueIndicator'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { readLocal, writeLocal } from '@/lib/local-cache'
import SidebarSearch, { SearchItem } from '@/components/SidebarSearch'
import CallHandoff from '@/components/CallHandoff'
import GlobalDialer from '@/components/GlobalDialer'
import { setPhoneHost } from '@/lib/phone-host'
import { getActiveCall, subscribeActiveCall } from '@/lib/active-call'
import AdminBanner from '@/components/AdminBanner'
import TrialBanner from '@/components/TrialBanner'
import SetupReturnBar from '@/components/SetupReturnBar'
import OverlayWatch from '@/components/OverlayWatch'
import ImpersonationBanner from '@/components/ImpersonationBanner'
import BackendStatusBanner from '@/components/BackendStatusBanner'
import { isBackendDown } from '@/lib/net-timeout'
// Thrown instead of denying access when the database simply didn't answer: a
// returning admin keeps their remembered workspace (and sees the outage
// banner); a fresh open shows the "Try again" screen. Never signs anyone out.
const BACKEND_DOWN = 'backend unavailable'
import DemoBanner from '@/components/DemoBanner'
import DemoTour from '@/components/DemoTour'

// Pages locked inside a demo workspace (connect real accounts / billing /
// import-export). Sending is blocked server-side regardless; this hides the UI.
const DEMO_LOCKED_HREFS = ['/admin/integrations', '/admin/billing', '/admin/import']
const DEMO_LOCK_MESSAGE = 'This action is unavailable in the shared Colvy showcase. Start a free trial to connect your channels and use live messaging.'
import { getCompanyByOwner } from '@/lib/board'
import { readAdminGate, writeAdminGate, clearAdminGate, peekStoredUser, seedCompanyUser } from '@/lib/client-cache'
import { useRouter } from 'next/navigation'
import MobileNav from '@/components/MobileNav'
import FeedbackButton from '@/components/FeedbackButton'
import ColvyAssistant from '@/components/ColvyAssistant'
import SuperAdminBar from '@/components/SuperAdminBar'
import RouteScrollTop from '@/components/RouteScrollTop'
import SetupRing from '@/components/SetupRing'
import AdminRail, { RAIL_W, type RailSection } from '@/components/AdminRail'
import { SettingsAccess } from '@/components/settings/SettingsShell'
import { SETTINGS_NAV } from '@/components/settings/settings-nav'
import { canUseFeature, canAccessPath, featureForPath, hasFullAccess, type PermissionMap } from '@/lib/permissions'
import { reportFonts } from '@/lib/fonts'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

// SVG icon components
const icons: Record<string, React.JSX.Element> = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  ideas: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.76-1.58 5.16-3.9 6.37L15 17H9l-.1-1.63A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="17" x2="14.5" y2="17"/></svg>,
  roadmap: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  calendar: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  scheduled: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 15 15"/><path d="M9 1h6"/></svg>,
  waitlist: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  announcements: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>,
  polls: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  forms: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/></svg>,
  surveys: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  statuses: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  topics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  priorities: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  segments: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  gallery: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
  check: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  notes: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v5h5"/><path d="M18 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9l5 5v11a2 2 0 0 1-2 2z"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="14" y2="17"/></svg>,
  link: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  analytics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  // Brand marks — Reviews (Google "G") and Social Engagement (Meta), drawn as
  // outline icons in currentColor so they match the weight AND size of the
  // other (stroke-based) sidebar icons.
  google: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.9 12a8.9 8.9 0 1 1-2.7-6.4"/><path d="M21 12h-8"/></svg>,
  meta: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 10.174c1.766 -2.784 3.315 -4.174 4.648 -4.174c2 0 3.263 2.213 4 5.217c.704 2.869 .5 6.783 -2 6.783c-1.114 0 -2.648 -1.565 -4.148 -3.652a27.627 27.627 0 0 1 -2.5 -4.174z"/><path d="M12 10.174c-1.766 -2.784 -3.315 -4.174 -4.648 -4.174c-2 0 -3.263 2.213 -4 5.217c-.704 2.869 -.5 6.783 2 6.783c1.114 0 2.648 -1.565 4.148 -3.652a27.627 27.627 0 0 0 2.5 -4.174z"/></svg>,
  help: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  support: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  users: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  integrations: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  billing: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  company: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  agents: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>,
  memory: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M9 7h7M9 11h5"/></svg>,
  import_data: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  widget: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg>,
  upgrade: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/></svg>,
  command: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/></svg>,
  orders: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  shipping: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  payments: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>,
  needs: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="12" y1="16.5" x2="12.01" y2="16.5"/></svg>,
  results: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  knowledge: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>,
  sliders: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>,
}

// The admin's navigation, in sections. On wider screens each section is a
// tile in the rail (components/AdminRail) with a panel of its pages; on phones
// the sections are the groups of the menu sheet. The first page of a section
// is where its tile goes. `match` lists extra pages that should light up an
// item: pages that belong to it but live at a different address (e.g. a
// contact's profile → Contacts).
type NavItem = { label: string; href: string; icon: string; match?: string[] }
type NavSection = { key: string; label: string; glyph: string; groups: { label?: string; items: NavItem[] }[] }
const SECTIONS: NavSection[] = [
  { key: 'home', label: 'Home', glyph: 'home', groups: [{ items: [
    { label: 'Dashboard', href: '/admin', icon: 'dashboard' },
    { label: 'Command Centre', href: '/admin/command-centre', icon: 'command' },
  ] }] },
  { key: 'inbox', label: 'Inbox', glyph: 'inbox', groups: [{ items: [
    { label: 'Inbox', href: '/admin/inbox', icon: 'support' },
    { label: 'Call Logs', href: '/admin/calls', icon: 'support' },
    { label: 'Scheduled', href: '/admin/scheduled', icon: 'scheduled' },
  ] }] },
  { key: 'contacts', label: 'Contacts', glyph: 'contacts', groups: [{ items: [
    { label: 'Contacts', href: '/admin/contacts', icon: 'users', match: ['/admin/customers/profile'] },
    { label: 'Customer Segments', href: '/admin/customers/segments', icon: 'segments' },
  ] }] },
  { key: 'tasks', label: 'Tasks', glyph: 'tasks', groups: [{ items: [
    { label: 'Tasks', href: '/admin/tasks', icon: 'check' },
    { label: 'Notes', href: '/admin/notes', icon: 'notes' },
    { label: 'Calendar', href: '/admin/calendar', icon: 'calendar' },
    { label: 'Bookings', href: '/admin/bookings', icon: 'calendar' },
    { label: 'Gallery', href: '/admin/gallery', icon: 'gallery' },
  ] }] },
  // Everything the AI does and knows. AI Knowledge and AI Settings live inside
  // Business Settings (so its tabs show around them); they're listed here too.
  { key: 'ai', label: 'AI agent', glyph: 'ai', groups: [
    { items: [
      { label: 'AI Agents', href: '/admin/agents', icon: 'agents' },
      { label: 'Needs You', href: '/admin/agents/needs-you', icon: 'needs' },
      { label: 'Results & Goals', href: '/admin/agents/results', icon: 'results' },
      { label: 'Business Memory', href: '/admin/agents/memory', icon: 'memory' },
    ] },
    { label: 'Set up', items: [
      { label: 'AI Knowledge', href: '/admin/crm-settings/ai-knowledge', icon: 'knowledge' },
      { label: 'AI Settings', href: '/admin/crm-settings/ai', icon: 'sliders' },
    ] },
  ] },
  { key: 'orders', label: 'Orders', glyph: 'orders', groups: [{ items: [
    { label: 'Orders', href: '/admin/orders', icon: 'orders' },
    { label: 'Payments', href: '/admin/payments', icon: 'payments' },
    { label: 'Shipping', href: '/admin/orders/shipping', icon: 'shipping' },
    { label: 'Reports', href: '/admin/orders/reports', icon: 'analytics' },
  ] }] },
  { key: 'support', label: 'Support', glyph: 'ticket', groups: [
    { items: [{ label: 'Tickets', href: '/admin/tickets', icon: 'support' }] },
    { label: 'Help centre', items: [
      { label: 'Help Centre', href: '/admin/help', icon: 'help' },
      { label: 'Help Categories', href: '/admin/settings/help-categories', icon: 'topics' },
      { label: 'Help Reporting', href: '/admin/help/analytics', icon: 'analytics' },
      { label: 'Help Settings', href: '/admin/help/settings', icon: 'settings' },
    ] },
  ] },
  // Reaching customers and your public reputation.
  { key: 'marketing', label: 'Marketing', glyph: 'marketing', groups: [
    { items: [
      { label: 'Campaigns', href: '/admin/campaigns', icon: 'announcements' },
      { label: 'Waitlists', href: '/admin/waitlists', icon: 'waitlist' },
      { label: 'Reviews', href: '/admin/reviews', icon: 'google' },
      { label: 'Social Engagement', href: '/admin/social', icon: 'meta' },
    ] },
    { label: 'Links', items: [
      { label: 'Links Generator', href: '/admin/links', icon: 'link' },
      { label: 'Link Reports', href: '/admin/link-reports', icon: 'analytics' },
    ] },
  ] },
  { key: 'feedback', label: 'Feedback', glyph: 'feedback', groups: [
    { items: [
      // The ideas board and roadmap, shown inside the admin (the public
      // versions stay at /?view=ideas and /roadmap).
      { label: 'Ideas', href: '/admin/ideas', icon: 'ideas' },
      { label: 'Roadmap', href: '/admin/roadmap', icon: 'roadmap' },
      { label: 'Announcements', href: '/admin/announcements', icon: 'announcements' },
      { label: 'Polls', href: '/admin/polls', icon: 'polls' },
      { label: 'Forms', href: '/admin/forms', icon: 'forms' },
      { label: 'Surveys', href: '/admin/surveys', icon: 'surveys' },
    ] },
    // How the feedback board is organised.
    { label: 'Organise', items: [
      { label: 'Statuses', href: '/admin/statuses', icon: 'statuses' },
      { label: 'Topics', href: '/admin/topics', icon: 'topics' },
      { label: 'Priorities', href: '/admin/priorities', icon: 'priorities' },
      { label: 'Segments', href: '/admin/segments', icon: 'segments' },
    ] },
  ] },
  { key: 'insights', label: 'Insights', glyph: 'insights', groups: [{ items: [
    { label: 'Analytics', href: '/admin/analytics', icon: 'analytics' },
    { label: 'Customer Insights', href: '/admin/insights/customers', icon: 'users' },
    { label: 'Location Insights', href: '/admin/insights/location', icon: 'analytics' },
  ] }] },
]
// Settings sits at the foot of the rail, below Search, and opens the Settings
// area (components/settings/SettingsShell), which has its own menu of every
// setting. Every page of that area lights it up.
const SETTINGS_SECTION: NavSection = { key: 'settings', label: 'Settings', glyph: 'settings', groups: [{ items: [
  { label: 'Settings', href: '/admin/crm-settings/business', icon: 'settings', match: [
    '/admin/crm-settings', '/admin/settings', '/admin/team', '/admin/users', '/admin/locations',
    '/admin/billing', '/admin/referrals', '/admin/import', '/admin/integrations',
  ] },
] }] }
// The phone menu sheet: one group per section.
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [...SECTIONS, SETTINGS_SECTION]
  .map(s => ({ label: s.key === 'home' ? null : s.label, items: s.groups.flatMap(g => g.items) }))

// Every address that lights up a sidebar item, longest first. A page lights up
// the item whose address is the longest whole-segment match, so
// /admin/help/analytics → Help Reporting (not Help Centre) and
// /admin/crm-settings/ai → AI Settings (not Business Settings).
const NAV_MATCHES: { href: string; path: string }[] = NAV_GROUPS
  .flatMap(g => g.items.flatMap(i => [i.href, ...(i.match || [])].map(path => ({ href: i.href, path }))))
  .filter(m => m.path.startsWith('/admin/'))
  .sort((a, b) => b.path.length - a.path.length)

// Extra destinations for the sidebar search that aren't top-level nav items
// (deeper settings pages). Deduped against the nav items at render time, and
// filtered by the member's permissions just like the nav.
const SEARCH_EXTRAS: SearchItem[] = [
  { label: 'Your profile & notifications', href: '/admin/crm-settings/profile', section: 'Business Settings', keywords: 'my settings name signature avatar notifications' },
  { label: 'Business profile', href: '/admin/crm-settings/business', section: 'Business Settings', keywords: 'company details address hours abn website' },
  { label: 'Channels', href: '/admin/crm-settings/channels', section: 'Business Settings', keywords: 'whatsapp instagram facebook messenger sms email meta connect calls' },
  { label: 'Facebook & Instagram', href: '/admin/crm-settings/channels/meta', section: 'Business Settings', keywords: 'meta messenger instagram connect page' },
  { label: 'Email channel', href: '/admin/crm-settings/channels/email', section: 'Business Settings', keywords: 'gmail outlook inbox connect' },
  { label: 'Google Reviews channel', href: '/admin/crm-settings/channels/google-reviews', section: 'Business Settings', keywords: 'google business profile reviews connect' },
  { label: 'Chat widget', href: '/admin/crm-settings/chat-widget', section: 'Business Settings', keywords: 'live chat website widget' },
  { label: 'Contact form', href: '/admin/crm-settings/contact-form', section: 'Business Settings', keywords: 'website form embed enquiry' },
  { label: 'Automatic replies', href: '/admin/crm-settings/auto-replies', section: 'Business Settings', keywords: 'auto-replies automation canned away hours' },
  { label: 'Time savers', href: '/admin/crm-settings/power-ups', section: 'Business Settings', keywords: 'quick responses canned replies conversation categories' },
  { label: 'Conversation actions', href: '/admin/crm-settings/conversation-actions', section: 'Business Settings', keywords: 'buttons actions inbox' },
  { label: 'Custom fields', href: '/admin/crm-settings/custom-fields', section: 'Business Settings', keywords: 'contact fields properties' },
  { label: 'Archived & spam', href: '/admin/crm-settings/archived-spam', section: 'Business Settings', keywords: 'restore hidden enquiries junk' },
  { label: 'Payment settings', href: '/admin/crm-settings/payments', section: 'Business Settings', keywords: 'invoices transactions receipts' },
  { label: 'Order automation', href: '/admin/crm-settings/order-automation', section: 'Business Settings', keywords: 'woocommerce order status messages' },
  { label: 'SMS campaign settings', href: '/admin/crm-settings/campaigns', section: 'Business Settings', keywords: 'bulk sms sender' },
  { label: 'Policies', href: '/admin/crm-settings/policies', section: 'Business Settings', keywords: 'waivers consent agreements legal' },
  { label: 'Imports', href: '/admin/crm-settings/imports', section: 'Business Settings', keywords: 'import csv contacts conversations' },
  { label: 'CSV processor', href: '/admin/crm-settings/csv-processor', section: 'Business Settings', keywords: 'clean csv preview' },
  { label: 'AI settings', href: '/admin/crm-settings/ai', section: 'AI', keywords: 'assistant colvy ai reply auto reply' },
  { label: 'AI knowledge', href: '/admin/crm-settings/ai-knowledge', section: 'AI', keywords: 'colvy ai library facts files website train learn answers' },
  { label: 'Outside tools (MCP)', href: '/admin/integrations/mcp', section: 'AI', keywords: 'mcp claude chatgpt connect ai tools server' },
  { label: 'Calls & SMS', href: '/admin/crm-settings/channels/calls', section: 'Business Settings', keywords: 'phone number sms calling voicemail' },
  { label: 'Shopify', href: '/admin/integrations/shopify', section: 'Integrations', keywords: 'store ecommerce' },
  { label: 'WooCommerce', href: '/admin/integrations/woocommerce', section: 'Integrations', keywords: 'store ecommerce wordpress orders' },
  { label: 'Stripe', href: '/admin/integrations/stripe', section: 'Integrations', keywords: 'payments card' },
  { label: 'Prexty', href: '/admin/integrations/prexty', section: 'Integrations', keywords: 'store orders' },
  { label: 'Campaign templates', href: '/admin/campaigns/templates', section: 'Marketing', keywords: 'sms email template' },
  { label: 'Social categories', href: '/admin/social/categories', section: 'Marketing', keywords: 'comments tags' },
  { label: 'Import help articles', href: '/admin/help/import', section: 'Support', keywords: 'help centre import zendesk intercom' },
  { label: 'Terminology', href: '/admin/settings#terminology', section: 'Settings', keywords: 'wording labels rename words' },
  { label: 'Audit logs', href: '/admin/settings/audit-logs', section: 'Settings', keywords: 'security history' },
  { label: 'Create workspace', href: '/admin/new-workspace', section: 'Settings', keywords: 'new company workspace business' },
]

// A few seconds after the admin opens, fetch the Waitlists list in the
// background (database only, no store calls) and keep it on this device. Once
// per company per page load, and skipped when a copy under 10 minutes old is
// already here. Lives outside the component so a layout remount during start-up
// can't cancel it.
const warmed = new Set<string>()
function warmWaitlists(cid: string) {
  if (warmed.has(cid) || typeof window === 'undefined') return
  warmed.add(cid)
  setTimeout(async () => {
    try {
      if (window.location.pathname.startsWith('/admin/waitlists')) return
      const { data } = await supabase.auth.getSession()
      const s = data?.session
      if (!s) return
      if (readLocal('waitlists', s.user.id, 10 * 60_000)?.companyId === cid) return
      const r = await fetch(`/api/waitlist?companyId=${cid}&live=0`, { headers: { Authorization: `Bearer ${s.access_token}` } })
      if (!r.ok) return
      const d = await r.json()
      if (d.needsMigration || d.error) return
      writeLocal('waitlists', s.user.id, cid, { entries: d.entries || [], stock: d.stock || {}, settings: d.settings, businessName: d.businessName || '' })
    } catch {}
  }, 4000)
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  // A new page fades in instead of snapping over the old one. Opacity only:
  // moving the content would make it the containing block for the page's
  // fixed buttons and sheets for the length of the fade.
  const pageRef = useRef<HTMLDivElement>(null)
  const fadedPath = useRef(pathname)
  React.useLayoutEffect(() => {
    if (fadedPath.current === pathname) return
    fadedPath.current = pathname
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    pageRef.current?.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
  }, [pathname])
  const [authed, setAuthed] = useState<boolean | null>(null)
  // When auth resolution hangs or throws (a stuck/expired session token, a
  // backend blip), we must never leave the user on an endless spinner. This
  // flips to an error so a recoverable screen (Retry / Sign in) renders instead.
  const [authError, setAuthError] = useState(false)
  // Mirror of `authed` for the backstop timeout to read the latest value.
  const authedRef = useRef<boolean | null>(null)
  // Keep --admin-banners-h in step with the trial / setup banners above the
  // page (they come and go, and wrap on phones).
  // (A callback ref: the layout shows a loading screen before the banners exist.)
  const [bannersEl, setBannersEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = bannersEl
    if (!el || typeof ResizeObserver === 'undefined') return
    const root = document.documentElement
    // Plus the super admin bar at the foot while it's open (--sab-h, set by
    // components/SuperAdminBar), so full-height screens stop above it too.
    const set = () => root.style.setProperty('--admin-banners-h', `calc(${Math.round(el.getBoundingClientRect().height)}px + var(--sab-h, 0px))`)
    const ro = new ResizeObserver(set)
    ro.observe(el); set()
    return () => { ro.disconnect(); root.style.removeProperty('--admin-banners-h') }
  }, [bannersEl])
  useEffect(() => { authedRef.current = authed }, [authed])

  // Just installed Colvy in Shopify and signed in: take them to the Shopify
  // page to connect the store (once per tab — they can still go elsewhere).
  useEffect(() => {
    if (!authed || pathname === '/admin/integrations/shopify') return
    try {
      if (!document.cookie.includes('colvy_shopify_pending=') || sessionStorage.getItem('colvy_shopify_pending_seen')) return
      sessionStorage.setItem('colvy_shopify_pending_seen', '1')
      router.replace('/admin/integrations/shopify')
    } catch {}
  }, [authed, pathname, router])
  // Wider screens get the rail (components/AdminRail); phones get the menu
  // sheet. Decided once mounted, and again as the window changes.
  const [desktop, setDesktop] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 861px)')
    const apply = () => setDesktop(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const [company, setCompany] = useState<any>(null)
  // Tab favicon for this workspace. Prefer a dedicated square favicon (uploaded
  // in Settings → site_settings.faviconUrl) — it reads cleanly at 16px — and
  // fall back to the company logo only when none is set. AppChrome does the same
  // precedence, but it resolves the company by subdomain slug and can miss on
  // /admin (RLS/timing), so we set it reliably here where the company is known.
  useEffect(() => {
    if (typeof document === 'undefined' || !company?.id) return
    let cancelled = false
    ;(async () => {
      let favicon: string | null = null
      try {
        const { data } = await (supabase as any).from('site_settings')
          .select('value').eq('key', 'general').eq('company_id', company.id)
          .order('updated_at', { ascending: false }).limit(1)
        favicon = data?.[0]?.value?.faviconUrl || null
      } catch {}
      if (!favicon) favicon = company.logo_url || null
      if (cancelled || !favicon) return
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
      link.href = favicon
    })()
    return () => { cancelled = true }
  }, [company?.id, company?.logo_url])
  // The current member's role + feature permissions (see lib/permissions.ts).
  // Owner/super-admin => full access; a restricted editor/viewer only sees and
  // can open the features their permission map allows.
  const [myRole, setMyRole] = useState<string | null>(null)
  const [myPerms, setMyPerms] = useState<PermissionMap>(null)
  const [permsLoaded, setPermsLoaded] = useState(false)
  const [demoMsg, setDemoMsg] = useState('')
  useEffect(() => { if (!demoMsg) return; const t = setTimeout(() => setDemoMsg(''), 4000); return () => clearTimeout(t) }, [demoMsg])

  // Per-section collapse. Not everyone needs every group expanded, so each
  // titled nav group can be minimised. The choice is remembered for the tab
  // session (sessionStorage) — a fresh browser session starts fully expanded.
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(sessionStorage.getItem('colvy:nav-collapsed') || '{}') } catch { return {} }
  })
  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = { ...prev, [label]: !prev[label] }
      try { sessionStorage.setItem('colvy:nav-collapsed', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Agent presence ────────────────────────────────────────────────────────
  // Email sync, back-in-stock texts, ticket deadlines and booking reminders used
  // to be pinged from here while an admin had Colvy open; Vercel Cron runs them
  // now (vercel.json), behind CRON_SECRET.
  useEffect(() => {
    if (!company?.id) return
    // Agent presence heartbeat — records that this agent is online so an inbound
    // call can ring them. "Online" = seen in the last ~2 minutes.
    const beat = async () => {
      const onCall = !!getActiveCall()
      // Beat even when the tab is backgrounded. Inbound routing only rings agents
      // with a fresh heartbeat (last ~2 min), so skipping while hidden made a
      // web agent with the board tab in the background drop offline after 2
      // minutes — every call then went straight to voicemail, even though the
      // (backgrounded) tab can still ring. Browsers throttle background timers to
      // ~1/min, which stays within the 2-minute window. `available: !onCall`
      // still reports a busy agent as unavailable.
      try {
        const { data: { session } } = await supabase.auth.getSession()
        authFetch('/api/telnyx/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
          body: JSON.stringify({ companyId: company.id, available: !onCall }),
        }).catch(() => {})
      } catch {}
    }
    const t = setTimeout(beat, 4000)                        // shortly after load
    const hb = setInterval(beat, 45000)                     // presence every 45s
    // Flip availability the instant a call starts or ends, so the 45s cadence
    // doesn't leave a window where a busy agent still gets rung.
    const unsubCall = subscribeActiveCall(() => { beat() })
    const onVisible = () => { beat() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(t); clearInterval(hb)
      unsubCall()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [company?.id])
  const [inboxUnread, setInboxUnread] = useState(0)

  // Poll unread conversation count for the Inbox badge
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      try {
        const { count } = await (supabase as any)
          .from('conversations')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .eq('is_unread', true)
          // A closed/resolved conversation shouldn't drive the unread badge —
          // it's dealt with. Only open ones count as needing attention.
          .not('status', 'in', '("closed","resolved")')
        if (active) setInboxUnread(count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 15000)
    // Realtime: bump immediately on new/updated conversations
    const ch = (supabase as any)
      .channel(`inbox-badge-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations', filter: `company_id=eq.${company.id}` }, load)
      .subscribe()
    return () => { active = false; clearInterval(iv); try { (supabase as any).removeChannel(ch) } catch {} }
  }, [company?.id])

  // New, unviewed orders for the Orders nav badge. "Unviewed" = placed since the
  // last time this browser opened the Orders page (colvy-orders-seen-at). Only
  // actionable orders count: PAID (unpaid/pending aren't ready to ship) and not
  // already shipped/cancelled/refunded.
  const [ordersNew, setOrdersNew] = useState(0)
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      try {
        let s = ''
        try { s = localStorage.getItem('colvy-orders-seen-at') || '' } catch {}
        if (!s) {
          // First run on this browser — start the badge clean rather than
          // counting the entire back-catalogue as "new".
          s = new Date().toISOString()
          try { localStorage.setItem('colvy-orders-seen-at', s) } catch {}
        }
        const { count } = await (supabase as any)
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .gt('order_date', s)
          .not('payment_status', 'eq', 'pending')
          .not('status', 'in', '("shipped","cancelled","refunded")')
        if (active) setOrdersNew(count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 15000)
    // Coalesce bursts of order webhooks into one badge refetch — a busy store can
    // fire many order changes a second, and re-running the count query on each was
    // needless load.
    let debTimer: any = null
    const debouncedLoad = () => { clearTimeout(debTimer); debTimer = setTimeout(load, 1500) }
    const onSeen = () => { if (active) setOrdersNew(0); load() }
    window.addEventListener('orders-seen', onSeen)
    window.addEventListener('storage', onSeen)
    const ch = (supabase as any)
      .channel(`orders-badge-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${company.id}` }, debouncedLoad)
      .subscribe()
    return () => { active = false; clearInterval(iv); clearTimeout(debTimer); window.removeEventListener('orders-seen', onSeen); window.removeEventListener('storage', onSeen); try { (supabase as any).removeChannel(ch) } catch {} }
  }, [company?.id])

  // Tasks needing this person's attention: assigned to them, not finished, and
  // either due today or already overdue. Same idea as the inbox badge — a count
  // of things actually waiting on you, not a total.
  const [taskDue, setTaskDue] = useState(0)
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) { if (active) setTaskDue(0); return }
        // End of today, local time — a task due later today still counts.
        const end = new Date(); end.setHours(23, 59, 59, 999)
        const { data } = await (supabase as any)
          .from('conversation_tasks')
          .select('id, done, status, due_date, assigned_to_id, assignees, series_id')
          .eq('company_id', company.id)
          .lte('due_date', end.toISOString())
          .limit(500)
        const mine = (data || []).filter((t: any) => {
          const finished = t.done || t.status === 'done'
          if (finished || !t.due_date) return false
          if (t.assigned_to_id === uid) return true
          return Array.isArray(t.assignees) && t.assignees.some((a: any) => a?.id === uid)
        })
        // A repeating task counts once: missed copies fold into its latest
        // one on the Tasks page, so the badge matches what's listed there.
        const seriesSeen = new Set(mine.filter((t: any) => t.series_id).map((t: any) => t.series_id))
        const due = mine.filter((t: any) => !t.series_id).length + seriesSeen.size
        if (active) setTaskDue(due)
      } catch { if (active) setTaskDue(0) }
    }
    load()
    const iv = setInterval(load, 30000)
    const ch = (supabase as any)
      .channel(`tasks-badge-${company.id}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_tasks', filter: `company_id=eq.${company.id}` }, load)
      .subscribe()
    return () => { active = false; clearInterval(iv); try { (supabase as any).removeChannel(ch) } catch {} }
  }, [company?.id])

  // New, unviewed support tickets for the Tickets nav badge. "Unviewed" = raised
  // since the last time this browser opened the Tickets page (colvy-tickets-seen-at).
  // Only actionable ones count: open / in_progress (resolved & closed are dealt with).
  const [ticketsNew, setTicketsNew] = useState(0)
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      try {
        let s = ''
        try { s = localStorage.getItem('colvy-tickets-seen-at') || '' } catch {}
        if (!s) { s = new Date().toISOString(); try { localStorage.setItem('colvy-tickets-seen-at', s) } catch {} }
        const { count } = await (supabase as any)
          .from('support_tickets')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company.id)
          .gt('created_at', s)
          .in('status', ['open', 'in_progress'])
        if (active) setTicketsNew(count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 15000)
    const onSeen = () => { if (active) setTicketsNew(0); load() }
    window.addEventListener('tickets-seen', onSeen)
    window.addEventListener('storage', onSeen)
    const ch = (supabase as any)
      .channel(`tickets-badge-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `company_id=eq.${company.id}` }, load)
      .subscribe()
    return () => { active = false; clearInterval(iv); window.removeEventListener('tickets-seen', onSeen); window.removeEventListener('storage', onSeen); try { (supabase as any).removeChannel(ch) } catch {} }
  }, [company?.id])

  // New online bookings for the Bookings nav badge — confirmed since this
  // browser last opened Bookings (colvy-bookings-seen-at). Bookings are
  // server-only (RLS), so this polls a tiny count endpoint.
  const [bookingsNew, setBookingsNew] = useState(0)
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        let s = ''
        try { s = localStorage.getItem('colvy-bookings-seen-at') || '' } catch {}
        if (!s) { s = new Date().toISOString(); try { localStorage.setItem('colvy-bookings-seen-at', s) } catch {} }
        const { data } = await supabase.auth.getSession()
        const t = data?.session?.access_token
        const r = await fetch(`/api/bookings?companyId=${company.id}&op=newcount&since=${encodeURIComponent(s)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        const d = await r.json().catch(() => ({}))
        if (active && r.ok) setBookingsNew(d.count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 20000)
    const onSeen = () => { if (active) setBookingsNew(0) }
    const onStorage = (e: StorageEvent) => { if (e.key === 'colvy-bookings-seen-at') onSeen() }
    window.addEventListener('bookings-seen', onSeen)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', load)
    return () => { active = false; clearInterval(iv); window.removeEventListener('bookings-seen', onSeen); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', load) }
  }, [company?.id])

  // New back-in-stock sign-ups for the Waitlists badge — same pattern as Bookings.
  const [waitlistNew, setWaitlistNew] = useState(0)
  useEffect(() => {
    if (!company?.id) return
    let active = true
    const load = async () => {
      if (document.visibilityState !== 'visible') return
      try {
        let s = ''
        try { s = localStorage.getItem('colvy-waitlist-seen-at') || '' } catch {}
        if (!s) { s = new Date().toISOString(); try { localStorage.setItem('colvy-waitlist-seen-at', s) } catch {} }
        const { data } = await supabase.auth.getSession()
        const t = data?.session?.access_token
        const r = await fetch(`/api/waitlist?companyId=${company.id}&op=newcount&since=${encodeURIComponent(s)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
        const d = await r.json().catch(() => ({}))
        if (active && r.ok) setWaitlistNew(d.count || 0)
      } catch {}
    }
    load()
    const iv = setInterval(load, 30000)
    const onSeen = () => { if (active) setWaitlistNew(0) }
    const onStorage = (e: StorageEvent) => { if (e.key === 'colvy-waitlist-seen-at') onSeen() }
    window.addEventListener('waitlist-seen', onSeen)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', load)
    return () => { active = false; clearInterval(iv); window.removeEventListener('waitlist-seen', onSeen); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', load) }
  }, [company?.id])

  // Warm the Waitlists page so even the first visit opens instantly.
  useEffect(() => { if (company?.id) warmWaitlists(company.id) }, [company?.id])

  const [showWorkspaces, setShowWorkspaces] = useState(false)
  const [workspaces, setWorkspaces] = useState<any[]>([])

  // All companies this user can administer (owned + elevated team memberships)
  const loadWorkspaces = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const list: any[] = []
      const { data: owned } = await (supabase as any).from('companies')
        .select('id, name, slug, logo_url, accent_color').eq('owner_id', session.user.id)
      ;(owned || []).forEach((c: any) => list.push(c))
      const { data: memberships } = await (supabase as any).from('team_members')
        .select('company_id, role').eq('user_id', session.user.id)
      const elevated = (memberships || []).filter((m: any) => ['owner', 'admin', 'editor'].includes((m.role || '').toLowerCase()))
      for (const m of elevated) {
        if (list.find(c => c.id === m.company_id)) continue
        const { data: co } = await (supabase as any).from('companies')
          .select('id, name, slug, logo_url, accent_color').eq('id', m.company_id).maybeSingle()
        if (co) list.push(co)
      }
      setWorkspaces(list)
    } catch {}
  }
  const [user, setUser] = useState<any>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // The browser phone lives in the ROOT layout (components/PhoneHost) so a live
  // call survives leaving /admin — Back, the Ideas/Roadmap links, a reload.
  // Tell it whose phone it is.
  const phoneAgent = user?.user_metadata?.display_name || user?.email?.split('@')[0]
  useEffect(() => {
    if (company?.id && user?.id) setPhoneHost({ companyId: company.id, agentName: phoneAgent, userId: user.id })
  }, [company?.id, user?.id, phoneAgent])

  // The top-bar hamburger (in the root layout) fires this event on admin pages
  // so the single top-left hamburger opens the admin sidebar.
  useEffect(() => {
    const open = () => setMobileSidebarOpen(v => !v)
    window.addEventListener('colvy:toggle-admin-sidebar', open)
    return () => window.removeEventListener('colvy:toggle-admin-sidebar', open)
  }, [])

  useEffect(() => {
    // Opened this admin before as this same person? Show it straight away from
    // the remembered answer; the full check below still runs and sends them
    // away if the answer has changed. (Every read/write is still checked by the
    // database and the API — this only decides what the screen shows first.)
    if (typeof window !== 'undefined' && !window.location.hash.includes('access_token')) {
      const gate = readAdminGate()
      const stored = peekStoredUser()
      if (gate && stored && stored.id === gate.userId) {
        setUser(stored); setCompany(gate.company); setAuthed(true)
        seedCompanyUser({ companyId: gate.company.id, user: stored })
      }
    }
    const initAuth = async () => {
      // When redirected from colvy.com sign-in, the session tokens may be in
      // the URL hash fragment (#access_token=...&refresh_token=...).
      // Supabase's detectSessionInUrl will exchange them automatically,
      // but we need to wait for onAuthStateChange to fire first.
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        // Let Supabase process the hash
        await new Promise<void>(resolve => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || session) {
              subscription.unsubscribe()
              // Clean the hash from URL without reloading
              window.history.replaceState(null, '', window.location.pathname)
              resolve()
            }
          })
          // Timeout fallback in case the event doesn't fire
          setTimeout(resolve, 2000)
        })
      }

      // getSession() can hang if a token refresh network call stalls. Race it
      // against a timeout so a stuck session surfaces the recoverable screen
      // instead of spinning forever.
      const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([
        p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
      ])
      await withTimeout(supabase.auth.getSession(), 12000).then(async ({ data }: any) => {
      // admin.colvy.com is the platform super-admin domain — never a company
      // admin. Any /admin/* URL there must go to the platform panel instead of
      // falling through to a company lookup that resolves nothing and 404s.
      if (typeof window !== 'undefined' && window.location.hostname === 'admin.colvy.com') {
        // The console lives at the bare host root, not the explicit
        // /platform-admin path (which 404s).
        clearAdminGate(); window.location.replace('/'); return
      }
      const u = data?.session?.user
      if (!u) { clearAdminGate(); router.push('/signin'); return }
      setUser(u)

      // Get hostname for subdomain detection
      const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
      const parts = hostname.split('.')
      const isSubdomain = parts.length === 3 && hostname.endsWith('colvy.com')
      const isLocalOrVercel = hostname.includes('localhost') || hostname.includes('vercel.app')
      const subdomain = isSubdomain ? parts[0] : null

      // Super admin can access anything
      const SUPER_ADMIN = 'bishalstha76@gmail.com'
      if (u.email === SUPER_ADMIN) {
        // Load the company for display (could be any company if on a subdomain)
        if (subdomain) {
          const { data: co } = await (supabase as any).from('companies').select('*').eq('slug', subdomain).maybeSingle()
          // A subdomain with no company (typo, deleted workspace) has nothing to
          // administer — send the super admin to the platform panel rather than
          // rendering a company-less admin that reads as a broken 404.
          if (!co) { if (isBackendDown()) throw new Error(BACKEND_DOWN); clearAdminGate(); window.location.href = 'https://admin.colvy.com'; return }
          setCompany(co)
        } else {
          const co = await getCompanyByOwner(u.id)
          setCompany(co)
        }
        setAuthed(true)
        return
      }

      // Regular user: check subdomain access
      if (isSubdomain && !isLocalOrVercel) {
        // On a company subdomain — load that company and verify ownership
        const { data: subdomainCo } = await (supabase as any)
          .from('companies').select('*').eq('slug', subdomain).maybeSingle()

        if (!subdomainCo) {
          // Subdomain doesn't exist — deny access
          if (isBackendDown()) throw new Error(BACKEND_DOWN); clearAdminGate(); router.push('/')
          return
        }

        if (subdomainCo.owner_id === u.id) {
          setCompany(subdomainCo)
          setAuthed(true)
          return
        }

        // Elevated team members (owner/admin/editor) may also access the admin panel.
        // Viewers (regular users who signed up on this board) may NOT.
        // Array query with .length check — never .single() (may return no rows).
        const { data: members } = await (supabase as any)
          .from('team_members').select('role')
          .eq('company_id', subdomainCo.id).eq('user_id', u.id).limit(1)
        const role = members && members.length > 0 ? (members[0].role || '').toLowerCase() : null
        if (role && ['owner', 'admin', 'editor'].includes(role)) {
          setCompany(subdomainCo)
          setAuthed(true)
          return
        }

        // Regular user (viewer or not a member) on someone else's board.
        // If they own their OWN company, send them to their own admin; otherwise back to the board.
        const userCo = await getCompanyByOwner(u.id)
        if (userCo?.slug) {
          if (isBackendDown()) throw new Error(BACKEND_DOWN); clearAdminGate(); window.location.href = `https://${userCo.slug}.colvy.com/admin`
        } else {
          // User owns no company — deny access, back to the public board
          if (isBackendDown()) throw new Error(BACKEND_DOWN); clearAdminGate(); router.push('/')
        }
        return
      }

      // On localhost/vercel.app/colvy.com — user must own a company (or be an elevated team member somewhere)
      const userCo = await getCompanyByOwner(u.id)
      if (userCo) {
        setCompany(userCo)
        setAuthed(true)
        return
      }
      // No owned company — allow only elevated team members; plain viewers are denied
      const { data: anyMemberships } = await (supabase as any)
        .from('team_members').select('role, company_id')
        .eq('user_id', u.id).limit(5)
      const elevated = (anyMemberships || []).find((m: any) => ['owner', 'admin', 'editor'].includes((m.role || '').toLowerCase()))
      if (elevated) {
        const { data: memberCo } = await (supabase as any).from('companies').select('*').eq('id', elevated.company_id).maybeSingle()
        setCompany(memberCo || null)
        setAuthed(true)
        return
      }
      // Not an admin of anything — deny
      if (isBackendDown()) throw new Error(BACKEND_DOWN); clearAdminGate(); router.push('/')
    }).catch(() => setAuthError(true))
    } // end initAuth
    initAuth().catch(() => setAuthError(true))
    // Backstop: if auth resolution hasn't completed (a query that hangs without
    // rejecting), surface the recoverable screen rather than an endless spinner.
    const backstop = setTimeout(() => { if (authedRef.current === null) setAuthError(true) }, 15000)
    return () => clearTimeout(backstop)
  }, [])

  // Remember a confirmed admin for an instant open next time, and hand the
  // company to the pages so they skip their own lookup.
  useEffect(() => {
    if (!authed || !user?.id || !company?.id) return
    writeAdminGate(user.id, company)
    seedCompanyUser({ companyId: company.id, user })
  }, [authed, user, company])

  // Resolve THIS member's role + feature permissions once we know who they are
  // and which company they're in. Owner / super-admin get full access; everyone
  // else is gated by their team_members.permissions map.
  // NOTE: these hooks MUST stay above the early returns below — a hook after a
  // conditional return breaks the Rules of Hooks (React error #310).
  useEffect(() => {
    const uid = user?.id
    const cid = company?.id
    if (!uid || !cid) return
    let active = true
    ;(async () => {
      if (user?.email === SUPER_ADMIN_EMAIL || company?.owner_id === uid) {
        if (active) { setMyRole('owner'); setMyPerms(null); setPermsLoaded(true) }
        return
      }
      try {
        // select('*') so this doesn't break if the V306 permissions column
        // hasn't been added yet — an absent column just reads as undefined
        // (unrestricted) rather than erroring the whole query.
        const { data } = await (supabase as any).from('team_members')
          .select('*').eq('company_id', cid).eq('user_id', uid).limit(1)
        const row = data?.[0]
        if (active) {
          setMyRole(String(row?.role || 'viewer').toLowerCase())
          setMyPerms((row?.permissions as PermissionMap) || null)
          setPermsLoaded(true)
        }
      } catch {
        if (active) { setMyRole('viewer'); setMyPerms(null); setPermsLoaded(true) }
      }
    })()
    return () => { active = false }
  }, [user?.id, company?.id, company?.owner_id])

  // Route guard: a restricted member who opens a disallowed URL directly is sent
  // back to the dashboard (which is always allowed). Nav hiding covers the normal
  // path; this covers deep links and typed URLs.
  useEffect(() => {
    if (!permsLoaded || hasFullAccess(myRole)) return
    if (!pathname || !pathname.startsWith('/admin')) return
    if (!canAccessPath(myRole, myPerms, pathname)) {
      router.replace('/admin')
    }
  }, [permsLoaded, myRole, myPerms, pathname, router])

  // Auth resolution hung or failed (stuck/expired session token, backend blip) —
  // give the user a way out instead of an infinite spinner.
  if (authed === null && authError) {
    const signInAgain = async () => { try { await supabase.auth.signOut({ scope: 'local' }) } catch {} ; window.location.href = '/signin' }
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)', padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--peach, #fff0ec)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>We couldn&rsquo;t load your workspace</h2>
          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: 'var(--slate)' }}>Your session may have expired, or the connection stalled. Try again, or sign in to refresh your session.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Try again</button>
            <button onClick={signInAgain} style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>Sign in again</button>
          </div>
        </div>
      </div>
    )
  }

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL

  // Nav visibility for the current member.
  const canUseNavItem = (item: { href: string; label: string }) => {
    const featKey = item.label === 'Ideas' ? 'ideas' : featureForPath(item.href.split(/[?#]/)[0])?.key
    return !featKey || canUseFeature(myRole, myPerms, featKey)
  }

  // Only the LONGEST whole-segment match is active — prevents /admin/help
  // lighting up when /admin/help/analytics is the current page.
  const activeHref = pathname === '/admin' ? '/admin'
    : NAV_MATCHES.find(m => pathname === m.path || pathname?.startsWith(m.path + '/'))?.href
  const isActive = (href: string) => href === activeHref
  const settingsAccess = (href: string) => canUseNavItem({ href, label: '' })

  // Jump-to search: every page this member can open, and settings destinations.
  const navItems: SearchItem[] = NAV_GROUPS.flatMap(g => g.items.filter(canUseNavItem).map(it => ({ label: it.label, href: it.href, section: g.label || 'General', icon: icons[it.icon] })))
  const settingsItems: SearchItem[] = SETTINGS_NAV.flatMap(g => g.items.filter(it => canUseNavItem(it)).map(it => ({ label: it.label, href: it.href, section: `Settings · ${g.title}`, icon: icons.settings })))
  const searchSeen = new Set([...navItems, ...settingsItems].map(i => i.href))
  const searchItems = [...navItems, ...settingsItems.filter(i => !navItems.some(n => n.href === i.href)), ...SEARCH_EXTRAS.filter(e => !searchSeen.has(e.href) && canUseNavItem(e)).map(e => ({ ...e, icon: e.icon || icons.settings }))]

  // Upgrade shows for the people who run billing, and only when there's
  // something to upgrade to (not on a paid or Enterprise plan).
  const showUpgrade = hasFullAccess(myRole) && !['feedback', 'omnichannel', 'everything', 'enterprise', 'pro', 'business', 'growth', 'startup'].includes(String(company?.plan || '').toLowerCase())

  // The rail's sections: what this member may open, with counts of what's
  // waiting, the current page lit, and demo-locked pages marked.
  const COUNTS: Record<string, [number, string]> = {
    Inbox: [inboxUnread, '#ef4444'], Tasks: [taskDue, 'var(--coral)'], Orders: [ordersNew, '#2563eb'],
    Tickets: [ticketsNew, '#ef4444'], Bookings: [bookingsNew, '#2563eb'], Waitlists: [waitlistNew, '#2563eb'],
  }
  const toRail = (sec: NavSection): RailSection | null => {
    const groups = sec.groups.map(g => ({
      label: g.label,
      items: g.items.filter(canUseNavItem).map(it => ({
        label: it.label, href: it.href, icon: icons[it.icon], active: isActive(it.href),
        count: COUNTS[it.label]?.[0] || 0, tone: COUNTS[it.label]?.[1],
        locked: !!company?.is_demo && DEMO_LOCKED_HREFS.some(h => it.href === h || it.href.startsWith(h + '/')),
      })),
    })).filter(g => g.items.length)
    return groups.length ? { key: sec.key, label: sec.label, glyph: sec.glyph, groups } : null
  }
  const railSections = SECTIONS.map(toRail).filter((x): x is RailSection => !!x)
  const railSettingsBase = toRail(SETTINGS_SECTION)
  const railSettings: RailSection | null = isSuperAdmin
    ? { key: 'settings', label: 'Settings', glyph: 'settings', groups: [...(railSettingsBase?.groups || []), { label: 'Super admin', items: [
        { label: 'Create Company', href: '/admin/create-company', icon: icons.company, active: isActive('/admin/create-company') },
        { label: 'Platform panel', href: 'https://admin.colvy.com', icon: icons.lock || icons.company, external: true },
        { label: 'Legal Pages', href: '/admin/legal', icon: icons.legal || icons.settings, active: isActive('/admin/legal') },
      ] }] }
    : railSettingsBase

  // The workspaces this person runs, to switch between (the menu sheet's
  // header and the rail's logo both open it).
  const workspaceList = (
    <>
      <p style={{ margin: 0, padding: '12px 16px 6px', fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>Workspaces</p>
      {workspaces.map(w => (
        <button key={w.id} type="button"
          onClick={() => {
            setShowWorkspaces(false)
            if (w.slug && company?.slug !== w.slug) window.location.href = `https://${w.slug}.colvy.com/admin`
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer' }}>
          {w.logo_url ? (
            <img src={w.logo_url} alt={w.name} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 6, background: w.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{(w.name?.[0] || '?').toUpperCase()}</span>
          )}
          <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
          {company?.id === w.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
        </button>
      ))}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
        <a href="/admin/new-workspace"
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', textDecoration: 'none' }}>
          <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', fontSize: 15, fontWeight: 600 }}>+</span>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Create Workspace</span>
        </a>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      {/* Super-admin impersonation banner (shows only when a session is active) */}
      <ImpersonationBanner />
      {/* Shown when the database stops answering (lib/net-timeout) */}
      <BackendStatusBanner />
      {/* Demo showcase banner + guided tour (shown only inside a demo workspace) */}
      <DemoBanner company={company} />
      {company?.is_demo && <DemoTour />}
      {demoMsg && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 100001, maxWidth: 420, padding: '12px 16px', borderRadius: 12, background: '#111827', color: '#fff', fontSize: 13, fontWeight: 500, boxShadow: '0 10px 30px rgba(0,0,0,0.35)', lineHeight: 1.5 }}>
          {demoMsg}
        </div>
      )}
      {/* The phone itself (inbound calls + the outbound call panel) is mounted
          in the root layout by PhoneHost, so calls survive leaving the admin. */}
      {/* Registers this browser as a call device and shows the "Take over call"
          banner when a live call is handed to it from another device. */}
      <CallHandoff companyId={company?.id || null} userId={user?.id || null} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />
      {/* App-wide softphone: a "Call" button on any page (contacts, profile,
          order drawer) opens this via the `colvy:dial` event, so calls are
          placed inside Colvy instead of the browser handing off to a `tel:`
          link and asking the OS to pick a phone app. */}
      <GlobalDialer companyId={company?.id || null} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />
      <style>{`
        @media (max-width: 860px) {
          /* Phones: the menu is a floating sheet over the page (Apple-like):
             inset from the edges, rounded top corners, large rows, the page
             dimmed behind it, and a close button by the workspace name. */
          .admin-sidebar {
            top: calc(env(safe-area-inset-top, 0px) + 8px) !important; left: 8px !important; bottom: 0;
            width: min(340px, calc(100vw - 48px)) !important; height: calc(100dvh - env(safe-area-inset-top, 0px) - 8px) !important;
            border: none !important; border-radius: 22px 22px 0 0; z-index: 61 !important;
            transform: translateX(calc(-100% - 16px)); transition: transform 0.32s cubic-bezier(.2,.8,.2,1), box-shadow 0.32s ease;
            box-shadow: 0 0 0 transparent; overscroll-behavior: contain;
          }
          .admin-sidebar.open { transform: translateX(0); box-shadow: 0 24px 60px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.06); }
          .admin-main { margin-left: 0 !important; }
          .admin-mobile-overlay { top: 0 !important; z-index: 60 !important; background: rgba(17,17,20,0.34) !important; -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
          .admin-mobile-overlay.open { display: block !important; animation: cvOverlayIn .2s ease-out; }
          .admin-mobile-close { display: flex !important; }
          .admin-ws-head { padding: 18px 56px 12px 20px !important; border-bottom: none !important; }
          .admin-ws-head .admin-ws-name { font-size: 17px !important; font-weight: 700 !important; }
          .admin-sidebar nav { padding: 4px 12px 24px !important; }
          /* Rows at the app's own text size (15px), with section headings the
             same size, set in bold with a chevron, like the sidebar in Files. */
          .admin-sidebar .nav-item {
            font-size: 15px !important; padding: 10px 12px !important; gap: 14px !important; border-radius: 12px !important;
            min-height: 44px; color: #1c1c1e !important; font-weight: 500 !important; margin-bottom: 1px !important;
          }
          .admin-sidebar .nav-item.is-active { background: #f2f2f7 !important; }
          .admin-sidebar .nav-item.is-active .nav-ic { color: var(--coral); }
          .admin-sidebar .nav-item .nav-ic { opacity: 0.75 !important; }
          .admin-sidebar .nav-item .nav-ic svg { width: 20px; height: 20px; }
          .admin-sidebar .nav-item:not(.is-active):hover { background: #f7f7f9; }
          .admin-sidebar .nav-group-header { padding: 10px 12px !important; min-height: 44px; margin: 4px 0 1px !important; border-radius: 12px !important; }
          .admin-sidebar .nav-group-header span { font-size: 15px !important; letter-spacing: -0.01em !important; text-transform: none !important; color: #1c1c1e !important; font-weight: 650 !important; }
          .admin-sidebar .nav-group-header .nav-group-chevron { width: 15px; height: 15px; opacity: 0.5; }
          .admin-sidebar .nav-group-header.is-collapsed { background: transparent; }
          .admin-sidebar .nav-group-header:hover { background: #f7f7f9; }
          /* Touch screens keep :hover after a tap; show the press instead. */
          @media (hover: none) {
            .admin-sidebar .nav-group-header:hover, .admin-sidebar .nav-group-header.is-collapsed:hover,
            .admin-sidebar .nav-item:not(.is-active):hover { background: transparent !important; }
            .admin-sidebar .nav-group-header:active, .admin-sidebar .nav-item:not(.is-active):active { background: #f2f2f7 !important; }
          }
          .admin-sidebar .ss-trigger { min-height: 42px; font-size: 15px !important; border-radius: 12px !important; padding: 9px 12px !important; gap: 12px !important; margin-bottom: 8px !important; }
          .admin-sidebar .ss-trigger .nav-ic svg { width: 18px; height: 18px; }
        }
        @keyframes cvOverlayIn { from { opacity: 0 } to { opacity: 1 } }
        /* Collapsible nav-group header — a proper padded, rounded row that
           highlights on hover, with the chevron fading in a touch. */
        .nav-group-header {
          display: flex; align-items: center; justify-content: space-between;
          width: 100%; padding: 5px 10px; margin-bottom: 4px; border-radius: 8px;
          background: transparent; border: none; cursor: pointer;
          transition: background 0.14s ease;
        }
        .nav-group-header:hover { background: #f1f2f4; }
        .nav-group-header .nav-group-chevron { opacity: 0.45; transition: transform 0.18s ease, opacity 0.14s ease; }
        .nav-group-header:hover .nav-group-chevron { opacity: 0.85; }
        .nav-group-header.is-collapsed { background: #f5f6f8; }
        .nav-group-header.is-collapsed:hover { background: #ececf0; }
        /* Sidebar nav item — clear hover highlight so you can see which row
           you're pointing at, with the icon giving a small lift/brighten. */
        .nav-item { transition: background 0.14s ease, color 0.14s ease; cursor: pointer; }
        .nav-item, .nav-item * { cursor: pointer; }
        .nav-item:not(.is-active):hover { background: #f1f2f4; color: var(--ink) !important; }
        .nav-item .nav-ic { transition: transform 0.16s ease, opacity 0.14s ease; }
        .nav-item:hover .nav-ic { transform: scale(1.14); opacity: 1 !important; }
        .nav-item:active .nav-ic { transform: scale(0.96); }
      `}</style>

      {/* NOTE: the old floating mobile hamburger was removed. It used
          `display: 'none !important'` in an inline style, which React silently
          rejects (inline styles can't take !important), so it rendered anyway
          and showed a SECOND hamburger over the sidebar. The top-bar hamburger
          opens this sidebar via the colvy:toggle-admin-sidebar event. */}

      {desktop ? (
        <>
          <AdminRail
            workspace={
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => { setShowWorkspaces(v => !v); if (!workspaces.length) loadWorkspaces() }}
                  title={company?.name || 'Workspace'} aria-haspopup="menu" aria-expanded={showWorkspaces}
                  style={{ display: 'flex', width: 44, height: 44, padding: 0, border: 'none', borderRadius: 13, background: 'none', cursor: 'pointer', overflow: 'hidden' }}>
                  {/* The logo as it is: no white square behind a transparent one. */}
                  {company?.logo_url
                    ? <img src={company.logo_url} alt={company?.name || ''} style={{ width: 44, height: 44, objectFit: 'contain' }} />
                    : <span style={{ width: 44, height: 44, background: company?.accent_color || 'var(--coral)', color: '#fff', fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{(company?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}</span>}
                </button>
                {showWorkspaces && (
                  <>
                    <div onClick={() => setShowWorkspaces(false)} style={{ position: 'fixed', inset: 0, zIndex: 89 }} />
                    <div style={{ position: 'fixed', top: 'calc(64px + var(--imp-h, 0px))', left: RAIL_W + 6, width: 280, background: '#fff', borderRadius: 16, boxShadow: '0 16px 44px rgba(0,0,0,.14), 0 0 0 1px rgba(0,0,0,.05)', zIndex: 90, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f0f2' }}>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company?.name || 'Workspace'}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 12.5, color: '#8e8e93' }}>{company ? `${company.slug}.colvy.com` : ''}</p>
                      </div>
                      {workspaceList}
                    </div>
                  </>
                )}
              </div>
            }
            sections={railSections}
            settings={railSettings}
            search={() => window.dispatchEvent(new Event('colvy:open-search'))}
            ring={hasFullAccess(myRole) && company?.id ? <SetupRing companyId={company.id} rail /> : null}
            upgrade={showUpgrade ? '/admin/billing' : null}
            onLocked={() => setDemoMsg(DEMO_LOCK_MESSAGE)}
          />
          {/* The search palette (⌘K, or the rail's Search). */}
          <SidebarSearch items={searchItems} collapsed={false} hideTrigger />
        </>
      ) : (
      <>
      {/* Mobile overlay */}
      <div
        className={`admin-mobile-overlay ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? 'block' : 'none', position: 'fixed', inset: 0, top: 'calc(56px + var(--imp-h, 0px))', background: 'rgba(0,0,0,0.3)', zIndex: 29 }}
      />

      {/* Sidebar — fixed, responsive drawer on mobile */}
      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`} style={{
        position: 'fixed',
        top: 'calc(56px + var(--imp-h, 0px))',
        left: 0,
        width: 220,
        height: 'calc(100vh - 56px - var(--imp-h, 0px))',
        background: '#fff',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}>
        {/* Phones: close the menu sheet. */}
        <button type="button" onClick={() => setMobileSidebarOpen(false)} aria-label="Close menu" className="admin-mobile-close"
          style={{ display: 'none', position: 'absolute', top: 14, right: 12, width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'transparent', color: '#3a3a3c', cursor: 'pointer', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
        {/* Company info — workspace switcher. */}
        <div className="admin-ws-head" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button type="button" onClick={() => { setShowWorkspaces(v => !v); if (!workspaces.length) loadWorkspaces() }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name}
                style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
            ) : null}
            <div style={{ width: 32, height: 32, borderRadius: 8, background: company?.accent_color || 'var(--coral)', display: company?.logo_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {(company?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="admin-ws-name" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company?.name || user?.email?.split('@')[0] || 'My Board'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company ? `${company.slug}.colvy.com` : typeof window !== 'undefined' ? window.location.hostname : 'colvy.com'}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: showWorkspaces ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>

          {/* Workspace switcher dropdown */}
          {showWorkspaces && (
            <div style={{ position: 'absolute', top: '92%', left: 12, right: 12, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', zIndex: 90, overflow: 'hidden' }}>
              {workspaceList}
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {/* Search — jumps to any sidebar page or settings destination. */}
          <SidebarSearch items={searchItems} collapsed={false} />
          {NAV_GROUPS.map((group, gi) => {
            // Hide features this member isn't permitted to use, and drop a whole
            // group once nothing in it is visible.
            const permittedItems = group.items.filter(canUseNavItem)
            if (permittedItems.length === 0) return null
            // Groups without a title (Home) are never collapsible.
            const groupCollapsed = !!group.label && !!collapsedGroups[group.label]
            return (
            <div key={gi} style={{ marginBottom: groupCollapsed ? 8 : 20 }}>
              {group.label && (
                <button type="button" onClick={() => toggleGroup(group.label!)}
                  aria-expanded={!groupCollapsed}
                  title={groupCollapsed ? `Show ${group.label}` : `Hide ${group.label}`}
                  className={`nav-group-header${groupCollapsed ? ' is-collapsed' : ''}`}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                    {group.label}
                  </span>
                  <svg className="nav-group-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                    style={{ flexShrink: 0, transform: groupCollapsed ? 'rotate(180deg)' : 'none' }}>
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </button>
              )}
              {!groupCollapsed && permittedItems.map(item => {
                const active = isActive(item.href)
                // In a demo workspace, pages that connect real accounts, handle
                // billing or import/export real data are locked. Sending is
                // already blocked server-side; this hides the surfaces too.
                const locked = !!company?.is_demo && DEMO_LOCKED_HREFS.some(h => item.href === h || item.href.startsWith(h + '/'))
                return (
                  <Link key={item.href + item.label} href={locked ? '#' : item.href}
                    className={`nav-item${active ? ' is-active' : ''}`}
                    onClick={(e) => { if (locked) { e.preventDefault(); setDemoMsg(DEMO_LOCK_MESSAGE) } else setMobileSidebarOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                      borderRadius: 8, fontSize: 13, textDecoration: 'none', marginBottom: 1,
                      background: active ? 'var(--peach)' : undefined,
                      color: active ? 'var(--coral)' : 'var(--slate)',
                      fontWeight: active ? 600 : 400,
                    }}>
                    {/* Any section with things waiting shows a count, so you can
                        see there's work elsewhere without navigating to it. */}
                    {(() => {
                      const count = item.label === 'Inbox' ? inboxUnread
                        : item.label === 'Tasks' ? taskDue
                        : item.label === 'Orders' ? ordersNew
                        : item.label === 'Tickets' ? ticketsNew
                        : item.label === 'Bookings' ? bookingsNew
                        : item.label === 'Waitlists' ? waitlistNew
                        : 0
                      const tone = item.label === 'Tasks' ? 'var(--coral)' : item.label === 'Orders' || item.label === 'Bookings' || item.label === 'Waitlists' ? '#2563eb' : '#ef4444'
                      return (
                        <>
                          <span className="nav-ic" style={{ flexShrink: 0, display: 'flex', opacity: active ? 1 : 0.65, position: 'relative' }}>
                            {icons[item.icon]}
                          </span>
                          {item.label}
                          {locked && <span title="Not available in the demo" style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.55 }}>🔒</span>}
                          {count > 0 && (
                            <span
                              // key on the number so React remounts it and the
                              // pop animation replays whenever the count moves.
                              key={count}
                              className="count-pop"
                              title={item.label === 'Tasks' ? `${count} task${count === 1 ? '' : 's'} due or overdue` : item.label === 'Orders' ? `${count} new order${count === 1 ? '' : 's'}` : item.label === 'Tickets' ? `${count} new ticket${count === 1 ? '' : 's'}` : item.label === 'Bookings' ? `${count} new booking${count === 1 ? '' : 's'}` : `${count} unread`}
                              style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: tone, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </>
                      )
                    })()}
                  </Link>
                )
              })}
            </div>
          )})}

          {/* Super admin */}
          {isSuperAdmin && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                Super Admin
              </p>
              {/* The super-admin "create a company for a customer" form (owner,
                  plan, industry). Creating a workspace for yourself is the
                  "Create Workspace" option in the workspace switcher above. */}
              <Link href="/admin/create-company"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: 'var(--slate)', background: 'transparent' }}>
                <span style={{ flexShrink: 0, display: 'flex', opacity: 0.65 }}>{icons.company}</span>
                Create Company
              </Link>
              <a href="https://admin.colvy.com"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: 'var(--slate)', background: 'transparent' }}>
                <span style={{ flexShrink: 0, display: 'flex', opacity: 0.65 }}>{icons.lock || icons.company}</span>
                Platform panel
              </a>
              <Link href="/admin/legal"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: 'var(--slate)', background: 'transparent' }}>
                <span style={{ flexShrink: 0, display: 'flex', opacity: 0.65 }}>{icons.legal || icons.settings}</span>
                Legal Pages
              </Link>
            </div>
          )}
        </nav>

        {/* Getting started: setup progress, for new workspaces (components/SetupRing). */}
        {hasFullAccess(myRole) && company?.id && <SetupRing companyId={company.id} />}

        {/* Upgrade CTA — collapses to a single centred icon so its text can't
            overflow the 60px rail and clip ("Upgrade / to Pro / Unloc…").
            Only for the people who run billing, and only when there's
            something to upgrade to (not on a paid or Enterprise plan). */}
        {showUpgrade && (
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <Link href="/admin/billing"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 14px', borderRadius: 12, background: 'var(--peach)', textDecoration: 'none', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--coral)' }}>
              {icons.upgrade}
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>Upgrade to Pro</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>Unlock all features</p>
          </Link>
        </div>
        )}
      </aside>
      </>
      )}

      {/* Main content — offset by sidebar width on desktop, full width on mobile */}
      <div className={`admin-main ${reportFonts}`} style={{ marginLeft: desktop ? RAIL_W : 0, flex: 1, overflowY: 'auto', minHeight: 'calc(100vh - 56px)', paddingBottom: 'var(--sab-h, 0px)' }}>
        {/* The banners' total height is published as --admin-banners-h so
            full-height screens (the inbox) can fit below them instead of
            running under the phone's bottom nav. */}
        <div ref={setBannersEl} className="admin-banners">
        <AdminBanner />
        <TrialBanner company={company} />
        {/* "Back to setup" while someone is part-way through the dashboard's
            setup checklist (it reads the query string, hence Suspense). */}
        <React.Suspense fallback={null}><SetupReturnBar key={pathname} /></React.Suspense>
        </div>
        <div ref={pageRef} className="colvy-mobile-pad">
          {/* The Settings menu shows only what this member may open. */}
          <SettingsAccess.Provider value={settingsAccess}>
            {children}
          </SettingsAccess.Provider>
        </div>
      </div>

      <MobileNav />
      {/* Hides the bottom nav, AI orb and Feedback tab while a modal or sheet is open. */}
      <OverlayWatch />
      {/* A newly opened page starts at the top, not under the app header. */}
      <RouteScrollTop />
      <FeedbackButton companyId={company?.id} />
      {/* Floating Colvy AI command bar — natural-language actions on any admin
          page. Reads the current page's context (open conversation/contact/
          order) via the `colvy:ai-context` event so "reply to this customer" or
          "task for this order" just work. */}
      <ColvyAssistant companyId={company?.id || null} userId={user?.id || null} agentName={user?.user_metadata?.display_name || user?.email?.split('@')[0]} />
      {/* Background uploads keep running as you move around the app. */}
      <UploadQueueIndicator />
      {/* In-workspace Super-Admin bar — renders only for a platform super-admin
          (the summary API 403s for everyone else). Lets us see/act on this
          company's plan, trial and usage without leaving their admin. */}
      <SuperAdminBar companyId={company?.id || null} />
    </div>
  )
}
