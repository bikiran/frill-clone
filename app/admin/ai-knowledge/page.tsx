'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '@/app/admin/crm-settings/_shared'
import { confirmDialog } from '@/components/ConfirmDialog'

// AI knowledge library: what Colvy AI may use to answer customers, where it
// came from, and a place to test answers before auto-reply is switched on.

type Overview = {
  needsMigration: boolean
  settings: Record<string, boolean>
  aiEnabled: boolean
  syncedAt: string | null
  domains: string[]
  sources: Record<string, { count: number; latest: string | null }>
  total: number
  facts: { id: string; question: string; answer: string; updated_at: string }[]
  files: { id: string; name: string; size_bytes: number; pages: number; chunks: number; created_at: string }[]
  websitePages: { url: string; title: string }[]
  unanswered: { id: string; question: string; count: number; examples: { text: string; source: string; at: string }[]; suggested_answer: string | null; last_seen_at: string }[]
  unansweredReady: boolean
}
type TestResult = { answer: string; grounded: boolean; sources: { source: string; title: string; url: string | null; excerpt: string }[] }

const CORAL = 'var(--coral, #ff7a6b)'

const SOURCE_CARDS: { key: string; setting?: string; label: string; note: string; live: boolean; icon: string }[] = [
  { key: 'help', setting: 'help', label: 'Help centre', note: 'Published articles. Usually the best answers.', live: true, icon: 'book' },
  { key: 'website', setting: 'website', label: 'Your website', note: 'FAQ, delivery, returns, about and contact pages.', live: false, icon: 'globe' },
  { key: 'announcement', setting: 'announcements', label: 'Announcements', note: 'Your published news and changelog.', live: true, icon: 'megaphone' },
  { key: 'roadmap', setting: 'roadmap', label: 'Roadmap', note: "What's planned and what's shipped.", live: true, icon: 'map' },
  { key: 'idea', setting: 'ideas', label: 'Ideas', note: 'Public ideas customers have suggested.', live: true, icon: 'bulb' },
  { key: 'chat', setting: 'past_chats', label: 'Past conversations', note: 'How your team answers. Only human replies are used.', live: false, icon: 'chat' },
]

const FACT_IDEAS = ['What are your opening hours?', 'Do you deliver, and where?', 'What is your returns policy?', 'Can I pick up my order in store?', 'Which payment methods do you accept?', 'Where can I park?']

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  switch (name) {
    case 'book': return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>
    case 'globe': return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
    case 'megaphone': return <svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
    case 'map': return <svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
    case 'bulb': return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
    case 'chat': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    case 'fact': return <svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
    case 'file': return <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
    case 'upload': return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
    case 'sync': return <svg {...p}><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
    case 'trash': return <svg {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
    case 'edit': return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
    case 'check': return <svg {...p} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    case 'alert': return <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
    case 'shield': return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
    case 'spark': return <svg {...p}><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" /><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2z" /></svg>
    default: return <svg {...p}><circle cx="12" cy="12" r="9" /></svg>
  }
}

