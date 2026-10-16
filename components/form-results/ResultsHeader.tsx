'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons'

export type ResultsTab = 'summary' | 'responses' | 'paths'

export function ResultsHeader({ formId, title, isPublished, tab, onTab, responseCount, showPaths }: {
  formId: string
  title: string
  isPublished: boolean
  tab: ResultsTab
  onTab: (t: ResultsTab) => void
  responseCount: number
  showPaths: boolean
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async () => {
    const url = `${window.location.origin}/forms/${formId}`
    try { await navigator.clipboard.writeText(url) } catch {
      const t = document.createElement('textarea'); t.value = url; document.body.appendChild(t); t.select()
      try { document.execCommand('copy') } catch {}
      t.remove()
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  const tabs: { key: ResultsTab; label: string; count?: number }[] = [
    { key: 'summary', label: 'Summary' },
    { key: 'responses', label: 'Responses', count: responseCount },
    ...(showPaths ? [{ key: 'paths' as const, label: 'Paths' }] : []),
  ]

  return (
    <div>
      <div className="fr-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: '1 1 320px' }}>
          <Link href="/admin/forms" className="fr-icon-btn" aria-label="Back to forms" title="Forms">
            <Icon name="back" size={18} />
          </Link>
          <h1 className="fr-title" title={title}>{title || 'Untitled form'}</h1>
          <span className="fr-pill" style={{ background: isPublished ? '#dcfce7' : '#f3f4f6', color: isPublished ? '#16a34a' : '#6b7280' }}>
            {isPublished ? 'Live' : 'Draft'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Link href={`/admin/forms/${formId}`} className="fr-btn"><Icon name="edit" size={15} />Edit form</Link>
          {isPublished ? (
            <a href={`/forms/${formId}`} target="_blank" rel="noopener noreferrer" className="fr-btn"><Icon name="external" size={15} />View form</a>
          ) : (
            <span className="fr-btn" aria-disabled="true" title="Publish the form to share it"><Icon name="external" size={15} />View form</span>
          )}
          <button type="button" className="fr-btn" onClick={copy} aria-live="polite">
            <Icon name={copied ? 'check' : 'link'} size={15} />{copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      </div>
      <div className="fr-tabs" role="tablist" aria-label="Results views">
        {tabs.map(t => (
          <button key={t.key} type="button" role="tab" id={`fr-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`fr-panel-${t.key}`}
            className="fr-tab" onClick={() => onTab(t.key)}>
            {t.label}{t.count !== undefined && <span className="fr-tab-count">({t.count.toLocaleString('en-AU')})</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
