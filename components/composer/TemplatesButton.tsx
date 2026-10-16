'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Popover, { usePopover } from './Popover'
import { fillTemplateVars, filterTemplates, ownTemplates, type ReplyTemplate, type TemplateVars } from '@/lib/composer-templates'

// The composer's lightning button: this company's saved replies (Settings →
// Time Savers → Quick Response). Search, see each one's title and a preview
// with the customer's details filled in, and insert it at the cursor.

export const MANAGE_TEMPLATES_HREF = '/admin/crm-settings/power-ups?tool=quick-response'

// Last list per company, so reopening shows it straight away while it refreshes.
const cache = new Map<string, ReplyTemplate[]>()
const names = new Map<string, string>()

/** The business name, for {company} when the caller didn't pass one. */
function useCompanyName(companyId: string | null, known: string | null | undefined) {
  const [name, setName] = useState<string>(() => (companyId && names.get(companyId)) || '')
  useEffect(() => {
    if (known || !companyId) return
    if (names.has(companyId)) { setName(names.get(companyId) || ''); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle()
        if (data?.name) names.set(companyId, data.name)
        if (!cancelled) setName(data?.name || '')
      } catch {}
    })()
    return () => { cancelled = true }
  }, [companyId, known])
  return known || name
}

export function useReplyTemplates(companyId: string | null, refreshKey: unknown) {
  const [list, setList] = useState<ReplyTemplate[] | null>(() => (companyId && cache.get(companyId)) || null)
  useEffect(() => {
    if (!companyId) { setList([]); return }
    setList(cache.get(companyId) || null)
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await (supabase as any).from('quick_responses').select('*').eq('company_id', companyId).order('created_at', { ascending: true })
        const rows = ownTemplates<ReplyTemplate>(data, companyId)
        cache.set(companyId, rows)
        if (!cancelled) setList(rows)
      } catch { if (!cancelled) setList(l => l || []) }
    })()
    // A late answer for a company we've since left must not land here.
    return () => { cancelled = true }
  }, [companyId, refreshKey])
  return list
}

const BoltIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)
const GearIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
)

export interface TemplatesPanelProps {
  templates: ReplyTemplate[] | null
  vars: TemplateVars
  query: string
  onQuery: (q: string) => void
  onPick: (text: string) => void
}

/** The list inside the popover (separate so it renders on its own in tests). */
export function TemplatesPanel({ templates, vars, query, onQuery, onPick }: TemplatesPanelProps) {
  const shown = useMemo(() => filterTemplates(templates || [], query), [templates, query])
  return (
    <div>
      <div style={{ position: 'relative', margin: '2px 2px 6px' }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', color: 'var(--slate)', pointerEvents: 'none' }}><SearchIcon /></span>
        <input data-autofocus value={query} onChange={e => onQuery(e.target.value)} placeholder="Search templates" aria-label="Search templates"
          onKeyDown={e => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); onPick(fillTemplateVars(shown[0].body, vars)) } }}
          style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', background: 'var(--canvas)', padding: '8px 10px 8px 31px', fontSize: 13, color: 'var(--ink)', fontFamily: 'inherit' }} />
      </div>
      {templates === null && <p style={{ margin: 0, padding: '10px', fontSize: 13, color: 'var(--slate)' }}>Loading…</p>}
      {templates && templates.length === 0 && (
        <p style={{ margin: 0, padding: '10px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.45 }}>No templates yet. Save answers you send often, then insert them here in one click.</p>
      )}
      {templates && templates.length > 0 && shown.length === 0 && (
        <p style={{ margin: 0, padding: '10px', fontSize: 13, color: 'var(--slate)' }}>No templates match “{query.trim()}”.</p>
      )}
      <div role="listbox" aria-label="Templates">
        {shown.map(t => {
          const filled = fillTemplateVars(t.body, vars)
          const sc = String(t.shortcut || '').replace(/^\//, '')
          return (
            <button key={t.id} type="button" role="option" aria-selected={false} data-pop-item className="cpop-item"
              onMouseDown={e => e.preventDefault()} onClick={() => onPick(filled)}
              style={{ display: 'block', padding: '8px 10px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{t.title || (sc ? `/${sc}` : 'Template')}</span>
                {sc && t.title && <code style={{ fontSize: 11, color: 'var(--coral)', background: 'var(--canvas)', padding: '1px 6px', borderRadius: 5, flexShrink: 0 }}>/{sc}</code>}
              </span>
              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: 12, lineHeight: 1.45, color: 'var(--slate)', marginTop: 2, whiteSpace: 'pre-line' }}>{filled}</span>
            </button>
          )
        })}
      </div>
      <div style={{ borderTop: '1px solid var(--border)', margin: '6px -6px 0', padding: '6px 6px 0' }}>
        <a href={MANAGE_TEMPLATES_HREF} target="_blank" rel="noopener noreferrer" title="Opens in a new tab, so this reply stays as it is" data-pop-item className="cpop-item" style={{ textDecoration: 'none', color: 'var(--slate)', fontSize: 12.5, fontWeight: 700 }}>
          <GearIcon /> Manage templates
        </a>
      </div>
    </div>
  )
}

export default function TemplatesButton({ companyId, vars, onInsert, buttonStyle }: {
  companyId: string | null
  vars: TemplateVars
  onInsert: (text: string) => void
  buttonStyle?: (open: boolean) => React.CSSProperties
}) {
  const pop = usePopover()
  const [query, setQuery] = useState('')
  const [opens, setOpens] = useState(0)          // refetch each time it opens (never stale)
  const templates = useReplyTemplates(companyId, opens)
  const company = useCompanyName(companyId, vars.company)
  const filledVars: TemplateVars = { ...vars, company }
  const close = () => { pop.close(); setQuery('') }
  if (!companyId) return null
  return (
    <>
      <button type="button" ref={pop.anchorRef} title="Insert a template" aria-label="Insert a template" aria-haspopup="listbox" aria-expanded={pop.open}
        onMouseDown={e => e.preventDefault()}
        onClick={() => { if (pop.open) close(); else { setOpens(n => n + 1); pop.setOpen(true) } }}
        style={buttonStyle?.(pop.open)}>
        <BoltIcon />
      </button>
      <Popover open={pop.open} onClose={close} anchorRef={pop.anchorRef} width={340} label="Templates" role="dialog">
        <p className="cpop-head">Templates</p>
        <TemplatesPanel templates={templates} vars={filledVars} query={query} onQuery={setQuery} onPick={t => { close(); onInsert(t) }} />
      </Popover>
    </>
  )
}
