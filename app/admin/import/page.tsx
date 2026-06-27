'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

// Platform detection patterns
const PLATFORMS = [
  {
    id: 'canny',
    name: 'Canny',
    color: '#217CE8',
    bg: '#EBF4FF',
    pattern: /canny\.io/,
    logo: 'https://asset.brandfetch.io/id6GKdqkYZ/idIWt2DNNI.png',
    supports: ['posts', 'votes', 'comments', 'categories', 'statuses', 'changelog'],
    description: 'Import feedback posts, votes, comments and changelog',
  },
  {
    id: 'frill',
    name: 'Frill',
    color: '#FF7A6B',
    bg: '#FFF0EE',
    pattern: /frill\.co/,
    logo: null,
    supports: ['ideas', 'votes', 'comments', 'statuses', 'topics', 'announcements'],
    description: 'Import ideas, votes, topics and announcements',
  },
  {
    id: 'featurebase',
    name: 'Featurebase',
    color: '#6366F1',
    bg: '#EEF2FF',
    pattern: /featurebase\.app/,
    logo: null,
    supports: ['posts', 'votes', 'comments', 'categories', 'roadmap', 'changelog'],
    description: 'Import feedback posts, roadmap and changelog',
  },
  {
    id: 'uservoice',
    name: 'UserVoice',
    color: '#F59E0B',
    bg: '#FFFBEB',
    pattern: /uservoice\.com/,
    logo: null,
    supports: ['suggestions', 'votes', 'comments', 'categories', 'statuses'],
    description: 'Import suggestions, votes and categories',
  },
  {
    id: 'productboard',
    name: 'Productboard',
    color: '#E8454A',
    bg: '#FEF2F2',
    pattern: /productboard\.com/,
    logo: null,
    supports: ['features', 'insights', 'roadmap', 'notes'],
    description: 'Import features, insights and roadmap',
  },
  {
    id: 'typeform',
    name: 'Typeform',
    color: '#262627',
    bg: '#F9FAFB',
    pattern: /typeform\.com/,
    logo: null,
    supports: ['responses', 'questions'],
    description: 'Import survey responses as ideas',
  },
  {
    id: 'intercom',
    name: 'Intercom Articles',
    color: '#286EFA',
    bg: '#EFF6FF',
    pattern: /intercom\.com|intercom\.help/,
    logo: null,
    supports: ['articles', 'categories'],
    description: 'Import help articles and categories',
  },
  {
    id: 'zendesk',
    name: 'Zendesk Help Center',
    color: '#03363D',
    bg: '#ECFDF5',
    pattern: /zendesk\.com/,
    logo: null,
    supports: ['articles', 'categories', 'sections'],
    description: 'Import help articles and knowledge base',
  },
  {
    id: 'notion',
    name: 'Notion',
    color: '#000000',
    bg: '#F9FAFB',
    pattern: /notion\.so|notion\.site/,
    logo: null,
    supports: ['pages', 'databases', 'blocks'],
    description: 'Import Notion pages and databases',
  },
]

// SVG icons
const CheckIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const AlertIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const ArrowRightIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
const LinkIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
const ImportIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const SpinnerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite' }}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
)

type Step = 'input' | 'preview' | 'importing' | 'done'

type ImportPreview = {
  platform: typeof PLATFORMS[0]
  url: string
  counts: Record<string, number>
  warnings: string[]
  unsupported: string[]
  items: any[]
  apiRequired: boolean
  credentials?: Record<string, string>
}

type ImportResult = {
  imported: Record<string, number>
  skipped: number
  errors: string[]
  duration: number
}

