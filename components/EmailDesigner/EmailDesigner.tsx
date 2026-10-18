'use client'

// The email designer: a simple block editor (add, edit, reorder) beside a
// live preview at desktop and phone widths. Subject and preview text with
// length hints, merge tags that match the SMS personalisation chips, image
// upload to Colvy's storage, products from the store's catalogue, and "Send
// test email" to the signed-in staff member. Saves through
// /api/email-campaigns/designs (server renders and stores the HTML).
//
// Self-contained so the campaign wizard can drop it in for email campaigns:
// pass campaignId and it saves the design against that campaign.

import { useEffect, useMemo, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { fillTemplate, renderEmail, sampleVars, safeImage, safeUrl } from './render'
import { blankBlock, newId } from './templates'
import { DIcon } from './icons'
import { MERGE_TAGS, PREVIEW_HINT, SUBJECT_HINT, type Block, type BlockType, type EmailBrand, type EmailDesign, type ProductItem, type SocialLink } from './types'

export type DesignDraft = { id?: string | null; name: string; subject: string; previewText: string; design: EmailDesign }
export type SenderInfo = { from: string; shared: boolean; replyTo?: string | null } | null

const BLOCK_LABEL: Record<BlockType, string> = {
  header: 'Logo and name', heading: 'Heading', text: 'Text', image: 'Picture', button: 'Button', products: 'Products',
  coupon: 'Coupon', divider: 'Divider', spacer: 'Space', social: 'Social links', footer: 'Footer',
}
const ADDABLE: BlockType[] = ['heading', 'text', 'image', 'button', 'products', 'coupon', 'divider', 'spacer', 'social', 'header']
const NETWORKS: SocialLink['network'][] = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'website']
const NETWORK_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', website: 'Website' }

function summary(b: Block): string {
  switch (b.type) {
    case 'heading': case 'text': return b.text.replace(/\s+/g, ' ').slice(0, 70)
    case 'image': return b.src ? (b.alt || 'Picture') : 'No picture yet'
    case 'button': return b.label ? `${b.label}${b.url ? '' : ' (no link yet)'}` : 'No label yet'
    case 'products': return b.items.filter(p => p.name).length ? `${b.items.filter(p => p.name).length} product${b.items.filter(p => p.name).length === 1 ? '' : 's'}` : 'No products yet'
    case 'coupon': return b.code || 'No code yet'
    case 'social': return b.links.length ? b.links.map(l => NETWORK_LABEL[l.network]).join(', ') : 'No links yet'
    case 'spacer': return `${b.height || 24}px`
    case 'footer': return 'Address, unsubscribe and preferences'
    default: return ''
  }
}

function hint(len: number, h: { ideal: number; max: number }, what: string): { text: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!len) return { text: `Add ${what}`, tone: 'warn' }
  if (len <= h.ideal) return { text: `${len} characters: a good length`, tone: 'ok' }
  if (len <= h.max) return { text: `${len} characters: may be cut off on phones`, tone: 'warn' }
  return { text: `${len} characters: too long, most inboxes cut it off`, tone: 'bad' }
}

async function uploadImage(companyId: string, file: File): Promise<string> {
  const { compressImage } = await import('@/lib/upload-attachment')
  const f = file.type.startsWith('image/') ? await compressImage(file) : file
  const fd = new FormData()
  fd.append('file', f)
  fd.append('prefix', `media-gallery/${companyId}/email`)
  const r = await authFetch('/api/storage/put', { method: 'POST', body: fd })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j?.url) throw new Error(j?.error || 'That picture couldn’t be uploaded')
  return j.url
}

const money = (v: any) => { const n = Number(v); return Number.isFinite(n) && String(v).trim() !== '' ? `$${n.toFixed(2)}` : String(v || '') }

