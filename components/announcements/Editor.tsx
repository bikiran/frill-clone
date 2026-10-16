'use client'

// The announcement editor: write on the left, see exactly what customers will
// see (desktop or phone), and set when it goes live, who it's for, the chat
// widget banner or popup, and who to tell, on the right. Colvy AI can write a
// first draft, tidy one up, or turn it into an SMS or a social post; its
// drafts are suggestions the person chooses to use.
//
// Saves through /api/announcements (staff-checked). "Publish & notify" saves,
// then tells the board and opted-in customers (/api/announcements/notify) and
// can make a draft SMS campaign to review.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import RichTextEditor from '@/components/RichTextEditor'
import { WhyLink } from '@/components/WhyAgent'
import { CATEGORIES, categoryOf, SEGMENTS, statusOf, STATUS_LABEL, toPublicAnnouncement, videoOf, type CategoryKey } from '@/lib/announcements'
import { htmlToText } from '@/lib/safe-html'
import { PublicPost, POST_CSS } from './PublicPost'
import { AnnIcon } from './icons'
import { ADMIN_CSS } from './styles'
import { annAction, askAi, boardBase, sendNotify, uploadMedia, type AdminData } from './client'

type When = 'now' | 'schedule' | 'draft'
type Draft = {
  title: string; description: string; tag: CategoryKey
  when: When; publish_at: string; expires_at: string; is_pinned: boolean
  cover_image: string; video_url: string; cta_label: string; cta_url: string
  audience: 'all' | 'outlets' | 'segment'; location_ids: string[]; segment: string
  boost_enabled: boolean; boost_type: 'banner' | 'popup'; boost_title: string; boost_blurb: string; boost_button_label: string
  idea_id: string
  tell_board: boolean; tell_email: boolean; tell_sms: boolean
}

// <input type="datetime-local"> works in local time without a zone.
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

function fromRow(a: any | null, now: number): Draft {
  const s = a ? statusOf(a, now) : 'draft'
  const seg = String(a?.segmentation || '').startsWith('segment:') ? String(a.segmentation).slice(8) : ''
  const ids: string[] = Array.isArray(a?.location_ids) ? a.location_ids : []
  const plan = a?.notify_stats?.plan
  return {
    title: a?.title || '', description: a?.description || a?.content || '',
    tag: a ? categoryOf(a.tag).key : 'new',
    when: !a ? 'now' : s === 'scheduled' ? 'schedule' : s === 'draft' ? 'draft' : 'now',
    publish_at: toLocalInput(a?.publish_at), expires_at: toLocalInput(a?.expires_at), is_pinned: !!a?.is_pinned,
    cover_image: a?.cover_image || '', video_url: a?.video_url || '', cta_label: a?.cta_label || '', cta_url: a?.cta_url || '',
    audience: seg ? 'segment' : ids.length ? 'outlets' : 'all', location_ids: ids, segment: seg || SEGMENTS[0],
    boost_enabled: !!a?.boost_enabled, boost_type: a?.boost_type === 'popup' ? 'popup' : 'banner',
    boost_title: a?.boost_title || '', boost_blurb: a?.boost_blurb || '', boost_button_label: a?.boost_button_label && a.boost_button_label !== 'Learn More' ? a.boost_button_label : '',
    idea_id: a?.idea_id || '',
    tell_board: plan ? !!plan.board : true, tell_email: plan ? !!plan.email : false, tell_sms: false,
  }
}
function toPayload(d: Draft, status: 'draft' | 'published' | 'scheduled') {
  return {
    title: d.title, description: d.description, tag: d.tag, status,
    publish_at: status === 'scheduled' ? fromLocalInput(d.publish_at) : undefined,
    expires_at: fromLocalInput(d.expires_at), is_pinned: d.is_pinned,
    cover_image: d.cover_image || null, video_url: d.video_url || null, cta_label: d.cta_label || null, cta_url: d.cta_url || null,
    location_ids: d.audience === 'outlets' ? d.location_ids : [],
    segmentation: d.audience === 'segment' ? `segment:${d.segment}` : 'all',
    boost_enabled: d.boost_enabled, boost_type: d.boost_type, boost_title: d.boost_title || null, boost_blurb: d.boost_blurb || null, boost_button_label: d.boost_button_label || null,
    idea_id: d.idea_id || null,
    notify_subscribers: status === 'scheduled' ? (d.tell_board || d.tell_email) : false,
    ...(status === 'scheduled' ? { notify_plan: { board: d.tell_board, email: d.tell_email } } : {}),
  }
}