const ago = (iso: string | null) => {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
const kb = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

export default function AiKnowledgePage() {
  const { companyId, loading: userLoading } = useCompanyUser()
  const [ov, setOv] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState<string | null>(null)   // 'all' or a setting key
  const [notice, setNotice] = useState('')
  const [undo, setUndo] = useState<(() => void) | null>(null)
  const [question, setQuestion] = useState('')
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState('')
  const [factDraft, setFactDraft] = useState<{ id?: string; question: string; answer: string; unansweredId?: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [openExamples, setOpenExamples] = useState<string | null>(null)
  const [savingFact, setSavingFact] = useState(false)
  const [uploading, setUploading] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [showPages, setShowPages] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const factRef = useRef<HTMLDivElement>(null)

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }
  const api = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(path, { ...init, headers: { ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()), ...(init.headers || {}) } })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(d.error || 'Something went wrong')
    return d
  }

  const load = useCallback(async () => {
    if (!companyId) return
    try {
      const d = await api(`/api/ai/knowledge?companyId=${companyId}`)
      // Never let a partial response take the page down.
      setOv({ ...d, settings: d.settings || {}, sources: d.sources || {}, domains: d.domains || [], facts: d.facts || [], files: d.files || [], websitePages: d.websitePages || [], unanswered: d.unanswered || [], total: d.total || 0 })
      setError('')
    }
    catch (e: any) { setError(e.message) }
  }, [companyId])
  useEffect(() => { load() }, [load])

  const flashTimer = useRef<any>(null)
  const flash = (m: string, onUndo?: () => void) => {
    setNotice(m); setUndo(() => onUndo || null)
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => { setNotice(''); setUndo(null) }, onUndo ? 6000 : 3500)
  }

  const sync = async (knowledge?: Record<string, boolean>, key = 'all') => {
    if (!companyId) return
    setSyncing(key)
    if (knowledge && ov) setOv({ ...ov, settings: { ...ov.settings, ...knowledge } })
    try {
      const d = await api('/api/ai/knowledge', { method: 'POST', body: JSON.stringify({ companyId, knowledge }) })
      flash(`Library updated: ${d.total} item${d.total === 1 ? '' : 's'}.`)
      await load()
    } catch (e: any) { flash(e.message); await load() }
    finally { setSyncing(null) }
  }

  const ask = async (q?: string) => {
    const text = (q ?? question).trim()
    if (!text || !companyId) return
    setQuestion(text); setTesting(true); setTest(null); setTestError('')
    try { setTest(await api('/api/ai/knowledge/test', { method: 'POST', body: JSON.stringify({ companyId, question: text }) })) }
    catch (e: any) { setTestError(e.message) }
    finally { setTesting(false) }
  }

  const openFact = (f: { id?: string; question: string; answer: string; unansweredId?: string }) => {
    setFactDraft(f)
    setTimeout(() => factRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }
  const saveFact = async () => {
    if (!factDraft || !companyId) return
    setSavingFact(true)
    try {
      await api('/api/ai/knowledge/facts', { method: 'POST', body: JSON.stringify({ companyId, ...factDraft }) })
      setFactDraft(null); flash(factDraft.unansweredId ? 'Answered. Colvy AI knows this from now on.' : 'Fact saved. Colvy AI can use it straight away.'); await load()
    } catch (e: any) { flash(e.message) }
    finally { setSavingFact(false) }
  }
  const deleteFact = async (id: string) => {
    if (!(await confirmDialog({ title: 'Delete this fact?', message: 'Colvy AI will stop using it.', confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await api('/api/ai/knowledge/facts', { method: 'DELETE', body: JSON.stringify({ companyId, id }) }); await load() }
    catch (e: any) { flash(e.message) }
  }

  const scan = async () => {
    if (!companyId) return
    setScanning(true)
    try {
      const d = await api('/api/ai/knowledge/unanswered', { method: 'POST', body: JSON.stringify({ companyId, action: 'scan' }) })
      flash(d.groups ? `Found ${d.groups} question${d.groups === 1 ? '' : 's'} to answer, from ${d.scanned} recent customer messages.` : `Checked ${d.scanned} recent customer questions. Your knowledge already covers them.`)
      await load()
    } catch (e: any) { flash(e.message) }
    finally { setScanning(false) }
  }
  const setUnanswered = async (id: string, action: 'dismiss' | 'reopen') => {
    if (action === 'dismiss' && ov) setOv({ ...ov, unanswered: ov.unanswered.filter(u => u.id !== id) })
    try {
      await api('/api/ai/knowledge/unanswered', { method: 'POST', body: JSON.stringify({ companyId, action, id }) })
      if (action === 'dismiss') flash('Dismissed.', () => setUnanswered(id, 'reopen'))
      else { setNotice(''); setUndo(null) }
      await load()
    } catch (e: any) { flash(e.message); await load() }
  }

  const upload = async (file: File | undefined) => {
    if (!file || !companyId) return
    setUploading(file.name)
    try {
      const fd = new FormData(); fd.append('companyId', companyId); fd.append('file', file)
      const d = await api('/api/ai/knowledge/files', { method: 'POST', body: fd })
      flash(`Read ${d.file.name}: ${d.file.chunks} section${d.file.chunks === 1 ? '' : 's'} added.`); await load()
    } catch (e: any) { flash(e.message) }
    finally { setUploading(''); if (fileRef.current) fileRef.current.value = '' }
  }
  const deleteFile = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: `Remove ${name}?`, message: 'Colvy AI will stop using what it learned from this file.', confirmLabel: 'Remove', tone: 'danger' }))) return
    try { await api('/api/ai/knowledge/files', { method: 'DELETE', body: JSON.stringify({ companyId, id }) }); await load() }
    catch (e: any) { flash(e.message) }
  }

  if (userLoading || (!ov && !error)) return <div style={{ padding: 32, color: 'var(--slate)' }}>Loading…</div>
  if (!ov) return <div style={{ padding: 32, color: '#b42318' }}>{error || 'Couldn’t load AI knowledge.'}</div>

  const s = ov.sources
  return (
    <div className="akn">
      <style>{`
        .akn{max-width:1000px;margin:0 auto;padding:4px 0 64px}
        .akn h1{margin:0;font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--ink)}
        .akn-card{background:#fff;border:1px solid var(--border,#ececef);border-radius:18px;padding:20px}
        .akn-sec{margin-top:28px}
        .akn-sec h2{margin:0 0 4px;font-size:16px;font-weight:800;color:var(--ink)}
        .akn-sub{margin:0;font-size:13px;color:var(--slate);line-height:1.5}
        .akn-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}
        .akn-src{display:flex;flex-direction:column;gap:10px;transition:border-color .2s ease,box-shadow .2s ease,opacity .2s ease}
        .akn-src.off{opacity:.62}
        .akn-src:hover{border-color:#e2e2e7;box-shadow:0 10px 24px -18px rgba(16,24,40,.35)}
        .akn-ico{width:36px;height:36px;border-radius:11px;background:#fff3f0;color:#e2553f;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .akn-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px}
        .akn-switch{position:relative;width:38px;height:22px;border-radius:999px;border:none;cursor:pointer;flex-shrink:0;transition:background .2s ease}
        .akn-switch::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .22s cubic-bezier(.22,1,.36,1)}
        .akn-switch.on::after{transform:translateX(16px)}
        .akn-btn{white-space:nowrap;display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:11px;font-size:13.5px;font-weight:700;cursor:pointer;border:1px solid var(--border,#e4e4e7);background:#fff;color:var(--ink);font-family:inherit;transition:background .15s ease,transform .15s ease}
        .akn-btn:hover{background:#fafafa}
        .akn-btn.primary{background:linear-gradient(135deg,#ff7a6b,#ff9d72);border-color:transparent;color:#fff}
        .akn-btn.primary:hover{filter:brightness(1.03)}
        .akn-btn:disabled{opacity:.6;cursor:default}
        .akn-input{width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--border,#e4e4e7);font-size:14.5px;font-family:inherit;color:var(--ink);background:#fff;outline:none;transition:border-color .15s ease,box-shadow .15s ease;box-sizing:border-box}
        .akn-input:focus{border-color:#ffb4a6;box-shadow:0 0 0 4px rgba(255,122,107,.12)}
        .akn-chip{border:1px solid var(--border,#ececef);background:#fff;border-radius:999px;padding:7px 12px;font-size:12.5px;font-weight:600;color:#3f3f46;cursor:pointer;font-family:inherit;transition:border-color .15s ease,background .15s ease}
        .akn-chip:hover{border-color:#ffc9bf;background:#fff7f5}
        .akn-row{display:flex;align-items:flex-start;gap:12px;padding:14px 0;border-top:1px solid #f1f1f3}
        .akn-row:first-child{border-top:none}
        .akn-iconbtn{width:32px;height:32px;border-radius:9px;border:none;background:transparent;color:#71717a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background .15s ease,color .15s ease}
        .akn-iconbtn:hover{background:#f4f4f5;color:#111827}
        .akn-iconbtn.danger:hover{background:#fef2f2;color:#dc2626}
        .akn-drop{border:1.5px dashed #e4e4e7;border-radius:16px;padding:22px;text-align:center;cursor:pointer;transition:border-color .2s ease,background .2s ease}
        .akn-drop.over,.akn-drop:hover{border-color:#ffb4a6;background:#fff8f6}
        .akn-in{animation:aknIn .3s cubic-bezier(.22,1,.36,1) both}
        @keyframes aknIn{from{opacity:0;transform:translate3d(0,6px,0)}to{opacity:1;transform:none}}
        .akn-spin{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;animation:aknSpin .7s linear infinite}
        @keyframes aknSpin{to{transform:rotate(360deg)}}
        .akn-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111827;color:#fff;padding:11px 18px;border-radius:12px;font-size:13.5px;font-weight:600;z-index:80;box-shadow:0 12px 30px -10px rgba(0,0,0,.4);max-width:calc(100vw - 32px)}
        @media (max-width:900px){.akn-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:640px){.akn-toast{left:16px;right:16px;transform:none;bottom:calc(76px + env(safe-area-inset-bottom));max-width:none}.akn{padding:0 0 56px}.akn-grid{grid-template-columns:1fr}.akn h1{font-size:22px}.akn-head{flex-direction:column;align-items:flex-start!important}}
        @media (prefers-reduced-motion:reduce){.akn-in,.akn-spin{animation:none}.akn-switch::after{transition:none}}
      `}</style>

      {/* Header */}
      <div className="akn-head" style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
        <div>
          <h1>AI knowledge</h1>
          <p className="akn-sub" style={{ marginTop: 6, maxWidth: 560 }}>Everything Colvy AI can use to answer your customers. It answers only from what&rsquo;s here, and hands over to your team when it isn&rsquo;t sure.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>{ov.total} item{ov.total === 1 ? '' : 's'} · synced {ago(ov.syncedAt)}</span>
          <button className="akn-btn" onClick={() => sync()} disabled={!!syncing || ov.needsMigration}>
            {syncing === 'all' ? <span className="akn-spin" /> : <Icon name="sync" size={15} />}{syncing === 'all' ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {ov.needsMigration && (
        <div className="akn-card akn-in" style={{ marginTop: 18, borderColor: '#fcd9a8', background: '#fffaf2', display: 'flex', gap: 12 }}>
          <span style={{ color: '#b45309', marginTop: 1 }}><Icon name="alert" /></span>
          <p className="akn-sub" style={{ color: '#7c4a03' }}>One more step: run <strong>migrations/COLVY_V326_AI_KNOWLEDGE_LIBRARY.sql</strong> in the Supabase SQL editor. It adds facts, files, live syncing and smarter search.</p>
        </div>
      )}
      {!ov.aiEnabled && !ov.needsMigration && (
        <p className="akn-sub" style={{ marginTop: 14 }}>Colvy AI replies are switched off in <Link href="/admin/ai-settings" style={{ color: '#e2553f', fontWeight: 700 }}>AI settings</Link>. You can still build the library and test answers here.</p>
      )}

      {/* Test */}
      <div className="akn-card akn-sec">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="akn-ico" style={{ background: 'linear-gradient(135deg,#ff7a6b,#ff9d72)', color: '#fff' }}><Icon name="spark" /></span>
          <div>
            <h2>Test Colvy AI</h2>
            <p className="akn-sub">Ask a question the way a customer would and see what Colvy AI would say.</p>
          </div>
        </div>
        <form onSubmit={e => { e.preventDefault(); ask() }} style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <input className="akn-input" value={question} onChange={e => setQuestion(e.target.value)} placeholder="e.g. Do you deliver to Craigieburn?" aria-label="Test question" />
          <button className="akn-btn primary" type="submit" disabled={testing || !question.trim()} style={{ flexShrink: 0 }}>
            {testing ? <span className="akn-spin" /> : null}{testing ? 'Thinking…' : 'Ask'}
          </button>
        </form>
        {!test && !testing && !testError && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {['What are your opening hours?', 'Do you deliver?', 'Can I return something?'].map(q => <button key={q} className="akn-chip" onClick={() => ask(q)}>{q}</button>)}
          </div>
        )}
        {testError && <p className="akn-sub akn-in" style={{ marginTop: 12, color: '#b42318' }}>{testError}</p>}
        {test && (
          <div className="akn-in" style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${test.grounded ? '#d1fadf' : '#fde7c7'}`, background: test.grounded ? '#f6fef9' : '#fffbf3', padding: 16 }}>
            <span className="akn-pill" style={{ background: test.grounded ? '#dcfae6' : '#fef0c7', color: test.grounded ? '#067647' : '#b54708' }}>
              <Icon name={test.grounded ? 'check' : 'alert'} size={12} />{test.grounded ? 'Answered from your knowledge' : 'Not in your knowledge yet'}
            </span>
            <p style={{ margin: '10px 0 0', fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)' }}>
              {test.answer || 'Colvy AI found nothing about this, so it would pass the question to your team.'}
            </p>
            {test.sources.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {test.sources.map((src, i) => {
                  const inner = <><Icon name={SOURCE_CARDS.find(c => c.key === src.source)?.icon || (src.source === 'fact' ? 'fact' : 'file')} size={12} />{src.title}</>
                  const style = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 999, background: '#fff', border: '1px solid #ececef', color: '#3f3f46', textDecoration: 'none', maxWidth: '100%' } as const
                  return src.url ? <a key={i} href={src.url} target="_blank" rel="noreferrer" style={style} title={src.excerpt}>{inner}</a> : <span key={i} style={style} title={src.excerpt}>{inner}</span>
                })}
              </div>
            )}
            {!test.grounded && (
              <button className="akn-btn" style={{ marginTop: 12 }} onClick={() => openFact({ question, answer: '' })}><Icon name="fact" size={15} />Add the answer as a fact</button>
            )}
          </div>
        )}
      </div>

      {/* Unanswered */}
      <div className="akn-sec">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Questions Colvy AI couldn&rsquo;t answer
              {ov.unanswered.length > 0 && <span className="akn-pill" style={{ background: '#fff1ee', color: '#e2553f' }}>{ov.unanswered.length}</span>}
            </h2>
            <p className="akn-sub">Answer each one once and Colvy AI knows it from then on.</p>
          </div>
          <button className="akn-btn" onClick={scan} disabled={scanning || !ov.unansweredReady}>
            {scanning ? <span className="akn-spin" /> : <Icon name="search" size={15} />}{scanning ? 'Scanning…' : 'Scan recent conversations'}
          </button>
        </div>
        <div className="akn-card" style={{ marginTop: 14 }}>
          {!ov.unansweredReady ? (
            <p className="akn-sub" style={{ color: '#7c4a03' }}>One more step: run <strong>migrations/COLVY_V327_AI_UNANSWERED.sql</strong> in the Supabase SQL editor.</p>
          ) : ov.unanswered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: '50%', background: '#ecfdf3', color: '#067647', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" /></span>
              <p style={{ margin: '10px 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Nothing waiting</p>
              <p className="akn-sub">When Colvy AI can&rsquo;t answer a customer, the question shows up here. Scan your recent conversations to find gaps now.</p>
            </div>
          ) : ov.unanswered.map(u => {
            const from = Array.from(new Set((u.examples || []).map(e => e.source))).map(x => x === 'ai_reply' ? 'auto-replies' : x === 'ai_draft' ? 'inbox drafts' : 'recent chats').join(', ')
            return (
              <div key={u.id} className="akn-row akn-in" style={{ flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{u.question}</p>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                      Asked {u.count} time{u.count === 1 ? '' : 's'} · last {ago(u.last_seen_at)}{from ? ` · from ${from}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="akn-btn primary" style={{ padding: '7px 14px', fontSize: 13 }} onClick={() => openFact({ question: u.question, answer: u.suggested_answer || '', unansweredId: u.id })}>Answer</button>
                    <button className="akn-iconbtn" aria-label="Dismiss" title="Dismiss" onClick={() => setUnanswered(u.id, 'dismiss')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </div>
                {u.suggested_answer && (
                  <div style={{ width: '100%', boxSizing: 'border-box', background: '#f8f8fa', borderRadius: 12, padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontSize: 11.5, fontWeight: 700, color: '#71717a', textTransform: 'uppercase', letterSpacing: '.04em' }}>How your team answered</p>
                    <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#3f3f46', lineHeight: 1.55 }}>{u.suggested_answer}</p>
                  </div>
                )}
                {(u.examples || []).length > 0 && (
                  <>
                    <button className="akn-chip" style={{ padding: '3px 10px', fontSize: 11.5 }} onClick={() => setOpenExamples(openExamples === u.id ? null : u.id)}>
                      {openExamples === u.id ? 'Hide what customers wrote' : 'See what customers wrote'}
                    </button>
                    {openExamples === u.id && (
                      <ul className="akn-in" style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#52525b', lineHeight: 1.6, width: '100%' }}>
                        {u.examples.map((e, i) => <li key={i}>&ldquo;{e.text}&rdquo; <span style={{ color: '#a1a1aa' }}>· {ago(e.at)}</span></li>)}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Sources */}
      <div className="akn-sec">
        <h2>Sources</h2>
        <p className="akn-sub">Live sources update the moment you publish or edit. Your website and past conversations refresh daily, or when you press Sync now.</p>
        <div className="akn-grid">
          {SOURCE_CARDS.map(c => {
            const on = !!ov.settings[c.setting!]
            const n = c.key === 'website' ? ov.websitePages.length : s[c.key]?.count || 0
            const busy = syncing === c.setting
            const unit = c.key === 'website' ? 'page' : c.key === 'chat' ? 'conversation' : c.key === 'help' ? 'article' : 'item'
            return (
              <div key={c.key} className={`akn-card akn-src ${on ? '' : 'off'}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="akn-ico"><Icon name={c.icon} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{c.label}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{on ? `${n} ${unit}${n === 1 ? '' : 's'}` : 'Off'}</p>
                  </div>
                  {busy ? <span className="akn-spin" style={{ color: '#e2553f' }} /> : (
                    <button className={`akn-switch ${on ? 'on' : ''}`} style={{ background: on ? '#ff7a6b' : '#d4d4d8' }} role="switch" aria-checked={on} aria-label={`Use ${c.label}`}
                      disabled={!!syncing || ov.needsMigration} onClick={() => sync({ [c.setting!]: !on }, c.setting)} />
                  )}
                </div>
                <p className="akn-sub" style={{ fontSize: 12.5 }}>{c.note}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 'auto' }}>
                  <span className="akn-pill" style={{ background: c.live ? '#ecfdf3' : '#f4f4f5', color: c.live ? '#067647' : '#52525b' }}>{c.live ? 'Live' : 'Daily'}</span>
                  {c.key === 'website' && on && (ov.domains.length
                    ? <button className="akn-chip" style={{ padding: '3px 9px', fontSize: 11.5 }} onClick={() => setShowPages(v => !v)}>{showPages ? 'Hide pages' : 'See pages'}</button>
                    : <Link href="/admin/crm-settings/business" style={{ fontSize: 12, fontWeight: 700, color: '#e2553f' }}>Add your website</Link>)}
                  {c.key === 'help' && n === 0 && on && <Link href="/admin/help/new" style={{ fontSize: 12, fontWeight: 700, color: '#e2553f' }}>Write an article</Link>}
                </div>
              </div>
            )
          })}
        </div>
        {showPages && (
          <div className="akn-card akn-in" style={{ marginTop: 12 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Pages read from {ov.domains.join(', ')}</p>
            {ov.websitePages.length === 0
              ? <p className="akn-sub">Nothing read yet. Press Sync now.</p>
              : <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 4 }}>
                  {ov.websitePages.map(p => (
                    <li key={p.url} style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)', textDecoration: 'none' }}>{p.title}</a>
                      <span style={{ color: '#a1a1aa' }}> · {p.url.replace(/^https?:\/\//, '')}</span>
                    </li>
                  ))}
                </ul>}
          </div>
        )}
      </div>

      {/* Facts */}
      <div className="akn-sec">
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h2>Facts</h2>
            <p className="akn-sub">Short answers in your own words. Colvy AI trusts these most.</p>
          </div>
          {!factDraft && <button className="akn-btn" onClick={() => openFact({ question: '', answer: '' })} disabled={ov.needsMigration}><Icon name="fact" size={15} />Add fact</button>}
        </div>
        <div className="akn-card" style={{ marginTop: 14 }}>
          {factDraft && (
            <div ref={factRef} className="akn-in" style={{ paddingBottom: ov.facts.length ? 16 : 0, marginBottom: ov.facts.length ? 4 : 0, borderBottom: ov.facts.length ? '1px solid #f1f1f3' : 'none' }}>
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>Question customers ask</label>
              <input className="akn-input" value={factDraft.question} onChange={e => setFactDraft({ ...factDraft, question: e.target.value })} placeholder="Do you deliver to my suburb?" autoFocus={!factDraft.question} />
              <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', margin: '12px 0 6px' }}>Your answer</label>
              <textarea className="akn-input" value={factDraft.answer} onChange={e => setFactDraft({ ...factDraft, answer: e.target.value })} rows={3} placeholder="We deliver within 30 km of Somerton, Tuesday to Saturday. Live fish are local delivery only." autoFocus={!!factDraft.question} style={{ resize: 'vertical' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button className="akn-btn" onClick={() => setFactDraft(null)}>Cancel</button>
                <button className="akn-btn primary" onClick={saveFact} disabled={savingFact || !factDraft.question.trim() || !factDraft.answer.trim()}>{savingFact ? 'Saving…' : 'Save fact'}</button>
              </div>
            </div>
          )}
          {ov.facts.length === 0 && !factDraft && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <p className="akn-sub">No facts yet. Start with what customers ask most:</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 12 }}>
                {FACT_IDEAS.map(q => <button key={q} className="akn-chip" onClick={() => openFact({ question: q, answer: '' })} disabled={ov.needsMigration}>{q}</button>)}
              </div>
            </div>
          )}
          {ov.facts.map(f => (
            <div key={f.id} className="akn-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{f.question}</p>
                <p style={{ margin: '3px 0 0', fontSize: 13.5, color: '#52525b', lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{f.answer}</p>
              </div>
              <button className="akn-iconbtn" aria-label="Edit fact" onClick={() => openFact({ id: f.id, question: f.question, answer: f.answer })}><Icon name="edit" size={15} /></button>
              <button className="akn-iconbtn danger" aria-label="Delete fact" onClick={() => deleteFact(f.id)}><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Files */}
      <div className="akn-sec">
        <h2>Files</h2>
        <p className="akn-sub">Price lists, care guides, policies. Colvy AI reads the text; the file itself isn&rsquo;t kept.</p>
        <div className="akn-card" style={{ marginTop: 14 }}>
          <div className={`akn-drop ${dragOver ? 'over' : ''}`} role="button" tabIndex={0}
            onClick={() => !uploading && !ov.needsMigration && fileRef.current?.click()}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !uploading) fileRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); if (!ov.needsMigration) upload(e.dataTransfer.files?.[0]) }}>
            <span style={{ color: '#e2553f', display: 'inline-flex' }}>{uploading ? <span className="akn-spin" /> : <Icon name="upload" size={22} />}</span>
            <p style={{ margin: '8px 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{uploading ? `Reading ${uploading}…` : 'Drop a file or click to upload'}</p>
            <p className="akn-sub" style={{ fontSize: 12 }}>PDF, TXT, MD or CSV · up to 10 MB</p>
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.csv,application/pdf,text/plain,text/markdown,text/csv" hidden onChange={e => upload(e.target.files?.[0])} />
          </div>
          {ov.files.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {ov.files.map(f => (
                <div key={f.id} className="akn-row" style={{ alignItems: 'center' }}>
                  <span className="akn-ico" style={{ width: 32, height: 32 }}><Icon name="file" size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{f.pages > 1 ? `${f.pages} pages · ` : ''}{f.chunks} section{f.chunks === 1 ? '' : 's'} · {kb(f.size_bytes || 0)} · added {ago(f.created_at)}</p>
                  </div>
                  <button className="akn-iconbtn danger" aria-label={`Remove ${f.name}`} onClick={() => deleteFile(f.id, f.name)}><Icon name="trash" size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Privacy */}
      <div className="akn-card akn-sec" style={{ display: 'flex', gap: 12, background: '#fafafa' }}>
        <span style={{ color: '#52525b', marginTop: 1 }}><Icon name="shield" /></span>
        <p className="akn-sub"><strong style={{ color: 'var(--ink)' }}>Never stored here:</strong> customer details, orders, stock levels, prices and form responses. Colvy AI looks those up live, and only for the customer it&rsquo;s talking to, so one customer&rsquo;s details can never show up in a reply to someone else.</p>
      </div>

      {notice && (
        <div className="akn-toast akn-in" role="status" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span>{notice}</span>
          {undo && <button onClick={() => { const f = undo; setUndo(null); f() }} style={{ border: 'none', background: 'transparent', color: '#ffb4a6', fontWeight: 800, fontSize: 13.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Undo</button>}
        </div>
      )}
    </div>
  )
}
