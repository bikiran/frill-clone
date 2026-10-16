'use client'

// The poll builder (detail page → Edit): question, type, answers (with
// optional picture and note), settings, and a live preview of what customers
// see. Answers that already have votes keep their wording, because votes are
// stored against it.

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ConfirmDialog'
import {
  POLL_TYPES, compactSettings, parsePollOptions, pollTypeOf, ratingTop, settingsOf,
  type EngageSettings, type PollOption, type PollType, type EngageStatus,
} from '@/lib/engage-core'
import type { PublicPoll } from '@/lib/engage-server'
import { PublicPollCard, PublicShell } from './PublicViews'
import { SettingsFields } from './SettingsFields'
import { EngageIcon } from './icons'

export type PollDraft = { question: string; description: string; image_url: string; poll_type: PollType; options: PollOption[]; settings: EngageSettings; scale: number }

export function pollDraftOf(row: any): PollDraft {
  const type = pollTypeOf(row)
  const opts = parsePollOptions(row?.options)
  return {
    question: String(row?.question || ''),
    description: String(row?.description || ''),
    image_url: String(row?.image_url || ''),
    poll_type: type,
    options: opts.length || type === 'rating' ? opts : [{ text: '' }, { text: '' }],
    settings: settingsOf(row),
    scale: ratingTop(row),
  }
}

/** Fields to save for a draft, and what's missing before it can go live. */
export function pollFields(d: PollDraft): { fields: Record<string, any>; problems: string[] } {
  const options = d.poll_type === 'rating' ? [] : d.options
    .map(o => ({ text: o.text.trim(), image: (o.image || '').trim(), description: (o.description || '').trim() }))
    .filter(o => o.text)
  const problems: string[] = []
  if (!d.question.trim()) problems.push('Add a question.')
  if (d.poll_type !== 'rating' && options.length < 2) problems.push('Add at least two answers.')
  if (new Set(options.map(o => o.text.toLowerCase())).size !== options.length) problems.push('Two answers have the same wording.')
  const settings = d.poll_type === 'rating' ? compactSettings({ ...d.settings, scale: d.scale === 10 ? 10 : 5 }, true) : compactSettings({ ...d.settings, scale: 10 })
  return {
    fields: { question: d.question.trim(), description: d.description.trim() || null, image_url: d.image_url || null, poll_type: d.poll_type, options, settings },
    problems,
  }
}