function Field({ label, hint, children, htmlFor }: { label: string; hint?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="ae-field">
      <label className="ae-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="ae-hint">{hint}</p>}
    </div>
  )
}
function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className={`ae-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}><span /></button>
  )
}

export default function Editor({ companyId, data, initial, startWithAi, onSaved }: { companyId: string; data: AdminData; initial: any | null; startWithAi?: boolean; onSaved?: (row: any) => void }) {
  const router = useRouter()
  const [row, setRow] = useState<any | null>(initial)
  const [d, setD] = useState<Draft>(() => fromRow(initial, Date.now()))
  const [bodyKey, setBodyKey] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'err'; text: string; links?: { href: string; label: string; ext?: boolean }[] } | null>(null)
  const [device, setDevice] = useState<'desktop' | 'phone'>('desktop')
  const [showPreview, setShowPreview] = useState(false)
  const [aiOpen, setAiOpen] = useState(!!startWithAi && !initial)
  const [brief, setBrief] = useState('')
  const [aiBusy, setAiBusy] = useState<string | null>(null)
  const [aiNote, setAiNote] = useState<{ text?: string; runId?: string } | null>(null)
  const [share, setShare] = useState<{ sms?: string; facebook?: string; instagram?: string; runId?: string } | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const coverInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const ready = data.schemaReady !== false
  const now = Date.now()
  const live = row ? statusOf(row, now) : 'draft'
  const board = boardBase(data.company)

  const set = useCallback(<K extends keyof Draft>(k: K, v: Draft[K]) => { setD(p => ({ ...p, [k]: v })); setDirty(true) }, [])

  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // What the public will see, built by the same code the server uses.
  const preview = useMemo(() => toPublicAnnouncement({
    id: row?.id || 'preview', title: d.title, description: d.description, tag: d.tag,
    publish_at: d.when === 'schedule' ? fromLocalInput(d.publish_at) : row?.publish_at || new Date().toISOString(), created_at: row?.created_at,
    expires_at: fromLocalInput(d.expires_at), is_pinned: d.is_pinned, cover_image: d.cover_image, video_url: d.video_url,
    cta_label: d.cta_label, cta_url: d.cta_url, idea_id: d.idea_id || null, views: row?.views, reactions: row?.reactions,
  }), [d, row])
  const ideaTitle = data.ideas.find(i => i.id === d.idea_id)?.title || null

  const problems = (): string | null => {
    if (!d.title.trim()) return 'Give it a title.'
    if (d.when === 'schedule') {
      if (!ready) return 'Scheduling needs the database update first. Publish now or save a draft.'
      if (!d.publish_at) return 'Pick when it should go live.'
    }
    if (d.expires_at && d.when === 'schedule' && d.publish_at && new Date(d.expires_at) <= new Date(d.publish_at)) return 'The end date must be after it goes live.'
    if (d.expires_at && new Date(d.expires_at).getTime() <= Date.now()) return 'The end date has already passed.'
    if (d.audience === 'outlets' && !d.location_ids.length) return 'Pick at least one outlet, or choose Everyone.'
    if (d.cta_url && !/^https?:\/\//i.test(d.cta_url)) return 'The button link must start with https://'
    if (d.video_url && !videoOf(d.video_url)) return 'Use a YouTube or Vimeo link, or upload a video file.'
    return null
  }

  const save = async (mode: 'draft' | 'main') => {
    const problem = mode === 'main' || d.title.trim() === '' ? problems() : null
    if (problem) { setMsg({ tone: 'err', text: problem }); return }
    const status = mode === 'draft' ? 'draft' : d.when === 'schedule' ? 'scheduled' : d.when === 'draft' ? 'draft' : 'published'
    setSaving(mode); setMsg(null)
    try {
      const r = await annAction(companyId, 'save', row?.id, toPayload(d, status as any))
      const saved = r.announcement
      setRow(saved); setDirty(false)
      onSaved?.(saved)
      if (!row?.id) router.replace(`/admin/announcements/new?edit=${saved.id}`)
      const warnings: string[] = r.warnings || []
      const links: { href: string; label: string; ext?: boolean }[] = []
      let text = status === 'draft' ? 'Saved as a draft. Only your team can see it.' : status === 'scheduled' ? `Scheduled. It goes live ${new Date(saved.publish_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` : (live === 'published' ? 'Updated.' : 'Published. It’s on your updates page now.')
      const nowLive = statusOf(saved, Date.now()) === 'published'
      if (nowLive && board) links.push({ href: `${board}/announcements?id=${saved.id}`, label: 'View it', ext: true })
      // Publish & notify.
      if (nowLive && status === 'published' && !saved.notified_at && (d.tell_board || d.tell_email)) {
        try {
          const n = await sendNotify(companyId, saved.id, { board: d.tell_board, email: d.tell_email })
          const told = [d.tell_board ? `${n.inAppCount} on your board` : '', d.tell_email ? `${n.emailCount} by email` : ''].filter(Boolean).join(' and ')
          text += ` Told ${told || 'nobody yet'}.`
          if (n.errors?.length) warnings.push(n.errors[0])
          setRow({ ...saved, notified_at: new Date().toISOString() })
        } catch (e: any) { warnings.push(e.message) }
      }
      if (nowLive && status === 'published' && d.tell_sms && !saved.sms_campaign_id) {
        try {
          const s = await annAction(companyId, 'sms_draft', saved.id)
          links.push({ href: `/admin/campaigns/${s.campaignId}`, label: 'Review the SMS and send' })
          set('tell_sms', false); setDirty(false)
        } catch (e: any) { warnings.push(e.message) }
      }
      setMsg({ tone: warnings.length ? 'warn' : 'ok', text: warnings.length ? `${text} ${warnings.join(' ')}` : text, links })
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }) }
    setSaving(null)
  }

  const runAi = async (mode: 'write' | 'improve' | 'sms' | 'social') => {
    setAiBusy(mode)
    try {
      const r = await askAi(companyId, { mode, brief, title: d.title, body: d.description, category: d.tag })
      if (mode === 'write' || mode === 'improve') {
        setD(p => ({ ...p, title: r.title || p.title, description: r.html || p.description, tag: r.category || p.tag }))
        setBodyKey(k => k + 1); setDirty(true); setAiOpen(false)
        setAiNote({ text: r.note, runId: r.runId })
      } else {
        const link = row?.id && board ? `${board}/announcements?id=${row.id}` : `${board || 'https://your-board'}/announcements`
        setShare({ sms: r.sms ? r.sms.replace(/\{\{link\}\}/g, link) : undefined, facebook: r.facebook ? r.facebook.replace(/\{\{link\}\}/g, link) : undefined, instagram: r.instagram, runId: r.runId })
      }
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }) }
    setAiBusy(null)
  }

  const upload = async (kind: 'cover' | 'video' | 'image', file: File | undefined) => {
    if (!file) return
    setUploading(kind)
    try {
      const url = await uploadMedia(companyId, file)
      if (kind === 'cover') set('cover_image', url)
      else if (kind === 'video') set('video_url', url)
      else { setD(p => ({ ...p, description: `${p.description || ''}<p><img src="${url.replace(/"/g, '&quot;')}" alt=""></p>` })); setBodyKey(k => k + 1); setDirty(true) }
    } catch (e: any) { setMsg({ tone: 'err', text: e.message }) }
    setUploading(null)
  }

  const copy = (key: string, text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1600) }).catch(() => {})

  const primaryLabel = d.when === 'schedule' ? 'Schedule' : d.when === 'draft' ? 'Save draft' : live === 'published' ? 'Update' : (d.tell_board || d.tell_email || d.tell_sms) && !row?.notified_at ? 'Publish & notify' : 'Publish'
  const outlets = data.outlets || []
  const words = htmlToText(d.description).split(/\s+/).filter(Boolean).length

  const previewPane = (
    <div className="ae-preview">
      <div className="ae-preview-bar">
        <span className="ae-preview-title"><AnnIcon name="eye" size={15} /> Preview</span>
        <div className="an-seg" aria-label="Device">
          <button type="button" className={`an-seg-btn${device === 'desktop' ? ' on' : ''}`} aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')}><AnnIcon name="monitor" size={14} /> Desktop</button>
          <button type="button" className={`an-seg-btn${device === 'phone' ? ' on' : ''}`} aria-pressed={device === 'phone'} onClick={() => setDevice('phone')}><AnnIcon name="phone" size={14} /> Phone</button>
        </div>
      </div>
      <div className={`ae-stage is-${device}`}>
        <div className="ae-device">
          <PublicPost post={preview} ideaTitle={ideaTitle} preview />
        </div>
      </div>
      {d.boost_enabled && (
        <div className="ae-widget-preview">
          <p className="ae-mini-label">In your chat widget</p>
          <div className={`ae-wcard is-${d.boost_type}`}>
            {(preview.cover_image) && <img src={preview.cover_image} alt="" />}
            <div>
              <strong>{d.boost_title || d.title || 'Your title'}</strong>
              <span>{d.boost_blurb || preview.excerpt.slice(0, 120) || 'A line about it'}</span>
              <em style={{ color: data.company?.accent_color || 'var(--coral)' }}>{d.boost_button_label || 'Read more'}</em>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="an-root ae-root">
      <style>{ADMIN_CSS + POST_CSS + EDITOR_CSS}</style>
      <div className="ae-top">
        <div className="ae-top-left">
          <Link href="/admin/announcements" className="an-icon-btn" aria-label="Back to announcements"><AnnIcon name="chevron-left" size={18} /></Link>
          <div style={{ minWidth: 0 }}>
            <p className="ae-crumb">Announcements</p>
            <h1 className="ae-h1">{row?.id ? (d.title || 'Untitled') : 'New announcement'}</h1>
          </div>
          {row?.id && <span className={`an-pill s-${live}`}>{STATUS_LABEL[live]}</span>}
          <span className="ae-saved">{saving ? 'Saving…' : dirty ? 'Unsaved changes' : row?.id ? 'All changes saved' : ''}</span>
        </div>
        <div className="ae-top-actions">
          <button type="button" className="an-btn ae-preview-btn" onClick={() => setShowPreview(true)}><AnnIcon name="eye" size={15} />Preview</button>
          {d.when !== 'draft' && <button type="button" className="an-btn" onClick={() => save('draft')} disabled={!!saving}>{live === 'published' ? 'Move to drafts' : 'Save draft'}</button>}
          <button type="button" className="an-btn an-btn-primary" onClick={() => save('main')} disabled={!!saving}>
            <AnnIcon name={d.when === 'schedule' ? 'clock' : 'send'} size={15} />{saving === 'main' ? 'Saving…' : primaryLabel}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`ae-msg is-${msg.tone}`} role="status">
          <AnnIcon name={msg.tone === 'ok' ? 'check' : 'warning'} size={16} />
          <span>{msg.text}</span>
          {msg.links?.map(l => l.ext
            ? <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">{l.label}</a>
            : <Link key={l.href} href={l.href}>{l.label}</Link>)}
          <button type="button" className="an-icon-btn" aria-label="Dismiss" style={{ marginLeft: 'auto', width: 28, height: 28 }} onClick={() => setMsg(null)}><AnnIcon name="x" size={14} /></button>
        </div>
      )}
      {!ready && (
        <div className="an-notice"><AnnIcon name="warning" size={16} /><span>A database update (V387) is waiting. Until it runs, scheduling, cover pictures, video, end dates, the widget banner and idea links won’t be saved.</span></div>
      )}

      <div className="ae-grid">
        {/* ── Write ─────────────────────────────────────────────── */}
        <section className="ae-write" aria-label="Write">
          <div className="ae-card ae-cover-card">
            {d.cover_image ? (
              <div className="ae-cover">
                <img src={d.cover_image} alt="Cover" />
                <div className="ae-cover-actions">
                  <button type="button" className="an-btn an-btn-sm" onClick={() => coverInput.current?.click()}><AnnIcon name="image" size={14} />Replace</button>
                  <button type="button" className="an-btn an-btn-sm" onClick={() => set('cover_image', '')}><AnnIcon name="trash" size={14} />Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" className="ae-cover-empty" onClick={() => coverInput.current?.click()} disabled={uploading === 'cover'}>
                <AnnIcon name="image" size={22} />
                <strong>{uploading === 'cover' ? 'Uploading…' : 'Add a cover picture'}</strong>
                <span>A wide photo works best: new stock, the shop, the event.</span>
              </button>
            )}
            <input ref={coverInput} type="file" accept="image/*" hidden onChange={e => { upload('cover', e.target.files?.[0]); e.target.value = '' }} />
          </div>

          <div className="ae-card">
            <div className="ae-cats" role="radiogroup" aria-label="Category">
              {CATEGORIES.map(c => (
                <button key={c.key} type="button" role="radio" aria-checked={d.tag === c.key} title={c.about} className={`ae-cat${d.tag === c.key ? ' on' : ''}`}
                  style={d.tag === c.key ? { background: c.bg, color: c.color, borderColor: 'transparent' } : undefined} onClick={() => set('tag', c.key)}>
                  <span className="ae-cat-dot" style={{ background: c.color }} />{c.label}
                </button>
              ))}
            </div>
            <input className="ae-title" value={d.title} onChange={e => set('title', e.target.value)} placeholder="Title" aria-label="Title" maxLength={200} />

            <div className="ae-ai-row">
              <button type="button" className="an-btn an-btn-sm an-btn-ai" onClick={() => setAiOpen(o => !o)} aria-expanded={aiOpen}><AnnIcon name="spark" size={14} />Write with Colvy AI</button>
              <button type="button" className="an-btn an-btn-sm an-btn-ai" onClick={() => runAi('improve')} disabled={!!aiBusy || (!d.title.trim() && !htmlToText(d.description))}><AnnIcon name="spark" size={14} />{aiBusy === 'improve' ? 'Tidying…' : 'Tidy it up'}</button>
              <button type="button" className="an-btn an-btn-sm" onClick={() => imageInput.current?.click()} disabled={uploading === 'image'}><AnnIcon name="image" size={14} />{uploading === 'image' ? 'Uploading…' : 'Add picture'}</button>
              <input ref={imageInput} type="file" accept="image/*" hidden onChange={e => { upload('image', e.target.files?.[0]); e.target.value = '' }} />
              <span className="ae-count">{words} word{words === 1 ? '' : 's'}</span>
            </div>
            {aiOpen && (
              <div className="ae-ai">
                <label className="ae-label" htmlFor="ae-brief">What’s it about?</label>
                <textarea id="ae-brief" rows={3} value={brief} onChange={e => setBrief(e.target.value)} placeholder="e.g. New shipment of German blue rams arrived Friday, 20% off this weekend only, limited stock" />
                <div className="ae-ai-actions">
                  <span className="ae-hint" style={{ margin: 0 }}>Colvy AI writes a draft from your words. It won’t make up prices or dates, and nothing is published until you do.</span>
                  <button type="button" className="an-btn an-btn-sm an-btn-primary" onClick={() => runAi('write')} disabled={!!aiBusy || !brief.trim()}><AnnIcon name="spark" size={14} />{aiBusy === 'write' ? 'Writing…' : 'Write it'}</button>
                </div>
              </div>
            )}
            {aiNote && (
              <div className="ae-ai-note">
                <AnnIcon name="spark" size={14} />
                <span>Drafted by Colvy AI. Check it reads right before you publish.{aiNote.text ? ` ${aiNote.text}` : ''}</span>
                {aiNote.runId && <WhyLink companyId={companyId} runId={aiNote.runId} />}
              </div>
            )}
            <div className="ae-body">
              <RichTextEditor key={`${row?.id || 'new'}-${bodyKey}`} value={d.description} onChange={html => set('description', html)}
                onEditing={() => setDirty(true)} placeholder="Tell your customers what’s new…" minHeight={260} maxHeight="none" bordered={false} big companyId={companyId} />
            </div>
          </div>

          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="video" size={15} />Video and button</p>
            <div className="ae-two">
              <Field label="Video" htmlFor="ae-video" hint="A YouTube or Vimeo link, or upload a short clip.">
                <div className="ae-inline">
                  <input id="ae-video" className="ae-input" value={d.video_url} onChange={e => set('video_url', e.target.value)} placeholder="https://youtube.com/watch?v=…" />
                  <button type="button" className="an-btn an-btn-sm" onClick={() => videoInput.current?.click()} disabled={uploading === 'video'}>{uploading === 'video' ? 'Uploading…' : 'Upload'}</button>
                  <input ref={videoInput} type="file" accept="video/*" hidden onChange={e => { upload('video', e.target.files?.[0]); e.target.value = '' }} />
                </div>
              </Field>
              <Field label="Button" hint="Optional. Sends people to a product, booking page or your shop.">
                <div className="ae-inline">
                  <input className="ae-input ae-input-sm" value={d.cta_label} onChange={e => set('cta_label', e.target.value)} placeholder="Shop now" aria-label="Button text" maxLength={40} />
                  <input className="ae-input" value={d.cta_url} onChange={e => set('cta_url', e.target.value)} placeholder="https://" aria-label="Button link" />
                </div>
              </Field>
            </div>
          </div>
        </section>

        {/* ── Live preview (wide screens) ─────────────────────── */}
        <section className="ae-live" aria-label="Preview">{previewPane}</section>

        {/* ── Settings ─────────────────────────────────────────── */}
        <aside className="ae-side" aria-label="Settings">
          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="send" size={15} />Publishing</p>
            <div className="ae-when" role="radiogroup" aria-label="When">
              {([['now', live === 'published' ? 'Live' : 'Publish now', 'globe'], ['schedule', 'Schedule', 'clock'], ['draft', 'Draft', 'edit']] as [When, string, any][]).map(([k, label, icon]) => (
                <button key={k} type="button" role="radio" aria-checked={d.when === k} className={`ae-when-btn${d.when === k ? ' on' : ''}`} onClick={() => set('when', k)} disabled={k === 'schedule' && !ready}>
                  <AnnIcon name={icon} size={15} />{label}
                </button>
              ))}
            </div>
            {d.when === 'schedule' && (
              <Field label="Goes live" htmlFor="ae-pub" hint="Your local time. It appears on your updates page and widget at this time.">
                <input id="ae-pub" type="datetime-local" className="ae-input" value={d.publish_at} min={toLocalInput(new Date().toISOString())} onChange={e => set('publish_at', e.target.value)} />
              </Field>
            )}
            <Field label="Ends (optional)" htmlFor="ae-exp" hint="For sales and events: it comes down from your updates page and widget after this.">
              <div className="ae-inline">
                <input id="ae-exp" type="datetime-local" className="ae-input" value={d.expires_at} onChange={e => set('expires_at', e.target.value)} disabled={!ready} />
                {d.expires_at && <button type="button" className="an-btn an-btn-sm" onClick={() => set('expires_at', '')}>Clear</button>}
              </div>
            </Field>
            <div className="ae-row">
              <span className="ae-row-text"><strong>Pin to the top</strong><span>Stays first on your updates page.</span></span>
              <Toggle on={d.is_pinned} onChange={v => set('is_pinned', v)} label="Pin to the top" />
            </div>
          </div>

          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="bell" size={15} />Tell people</p>
            {row?.notified_at ? (
              <p className="ae-hint" style={{ margin: 0 }}>Your board and customers were told on {new Date(row.notified_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}. Each post is sent once.</p>
            ) : (
              <>
                <p className="ae-hint" style={{ margin: '0 0 8px' }}>{d.when === 'schedule' ? 'When it goes live, tell:' : d.when === 'draft' ? 'When you publish, you can tell:' : 'When you publish, tell:'}</p>
                <label className="ae-check"><input type="checkbox" checked={d.tell_board} onChange={e => set('tell_board', e.target.checked)} disabled={d.when === 'draft'} /><span><strong>People on your board</strong> a bell notification{d.idea_id ? ', including everyone who voted for the linked idea' : ''}</span></label>
                <label className="ae-check"><input type="checkbox" checked={d.tell_email} onChange={e => set('tell_email', e.target.checked)} disabled={d.when === 'draft'} /><span><strong>Customers by email</strong> only those who agreed to marketing, with an unsubscribe link</span></label>
                <label className="ae-check"><input type="checkbox" checked={d.tell_sms} onChange={e => set('tell_sms', e.target.checked)} disabled={d.when !== 'now'} /><span><strong>Customers by text</strong> {d.when === 'schedule' ? 'make the SMS campaign once it’s live' : 'makes a draft SMS campaign so you can check the cost first'}</span></label>
              </>
            )}
          </div>

          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="users" size={15} />Who it’s for</p>
            <div className="ae-when" role="radiogroup" aria-label="Audience">
              <button type="button" role="radio" aria-checked={d.audience === 'all'} className={`ae-when-btn${d.audience === 'all' ? ' on' : ''}`} onClick={() => set('audience', 'all')}>Everyone</button>
              <button type="button" role="radio" aria-checked={d.audience === 'outlets'} className={`ae-when-btn${d.audience === 'outlets' ? ' on' : ''}`} onClick={() => set('audience', 'outlets')} disabled={!outlets.length}>Outlets</button>
              <button type="button" role="radio" aria-checked={d.audience === 'segment'} className={`ae-when-btn${d.audience === 'segment' ? ' on' : ''}`} onClick={() => set('audience', 'segment')}>A group</button>
            </div>
            {d.audience === 'outlets' && (
              <div className="ae-outlets">
                {outlets.map(o => (
                  <label key={o.id} className="ae-check">
                    <input type="checkbox" checked={d.location_ids.includes(o.id)} onChange={e => set('location_ids', e.target.checked ? [...d.location_ids, o.id] : d.location_ids.filter(x => x !== o.id))} />
                    <span><strong>{o.label || o.suburb || 'Outlet'}</strong>{o.suburb && o.label ? ` ${o.suburb}` : ''}</span>
                  </label>
                ))}
                <p className="ae-hint">Shows in that outlet’s chat widget, and emails and texts go to that outlet’s customers.</p>
              </div>
            )}
            {d.audience === 'segment' && (
              <Field label="Customer group" htmlFor="ae-seg" hint="Emails and texts go to this group only. The post itself stays on your updates page for everyone.">
                <select id="ae-seg" className="an-select" style={{ width: '100%' }} value={d.segment} onChange={e => set('segment', e.target.value)}>
                  {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
            {d.audience === 'all' && <p className="ae-hint" style={{ margin: '8px 0 0' }}>On your updates page and every outlet’s chat widget.</p>}
          </div>

          <div className="ae-card">
            <div className="ae-row" style={{ marginTop: 0 }}>
              <span className="ae-row-text"><strong style={{ display: 'flex', alignItems: 'center', gap: 7 }}><AnnIcon name="widget" size={15} />Show in chat widget</strong><span>A banner inside the widget, or a card beside the chat bubble.</span></span>
              <Toggle on={d.boost_enabled} onChange={v => set('boost_enabled', v)} label="Show in chat widget" disabled={!ready} />
            </div>
            {d.boost_enabled && (
              <>
                <div className="ae-when" role="radiogroup" aria-label="Widget style" style={{ marginTop: 12 }}>
                  <button type="button" role="radio" aria-checked={d.boost_type === 'banner'} className={`ae-when-btn${d.boost_type === 'banner' ? ' on' : ''}`} onClick={() => set('boost_type', 'banner')}>Banner</button>
                  <button type="button" role="radio" aria-checked={d.boost_type === 'popup'} className={`ae-when-btn${d.boost_type === 'popup' ? ' on' : ''}`} onClick={() => set('boost_type', 'popup')}>Popup</button>
                </div>
                <p className="ae-hint">{d.boost_type === 'popup' ? 'A small card pops up beside the chat bubble while the widget is closed. Each visitor sees it until they close or open it.' : 'A slim card at the top of the widget until the visitor closes it.'}</p>
                <Field label="Headline" htmlFor="ae-bt"><input id="ae-bt" className="ae-input" value={d.boost_title} onChange={e => set('boost_title', e.target.value)} placeholder={d.title || 'Uses your title'} maxLength={120} /></Field>
                <Field label="Short line" htmlFor="ae-bb"><input id="ae-bb" className="ae-input" value={d.boost_blurb} onChange={e => set('boost_blurb', e.target.value)} placeholder="Uses the start of your post" maxLength={240} /></Field>
                <Field label="Button text" htmlFor="ae-bl"><input id="ae-bl" className="ae-input" value={d.boost_button_label} onChange={e => set('boost_button_label', e.target.value)} placeholder="Read more" maxLength={30} /></Field>
              </>
            )}
          </div>

          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="idea" size={15} />Roadmap idea</p>
            <select className="an-select" style={{ width: '100%' }} value={d.idea_id} onChange={e => set('idea_id', e.target.value)} disabled={!ready || !data.ideas.length} aria-label="Linked idea">
              <option value="">{data.ideas.length ? 'Not linked to an idea' : 'No ideas on your board yet'}</option>
              {data.ideas.map(i => <option key={i.id} value={i.id}>{i.title}{i.votes ? ` (${i.votes} vote${i.votes === 1 ? '' : 's'})` : ''}</option>)}
            </select>
            <p className="ae-hint">Did a customer ask for this? Link the idea: the post shows it, and its voters hear about it when you tell people.</p>
          </div>

          <div className="ae-card">
            <p className="ae-card-title"><AnnIcon name="share" size={15} />Share it elsewhere</p>
            <div className="ae-inline" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="an-btn an-btn-sm an-btn-ai" onClick={() => runAi('sms')} disabled={!!aiBusy || !d.title.trim()}><AnnIcon name="sms" size={14} />{aiBusy === 'sms' ? 'Writing…' : 'Write an SMS'}</button>
              <button type="button" className="an-btn an-btn-sm an-btn-ai" onClick={() => runAi('social')} disabled={!!aiBusy || !d.title.trim()}><AnnIcon name="facebook" size={14} />{aiBusy === 'social' ? 'Writing…' : 'Write a social post'}</button>
            </div>
            {share && (
              <div className="ae-share">
                {share.sms && <ShareBox label="SMS" text={share.sms} copied={copied === 'sms'} onCopy={() => copy('sms', share.sms!)} extra={row?.id && live === 'published' ? <button type="button" className="an-btn an-btn-sm" onClick={async () => { try { const r = await annAction(companyId, 'sms_draft', row.id, { text: share.sms }); setMsg({ tone: 'ok', text: 'SMS campaign draft made.', links: [{ href: `/admin/campaigns/${r.campaignId}`, label: 'Review and send' }] }) } catch (e: any) { setMsg({ tone: 'err', text: e.message }) } }}>Use in SMS campaign</button> : null} />}
                {share.facebook && <ShareBox label="Facebook" text={share.facebook} copied={copied === 'fb'} onCopy={() => copy('fb', share.facebook!)} />}
                {share.instagram && <ShareBox label="Instagram" text={share.instagram} copied={copied === 'ig'} onCopy={() => copy('ig', share.instagram!)} />}
                <p className="ae-hint" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Written by Colvy AI from this post. {share.runId && <WhyLink companyId={companyId} runId={share.runId} />}</p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {showPreview && (
        <div className="an-overlay" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setShowPreview(false) }}>
          <div className="an-dialog ae-preview-dialog" role="dialog" aria-modal="true" aria-label="Preview">
            <div className="an-dialog-head"><h2 className="an-dialog-title">How customers see it</h2>
              <button type="button" className="an-icon-btn" aria-label="Close preview" onClick={() => setShowPreview(false)}><AnnIcon name="x" size={18} /></button></div>
            <div style={{ padding: '0 16px 16px' }}>{previewPane}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function ShareBox({ label, text, copied, onCopy, extra }: { label: string; text: string; copied: boolean; onCopy: () => void; extra?: React.ReactNode }) {
  return (
    <div className="ae-sharebox">
      <div className="ae-sharebox-head"><span>{label}</span><span className="ae-count">{text.length} characters</span></div>
      <p>{text}</p>
      <div className="ae-inline">
        <button type="button" className="an-btn an-btn-sm" onClick={onCopy}><AnnIcon name={copied ? 'check' : 'copy'} size={13} />{copied ? 'Copied' : 'Copy'}</button>
        {extra}
      </div>
    </div>
  )
}

const EDITOR_CSS = `
.ae-root { padding-top: 0 !important; }
.ae-top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 0 -16px 16px; padding: 12px 16px; background: color-mix(in srgb, var(--canvas, #fafafa) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--an-line); }
@media (min-width: 640px) { .ae-top { margin: 0 -20px 18px; padding: 12px 20px; } }
@media (min-width: 1024px) { .ae-top { margin: 0 -32px 20px; padding: 14px 32px; } }
.ae-top-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1 1 320px; }
.ae-crumb { margin: 0; font-size: 12px; color: var(--slate); font-weight: 600; }
.ae-h1 { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw; }
.ae-saved { font-size: 12.5px; color: var(--slate); white-space: nowrap; }
.ae-top-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.ae-msg { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 14px; padding: 10px 12px; border-radius: 12px; font-size: 13.5px; border: 1px solid; }
.ae-msg a { font-weight: 700; color: inherit; }
.ae-msg.is-ok { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
.ae-msg.is-warn { background: #fffbeb; border-color: #fde68a; color: #92400e; }
.ae-msg.is-err { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
[data-theme="dark"] .ae-msg.is-ok { background: rgba(34,197,94,.12); color: #86efac; border-color: rgba(34,197,94,.3); }
.ae-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; margin-top: 14px; }
.ae-live { display: none; }
@media (min-width: 1180px) { .ae-grid { grid-template-columns: minmax(0, 1fr) 360px; } }
@media (min-width: 1660px) {
  .ae-grid { grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr) 360px; }
  .ae-live { display: block; position: sticky; top: 84px; }
  .ae-preview-btn { display: none !important; }
}
.ae-write, .ae-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ae-card { background: var(--an-card); border: 1px solid var(--an-line); border-radius: 16px; padding: 16px; min-width: 0; }
.ae-card-title { display: flex; align-items: center; gap: 7px; margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--ink); }
.ae-cover-card { padding: 0; overflow: hidden; }
.ae-cover { position: relative; aspect-ratio: 16 / 6; background: var(--an-soft); }
.ae-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ae-cover-actions { position: absolute; right: 12px; bottom: 12px; display: flex; gap: 8px; }
.ae-cover-empty { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; min-height: 120px; padding: 20px; border: none; background: repeating-linear-gradient(-45deg, var(--an-soft), var(--an-soft) 10px, transparent 10px, transparent 20px); color: var(--slate); cursor: pointer; font-size: 13px; }
.ae-cover-empty strong { color: var(--ink); font-size: 14.5px; }
.ae-cover-empty:hover { color: var(--ink); }
.ae-cats { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ae-cat { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--an-line); background: var(--an-card); color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; }
.ae-cat:hover { border-color: var(--an-strong); }
.ae-cat-dot { width: 7px; height: 7px; border-radius: 50%; }
.ae-title { width: 100%; border: none; outline: none; background: transparent; font-size: 28px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); padding: 6px 0 4px; }
.ae-title::placeholder { color: color-mix(in srgb, var(--slate) 60%, transparent); }
@media (max-width: 640px) { .ae-title { font-size: 22px; } }
.ae-ai-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 0 10px; border-bottom: 1px solid var(--an-line); }
.ae-count { font-size: 12px; color: var(--slate); margin-left: auto; white-space: nowrap; }
.ae-ai { margin: 12px 0 4px; padding: 12px; border-radius: 12px; background: #faf5ff; border: 1px solid #e9d5ff; }
[data-theme="dark"] .ae-ai { background: rgba(124,58,237,.1); border-color: rgba(124,58,237,.3); }
.ae-ai textarea { width: 100%; border: 1px solid #e9d5ff; border-radius: 10px; padding: 10px 12px; font: inherit; font-size: 14px; resize: vertical; background: var(--an-card); color: var(--ink); outline: none; }
.ae-ai textarea:focus { border-color: #a78bfa; }
.ae-ai-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
.ae-ai-note { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: #f5f3ff; color: #5b21b6; font-size: 12.5px; }
[data-theme="dark"] .ae-ai-note { background: rgba(124,58,237,.12); color: #c4b5fd; }
.ae-body { margin-top: 6px; min-width: 0; }
.ae-field { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; min-width: 0; }
.ae-label { font-size: 12.5px; font-weight: 600; color: var(--ink); }
.ae-hint { margin: 6px 0 0; font-size: 12.5px; color: var(--slate); line-height: 1.45; }
.ae-input { width: 100%; min-width: 0; height: 38px; padding: 0 11px; border: 1px solid var(--an-strong); border-radius: 10px; background: var(--an-card); color: var(--ink); font-size: 14px; outline: none; }
.ae-input:focus { border-color: var(--coral); }
.ae-input[disabled] { opacity: .55; }
.ae-input-sm { flex: 0 0 130px; }
.ae-inline { display: flex; gap: 8px; align-items: center; min-width: 0; }
.ae-two { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0 16px; }
@media (min-width: 900px) { .ae-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .ae-two .ae-field:first-child { margin-top: 0; } .ae-two .ae-field { margin-top: 0; } }
.ae-when { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 3px; border: 1px solid var(--an-strong); border-radius: 11px; background: var(--an-soft); }
.ae-when-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 34px; padding: 0 6px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--slate); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; min-width: 0; }
.ae-when-btn.on { background: var(--an-card); color: var(--ink); border-color: var(--an-strong); }
.ae-when-btn[disabled] { opacity: .45; cursor: default; }
.ae-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.ae-row-text { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: var(--slate); min-width: 0; }
.ae-row-text strong { font-size: 13.5px; color: var(--ink); }
.ae-switch { position: relative; flex-shrink: 0; width: 42px; height: 24px; border-radius: 999px; border: none; background: #d4d4d8; cursor: pointer; transition: background .15s; padding: 0; }
.ae-switch span { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .15s; }
.ae-switch.on { background: var(--coral); }
.ae-switch.on span { transform: translateX(18px); }
.ae-switch[disabled] { opacity: .5; cursor: default; }
.ae-check { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0; font-size: 12.5px; color: var(--slate); line-height: 1.4; cursor: pointer; }
.ae-check input { margin-top: 2px; width: 16px; height: 16px; accent-color: var(--coral); flex-shrink: 0; }
.ae-check strong { display: block; color: var(--ink); font-size: 13.5px; font-weight: 600; }
.ae-outlets { margin-top: 10px; }
.ae-share { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.ae-sharebox { border: 1px solid var(--an-line); border-radius: 12px; padding: 10px 12px; background: var(--an-soft); }
.ae-sharebox-head { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .04em; }
.ae-sharebox p { margin: 6px 0 10px; font-size: 13.5px; color: var(--ink); line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
.ae-preview { background: var(--an-card); border: 1px solid var(--an-line); border-radius: 16px; padding: 14px; min-width: 0; }
.ae-preview-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.ae-preview-title { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; }
.ae-stage { background: var(--canvas, #f5f5f7); border-radius: 14px; padding: 16px; max-height: calc(100vh - 260px); overflow-y: auto; }
.ae-stage.is-phone .ae-device { width: 100%; max-width: 390px; margin: 0 auto; border: 8px solid #1c1c1e; border-radius: 34px; overflow: hidden; background: var(--canvas, #f5f5f7); padding: 12px 8px; }
.ae-preview-dialog { max-width: 980px; }
.ae-preview-dialog .ae-stage { max-height: calc(100vh - 220px); }
.ae-widget-preview { margin-top: 14px; }
.ae-mini-label { margin: 0 0 8px; font-size: 12px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .04em; }
.ae-wcard { display: flex; gap: 10px; align-items: center; max-width: 320px; padding: 10px; border-radius: 14px; border: 1px solid var(--an-line); background: var(--an-card); box-shadow: 0 10px 30px -14px rgba(0,0,0,.25); }
.ae-wcard.is-popup { flex-direction: column; align-items: stretch; padding: 0; overflow: hidden; }
.ae-wcard img { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; }
.ae-wcard.is-popup img { width: 100%; height: 110px; border-radius: 0; }
.ae-wcard > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 12.5px; color: var(--slate); }
.ae-wcard.is-popup > div { padding: 10px 12px 12px; }
.ae-wcard strong { font-size: 13.5px; color: var(--ink); }
.ae-wcard em { font-style: normal; font-weight: 700; margin-top: 4px; }
@media (max-width: 640px) { .ae-h1 { max-width: 60vw; } .ae-saved { display: none; } .ae-top-actions { width: 100%; } .ae-top-actions .an-btn { flex: 1 1 auto; } .ae-input-sm { flex-basis: 100px; } }
`