export default function ImportPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [detected, setDetected] = useState<typeof PLATFORMS[0] | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [credentials, setCredentials] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [importProgress, setImportProgress] = useState(0)
  const [importStatus, setImportStatus] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [company, setCompany] = useState<any>(null)
  const progressInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      const { data: co } = await (supabase as any).from('companies').select('*').eq('owner_id', u.id).single()
      setCompany(co)
    })
    return () => { if (progressInterval.current) clearInterval(progressInterval.current) }
  }, [])

  // Auto-detect platform from URL
  const handleUrlChange = (val: string) => {
    setUrl(val)
    setError('')
    const platform = PLATFORMS.find(p => p.pattern.test(val))
    setDetected(platform || null)
  }

  const handleAnalyze = async () => {
    if (!url.trim()) { setError('Please enter a URL'); return }
    if (!detected) { setError('URL not recognized. Try a URL from Canny, Frill, Featurebase, UserVoice, Productboard, Typeform, Intercom, Zendesk or Notion.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/import/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, platform: detected.id, credentials }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      setPreview({ ...data, platform: detected, url })
      // Default all available types to selected
      const sel: Record<string, boolean> = {}
      Object.keys(data.counts || {}).forEach(k => { sel[k] = true })
      setSelected(sel)
      setStep('preview')
    } catch (e: any) {
      setError('Failed to analyze URL. Check your connection and try again.')
    }
    setLoading(false)
  }

  const handleImport = async () => {
    if (!preview || !company) return
    setStep('importing')
    setImportProgress(0)
    setImportStatus('Connecting to ' + preview.platform.name + '...')

    // Simulate progress while real import runs
    const statuses = [
      'Fetching data from ' + preview.platform.name + '...',
      'Parsing items...',
      'Detecting duplicates...',
      'Importing ideas...',
      'Importing statuses and topics...',
      'Importing announcements...',
      'Importing help articles...',
      'Finalizing...',
    ]
    let si = 0
    progressInterval.current = setInterval(() => {
      setImportProgress(p => {
        const next = Math.min(p + Math.random() * 8, 90)
        si = Math.floor((next / 90) * statuses.length)
        setImportStatus(statuses[Math.min(si, statuses.length - 1)])
        return next
      })
    }, 600)

    try {
      const res = await fetch('/api/import/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: preview.url,
          platform: preview.platform.id,
          companyId: company.id,
          selected,
          credentials,
        }),
      })
      const data = await res.json()
      clearInterval(progressInterval.current!)
      setImportProgress(100)
      setImportStatus('Import complete!')
      await new Promise(r => setTimeout(r, 800))
      setResult(data)
      setStep('done')
    } catch (e: any) {
      clearInterval(progressInterval.current!)
      setError('Import failed: ' + e.message)
      setStep('preview')
    }
  }

  const ENTITY_LABELS: Record<string, string> = {
    ideas: 'Ideas / Posts',
    posts: 'Posts',
    votes: 'Votes',
    comments: 'Comments',
    statuses: 'Statuses',
    topics: 'Topics / Categories',
    categories: 'Categories',
    announcements: 'Announcements',
    changelog: 'Changelog Posts',
    articles: 'Help Articles',
    roadmap: 'Roadmap Items',
    features: 'Features',
    suggestions: 'Suggestions',
    responses: 'Survey Responses',
    pages: 'Pages',
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes fadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}} .fade-in{animation:fadeIn 0.4s ease forwards}`}</style>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--coral)' }}>
            <ImportIcon />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', lineHeight: 1.2 }}>Import from Another Platform</h1>
            <p style={{ fontSize: 14, color: 'var(--slate)', marginTop: 2 }}>Migrate your feedback, roadmap and help centre in minutes</p>
          </div>
        </div>
      </div>

      {/* Steps indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
        {[
          { key: 'input', label: 'Paste URL' },
          { key: 'preview', label: 'Preview' },
          { key: 'importing', label: 'Import' },
          { key: 'done', label: 'Complete' },
        ].map((s, i, arr) => {
          const steps: Step[] = ['input', 'preview', 'importing', 'done']
          const current = steps.indexOf(step)
          const thisStep = steps.indexOf(s.key as Step)
          const done = thisStep < current
          const active = thisStep === current
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < arr.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: done ? '#10b981' : active ? 'var(--coral)' : 'var(--border)',
                  color: done || active ? '#fff' : 'var(--slate)', fontSize: 12, fontWeight: 700, flexShrink: 0,
                }}>
                  {done ? <CheckIcon /> : i + 1}
                </div>
                <span style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? 'var(--ink)' : 'var(--slate)', whiteSpace: 'nowrap' }}>{s.label}</span>
              </div>
              {i < arr.length - 1 && <div style={{ flex: 1, height: 1, background: done ? '#10b981' : 'var(--border)', minWidth: 20 }} />}
            </div>
          )
        })}
      </div>

      {/* STEP 1: URL Input */}
      {step === 'input' && (
        <div className="fade-in">
          {/* Platform cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 28 }}>
            {PLATFORMS.map(p => (
              <div key={p.id}
                onClick={() => {
                  // Prefill URL hint
                  if (!url) setUrl(`https://your-board.${p.id === 'intercom' ? 'intercom.help' : p.id === 'notion' ? 'notion.so' : p.id + '.io'}/`)
                  handleUrlChange(url || `https://your-board.${p.id === 'intercom' ? 'intercom.help' : p.id === 'notion' ? 'notion.so' : p.id + '.io'}/`)
                }}
                style={{
                  padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${detected?.id === p.id ? p.color : 'var(--border)'}`,
                  background: detected?.id === p.id ? p.bg : '#fff',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                  {detected?.id === p.id && <span style={{ marginLeft: 'auto', color: p.color }}><CheckIcon /></span>}
                </div>
                <p style={{ fontSize: 11, color: 'var(--slate)', lineHeight: 1.4 }}>{p.description}</p>
              </div>
            ))}
          </div>

          {/* URL input */}
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: 24, marginBottom: 20 }}>
            <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', display: 'block', marginBottom: 10 }}>
              Your board URL
            </label>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--slate)' }}>
                <LinkIcon />
              </div>
              <input
                value={url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder="https://yourcompany.canny.io or https://feedback.example.com"
                onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
                style={{
                  width: '100%', padding: '12px 16px 12px 44px',
                  borderRadius: 14, border: `1.5px solid ${detected ? 'var(--coral)' : 'var(--border)'}`,
                  fontSize: 15, outline: 'none', boxSizing: 'border-box',
                  background: '#fafafa', color: 'var(--ink)',
                  boxShadow: detected ? '0 0 0 3px var(--peach)' : 'none', transition: 'all 0.2s',
                }}
              />
              {detected && (
                <div style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 6, background: detected.bg, padding: '4px 10px', borderRadius: 999 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: detected.color }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: detected.color }}>{detected.name} detected</span>
                </div>
              )}
            </div>

            {/* Credential fields for platforms that need API keys */}
            {detected && ['canny', 'uservoice', 'productboard', 'typeform', 'featurebase'].includes(detected.id) && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 10 }}>
                  🔑 {detected.name} requires an API key for full import
                </p>
                {detected.id === 'canny' && (
                  <input value={credentials.apiKey || ''} onChange={e => setCredentials(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="Canny API Key (Settings → API)"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                )}
                {detected.id === 'featurebase' && (
                  <input value={credentials.apiKey || ''} onChange={e => setCredentials(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="Featurebase API Key"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                )}
                {detected.id === 'typeform' && (
                  <input value={credentials.apiKey || ''} onChange={e => setCredentials(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="Typeform Personal Access Token"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                )}
                {detected.id === 'productboard' && (
                  <input value={credentials.apiKey || ''} onChange={e => setCredentials(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="Productboard API Token"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }} />
                )}
                {detected.id === 'uservoice' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={credentials.apiKey || ''} onChange={e => setCredentials(p => ({ ...p, apiKey: e.target.value }))}
                      placeholder="API Key" style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }} />
                    <input value={credentials.apiSecret || ''} onChange={e => setCredentials(p => ({ ...p, apiSecret: e.target.value }))}
                      placeholder="API Secret" style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }} />
                  </div>
                )}
                <p style={{ fontSize: 11, color: '#92400e', marginTop: 8 }}>Without an API key, we'll attempt to import publicly accessible data only.</p>
              </div>
            )}

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fca5a5', marginBottom: 12, color: '#dc2626', fontSize: 13 }}>
                <AlertIcon /> {error}
              </div>
            )}

            <button onClick={handleAnalyze} disabled={loading || !url.trim()}
              style={{
                width: '100%', padding: '13px', borderRadius: 14, background: 'var(--coral)',
                color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: loading ? 'wait' : 'pointer',
                opacity: (!url.trim() || loading) ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {loading ? <><SpinnerIcon /> Analyzing...</> : <><ArrowRightIcon /> Analyze & Preview Import</>}
            </button>
          </div>

          <p style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'center' }}>
            We only read your data — nothing is modified on your original platform.
          </p>
        </div>
      )}

      {/* STEP 2: Preview */}
      {step === 'preview' && preview && (
        <div className="fade-in">
          {/* Platform badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderRadius: 14, background: preview.platform.bg, border: `1px solid ${preview.platform.color}30`, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: preview.platform.color }} />
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Found data on {preview.platform.name}</p>
              <p style={{ fontSize: 12, color: 'var(--slate)' }}>{url}</p>
            </div>
            <button onClick={() => setStep('input')} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--slate)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Change URL
            </button>
          </div>

          {/* Counts */}
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>What we found</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {Object.entries(preview.counts).map(([type, count]) => (
                <div key={type} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, background: selected[type] ? 'var(--peach)' : '#fafafa', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button onClick={() => setSelected(p => ({ ...p, [type]: !p[type] }))}
                      style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${selected[type] ? 'var(--coral)' : 'var(--border)'}`, background: selected[type] ? 'var(--coral)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#fff' }}>
                      {selected[type] && <CheckIcon />}
                    </button>
                    <span style={{ fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                      {ENTITY_LABELS[type] || type}
                    </span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: selected[type] ? 'var(--coral)' : 'var(--slate)', background: selected[type] ? 'white' : 'var(--border)', padding: '2px 10px', borderRadius: 999 }}>
                    {count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 13, color: 'var(--slate)' }}>
                <strong style={{ color: 'var(--ink)' }}>{Object.entries(selected).filter(([, v]) => v).reduce((s, [k]) => s + (preview.counts[k] || 0), 0).toLocaleString()}</strong> items selected
              </p>
              <button onClick={() => setSelected(p => { const n = { ...p }; Object.keys(n).forEach(k => n[k] = true); return n })}
                style={{ fontSize: 12, color: 'var(--coral)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Select all
              </button>
            </div>
          </div>

          {/* Warnings */}
          {preview.warnings.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#92400e', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertIcon /> Import warnings
              </p>
              {preview.warnings.map((w, i) => (
                <p key={i} style={{ fontSize: 13, color: '#92400e', marginBottom: 4 }}>• {w}</p>
              ))}
            </div>
          )}

          {/* Unsupported fields */}
          {preview.unsupported.length > 0 && (
            <div style={{ background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--slate)', marginBottom: 8 }}>Fields not supported in Colvy (will be skipped)</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {preview.unsupported.map(f => (
                  <span key={f} style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: '#fff', border: '1px solid var(--border)', color: 'var(--slate)' }}>{f}</span>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleImport} disabled={Object.values(selected).every(v => !v)}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, background: 'var(--coral)',
              color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer',
              opacity: Object.values(selected).every(v => !v) ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            <ImportIcon /> Start Import
          </button>
          <p style={{ fontSize: 12, color: 'var(--slate)', textAlign: 'center', marginTop: 10 }}>
            This runs in the background. You can leave this page — we'll notify you when done.
          </p>
        </div>
      )}

      {/* STEP 3: Importing */}
      {step === 'importing' && (
        <div className="fade-in" style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', color: 'var(--coral)' }}>
            <SpinnerIcon />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Importing your data</h2>
          <p style={{ fontSize: 14, color: 'var(--slate)', marginBottom: 32 }}>{importStatus}</p>

          {/* Progress bar */}
          <div style={{ background: 'var(--border)', borderRadius: 999, height: 8, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, var(--coral), #ff9a8b)', borderRadius: 999, width: `${importProgress}%`, transition: 'width 0.6s ease' }} />
          </div>
          <p style={{ fontSize: 13, color: 'var(--slate)' }}>{Math.round(importProgress)}% complete</p>
        </div>
      )}

      {/* STEP 4: Done — Migration Report */}
      {step === 'done' && result && (
        <div className="fade-in">
          {/* Success hero */}
          <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: 'var(--ink)', marginBottom: 8 }}>Migration complete!</h2>
            <p style={{ fontSize: 15, color: 'var(--slate)' }}>
              Imported in {result.duration}s from {preview?.platform.name}
            </p>
          </div>

          {/* Report card */}
          <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Migration Report</h3>

            {/* Imported counts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}>
              {Object.entries(result.imported).map(([type, count]) => (
                <div key={type} style={{ padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac' }}>
                  <p style={{ fontSize: 22, fontWeight: 900, color: '#16a34a' }}>{(count as number).toLocaleString()}</p>
                  <p style={{ fontSize: 13, color: '#166534' }}>{ENTITY_LABELS[type] || type} imported</p>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 12, background: '#fafafa', marginBottom: result.errors.length > 0 ? 16 : 0 }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>
                  {Object.values(result.imported).reduce((s, v) => s + (v as number), 0).toLocaleString()}
                </p>
                <p style={{ fontSize: 12, color: 'var(--slate)' }}>Total imported</p>
              </div>
              <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{result.skipped}</p>
                <p style={{ fontSize: 12, color: 'var(--slate)' }}>Skipped (duplicates)</p>
              </div>
              <div style={{ flex: 1, textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: result.errors.length > 0 ? '#dc2626' : 'var(--ink)' }}>
                  {result.errors.length}
                </p>
                <p style={{ fontSize: 12, color: 'var(--slate)' }}>Errors</p>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 12, padding: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>Import errors</p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} style={{ fontSize: 12, color: '#dc2626', marginBottom: 3 }}>• {e}</p>
                ))}
                {result.errors.length > 5 && <p style={{ fontSize: 12, color: '#dc2626' }}>...and {result.errors.length - 5} more</p>}
              </div>
            )}
          </div>

          {/* CTA buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="/" style={{ flex: 1, padding: '13px', borderRadius: 14, background: 'var(--coral)', color: '#fff', fontWeight: 700, fontSize: 14, textDecoration: 'none', textAlign: 'center', display: 'block' }}>
              View Your Ideas Board →
            </Link>
            <button onClick={() => { setStep('input'); setUrl(''); setPreview(null); setResult(null); setDetected(null) }}
              style={{ padding: '13px 20px', borderRadius: 14, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