export function PollEditor({ draft, onChange, votedOptions, hasVotes, hasSettingsColumn, status, company }: {
  draft: PollDraft
  onChange: (d: PollDraft) => void
  /** Answer texts that already have votes. */
  votedOptions: Set<string>
  hasVotes: boolean
  hasSettingsColumn: boolean
  status: EngageStatus
  company: PublicPoll['company']
}) {
  const [uploading, setUploading] = useState('')
  const [uploadError, setUploadError] = useState('')
  const set = <K extends keyof PollDraft>(k: K, v: PollDraft[K]) => onChange({ ...draft, [k]: v })
  const setOpt = (i: number, patch: Partial<PollOption>) => set('options', draft.options.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  const moveOpt = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= draft.options.length) return
    const list = draft.options.slice()
    ;[list[i], list[j]] = [list[j], list[i]]
    set('options', list)
  }
  const removeOpt = async (i: number) => {
    const o = draft.options[i]
    if (o && votedOptions.has(o.text) && !(await confirmDialog({ title: `Remove “${o.text}”?`, message: 'It has votes. They stay saved but won’t be counted while the answer is gone.', confirmLabel: 'Remove', tone: 'danger' }))) return
    set('options', draft.options.filter((_, j) => j !== i))
  }

  const upload = async (file: File, target: string) => {
    setUploading(target); setUploadError('')
    try {
      if (!/^image\//.test(file.type)) throw new Error('Choose an image file.')
      if (file.size > 8 * 1024 * 1024) throw new Error('That image is over 8 MB.')
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg'
      const path = `polls/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('idea-images').upload(path, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      if (target === 'cover') set('image_url', publicUrl)
      else setOpt(Number(target.replace('opt-', '')), { image: publicUrl })
    } catch (e: any) {
      setUploadError(e?.message || 'Upload failed')
    }
    setUploading('')
  }

  const preview: PublicPoll = useMemo(() => ({
    id: 'preview', question: draft.question, description: draft.description || null, image_url: draft.image_url || null,
    type: draft.poll_type, options: draft.options.filter(o => o.text.trim()).map(o => ({ text: o.text.trim(), ...(o.image ? { image: o.image } : {}), ...(o.description ? { description: o.description } : {}) })),
    scale: draft.scale, status: status === 'closed' ? 'closed' : 'live', closes_at: draft.settings.closes_at, allow_change: draft.settings.allow_change,
    show_results: draft.settings.show_results, ask_name: draft.settings.ask_name, ask_contact: draft.settings.ask_contact, thank_you: draft.settings.thank_you, company,
  }), [draft, status, company])
  // Re-mount the preview when the answers change shape so its picks reset.
  const previewKey = `${draft.poll_type}|${preview.options.map(o => o.text).join('|')}`

  useEffect(() => { if (draft.poll_type !== 'rating' && draft.options.length < 2) onChange({ ...draft, options: [...draft.options, ...Array.from({ length: 2 - draft.options.length }, () => ({ text: '' }))] }) }, [draft, onChange])

  return (
    <div className="eg-editor">
      <div style={{ minWidth: 0 }}>
        <div className="eg-card">
          <label className="eg-field">
            <span className="eg-label">Question</span>
            <input className="eg-input" value={draft.question} maxLength={300} onChange={e => set('question', e.target.value)} placeholder="What would you like us to stock next?" style={{ fontSize: 16, height: 44 }} />
          </label>
          <label className="eg-field">
            <span className="eg-label">Description <small>(optional)</small></span>
            <textarea className="eg-input" rows={2} maxLength={500} value={draft.description} onChange={e => set('description', e.target.value)} placeholder="A little context, if it helps." />
          </label>
          <div className="eg-field">
            <span className="eg-label">Cover picture <small>(optional)</small></span>
            <div className="eg-row">
              {draft.image_url && <img src={draft.image_url} alt="" style={{ height: 56, borderRadius: 10, border: '1px solid var(--fr-line)' }} />}
              <label className="fr-btn" style={{ cursor: 'pointer' }}>
                <EngageIcon name="image" size={15} />{uploading === 'cover' ? 'Uploading…' : draft.image_url ? 'Change' : 'Add a picture'}
                <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, 'cover'); e.currentTarget.value = '' }} />
              </label>
              {draft.image_url && <button type="button" className="fr-btn fr-btn-danger" onClick={() => set('image_url', '')}>Remove</button>}
            </div>
          </div>
        </div>

        <div className="eg-card">
          <h3 className="eg-h3">Type</h3>
          {hasVotes && <p className="eg-help">The type can&apos;t change once people have voted.</p>}
          <div className="eg-types">
            {POLL_TYPES.map(t => (
              <button key={t.key} type="button" className={`eg-type${draft.poll_type === t.key ? ' on' : ''}`} disabled={hasVotes && draft.poll_type !== t.key} onClick={() => set('poll_type', t.key)}>
                <b>{t.label}</b><span>{t.about}</span>
              </button>
            ))}
          </div>

          {draft.poll_type === 'rating' ? (
            <label className="eg-field" style={{ marginTop: 14 }}>
              <span className="eg-label">Scale</span>
              <select className="eg-input eg-select" value={draft.scale} disabled={hasVotes} onChange={e => set('scale', Number(e.target.value))} style={{ maxWidth: 260 }}>
                <option value={5}>1 to 5 stars</option>
                <option value={10}>1 to 10</option>
              </select>
            </label>
          ) : (
            <div style={{ marginTop: 16 }}>
              <h3 className="eg-h3">Answers</h3>
              {draft.options.map((o, i) => {
                const locked = votedOptions.has(o.text)
                return (
                  <div key={i} className="eg-opt">
                    <span className="eg-opt-num">{i + 1}</span>
                    <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                      <div className="eg-row" style={{ flexWrap: 'nowrap' }}>
                        {o.image && <img src={o.image} alt="" className="eg-opt-img" />}
                        <input className="eg-input" value={o.text} maxLength={120} readOnly={locked} onChange={e => setOpt(i, { text: e.target.value })} placeholder={`Answer ${i + 1}`}
                          aria-label={`Answer ${i + 1}`} title={locked ? 'This answer has votes, so its wording is kept.' : undefined} style={locked ? { background: 'var(--canvas)' } : undefined} />
                      </div>
                      <input className="eg-input" value={o.description || ''} maxLength={160} onChange={e => setOpt(i, { description: e.target.value })} placeholder="Short note (optional)" aria-label={`Note for answer ${i + 1}`} style={{ height: 32, fontSize: 13 }} />
                      <div className="eg-row" style={{ gap: 6 }}>
                        <label className="fr-btn fr-btn-sm" style={{ cursor: 'pointer' }}>
                          <EngageIcon name="image" size={13} />{uploading === `opt-${i}` ? 'Uploading…' : o.image ? 'Change picture' : 'Picture'}
                          <input type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f, `opt-${i}`); e.currentTarget.value = '' }} />
                        </label>
                        {o.image && <button type="button" className="fr-link" onClick={() => setOpt(i, { image: '' })}>Remove picture</button>}
                        {locked && <span className="eg-help" style={{ margin: 0 }}>Has votes</span>}
                      </div>
                    </div>
                    <div className="eg-opt-tools">
                      <button type="button" className="fr-icon-btn" onClick={() => moveOpt(i, -1)} disabled={i === 0} aria-label={`Move answer ${i + 1} up`}><EngageIcon name="up" size={16} /></button>
                      <button type="button" className="fr-icon-btn" onClick={() => moveOpt(i, 1)} disabled={i === draft.options.length - 1} aria-label={`Move answer ${i + 1} down`}><EngageIcon name="down" size={16} /></button>
                      <button type="button" className="fr-icon-btn" onClick={() => { void removeOpt(i) }} disabled={draft.options.length <= 2} aria-label={`Remove answer ${i + 1}`}><EngageIcon name="x" size={16} /></button>
                    </div>
                  </div>
                )
              })}
              {draft.options.length < 20 && (
                <button type="button" className="fr-btn" onClick={() => set('options', [...draft.options, { text: '' }])}><EngageIcon name="plus" size={15} />Add an answer</button>
              )}
            </div>
          )}
          {uploadError && <p style={{ color: '#b91c1c', fontSize: 13, margin: '10px 0 0' }}>{uploadError}</p>}
        </div>

        <SettingsFields kind="poll" value={draft.settings} onChange={s => set('settings', s)} hasSettingsColumn={hasSettingsColumn} />
      </div>

      <div className="eg-preview-col" style={{ minWidth: 0 }}>
        <div className="eg-preview-frame">
          <div className="eg-preview-label"><span>Preview</span><span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>What customers see</span></div>
          <PublicShell company={company} embed accent={company?.accent_color && /^#[0-9a-f]{6}$/i.test(company.accent_color) ? company.accent_color : '#ff7a6b'}>
            <PublicPollCard key={previewKey} poll={preview} results={null} myVote={null} preview />
          </PublicShell>
        </div>
      </div>
    </div>
  )
}