export default function EmailDesigner({ companyId, brand, sender, initial, campaignId, onSaved, onBack }: {
  companyId: string
  brand: EmailBrand
  sender?: SenderInfo
  initial: DesignDraft
  campaignId?: string | null
  onSaved?: (row: any) => void
  onBack?: () => void
}) {
  const [draft, setDraft] = useState<DesignDraft>(initial)
  const [selected, setSelected] = useState<string | null>(initial.design.blocks.find(b => b.type !== 'header')?.id || null)
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop')
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('')
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  const [dirty, setDirty] = useState(false)
  const lastField = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; set: (v: string) => void } | null>(null)

  useEffect(() => { setDraft(initial); setDirty(false) }, [initial])

  const blocks = draft.design.blocks
  const setBlocks = (fn: (bs: Block[]) => Block[]) => { setDraft(d => ({ ...d, design: { ...d.design, blocks: fn(d.design.blocks) } })); setDirty(true) }
  const update = (id: string, patch: Partial<Block>) => setBlocks(bs => bs.map(b => (b.id === id ? ({ ...b, ...patch } as Block) : b)))
  const move = (id: string, dir: -1 | 1) => setBlocks(bs => {
    const i = bs.findIndex(b => b.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= bs.length || bs[j].type === 'footer') return bs
    const c = [...bs]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const remove = (id: string) => setBlocks(bs => bs.filter(b => b.id !== id))
  const duplicate = (id: string) => setBlocks(bs => { const i = bs.findIndex(b => b.id === id); if (i < 0) return bs; const c = [...bs]; c.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(bs[i])), id: newId() }); return c })
  const add = (type: BlockType) => {
    const b = blankBlock(type)
    setBlocks(bs => {
      // After the open block, else at the end; never below the footer.
      const f = bs.findIndex(x => x.type === 'footer')
      const end = f < 0 ? bs.length : f
      const si = selected ? bs.findIndex(x => x.id === selected) : -1
      const pos = si >= 0 && si < end ? si + 1 : end
      const c = [...bs]; c.splice(pos, 0, b); return c
    })
    setSelected(b.id)
  }
  // A footer is always there (unsubscribe link); put one back if it was removed.
  useEffect(() => { if (!blocks.some(b => b.type === 'footer')) setBlocks(bs => [...bs, blankBlock('footer')]) }, [blocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = useMemo(() => {
    const r = renderEmail(draft.design, brand, { subject: draft.subject, previewText: draft.previewText, preview: true })
    return fillTemplate(r.html, sampleVars(brand), { html: true })
  }, [draft.design, draft.subject, draft.previewText, brand])

  const field = (set: (v: string) => void) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { lastField.current = { el: e.currentTarget, set } },
  })
  const insertTag = (token: string) => {
    const f = lastField.current
    const tag = `{{${token}}}`
    if (!f || !document.body.contains(f.el)) { setMsg({ text: 'Click into a heading, text or the subject first, then pick a tag.', tone: 'bad' }); return }
    const el = f.el, start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start
    const v = el.value.slice(0, start) + tag + el.value.slice(end)
    f.set(v)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length) })
  }
  const wrap = (before: string, after: string, fallback: string) => {
    const f = lastField.current
    if (!f || f.el.tagName !== 'TEXTAREA') return
    const el = f.el, s = el.selectionStart ?? 0, e = el.selectionEnd ?? s
    const inner = el.value.slice(s, e) || fallback
    f.set(el.value.slice(0, s) + before + inner + after + el.value.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + inner.length) })
  }

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const r = await authFetch('/api/email-campaigns/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id: draft.id || null, campaignId: campaignId || null, name: draft.name, subject: draft.subject, previewText: draft.previewText, design: draft.design }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Couldn’t save')
      setDraft(d => ({ ...d, id: j.design?.id || d.id })); setDirty(false)
      setMsg({ text: 'Saved', tone: 'ok' }); onSaved?.(j.design)
    } catch (e: any) { setMsg({ text: e.message, tone: 'bad' }) }
    setBusy('')
  }
  const sendTest = async () => {
    setBusy('test'); setMsg(null)
    try {
      const r = await authFetch('/api/email-campaigns/test-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, subject: draft.subject, previewText: draft.previewText, design: draft.design }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'The test didn’t send')
      setMsg({ text: `Test sent to ${j.to}`, tone: 'ok' })
    } catch (e: any) { setMsg({ text: e.message, tone: 'bad' }) }
    setBusy('')
  }

  const sh = hint(draft.subject.length, SUBJECT_HINT, 'a subject line')
  const ph = hint(draft.previewText.length, PREVIEW_HINT, 'preview text')

  return (
    <div className="ed">
      <style>{CSS}</style>
      <div className="ed-top">
        {onBack && <button type="button" className="ed-ghost ed-iconbtn" onClick={onBack} aria-label="Back"><DIcon name="back" /></button>}
        <input className="ed-name" value={draft.name} onChange={e => { setDraft(d => ({ ...d, name: e.target.value })); setDirty(true) }} aria-label="Email name" placeholder="Name this email" />
        <div className="ed-top-actions">
          {msg && <span className={`ed-msg ${msg.tone}`} role="status">{msg.tone === 'ok' && <DIcon name="check" size={14} />}{msg.text}</span>}
          {!msg && dirty && <span className="ed-msg">Unsaved changes</span>}
          <button type="button" className="ed-ghost" onClick={sendTest} disabled={!!busy}><DIcon name="send" size={15} />{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
          <button type="button" className="ed-primary" onClick={save} disabled={!!busy}><DIcon name="save" size={15} />{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {sender?.shared && (
        <div className="ed-warn"><DIcon name="warning" size={16} />
          <span>Sending from <b>{sender.from}</b>, Colvy’s shared address, with replies going to your business. Emails reach more inboxes from your own domain: <a href="/admin/crm-settings/channels/sending-domain">set up your sending domain</a>.</span>
        </div>
      )}

      <div className="ed-grid">
        <div className="ed-left">
          <div className="ed-card">
            <label className="ed-label" htmlFor="ed-subject">Subject line</label>
            <input id="ed-subject" className="ed-input" value={draft.subject} placeholder="What’s new at {{store_name}}" {...field(v => { setDraft(d => ({ ...d, subject: v })); setDirty(true) })} onChange={e => { setDraft(d => ({ ...d, subject: e.target.value })); setDirty(true) }} />
            <p className={`ed-hint ${sh.tone}`}>{sh.text}</p>
            <label className="ed-label" htmlFor="ed-preview" style={{ marginTop: 12 }}>Preview text</label>
            <input id="ed-preview" className="ed-input" value={draft.previewText} placeholder="The line inboxes show after the subject" {...field(v => { setDraft(d => ({ ...d, previewText: v })); setDirty(true) })} onChange={e => { setDraft(d => ({ ...d, previewText: e.target.value })); setDirty(true) }} />
            <p className={`ed-hint ${ph.tone}`}>{ph.text}</p>
            <div className="ed-tags">
              <span className="ed-label" style={{ margin: 0 }}>Personalisation</span>
              {MERGE_TAGS.map(t => <button key={t.token} type="button" className="ed-chip" title={`Example: ${t.sample}`} onMouseDown={e => e.preventDefault()} onClick={() => insertTag(t.token)}>{t.label}</button>)}
            </div>
            <p className="ed-hint">Tags are filled in for each customer. Write a fallback after a bar: {'{{first_name|there}}'}.</p>
          </div>

          <div className="ed-blocks">
            {blocks.map((b, i) => {
              const open = selected === b.id
              const isFooter = b.type === 'footer'
              return (
                <div key={b.id} className={`ed-block${open ? ' open' : ''}`}>
                  <div className="ed-block-head" onClick={() => setSelected(open ? null : b.id)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter') setSelected(open ? null : b.id) }} aria-expanded={open}>
                    <span className="ed-block-ic"><DIcon name={b.type} /></span>
                    <span className="ed-block-title"><b>{BLOCK_LABEL[b.type]}</b><small>{summary(b)}</small></span>
                    {!isFooter && (
                      <span className="ed-block-actions" onClick={e => e.stopPropagation()}>
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(b.id, -1)}><DIcon name="up" size={15} /></button>
                        <button type="button" aria-label="Move down" disabled={blocks[i + 1]?.type === 'footer' || i === blocks.length - 1} onClick={() => move(b.id, 1)}><DIcon name="down" size={15} /></button>
                        <button type="button" aria-label="Duplicate" onClick={() => duplicate(b.id)}><DIcon name="copy" size={15} /></button>
                        <button type="button" aria-label="Remove" onClick={() => remove(b.id)}><DIcon name="trash" size={15} /></button>
                      </span>
                    )}
                  </div>
                  {open && <div className="ed-block-body"><BlockFields b={b} brand={brand} companyId={companyId} update={p => update(b.id, p)} field={field} wrap={wrap} /></div>}
                </div>
              )
            })}
          </div>

          <div className="ed-card">
            <span className="ed-label">Add a block</span>
            <div className="ed-add">
              {ADDABLE.map(t => <button key={t} type="button" onClick={() => add(t)}><DIcon name={t} size={18} /><span>{BLOCK_LABEL[t]}</span></button>)}
            </div>
          </div>
        </div>

        <div className="ed-right">
          <div className="ed-preview-bar">
            <span className="ed-label" style={{ margin: 0 }}>Preview</span>
            <div className="ed-seg" role="tablist">
              <button type="button" role="tab" aria-selected={view === 'desktop'} className={view === 'desktop' ? 'on' : ''} onClick={() => setView('desktop')}><DIcon name="desktop" size={15} />Desktop</button>
              <button type="button" role="tab" aria-selected={view === 'mobile'} className={view === 'mobile' ? 'on' : ''} onClick={() => setView('mobile')}><DIcon name="mobile" size={15} />Phone</button>
            </div>
          </div>
          <div className="ed-inbox">
            <div className="ed-inbox-from">{sender?.from || brand.name}</div>
            <div className="ed-inbox-subject">{fillTemplate(draft.subject, sampleVars(brand), { html: false }) || 'No subject yet'}</div>
            <div className="ed-inbox-pre">{fillTemplate(draft.previewText, sampleVars(brand), { html: false })}</div>
          </div>
          <div className={`ed-frame ${view}`}>
            <iframe title="Email preview" srcDoc={preview} sandbox="allow-same-origin" />
          </div>
        </div>
      </div>
    </div>
  )
}

type FieldFn = (set: (v: string) => void) => { onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void }

function BlockFields({ b, brand, companyId, update, field, wrap }: { b: Block; brand: EmailBrand; companyId: string; update: (p: Partial<Block>) => void; field: FieldFn; wrap: (a: string, z: string, f: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const urlWarn = (u: string | undefined) => (u && !safeUrl(u) ? <p className="ed-hint bad">Links must start with https://</p> : null)
  const Align = ({ value }: { value?: string }) => (
    <div className="ed-seg small">
      <button type="button" className={value !== 'center' ? 'on' : ''} onClick={() => update({ align: 'left' } as any)}>Left</button>
      <button type="button" className={value === 'center' ? 'on' : ''} onClick={() => update({ align: 'center' } as any)}>Centre</button>
    </div>
  )
  switch (b.type) {
    case 'header':
      return (<>
        <label className="ed-check"><input type="checkbox" checked={b.showLogo !== false} onChange={e => update({ showLogo: e.target.checked })} /> Show your logo{!brand.logoUrl && <small> (add one in Business settings)</small>}</label>
        <label className="ed-check"><input type="checkbox" checked={b.showName !== false} onChange={e => update({ showName: e.target.checked })} /> Show {brand.name}</label>
        <Align value={b.align || 'center'} />
      </>)
    case 'heading':
      return (<>
        <input className="ed-input" value={b.text} {...field(v => update({ text: v }))} onChange={e => update({ text: e.target.value })} />
        <div className="ed-row">
          <div className="ed-seg small">
            <button type="button" className={b.size !== 'md' ? 'on' : ''} onClick={() => update({ size: 'lg' })}>Large</button>
            <button type="button" className={b.size === 'md' ? 'on' : ''} onClick={() => update({ size: 'md' })}>Medium</button>
          </div>
          <Align value={b.align} />
        </div>
      </>)
    case 'text':
      return (<>
        <div className="ed-toolbar">
          <button type="button" aria-label="Bold" onMouseDown={e => e.preventDefault()} onClick={() => wrap('**', '**', 'bold text')}><DIcon name="bold" size={15} /></button>
          <button type="button" aria-label="Italic" onMouseDown={e => e.preventDefault()} onClick={() => wrap('_', '_', 'italic text')}><DIcon name="italic" size={15} /></button>
          <button type="button" aria-label="Link" onMouseDown={e => e.preventDefault()} onClick={() => wrap('[', '](https://)', 'link text')}><DIcon name="link" size={15} /></button>
          <span className="ed-hint" style={{ margin: '0 0 0 6px' }}>Select words, then pick a style. A blank line starts a new paragraph.</span>
        </div>
        <textarea className="ed-input" rows={7} value={b.text} {...field(v => update({ text: v }))} onChange={e => update({ text: e.target.value })} />
        <Align value={b.align} />
      </>)
    case 'image':
      return (<>
        <div className="ed-row">
          <button type="button" className="ed-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}><DIcon name="upload" size={15} />{uploading ? 'Uploading…' : b.src ? 'Replace picture' : 'Upload a picture'}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={async e => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            setUploading(true); setErr('')
            try { update({ src: await uploadImage(companyId, f) }) } catch (x: any) { setErr(x.message) }
            setUploading(false)
          }} />
        </div>
        {err && <p className="ed-hint bad">{err}</p>}
        <label className="ed-label">Or paste a picture link</label>
        <input className="ed-input" value={b.src} placeholder="https://" onChange={e => update({ src: e.target.value })} />
        {b.src && !safeImage(b.src) && <p className="ed-hint bad">Picture links must start with https://</p>}
        <label className="ed-label">Describe the picture (alt text)</label>
        <input className="ed-input" value={b.alt} placeholder="For people who can’t see pictures" onChange={e => update({ alt: e.target.value })} />
        <label className="ed-label">Link when tapped (optional)</label>
        <input className="ed-input" value={b.url || ''} placeholder="https://" onChange={e => update({ url: e.target.value })} />
        {urlWarn(b.url)}
      </>)
    case 'button':
      return (<>
        <div className="ed-row2">
          <div><label className="ed-label">Label</label><input className="ed-input" value={b.label} onChange={e => update({ label: e.target.value })} /></div>
          <div><label className="ed-label">Colour</label><input className="ed-color" type="color" value={b.color || brand.accent || '#ff7a6b'} onChange={e => update({ color: e.target.value })} /></div>
        </div>
        <label className="ed-label">Link</label>
        <input className="ed-input" value={b.url} placeholder="https://" onChange={e => update({ url: e.target.value })} />
        {urlWarn(b.url)}
        <p className="ed-hint">Clicks are tracked and show in the campaign report and Link Reports.</p>
        <Align value={b.align} />
      </>)
    case 'products':
      return <ProductsFields b={b} companyId={companyId} update={update} />
    case 'coupon':
      return (<>
        <div className="ed-row2">
          <div><label className="ed-label">Code</label><input className="ed-input" value={b.code} placeholder="SAVE20" {...field(v => update({ code: v }))} onChange={e => update({ code: e.target.value })} /></div>
          <div><label className="ed-label">Title</label><input className="ed-input" value={b.title || ''} onChange={e => update({ title: e.target.value })} /></div>
        </div>
        <label className="ed-label">Small print</label>
        <input className="ed-input" value={b.note || ''} placeholder="Ends Sunday. One per customer." onChange={e => update({ note: e.target.value })} />
        <p className="ed-hint">Use the Coupon code tag to give each customer the code from the campaign.</p>
      </>)
    case 'divider':
      return <p className="ed-hint">A thin line to separate sections.</p>
    case 'spacer':
      return (<>
        <label className="ed-label">Height: {b.height || 24}px</label>
        <input type="range" min={8} max={80} step={4} value={b.height || 24} onChange={e => update({ height: Number(e.target.value) })} style={{ width: '100%' }} />
      </>)
    case 'social':
      return (<>
        {b.links.map((l, i) => (
          <div key={i} className="ed-row">
            <select className="ed-input" style={{ maxWidth: 150 }} value={l.network} onChange={e => update({ links: b.links.map((x, j) => (j === i ? { ...x, network: e.target.value as any } : x)) })}>
              {NETWORKS.map(n => <option key={n} value={n}>{NETWORK_LABEL[n]}</option>)}
            </select>
            <input className="ed-input" value={l.url} placeholder="https://" onChange={e => update({ links: b.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="ed-ghost ed-iconbtn" aria-label="Remove link" onClick={() => update({ links: b.links.filter((_, j) => j !== i) })}><DIcon name="trash" size={15} /></button>
          </div>
        ))}
        <button type="button" className="ed-ghost" onClick={() => update({ links: [...b.links, { network: NETWORKS[b.links.length % NETWORKS.length], url: '' }] })}><DIcon name="plus" size={15} />Add a link</button>
      </>)
    case 'footer':
      return (<>
        <label className="ed-label">Business address</label>
        <input className="ed-input" value={b.address ?? brand.address ?? ''} placeholder="Shop 1, 10 Main Street, Somerton VIC 3062" onChange={e => update({ address: e.target.value })} />
        <label className="ed-label">Why they’re getting this</label>
        <input className="ed-input" value={b.note || ''} placeholder={`You’re getting this because you agreed to hear from ${brand.name}.`} onChange={e => update({ note: e.target.value })} />
        <p className="ed-hint">Every email ends with your business name, address and working Unsubscribe and Update your preferences links, as the Spam Act requires. They can’t be removed.</p>
      </>)
  }
}

function ProductsFields({ b, companyId, update }: { b: Extract<Block, { type: 'products' }>; companyId: string; update: (p: Partial<Block>) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const items = b.items.filter(p => p.name || p.image)
  const search = async () => {
    if (!q.trim()) return
    setBusy(true); setNote('')
    try {
      const r = await authFetch(`/api/orders/products?companyId=${encodeURIComponent(companyId)}&q=${encodeURIComponent(q.trim())}`)
      const d = await r.json().catch(() => ({}))
      setResults((d.products || []).slice(0, 12))
      if (!(d.products || []).length) setNote('No products found. Connect your WooCommerce or Shopify store, or add a product by hand below.')
    } catch { setNote('Couldn’t search your products just now.') }
    setBusy(false)
  }
  const addProduct = (p: any) => {
    const img = typeof p.image === 'string' ? p.image : (p.image?.src || p.images?.[0]?.src || '')
    const item: ProductItem = { name: String(p.name || ''), price: money(p.sale_price || p.price), image: img, url: p.permalink || '' }
    update({ items: [...items, item].slice(0, 8) })
  }
  const set = (i: number, patch: Partial<ProductItem>) => update({ items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (<>
    <div className="ed-row">
      <input className="ed-input" value={q} placeholder="Search your products by name or SKU" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); search() } }} />
      <button type="button" className="ed-ghost" onClick={search} disabled={busy}><DIcon name="search" size={15} />{busy ? 'Searching…' : 'Search'}</button>
    </div>
    {note && <p className="ed-hint">{note}</p>}
    {results.length > 0 && (
      <div className="ed-results">
        {results.map((p: any) => {
          const img = typeof p.image === 'string' ? p.image : p.image?.src
          return (
            <button key={String(p.id)} type="button" onClick={() => addProduct(p)}>
              {img ? <img src={img} alt="" /> : <span className="ed-noimg" />}
              <span><b>{p.name}</b><small>{money(p.sale_price || p.price)}</small></span>
              <DIcon name="plus" size={15} />
            </button>
          )
        })}
      </div>
    )}
    {items.map((p, i) => (
      <div key={i} className="ed-product">
        {safeImage(p.image) ? <img src={p.image} alt="" /> : <span className="ed-noimg" />}
        <div className="ed-product-fields">
          <input className="ed-input" value={p.name} placeholder="Product name" onChange={e => set(i, { name: e.target.value })} />
          <div className="ed-row2">
            <input className="ed-input" value={p.price || ''} placeholder="$0.00" onChange={e => set(i, { price: e.target.value })} />
            <input className="ed-input" value={p.url || ''} placeholder="https:// product page" onChange={e => set(i, { url: e.target.value })} />
          </div>
        </div>
        <button type="button" className="ed-ghost ed-iconbtn" aria-label="Remove product" onClick={() => update({ items: items.filter((_, j) => j !== i) })}><DIcon name="trash" size={15} /></button>
      </div>
    ))}
    <div className="ed-row">
      <button type="button" className="ed-ghost" onClick={() => update({ items: [...items, { name: '', price: '', image: '', url: '' }].slice(0, 8) })}><DIcon name="plus" size={15} />Add by hand</button>
      <label className="ed-label" style={{ margin: '0 0 0 auto' }}>Button</label>
      <input className="ed-input" style={{ maxWidth: 140 }} value={b.buttonLabel || ''} onChange={e => update({ buttonLabel: e.target.value })} />
    </div>
  </>)
}

const CSS = `
.ed{display:flex;flex-direction:column;gap:14px;min-width:0}
.ed *{box-sizing:border-box}
.ed-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ed-name{flex:1 1 240px;min-width:0;font-size:20px;font-weight:800;color:var(--ink);border:1px solid transparent;border-radius:10px;padding:6px 10px;background:transparent;font-family:inherit}
.ed-name:hover,.ed-name:focus{border-color:var(--border);background:#fff;outline:none}
.ed-top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ed-msg{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--slate)}.ed-msg.ok{color:#067647}.ed-msg.bad{color:#b42318}
.ed-primary,.ed-ghost{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap}
.ed-primary{background:var(--coral);color:#fff;border:1px solid var(--coral)}
.ed-ghost{background:#fff;color:var(--ink);border:1px solid var(--border)}
.ed-primary:disabled,.ed-ghost:disabled{opacity:.55;cursor:default}
.ed-iconbtn{width:38px;padding:0;justify-content:center;flex-shrink:0}
.ed-warn{display:flex;gap:10px;align-items:flex-start;padding:11px 14px;border:1px solid #fedf89;background:#fffaeb;color:#93370d;border-radius:12px;font-size:13.5px;line-height:1.5}
.ed-warn svg{flex-shrink:0;margin-top:2px}.ed-warn a{color:#93370d;font-weight:700}
.ed-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:16px;align-items:start}
.ed-left{display:flex;flex-direction:column;gap:12px;min-width:0}
.ed-right{display:flex;flex-direction:column;gap:10px;min-width:0;border:1px solid var(--border);border-radius:14px;background:var(--canvas,#f4f4f5);padding:12px}
.ed-card{border:1px solid var(--border);border-radius:14px;background:#fff;padding:16px}
.ed-label{display:block;font-size:12.5px;font-weight:700;color:var(--ink);margin:8px 0 6px}
.ed-input{width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--border);font-size:14px;font-family:inherit;color:var(--ink);background:#fff;outline:none;min-width:0}
.ed-input:focus{border-color:var(--coral)}
textarea.ed-input{resize:vertical;line-height:1.5}
.ed-color{width:100%;height:38px;border:1px solid var(--border);border-radius:10px;padding:3px;background:#fff}
.ed-hint{font-size:12px;color:var(--slate);margin:5px 0 0;line-height:1.45}.ed-hint.ok{color:#067647}.ed-hint.warn{color:#b54708}.ed-hint.bad{color:#b42318}
.ed-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:12px}
.ed-chip{padding:5px 10px;border-radius:7px;border:1px solid var(--border);background:var(--canvas,#f4f4f5);font-size:12px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit}
.ed-chip:hover{color:var(--ink)}
.ed-blocks{display:flex;flex-direction:column;gap:8px}
.ed-block{border:1px solid var(--border);border-radius:12px;background:#fff;overflow:hidden}
.ed-block.open{border-color:var(--coral)}
.ed-block-head{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;min-width:0}
.ed-block-ic{width:32px;height:32px;border-radius:9px;background:var(--canvas,#f4f4f5);color:var(--ink);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.ed-block-title{display:flex;flex-direction:column;min-width:0;flex:1}.ed-block-title b{font-size:13.5px;color:var(--ink)}
.ed-block-title small{font-size:12px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-block-actions{display:flex;gap:2px;flex-shrink:0}
.ed-block-actions button{width:30px;height:30px;border:none;background:none;border-radius:8px;color:var(--slate);cursor:pointer;display:flex;align-items:center;justify-content:center}
.ed-block-actions button:hover:not(:disabled){background:var(--canvas,#f4f4f5);color:var(--ink)}
.ed-block-actions button:disabled{opacity:.3;cursor:default}
.ed-block-body{padding:4px 14px 14px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px}
.ed-row{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.ed-row > .ed-input{flex:1 1 160px}
.ed-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ed-check{display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--ink);padding:4px 0}.ed-check small{color:var(--slate)}
.ed-toolbar{display:flex;align-items:center;gap:4px;margin-top:8px;flex-wrap:wrap}
.ed-toolbar button{width:32px;height:30px;border:1px solid var(--border);background:#fff;border-radius:8px;cursor:pointer;color:var(--ink);display:flex;align-items:center;justify-content:center}
.ed-seg{display:inline-flex;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:#fff;margin-top:6px}
.ed-seg button{display:inline-flex;align-items:center;gap:6px;border:none;background:none;padding:7px 12px;font-size:13px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit}
.ed-seg button.on{background:var(--ink);color:#fff}
.ed-seg.small button{padding:5px 10px;font-size:12.5px}
.ed-add{display:grid;grid-template-columns:repeat(auto-fill,minmax(108px,1fr));gap:8px}
.ed-add button{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--ink);font-family:inherit}
.ed-add button:hover{border-color:var(--coral);color:var(--coral)}
.ed-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;margin-top:6px}
.ed-results button{display:flex;align-items:center;gap:8px;padding:6px;border:1px solid var(--border);border-radius:10px;background:#fff;cursor:pointer;text-align:left;font-family:inherit;min-width:0}
.ed-results img,.ed-product img,.ed-noimg{width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;background:var(--canvas,#f4f4f5);display:block}
.ed-results span{display:flex;flex-direction:column;min-width:0;flex:1}.ed-results b{font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ed-results small{font-size:12px;color:var(--slate)}
.ed-product{display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid var(--border);border-radius:10px;margin-top:6px}
.ed-product-fields{flex:1;display:flex;flex-direction:column;gap:6px;min-width:0}
.ed-preview-bar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.ed-preview-bar .ed-seg{margin:0}
.ed-inbox{background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px 12px;min-width:0}
.ed-inbox-from{font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-inbox-subject{font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-inbox-pre{font-size:12.5px;color:var(--slate);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-frame{display:flex;justify-content:center;min-width:0}
.ed-frame iframe{border:1px solid var(--border);background:#fff;height:calc(100vh - 230px);min-height:560px;border-radius:10px;display:block}
.ed-frame.desktop iframe{width:100%}
.ed-frame.mobile iframe{width:390px;max-width:100%;border-radius:22px;border:8px solid #18181b}
@media (min-width:1101px){
  /* Editor and preview side by side, each the height of the screen: the blocks scroll, the preview stays in view. */
  .ed-grid{height:calc(100vh - 250px);min-height:600px;align-items:stretch}
  .ed-left{overflow-y:auto;height:100%;padding-right:4px;overscroll-behavior:contain}
  .ed-right{position:static;height:100%}
  .ed-frame{flex:1;min-height:0}
  .ed-frame iframe{height:100%;min-height:0}
}
@media (max-width:1100px){.ed-grid{grid-template-columns:minmax(0,1fr)}.ed-right{position:static}.ed-frame iframe{height:640px}}
@media (max-width:600px){.ed-row2{grid-template-columns:1fr}.ed-top-actions{width:100%}.ed-top-actions .ed-primary,.ed-top-actions .ed-ghost{flex:1;justify-content:center}.ed-name{font-size:18px}}
`
