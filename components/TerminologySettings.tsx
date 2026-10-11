'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { TERM_GROUPS, termFor, TERM_DEFAULTS } from '@/lib/terminology'
import { confirmDialog } from '@/components/ConfirmDialog'

// Settings → Terminology. Rename the words customers see on the board, help
// centre and widget (lib/terminology), with a live preview. Saved by the
// Settings page's autosave as `termValues` — only changed terms are kept.

const ResetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><polyline points="3 3 3 9 9 9" /></svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
)

export default function TerminologySettings({ values, onChange, saving }: {
  values: Record<string, string>
  onChange: (next: Record<string, string>) => void
  saving?: boolean
}) {
  const [q, setQ] = useState('')
  const T = (k: string) => termFor(values, k)
  const changed = Object.keys(values || {}).filter(k => k in TERM_DEFAULTS && (values[k] || '').trim() && values[k].trim() !== TERM_DEFAULTS[k])
  const set = (k: string, v: string) => {
    const next = { ...(values || {}) }
    if (!v.trim() || v.trim() === TERM_DEFAULTS[k]) delete next[k]
    else next[k] = v.slice(0, 80)
    onChange(next)
  }
  const resetAll = async () => {
    if (!(await confirmDialog({ title: 'Reset all terms?', message: 'Every term goes back to the Colvy default wording.', confirmLabel: 'Reset all' }))) return
    onChange({})
  }

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return TERM_GROUPS
    return TERM_GROUPS.map(g => ({ ...g, terms: g.terms.filter(t => [t.default, t.where, values?.[t.key] || '', g.label].some(x => x.toLowerCase().includes(s))) }))
      .filter(g => g.terms.length)
  }, [q, values])

  return (
    <div className="term-wrap">
      <div className="term-main">
        <div className="bg-white rounded-2xl border p-5 md:p-6" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div style={{ minWidth: 0 }}>
              <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Terminology</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>
                Use your own words on your board, help centre and website widget. Leave a field empty to keep the default.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs font-semibold" style={{ color: 'var(--slate)' }} aria-live="polite">
                {saving ? 'Saving…' : changed.length ? `${changed.length} changed` : 'All default'}
              </span>
              {changed.length > 0 && (
                <button type="button" onClick={resetAll} className="term-reset-all">
                  <ResetIcon /> Reset all
                </button>
              )}
            </div>
          </div>
          <div className="relative mt-4">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)' }}><SearchIcon /></span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search terms…" aria-label="Search terms"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none" style={{ borderColor: 'var(--border)' }} />
          </div>
        </div>

        {groups.map(g => (
          <section key={g.id} className="bg-white rounded-2xl border mt-4 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            <div className="px-5 md:px-6 pt-5 pb-3">
              <h3 className="font-bold text-sm" style={{ color: 'var(--ink)' }}>{g.label}</h3>
              <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{g.description}</p>
            </div>
            <ul>
              {g.terms.map(t => {
                const val = values?.[t.key] || ''
                const isChanged = !!val.trim() && val.trim() !== t.default
                return (
                  <li key={t.key} className="term-row">
                    <div style={{ minWidth: 0 }}>
                      <label htmlFor={`term-${t.key}`} className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.default}</label>
                      <span className="block text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{t.where}</span>
                    </div>
                    <div className="term-field">
                      <input id={`term-${t.key}`} value={val} onChange={e => set(t.key, e.target.value)} placeholder={t.default} maxLength={80}
                        className="term-input" style={{ borderColor: isChanged ? 'var(--coral)' : 'var(--border)' }} />
                      <button type="button" onClick={() => set(t.key, '')} className="term-reset" title="Back to default" aria-label={`Reset ${t.default} to default`}
                        style={{ visibility: isChanged ? 'visible' : 'hidden' }}>
                        <ResetIcon />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: 'var(--slate)' }}>No terms match “{q}”.</p>
        )}

        <p className="text-xs mt-4 px-1" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>
          Status names (like “Planned” or “Shipped”) are set per status on the{' '}
          <Link href="/admin/statuses" style={{ color: 'var(--coral)', fontWeight: 600 }}>Statuses</Link> page.
        </p>
      </div>

      {/* Live preview — what customers see, updating as you type. */}
      <aside className="term-preview" aria-label="Preview">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Preview</p>
        <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-1 px-3 py-2.5 border-b overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {['nav_ideas', 'nav_roadmap', 'nav_updates', 'nav_help'].map((k, i) => (
              <span key={k} className="px-2.5 py-1 rounded-lg text-xs font-medium truncate"
                style={{ background: i === 0 ? 'var(--peach)' : 'transparent', color: i === 0 ? 'var(--coral)' : 'var(--slate)' }}>{T(k)}</span>
            ))}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div style={{ minWidth: 0 }}>
                <p className="text-lg font-bold truncate" style={{ color: 'var(--ink)' }}>{T('ideas_title')}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>12 {T('idea_plural')} total</p>
              </div>
              <span className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white shrink-0 truncate" style={{ background: 'var(--coral)', maxWidth: '55%' }}>+ {T('submit_idea')}</span>
            </div>
            <div className="mt-3 px-3 py-2 rounded-lg text-xs truncate" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>Search {T('idea_plural')}…</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {['statuses_heading', 'topics_heading'].map(k => (
                <div key={k} className="rounded-lg border px-2.5 py-2" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest truncate" style={{ color: 'var(--slate)' }}>{T(k)}</p>
                  <div className="mt-1.5 h-1.5 rounded-full w-3/4" style={{ background: 'var(--canvas)' }} />
                  <div className="mt-1 h-1.5 rounded-full w-1/2" style={{ background: 'var(--canvas)' }} />
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{T('roadmap_title')}</p>
              <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{T('roadmap_subtitle')}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['widget_feedback', 'widget_chat', 'nav_help'].map(k => (
                <span key={k} className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: 'var(--canvas)', color: 'var(--ink)' }}>{T(k)}</span>
              ))}
              <span className="text-[11px] self-center" style={{ color: 'var(--slate)' }}>widget tabs</span>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        .term-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:16px}
        @media (min-width:1024px){.term-wrap{grid-template-columns:minmax(0,1fr) 300px;align-items:start}.term-preview{position:sticky;top:16px}}
        @media (max-width:1023px){.term-preview{order:-1}}
        .term-row{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;padding:12px 20px;border-top:1px solid var(--border)}
        @media (min-width:640px){.term-row{grid-template-columns:minmax(0,1fr) 260px;align-items:center;padding:12px 24px}}
        .term-field{display:flex;align-items:center;gap:6px;min-width:0}
        .term-input{flex:1;min-width:0;font-size:14px;padding:8px 12px;border-radius:10px;border:1px solid var(--border);outline:none;transition:border-color .2s ease,box-shadow .2s ease;background:#fff}
        .term-input:focus{border-color:var(--coral);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 15%,transparent)}
        .term-reset{flex-shrink:0;width:30px;height:30px;border-radius:8px;border:none;background:transparent;color:var(--slate);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s ease,color .15s ease}
        .term-reset:hover{background:var(--canvas);color:var(--coral)}
        .term-reset-all{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--ink);font-size:13px;font-weight:600;cursor:pointer;transition:background .15s ease}
        .term-reset-all:hover{background:var(--canvas)}
      `}</style>
    </div>
  )
}
