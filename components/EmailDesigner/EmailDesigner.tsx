'use client'

// The email designer: a block editor beside a live preview. Content (subject,
// preview text, blocks to add, edit, drag and reorder), Design (background,
// accent, font, corners and buttons for the whole email) and Checks (what to
// fix before sending). The preview shows the email on a phone, in a desktop
// mail app, or as it sits in the inbox; click a block in it to edit that
// block. Undo and redo (Ctrl/Cmd+Z), starter templates, merge tags, emoji in
// the subject, image upload, products from the store, and "Send test email".
// Saves through /api/email-campaigns/designs (server renders and stores the
// HTML with the same renderer as this preview).
//
// Self-contained so the campaign wizard can drop it in for email campaigns:
// pass campaignId and it saves the design against that campaign.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import TickSlider from '@/components/TickSlider'
import EmojiPicker from '@/components/EmojiPicker'
import { authFetch } from '@/lib/auth-fetch'
import { DEFAULT_ACCENT, FONTS, fillTemplate, renderEmail, sampleVars, safeImage, safeUrl, videoThumb } from './render'
import { blankBlock, newId, type StarterTemplate } from './templates'
import { DIcon } from './icons'
import { runChecks, openIssues } from './checks'
import { DesktopPreview, InboxPreview, PhonePreview, DEVICES_CSS } from './Devices'
import TemplatePicker from './TemplatePicker'
import { MERGE_TAGS, PREVIEW_HINT, SUBJECT_HINT, type Block, type BlockType, type ColumnItem, type EmailBrand, type EmailDesign, type FontChoice, type ProductItem, type SocialLink } from './types'

export type DesignDraft = { id?: string | null; name: string; subject: string; previewText: string; design: EmailDesign }
export type SenderInfo = { from: string; shared: boolean; replyTo?: string | null } | null

const BLOCK_LABEL: Record<BlockType, string> = {
  header: 'Logo and name', heading: 'Heading', text: 'Text', image: 'Picture', button: 'Button', products: 'Products',
  coupon: 'Coupon', divider: 'Divider', spacer: 'Space', social: 'Social links', columns: 'Two columns', video: 'Video', menu: 'Menu links', footer: 'Footer',
}
// Grouped, so the add menu reads like a toolbox.
const ADD_GROUPS: { name: string; types: BlockType[] }[] = [
  { name: 'Basics', types: ['heading', 'text', 'image', 'button'] },
  { name: 'Layout', types: ['columns', 'divider', 'spacer', 'menu'] },
  { name: 'Selling', types: ['products', 'coupon', 'video', 'social', 'header'] },
]
const NETWORKS: SocialLink['network'][] = ['facebook', 'instagram', 'tiktok', 'youtube', 'x', 'linkedin', 'website']
const NETWORK_LABEL: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', website: 'Website' }

const BG_SWATCHES = ['#f4f4f5', '#ffffff', '#fbf7f1', '#eef7f2', '#eef3fb', '#f6effa', '#fdf0f0', '#1f2430']
const ACCENT_SWATCHES = ['#ff7a6b', '#e8590c', '#d6336c', '#7048e8', '#1c7ed6', '#0ca678', '#2b8a3e', '#111827']

function summary(b: Block): string {
  switch (b.type) {
    case 'heading': case 'text': return b.text.replace(/\s+/g, ' ').slice(0, 70)
    case 'image': return b.src ? (b.alt || 'Picture') : 'No picture yet'
    case 'button': return b.label ? `${b.label}${b.url ? '' : ' (no link yet)'}` : 'No label yet'
    case 'products': return b.items.filter(p => p.name).length ? `${b.items.filter(p => p.name).length} product${b.items.filter(p => p.name).length === 1 ? '' : 's'}` : 'No products yet'
    case 'coupon': return b.code || 'No code yet'
    case 'social': return b.links.length ? b.links.map(l => NETWORK_LABEL[l.network]).join(', ') : 'No links yet'
    case 'spacer': return `${b.height || 24}px`
    case 'columns': return (b.items || []).map(c => c?.title || (c?.image ? 'Picture' : '')).filter(Boolean).join(' · ') || 'Empty columns'
    case 'video': return b.url ? (videoThumb(b.url) ? 'YouTube video' : 'Video link') : 'No video link yet'
    case 'menu': return (b.links || []).map(l => l.label).filter(Boolean).join(' · ') || 'No links yet'
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

/** A switch row (title, optional line, switch on the right). */
function Switch({ on, onChange, title, sub }: { on: boolean; onChange: (v: boolean) => void; title: string; sub?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ed-switch" onClick={() => onChange(!on)}>
      <span className="ed-switch-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      <span className="ed-sw" aria-hidden />
    </button>
  )
}

/** Upload a picture or paste its link, with a thumbnail. */
function ImageField({ src, companyId, onSrc }: { src: string; companyId: string; onSrc: (v: string) => void }) {
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <div className="ed-img">
      <span className="ed-img-thumb">{safeImage(src) ? <img src={src} alt="" /> : <DIcon name="image" size={20} />}</span>
      <div className="ed-img-t">
        <div className="ed-row" style={{ marginTop: 0 }}>
          <button type="button" className="ed-ghost" disabled={uploading} onClick={() => fileRef.current?.click()}><DIcon name="upload" size={15} />{uploading ? 'Uploading…' : src ? 'Replace' : 'Upload'}</button>
          {src && <button type="button" className="ed-ghost ed-iconbtn" aria-label="Remove picture" onClick={() => onSrc('')}><DIcon name="trash" size={15} /></button>}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={async e => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          setUploading(true); setErr('')
          try { onSrc(await uploadImage(companyId, f)) } catch (x: any) { setErr(x.message) }
          setUploading(false)
        }} />
        <input className="ed-input" value={src} placeholder="Or paste a picture link (https://)" onChange={e => onSrc(e.target.value)} />
        {err && <p className="ed-hint bad">{err}</p>}
        {src && !safeImage(src) && <p className="ed-hint bad">Picture links must start with https://</p>}
      </div>
    </div>
  )
}

type Tab = 'content' | 'design' | 'checks'
type View = 'phone' | 'desktop' | 'inbox'

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
  const [tab, setTab] = useState<Tab>('content')
  const [view, setView] = useState<View>('phone')
  const [busy, setBusy] = useState<'' | 'save' | 'test'>('')
  const [msg, setMsg] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  // Side-by-side layout: the grid fills the rest of the screen below the bar and
  // banner (whatever their height), so the whole phone is always in view.
  const gridRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const fit = () => {
      const top = el.getBoundingClientRect().top + window.scrollY
      el.style.setProperty('--ed-h', `${Math.max(560, Math.round(window.innerHeight - top - 18))}px`)
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (el.parentElement) ro.observe(el.parentElement)
    window.addEventListener('resize', fit)
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [])
  const [drag, setDragState] = useState<{ id: string; over?: string; after?: boolean } | null>(null)
  // The drag also lives in a ref: dragover/drop can arrive before React re-renders.
  const dragRef = useRef<{ id: string; over?: string; after?: boolean } | null>(null)
  const setDrag = (d: { id: string; over?: string; after?: boolean } | null) => {
    dragRef.current = d; setDragState(d)
    if (!d) stopAutoScroll()
    else if (!autoScroll.current) startAutoScroll()
  }

  // While a block is being dragged, holding it near the top or bottom edge of the
  // list scrolls the list (or the page, when the editor isn't side by side), faster
  // the closer to the edge, so a block can travel any distance in one drag.
  const paneRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef<{ x: number; y: number; raf: number; t: number; acc: number; onOver: (e: DragEvent) => void; onLeave: (e: DragEvent) => void } | null>(null)
  const stopAutoScroll = () => {
    const a = autoScroll.current
    if (!a) return
    cancelAnimationFrame(a.raf)
    document.removeEventListener('dragover', a.onOver, true)
    document.removeEventListener('dragleave', a.onLeave, true)
    autoScroll.current = null
  }
  const startAutoScroll = () => {
    stopAutoScroll()
    const a = {
      x: -1, y: -1, raf: 0, t: 0, acc: 0,
      onOver: (e: DragEvent) => { a.x = e.clientX; a.y = e.clientY },
      // Left the window (or went into the preview's frame): stop until it's back.
      onLeave: (e: DragEvent) => { if (!e.relatedTarget) a.y = -1 },
    }
    autoScroll.current = a
    document.addEventListener('dragover', a.onOver, true)
    document.addEventListener('dragleave', a.onLeave, true)
    const tick = (now: number) => {
      if (autoScroll.current !== a) return
      // Speed in pixels per second, so it feels the same on 60 Hz and 120 Hz screens.
      const dt = a.t ? Math.min(50, now - a.t) : 16
      a.t = now
      if (a.y >= 0) {
        const pane = paneRef.current
        const inner = !!pane && pane.scrollHeight > pane.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(pane).overflowY)
        const r = inner ? pane!.getBoundingClientRect() : { top: 0, bottom: window.innerHeight }
        // The page case has fixed bars at the top and bottom on phones, so give it a deeper edge.
        const zone = Math.min(inner ? 80 : 120, (r.bottom - r.top) / 3)
        const beside = inner && (a.x < (r as DOMRect).left || a.x > (r as DOMRect).right)
        const pull = beside ? 0 : a.y < r.top + zone ? -Math.min(1, (r.top + zone - a.y) / zone) : a.y > r.bottom - zone ? Math.min(1, (a.y - (r.bottom - zone)) / zone) : 0
        if (!pull) a.acc = 0
        else {
          // Whole pixels only (carrying the rest), so slow speeds still move on every screen.
          a.acc += Math.sign(pull) * (180 + pull * pull * 1200) * dt / 1000
          const step = Math.trunc(a.acc)
          a.acc -= step
          if (step) { if (inner) pane!.scrollTop += step; else window.scrollBy(0, step); if (touchRef.current?.live) retarget() }
        }
      }
      a.raf = requestAnimationFrame(tick)
    }
    a.raf = requestAnimationFrame(tick)
  }
  useEffect(() => () => stopAutoScroll(), [])

  // Phones and tablets: their browsers don't do drag-and-drop, so blocks move by
  // touch instead. Grab the dots to drag straight away, or press and hold a
  // block's header. A lifted copy follows the finger; the drop line and the edge
  // scrolling are the same as with a mouse.
  type TouchDrag = {
    id: string; pid: number; el: HTMLElement
    x: number; y: number; x0: number; y0: number
    hx: number; grabY: number; live: boolean; timer: number; off: () => void
  }
  const touchRef = useRef<TouchDrag | null>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const [ghost, setGhost] = useState<{ id: string; left: number; width: number; top: number } | null>(null)
  const lastTouchDrop = useRef(0)
  const [touchUI, setTouchUI] = useState(false)
  useEffect(() => {
    // No hover = a touch screen: skip the browser's own drag (it can cancel ours).
    try { setTouchUI(window.matchMedia('(hover: none)').matches) } catch {}
    // Mobile browsers only let a page stop the scroll if a non-passive touchmove
    // listener is already there when the finger lands, so it stays for the editor's life.
    const noScroll = (e: TouchEvent) => { if (touchRef.current?.live && e.cancelable) e.preventDefault() }
    document.addEventListener('touchmove', noScroll, { passive: false })
    return () => { document.removeEventListener('touchmove', noScroll); touchRef.current?.off() }
  }, [])
  const placeGhost = () => {
    const t = touchRef.current, g = ghostRef.current
    if (t?.live && g) g.style.transform = `translate3d(0,${Math.round(t.y - t.grabY)}px,0)`
  }
  // Which block is under the finger, and which half of it.
  const retarget = () => {
    const t = touchRef.current
    if (!t?.live) return
    const el = (document.elementFromPoint(t.hx, t.y) as HTMLElement | null)?.closest<HTMLElement>('.ed-block')
    if (!el || !el.id.startsWith('ed-b-')) return
    const id = el.id.slice(5), r = el.getBoundingClientRect(), after = t.y > r.top + r.height / 2
    const d = dragRef.current
    if (d && (d.over !== id || d.after !== after)) setDrag({ ...d, over: id, after })
  }
  const beginTouch = () => {
    const t = touchRef.current
    if (!t || t.live) return
    t.live = true
    const r = t.el.getBoundingClientRect()
    t.grabY = t.y - r.top
    t.hx = r.left + Math.min(90, r.width / 2)
    setGhost({ id: t.id, left: r.left, width: r.width, top: r.top })
    setDrag({ id: t.id })
    const a = autoScroll.current
    if (a) { a.x = t.x; a.y = t.y }
    try { navigator.vibrate?.(12) } catch {}
  }
  const touchStart = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === 'mouse' || touchRef.current || e.button > 0) return
    if ((e.target as HTMLElement).closest('.ed-block-actions')) return
    const el = (e.currentTarget as HTMLElement).closest<HTMLElement>('.ed-block')
    if (!el) return
    const t: TouchDrag = { id, pid: e.pointerId, el, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, hx: 0, grabY: 0, live: false, timer: 0, off: () => {} }
    const finish = (drop: boolean) => {
      window.clearTimeout(t.timer)
      t.off()
      if (touchRef.current === t) touchRef.current = null
      if (!t.live) return
      const d = dragRef.current
      if (drop && d?.over && d.over !== d.id) moveTo(d.id, d.over, !!d.after)
      lastTouchDrop.current = Date.now()
      setGhost(null)
      setDrag(null)
    }
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== t.pid) return
      t.x = ev.clientX; t.y = ev.clientY
      if (!t.live) {
        // Moved before the hold finished: they're scrolling, not dragging.
        if (Math.hypot(t.x - t.x0, t.y - t.y0) > 10) finish(false)
        return
      }
      const a = autoScroll.current
      if (a) { a.x = t.x; a.y = t.y }
      placeGhost()
      retarget()
    }
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === t.pid) finish(true) }
    const onCancel = (ev: PointerEvent) => { if (ev.pointerId === t.pid) finish(false) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    t.off = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
    touchRef.current = t
    if ((e.target as HTMLElement).closest('.ed-grip')) beginTouch()
    else t.timer = window.setTimeout(beginTouch, 380)
  }
  const lastField = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; set: (v: string) => void } | null>(null)
  const subjectRef = useRef<HTMLInputElement>(null)

  // ── Undo / redo ───────────────────────────────────────────────────────────
  // Every change goes through change(). Typing in a field folds into one step
  // (a new step only after a short pause), so undo goes back a word, not a letter.
  const draftRef = useRef(draft)
  const hist = useRef<{ past: DesignDraft[]; future: DesignDraft[]; at: number }>({ past: [], future: [], at: 0 })
  const [, bump] = useState(0)
  const change = useCallback((fn: (d: DesignDraft) => DesignDraft) => {
    const cur = draftRef.current
    const next = fn(cur)
    if (next === cur) return
    const h = hist.current, now = Date.now()
    if (now - h.at > 800) { h.past.push(cur); if (h.past.length > 120) h.past.shift() }
    h.at = now; h.future = []
    draftRef.current = next; setDraft(next); setDirty(true); bump(x => x + 1)
  }, [])
  const undo = useCallback(() => {
    const h = hist.current
    setMsg(null)
    const prev = h.past.pop(); if (!prev) return
    h.future.push(draftRef.current); h.at = 0
    draftRef.current = prev; setDraft(prev); setDirty(true); bump(x => x + 1)
  }, [])
  const redo = useCallback(() => {
    const h = hist.current
    setMsg(null)
    const next = h.future.pop(); if (!next) return
    h.past.push(draftRef.current); h.at = 0
    draftRef.current = next; setDraft(next); setDirty(true); bump(x => x + 1)
  }, [])
  useEffect(() => {
    draftRef.current = initial; hist.current = { past: [], future: [], at: 0 }
    setDraft(initial); setDirty(false)
  }, [initial])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      // In a text field the browser's own undo handles typing.
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) redo(); else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const blocks = draft.design.blocks
  const setBlocks = (fn: (bs: Block[]) => Block[]) => change(d => ({ ...d, design: { ...d.design, blocks: fn(d.design.blocks) } }))
  const setDesign = (patch: Partial<EmailDesign>) => change(d => ({ ...d, design: { ...d.design, ...patch } }))
  const update = (id: string, patch: Partial<Block>) => setBlocks(bs => bs.map(b => (b.id === id ? ({ ...b, ...patch } as Block) : b)))
  const move = (id: string, dir: -1 | 1) => setBlocks(bs => {
    const i = bs.findIndex(b => b.id === id), j = i + dir
    if (i < 0 || j < 0 || j >= bs.length || bs[j].type === 'footer') return bs
    const c = [...bs]; [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const moveTo = (id: string, target: string, after: boolean) => setBlocks(bs => {
    if (id === target) return bs
    const item = bs.find(b => b.id === id); if (!item || item.type === 'footer') return bs
    const rest = bs.filter(b => b.id !== id)
    let at = rest.findIndex(b => b.id === target); if (at < 0) return bs
    if (after && rest[at].type !== 'footer') at += 1
    const f = rest.findIndex(b => b.type === 'footer')
    if (f >= 0 && at > f) at = f
    const c = [...rest]; c.splice(at, 0, item); return c
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
    requestAnimationFrame(() => document.getElementById(`ed-b-${b.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }
  // A footer is always there (unsubscribe link); put one back if it was removed.
  useEffect(() => { if (!blocks.some(b => b.type === 'footer')) setBlocks(bs => [...bs, blankBlock('footer')]) }, [blocks]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (t: StarterTemplate | null) => {
    const design = t ? t.design() : { version: 1 as const, blocks: [blankBlock('header'), blankBlock('heading'), blankBlock('text'), blankBlock('button'), blankBlock('footer')] }
    change(d => ({ ...d, subject: t?.subject || d.subject, previewText: t?.previewText || d.previewText, design: { ...design, background: d.design.background, accent: d.design.accent, font: d.design.font, corners: d.design.corners, buttonStyle: d.design.buttonStyle, buttonShape: d.design.buttonShape } }))
    setShowTemplates(false); setSelected(null); setTab('content')
    setMsg({ text: `${t ? t.name : 'Blank'} template applied. Undo to go back.`, tone: 'ok' })
  }

  const accent = draft.design.accent || brand.accent || DEFAULT_ACCENT
  const preview = useMemo(() => {
    const r = renderEmail(draft.design, brand, { subject: draft.subject, previewText: draft.previewText, preview: true })
    return fillTemplate(r.html, sampleVars(brand), { html: true })
  }, [draft.design, draft.subject, draft.previewText, brand])
  const checks = useMemo(() => runChecks(draft), [draft])
  const issues = openIssues(checks)

  // ── Preview: click a block to edit it; keep the scroll and the selection ──
  const frame = useRef<HTMLIFrameElement | null>(null)
  const frameScroll = useRef(0)
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const markSelected = useCallback((scroll: boolean) => {
    const doc = frame.current?.contentDocument
    if (!doc) return
    doc.querySelectorAll('[data-sel]').forEach(el => el.removeAttribute('data-sel'))
    const id = selectedRef.current
    if (!id) return
    const footerId = draftRef.current.design.blocks.find(b => b.type === 'footer')?.id
    const el = doc.querySelector(`[data-bid="${CSS.escape(id)}"]`) || (id === footerId ? doc.querySelector('[data-bid="footer"]') : null)
    if (!el) return
    el.setAttribute('data-sel', '')
    if (scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [])
  const onFrameLoad = useCallback(() => {
    const win = frame.current?.contentWindow, doc = frame.current?.contentDocument
    if (!win || !doc) return
    win.scrollTo(0, frameScroll.current)
    win.addEventListener('scroll', () => { frameScroll.current = win.scrollY }, { passive: true })
    doc.addEventListener('click', e => {
      const t = e.target as Element | null
      if (t?.closest('a')) e.preventDefault()
      const row = t?.closest('[data-bid]')
      if (!row) return
      let id = row.getAttribute('data-bid') || ''
      if (id === 'footer') id = draftRef.current.design.blocks.find(b => b.type === 'footer')?.id || ''
      if (!id) return
      setTab('content'); setSelected(id)
      requestAnimationFrame(() => document.getElementById(`ed-b-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    })
    markSelected(false)
  }, [markSelected])
  useEffect(() => { markSelected(true) }, [selected, markSelected])
  useEffect(() => { frameScroll.current = 0 }, [view])

  const field = (set: (v: string) => void) => ({
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { lastField.current = { el: e.currentTarget, set } },
  })
  const insertAt = (el: HTMLInputElement | HTMLTextAreaElement, set: (v: string) => void, text: string) => {
    const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start
    set(el.value.slice(0, start) + text + el.value.slice(end))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length) })
  }
  const insertTag = (token: string) => {
    const f = lastField.current
    if (!f || !document.body.contains(f.el)) { setMsg({ text: 'Click into a heading, text or the subject first, then pick a tag.', tone: 'bad' }); return }
    insertAt(f.el, f.set, `{{${token}}}`)
  }
  const wrap = (before: string, after: string, fallback: string) => {
    const f = lastField.current
    if (!f || f.el.tagName !== 'TEXTAREA') return
    const el = f.el, s = el.selectionStart ?? 0, e = el.selectionEnd ?? s
    const inner = el.value.slice(s, e) || fallback
    f.set(el.value.slice(0, s) + before + inner + after + el.value.slice(e))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, s + before.length + inner.length) })
  }
  const setSubject = (v: string) => change(d => ({ ...d, subject: v }))
  const setPreviewText = (v: string) => change(d => ({ ...d, previewText: v }))

  const save = async () => {
    setBusy('save'); setMsg(null)
    try {
      const d = draftRef.current
      const r = await authFetch('/api/email-campaigns/designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, id: d.id || null, campaignId: campaignId || null, name: d.name, subject: d.subject, previewText: d.previewText, design: d.design }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'Couldn’t save')
      const next = { ...draftRef.current, id: j.design?.id || draftRef.current.id }
      draftRef.current = next; setDraft(next); setDirty(false)
      setMsg({ text: 'Saved', tone: 'ok' }); onSaved?.(j.design)
    } catch (e: any) { setMsg({ text: e.message, tone: 'bad' }) }
    setBusy('')
  }
  const sendTest = async () => {
    setBusy('test'); setMsg(null)
    try {
      const d = draftRef.current
      const r = await authFetch('/api/email-campaigns/test-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, subject: d.subject, previewText: d.previewText, design: d.design }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j?.error || 'The test didn’t send')
      setMsg({ text: `Test sent to ${j.to}`, tone: 'ok' })
    } catch (e: any) { setMsg({ text: e.message, tone: 'bad' }) }
    setBusy('')
  }

  const sh = hint(draft.subject.length, SUBJECT_HINT, 'a subject line')
  const ph = hint(draft.previewText.length, PREVIEW_HINT, 'preview text')
  const vars = sampleVars(brand)
  const frameProps = {
    html: preview, from: brand.name, fromAddress: sender?.from?.match(/<([^>]+)>/)?.[1] || sender?.from || undefined,
    subject: fillTemplate(draft.subject, vars, { html: false }), previewText: fillTemplate(draft.previewText, vars, { html: false }),
    accent, iframeRef: frame, onFrameLoad,
  }
  const passed = checks.filter(c => c.ok).length

  return (
    <div className="ed">
      <style>{ED_CSS}</style>
      <style>{DEVICES_CSS}</style>
      <div className="ed-top">
        {onBack && <button type="button" className="ed-ghost ed-iconbtn" onClick={onBack} aria-label="Back"><DIcon name="back" /></button>}
        <input className="ed-name" value={draft.name} onChange={e => change(d => ({ ...d, name: e.target.value }))} aria-label="Email name" placeholder="Name this email" />
        <div className="ed-top-actions">
          {msg && <span className={`ed-msg ${msg.tone}`} role="status">{msg.tone === 'ok' && <DIcon name="check" size={14} />}{msg.text}</span>}
          {!msg && dirty && <span className="ed-msg">Unsaved changes</span>}
          <div className="ed-hist">
            <button type="button" className="ed-iconbtn" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo" title="Undo (Ctrl+Z)"><DIcon name="undo" size={16} /></button>
            <button type="button" className="ed-iconbtn" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><DIcon name="redo" size={16} /></button>
          </div>
          <button type="button" className="ed-ghost" onClick={() => setShowTemplates(true)}><DIcon name="template" size={15} />Templates</button>
          <button type="button" className="ed-ghost" onClick={sendTest} disabled={!!busy}><DIcon name="send" size={15} />{busy === 'test' ? 'Sending…' : 'Send test'}</button>
          <button type="button" className="ed-primary" onClick={save} disabled={!!busy}><DIcon name="save" size={15} />{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {sender?.shared && (
        <div className="ed-warn"><DIcon name="warning" size={16} />
          <span>Sending from <b>{sender.from}</b>, Colvy’s shared address, with replies going to your business. Emails reach more inboxes from your own domain: <a href="/admin/crm-settings/channels/sending-domain">set up your sending domain</a>.</span>
        </div>
      )}

      <div className="ed-grid" ref={gridRef}>
        <div className="ed-left">
          <div className="ed-tabs" role="tablist" aria-label="Editor">
            <button type="button" role="tab" aria-selected={tab === 'content'} className={tab === 'content' ? 'on' : ''} onClick={() => setTab('content')}><DIcon name="layers" size={15} />Content</button>
            <button type="button" role="tab" aria-selected={tab === 'design'} className={tab === 'design' ? 'on' : ''} onClick={() => setTab('design')}><DIcon name="palette" size={15} />Design</button>
            <button type="button" role="tab" aria-selected={tab === 'checks'} className={tab === 'checks' ? 'on' : ''} onClick={() => setTab('checks')}><DIcon name="checks" size={15} />Checks{issues > 0 ? <span className="ed-badge">{issues}</span> : <span className="ed-badge ok"><DIcon name="check" size={11} /></span>}</button>
          </div>

          <div className="ed-pane" ref={paneRef}>
          {tab === 'content' && (<>
            <div className="ed-card">
              <label className="ed-label" htmlFor="ed-subject" style={{ marginTop: 0 }}>Subject line</label>
              <div className="ed-subject">
                <input id="ed-subject" ref={subjectRef} className="ed-input" value={draft.subject} placeholder="What’s new at {{store_name}}" {...field(setSubject)} onChange={e => setSubject(e.target.value)} />
                <button type="button" className="ed-emoji" aria-label="Add an emoji" aria-expanded={showEmoji} onClick={() => setShowEmoji(v => !v)}><DIcon name="emoji" size={18} /></button>
                {showEmoji && (
                  <div className="ed-pop">
                    <EmojiPicker inline onClose={() => setShowEmoji(false)} onSelect={em => { const el = subjectRef.current; if (el) insertAt(el, setSubject, em); setShowEmoji(false) }} />
                  </div>
                )}
              </div>
              <p className={`ed-hint ${sh.tone}`}>{sh.text}</p>
              <label className="ed-label" htmlFor="ed-preview">Preview text</label>
              <input id="ed-preview" className="ed-input" value={draft.previewText} placeholder="The line inboxes show after the subject" {...field(setPreviewText)} onChange={e => setPreviewText(e.target.value)} />
              <p className={`ed-hint ${ph.tone}`}>{ph.text}</p>
              <div className="ed-tags">
                <span className="ed-tags-l">Personalise</span>
                {MERGE_TAGS.map(t => <button key={t.token} type="button" className="ed-chip" title={`Example: ${t.sample}`} onMouseDown={e => e.preventDefault()} onClick={() => insertTag(t.token)}>{t.label}</button>)}
              </div>
              <p className="ed-hint">Tags are filled in for each customer. Add a fallback after a bar: {'{{first_name|there}}'}.</p>
            </div>

            <div className="ed-sec-h"><span>Blocks</span><small>Drag to reorder (on a phone, hold a block or grab its dots), or click a block in the preview to edit it.</small></div>
            <div className="ed-blocks">
              {blocks.map((b, i) => {
                const open = selected === b.id
                const isFooter = b.type === 'footer'
                const dropHere = drag && drag.over === b.id && drag.id !== b.id ? (drag.after && !isFooter ? ' drop-after' : ' drop-before') : ''
                return (
                  <div key={b.id} id={`ed-b-${b.id}`} className={`ed-block${open ? ' open' : ''}${drag?.id === b.id ? ' dragging' : ''}${dropHere}`}
                    onDragOver={e => {
                      const d = dragRef.current
                      if (!d) return
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      const r = e.currentTarget.getBoundingClientRect()
                      const after = e.clientY > r.top + r.height / 2
                      if (d.over !== b.id || d.after !== after) setDrag({ ...d, over: b.id, after })
                    }}
                    onDrop={e => {
                      e.preventDefault()
                      const d = dragRef.current
                      if (d) {
                        const r = e.currentTarget.getBoundingClientRect()
                        moveTo(d.id, b.id, e.clientY > r.top + r.height / 2)
                      }
                      setDrag(null)
                    }}>
                    <div className="ed-block-head" onClick={() => { if (Date.now() - lastTouchDrop.current > 500) setSelected(open ? null : b.id) }} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') setSelected(open ? null : b.id) }} aria-expanded={open}
                      onPointerDown={isFooter ? undefined : e => touchStart(e, b.id)}
                      onContextMenu={e => { if (touchRef.current) e.preventDefault() }}
                      draggable={!isFooter && !touchUI}
                      onDragStart={e => { if (touchRef.current) { e.preventDefault(); return } e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); setDrag({ id: b.id }) }} onDragEnd={() => { if (!touchRef.current) setDrag(null) }}>
                      {!isFooter ? <span className="ed-grip" aria-hidden><DIcon name="grip" size={16} /></span> : <span className="ed-grip" aria-hidden />}
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
              <span className="ed-label" style={{ marginTop: 0 }}>Add a block</span>
              {ADD_GROUPS.map(g => (
                <div key={g.name} className="ed-add-g">
                  <span className="ed-add-gt">{g.name}</span>
                  <div className="ed-add">
                    {g.types.map(t => <button key={t} type="button" onClick={() => add(t)}><span className="ed-add-ic"><DIcon name={t} size={18} /></span><span>{BLOCK_LABEL[t]}</span></button>)}
                  </div>
                </div>
              ))}
            </div>
          </>)}

          {tab === 'design' && (
            <div className="ed-card ed-design">
              <span className="ed-label" style={{ marginTop: 0 }}>Background</span>
              <div className="ed-swatches">
                {BG_SWATCHES.map(c => <button key={c} type="button" className={`ed-sw-c${(draft.design.background || '#f4f4f5') === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Background ${c}`} onClick={() => setDesign({ background: c })} />)}
                <label className="ed-sw-c custom" title="Pick any colour"><input type="color" value={draft.design.background || '#f4f4f5'} onChange={e => setDesign({ background: e.target.value })} aria-label="Custom background colour" /><DIcon name="plus" size={14} /></label>
              </div>

              <span className="ed-label">Accent colour <small className="ed-opt">links, buttons and the coupon border</small></span>
              <div className="ed-swatches">
                {[...new Set([brand.accent || DEFAULT_ACCENT, ...ACCENT_SWATCHES])].map(c => <button key={c} type="button" className={`ed-sw-c${accent.toLowerCase() === c.toLowerCase() ? ' on' : ''}`} style={{ background: c }} aria-label={`Accent ${c}`} onClick={() => setDesign({ accent: c })} />)}
                <label className="ed-sw-c custom" title="Pick any colour"><input type="color" value={accent} onChange={e => setDesign({ accent: e.target.value })} aria-label="Custom accent colour" /><DIcon name="plus" size={14} /></label>
              </div>

              <span className="ed-label">Font</span>
              <div className="ed-tiles four">
                {(Object.keys(FONTS) as FontChoice[]).map(k => (
                  <button key={k} type="button" className={`ed-tile${(draft.design.font || 'modern') === k ? ' on' : ''}`} onClick={() => setDesign({ font: k })}>
                    <span className="ed-tile-aa" style={{ fontFamily: FONTS[k].stack }}>Aa</span><span>{FONTS[k].label}</span>
                  </button>
                ))}
              </div>
              <p className="ed-hint">Fonts every inbox already has, so the email looks the same everywhere.</p>

              <span className="ed-label">Corners</span>
              <div className="ed-tiles three">
                {([['sharp', 'Sharp', 0], ['soft', 'Soft', 6], ['round', 'Round', 14]] as const).map(([k, label, r]) => (
                  <button key={k} type="button" className={`ed-tile${(draft.design.corners || 'soft') === k ? ' on' : ''}`} onClick={() => setDesign({ corners: k })}>
                    <span className="ed-tile-shape" style={{ borderRadius: r }} /><span>{label}</span>
                  </button>
                ))}
              </div>

              <span className="ed-label">Buttons</span>
              <div className="ed-row" style={{ marginTop: 0 }}>
                <div className="ed-seg">
                  <button type="button" className={draft.design.buttonStyle !== 'outline' ? 'on' : ''} onClick={() => setDesign({ buttonStyle: 'filled' })}>Filled</button>
                  <button type="button" className={draft.design.buttonStyle === 'outline' ? 'on' : ''} onClick={() => setDesign({ buttonStyle: 'outline' })}>Outline</button>
                </div>
                <div className="ed-seg">
                  <button type="button" className={draft.design.buttonShape !== 'pill' ? 'on' : ''} onClick={() => setDesign({ buttonShape: 'rounded' })}>Rounded</button>
                  <button type="button" className={draft.design.buttonShape === 'pill' ? 'on' : ''} onClick={() => setDesign({ buttonShape: 'pill' })}>Pill</button>
                </div>
                <span className="ed-btn-demo" style={draft.design.buttonStyle === 'outline'
                  ? { color: accent, boxShadow: `inset 0 0 0 2px ${accent}`, borderRadius: draft.design.buttonShape === 'pill' ? 999 : ({ sharp: 0, soft: 8, round: 16 } as any)[draft.design.corners || 'soft'] }
                  : { background: accent, color: '#fff', borderRadius: draft.design.buttonShape === 'pill' ? 999 : ({ sharp: 0, soft: 8, round: 16 } as any)[draft.design.corners || 'soft'] }}>Shop now</span>
              </div>

              <div className="ed-design-foot">
                <button type="button" className="ed-link" onClick={() => setDesign({ background: undefined, accent: undefined, font: undefined, corners: undefined, buttonStyle: undefined, buttonShape: undefined })}>Reset to your brand’s look</button>
              </div>
            </div>
          )}

          {tab === 'checks' && (
            <div className="ed-card ed-checks">
              <div className="ed-score">
                <span className={`ed-ring${issues ? '' : ' ok'}`} style={{ ['--p' as any]: `${Math.round((passed / checks.length) * 100)}%` }}><b>{passed}</b><small>of {checks.length}</small></span>
                <div>
                  <b>{issues ? `${issues} thing${issues === 1 ? '' : 's'} to fix before sending` : 'Ready to send'}</b>
                  <span>{issues ? 'Click one to jump to it.' : 'Everything important checks out. Tips below can still help.'}</span>
                </div>
              </div>
              {(['error', 'warn', 'tip'] as const).map(level => checks.filter(c => c.level === level).sort((x, y) => Number(x.ok) - Number(y.ok)).map(c => (
                <button key={c.id} type="button" className={`ed-check-i ${c.ok ? 'ok' : c.level}`} disabled={!c.blockId && (c.ok || !['subject', 'subject-length', 'subject-tone', 'preview', 'personal'].includes(c.id))}
                  onClick={() => {
                    setTab('content')
                    if (c.blockId) { setSelected(c.blockId); requestAnimationFrame(() => document.getElementById(`ed-b-${c.blockId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })) }
                    else requestAnimationFrame(() => document.getElementById(c.id === 'preview' ? 'ed-preview' : 'ed-subject')?.focus())
                  }}>
                  <span className="ed-check-ic" aria-hidden>{c.ok ? <DIcon name="check" size={13} /> : c.level === 'tip' ? <DIcon name="sparkle" size={13} /> : '!'}</span>
                  <span className="ed-check-t"><b>{c.title}</b><small>{c.detail}</small></span>
                  {!c.ok && c.level === 'tip' && <span className="ed-check-tag">Tip</span>}
                </button>
              )))}
            </div>
          )}
          </div>
        </div>

        <div className="ed-right">
          <div className="ed-preview-bar">
            <span className="ed-preview-l">Preview</span>
            <div className="ed-seg" role="tablist" aria-label="Preview">
              <button type="button" role="tab" aria-selected={view === 'phone'} className={view === 'phone' ? 'on' : ''} onClick={() => setView('phone')}><DIcon name="mobile" size={15} />Phone</button>
              <button type="button" role="tab" aria-selected={view === 'desktop'} className={view === 'desktop' ? 'on' : ''} onClick={() => setView('desktop')}><DIcon name="desktop" size={15} />Desktop</button>
              <button type="button" role="tab" aria-selected={view === 'inbox'} className={view === 'inbox' ? 'on' : ''} onClick={() => setView('inbox')}><DIcon name="inbox" size={15} />Inbox</button>
            </div>
          </div>
          <div className={`ed-stage ${view}`}>
            {view === 'phone' && <PhonePreview {...frameProps} />}
            {view === 'desktop' && <DesktopPreview {...frameProps} />}
            {view === 'inbox' && <InboxPreview {...frameProps} />}
          </div>
        </div>
      </div>

      {showTemplates && (
        <div className="ed-modal-back" onClick={() => setShowTemplates(false)} onKeyDown={e => { if (e.key === 'Escape') setShowTemplates(false) }}>
          <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="ed-tpl-t" onClick={e => e.stopPropagation()}>
            <div className="ed-modal-h">
              <div><h3 id="ed-tpl-t">Start from a template</h3><p>Your logo, colours and address are filled in. Replaces the blocks in this email; your design settings stay, and Undo brings it all back.</p></div>
              <button type="button" className="ed-ghost ed-iconbtn" onClick={() => setShowTemplates(false)} aria-label="Close" autoFocus><DIcon name="close" size={16} /></button>
            </div>
            <TemplatePicker brand={brand} onPick={t => applyTemplate(t)} onBlank={() => applyTemplate(null)} />
          </div>
        </div>
      )}

      {ghost && typeof document !== 'undefined' && (() => {
        const gb = blocks.find(x => x.id === ghost.id)
        if (!gb) return null
        // At the page root (outside any transformed parent) so position:fixed follows the finger.
        return createPortal(
          <div className="ed ed-lift" ref={ghostRef} aria-hidden style={{ left: ghost.left, width: ghost.width, transform: `translate3d(0,${Math.round(ghost.top)}px,0)` }}>
            <div className="ed-block ed-lift-card">
              <div className="ed-block-head">
                <span className="ed-grip"><DIcon name="grip" size={16} /></span>
                <span className="ed-block-ic"><DIcon name={gb.type} /></span>
                <span className="ed-block-title"><b>{BLOCK_LABEL[gb.type]}</b><small>{summary(gb)}</small></span>
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}
    </div>
  )
}

type FieldFn = (set: (v: string) => void) => { onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void }

function BlockFields({ b, brand, companyId, update, field, wrap }: { b: Block; brand: EmailBrand; companyId: string; update: (p: Partial<Block>) => void; field: FieldFn; wrap: (a: string, z: string, f: string) => void }) {
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
        <Switch on={b.showLogo !== false} onChange={v => update({ showLogo: v })} title="Show your logo" sub={!brand.logoUrl ? 'Add one in Business settings.' : undefined} />
        <Switch on={b.showName !== false} onChange={v => update({ showName: v })} title={`Show ${brand.name}`} />
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
        <ImageField src={b.src} companyId={companyId} onSrc={v => update({ src: v })} />
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
        <TickSlider label="Height" min={8} max={80} step={4} ticks={28} value={b.height || 24} onChange={n => update({ height: n })} format={n => `${n}px`} showMax={false} />
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
    case 'columns': {
      const items = [b.items[0] || {}, b.items[1] || {}]
      const set = (i: number, patch: Partial<ColumnItem>) => update({ items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
      return (<div className="ed-cols">
        {items.map((c, i) => (
          <div key={i} className="ed-col">
            <span className="ed-col-t">{i === 0 ? 'Left column' : 'Right column'}<small>Stacks on phones</small></span>
            <ImageField src={c.image || ''} companyId={companyId} onSrc={v => set(i, { image: v })} />
            <input className="ed-input" value={c.alt || ''} placeholder="Describe the picture" onChange={e => set(i, { alt: e.target.value })} />
            <input className="ed-input" value={c.title || ''} placeholder="Title" {...field(v => set(i, { title: v }))} onChange={e => set(i, { title: e.target.value })} />
            <textarea className="ed-input" rows={3} value={c.text || ''} placeholder="A sentence or two" {...field(v => set(i, { text: v }))} onChange={e => set(i, { text: e.target.value })} />
            <div className="ed-row2">
              <input className="ed-input" value={c.label || ''} placeholder="Button (optional)" onChange={e => set(i, { label: e.target.value })} />
              <input className="ed-input" value={c.url || ''} placeholder="https://" onChange={e => set(i, { url: e.target.value })} />
            </div>
            {urlWarn(c.url)}
          </div>
        ))}
      </div>)
    }
    case 'video': {
      const auto = videoThumb(b.url)
      return (<>
        <label className="ed-label">Video link</label>
        <input className="ed-input" value={b.url} placeholder="https://www.youtube.com/watch?v=…" onChange={e => update({ url: e.target.value })} />
        {b.url && !safeUrl(b.url, false) ? <p className="ed-hint bad">Video links must start with https://</p> : <p className="ed-hint">{auto ? 'YouTube thumbnail added automatically.' : 'Email can’t play video, so this shows a picture that opens it. YouTube links get their thumbnail automatically.'}</p>}
        <label className="ed-label">Picture {auto ? <small className="ed-opt">optional, replaces the YouTube thumbnail</small> : null}</label>
        <ImageField src={b.thumbnail || ''} companyId={companyId} onSrc={v => update({ thumbnail: v })} />
        <label className="ed-label">Button</label>
        <input className="ed-input" value={b.label || ''} placeholder="Watch the video" onChange={e => update({ label: e.target.value })} />
      </>)
    }
    case 'menu':
      return (<>
        {b.links.map((l, i) => (
          <div key={i} className="ed-row ed-linkrow">
            <input className="ed-input" value={l.label} placeholder="Shop" onChange={e => update({ links: b.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
            <input className="ed-input" value={l.url} placeholder="https://" onChange={e => update({ links: b.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
            <button type="button" className="ed-ghost ed-iconbtn" aria-label="Remove link" onClick={() => update({ links: b.links.filter((_, j) => j !== i) })}><DIcon name="trash" size={15} /></button>
          </div>
        ))}
        {b.links.length < 6 && <button type="button" className="ed-ghost" onClick={() => update({ links: [...b.links, { label: '', url: '' }] })}><DIcon name="plus" size={15} />Add a link</button>}
        <p className="ed-hint">A row of links, like your website’s menu. Good under the logo.</p>
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

const ED_CSS = `
.ed{--ed-fill:#f4f4f5;--ed-fill-2:#ececef;--ed-soft:#f7f7f8;--ed-muted:#71717a;--ed-line:#f0f0f2;--ed-card:var(--card,#fff);display:flex;flex-direction:column;gap:14px;min-width:0}
[data-theme="dark"] .ed{--ed-fill:#2a2a2e;--ed-fill-2:#333337;--ed-soft:#242428;--ed-muted:#9a9aa0;--ed-line:#2c2c31}
.ed *{box-sizing:border-box}
.ed button::before{display:none!important}
.ed-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ed-name{flex:1 1 240px;min-width:0;padding:6px 12px;border:1.5px solid transparent;border-radius:14px;background:transparent;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.ed-name:hover,.ed-name:focus{border-color:var(--ed-fill-2);background:var(--ed-card);outline:none}
.ed-top-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ed-msg{display:inline-flex;align-items:center;gap:5px;font-size:13px;color:var(--ed-muted)}.ed-msg.ok{color:#067647}.ed-msg.bad{color:#b42318}
.ed-hist{display:inline-flex;padding:3px;border-radius:999px;background:var(--ed-fill)}
.ed-hist .ed-iconbtn{width:34px;height:34px;border:0;border-radius:999px;background:transparent;color:var(--ink);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.ed-hist .ed-iconbtn:hover:not(:disabled){background:var(--ed-card);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ed-hist .ed-iconbtn:disabled{opacity:.3;cursor:default}
.ed-primary,.ed-ghost{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border-radius:999px;font:inherit;font-size:13.5px;font-weight:650;cursor:pointer;white-space:nowrap;transition:filter .15s,background .15s,transform .12s}
.ed-primary{background:var(--coral);color:#fff;border:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.ed-primary:hover:not(:disabled){filter:brightness(.95)}
.ed-ghost{background:var(--ed-card);color:var(--ink);border:0;box-shadow:0 0 0 1.5px var(--ed-fill-2)}
.ed-ghost:hover:not(:disabled){background:var(--ed-soft)}
.ed-primary:active:not(:disabled),.ed-ghost:active:not(:disabled){transform:scale(.98)}
.ed-primary:disabled,.ed-ghost:disabled{opacity:.5;cursor:default}
.ed-iconbtn{width:40px;padding:0;flex-shrink:0}
.ed-warn{display:flex;gap:10px;align-items:flex-start;padding:12px 16px;border-radius:16px;background:#fffbeb;color:#92400e;font-size:13.5px;line-height:1.5}
.ed-warn svg{flex-shrink:0;margin-top:2px}.ed-warn a{color:#92400e;font-weight:700}
.ed-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:16px;align-items:start}
.ed-left{display:flex;flex-direction:column;gap:12px;min-width:0}
.ed-right{display:flex;flex-direction:column;gap:12px;min-width:0;padding:14px;border-radius:26px;background:linear-gradient(180deg,var(--ed-soft),var(--ed-fill));box-shadow:inset 0 0 0 1px rgba(0,0,0,.04)}
.ed-pane{display:flex;flex-direction:column;gap:12px;min-width:0}
.ed-tabs{position:sticky;top:0;z-index:2;display:flex;padding:4px;border-radius:999px;background:var(--ed-fill)}
.ed-tabs button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;border:0;border-radius:999px;background:transparent;font:inherit;font-size:13.5px;font-weight:650;color:var(--ed-muted);cursor:pointer;white-space:nowrap}
.ed-tabs button.on{background:var(--ed-card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.ed-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ef4444;color:#fff;font-size:11px;font-weight:700}
.ed-badge.ok{background:#22c55e}
.ed-card{padding:18px;border-radius:22px;background:var(--ed-card);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.ed-label{display:block;margin:16px 0 8px;font-size:13px;font-weight:600;color:var(--ink)}
.ed-opt{font-weight:400;color:var(--ed-muted)}
.ed-input{width:100%;min-width:0;padding:11px 14px;border:1.5px solid transparent;border-radius:14px;background:var(--ed-fill);font:inherit;font-size:14.5px;color:var(--ink);outline:none;transition:background .15s,border-color .15s,box-shadow .15s}
.ed-input:focus{background:var(--ed-card);border-color:var(--ed-fill-2);box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 14%,transparent)}
/* The global dark rule paints every field #1e1e1e with !important; keep the editor's own fills. */
[data-theme="dark"] .ed .ed-name:not(:hover):not(:focus){background:transparent!important;border-color:transparent!important}
[data-theme="dark"] .ed .ed-input:not(:focus){background:var(--ed-fill)!important;border-color:transparent!important}
[data-theme="dark"] .ed .ed-input:focus,[data-theme="dark"] .ed .ed-name:hover,[data-theme="dark"] .ed .ed-name:focus{background:var(--ed-card)!important;border-color:var(--ed-fill-2)!important}
.ed-input::placeholder{color:#a1a1aa}
textarea.ed-input{resize:vertical;line-height:1.55}
.ed-color{width:100%;height:44px;padding:4px;border:0;border-radius:14px;background:var(--ed-fill);cursor:pointer}
.ed-hint{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--ed-muted)}.ed-hint.ok{color:#067647}.ed-hint.warn{color:#b54708}.ed-hint.bad{color:#b42318}
.ed-subject{position:relative;display:flex;gap:6px}
.ed-emoji{width:46px;flex-shrink:0;border:0;border-radius:14px;background:var(--ed-fill);color:var(--ed-muted);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.ed-emoji:hover,.ed-emoji[aria-expanded="true"]{background:var(--ed-fill-2);color:var(--ink)}
.ed-pop{position:absolute;top:calc(100% + 6px);right:0;z-index:20;border-radius:18px;background:var(--ed-card);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 20px 50px -20px rgba(16,24,40,.35);overflow:hidden}
.ed-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:16px}
.ed-tags-l{margin-right:4px;font-size:13px;font-weight:600;color:var(--ink)}
.ed-chip{height:32px;padding:0 12px;border:0;border-radius:999px;background:var(--ed-fill);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer}
.ed-chip:hover{background:var(--ed-fill-2)}
.ed-sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:4px 4px -2px}
.ed-sec-h span{font-family:var(--font-display),-apple-system,sans-serif;font-size:16px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.ed-sec-h small{font-size:12.5px;color:var(--ed-muted)}
.ed-blocks{display:flex;flex-direction:column;gap:8px}
.ed-block{position:relative;border-radius:18px;background:var(--ed-card);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);transition:box-shadow .15s,opacity .15s}
.ed-block.open{box-shadow:0 0 0 1.5px var(--coral),0 10px 26px -16px color-mix(in srgb,var(--coral) 60%,transparent)}
.ed-block.dragging{opacity:.45}
.ed-block.drop-before::before,.ed-block.drop-after::after{content:'';position:absolute;left:10px;right:10px;height:3px;border-radius:3px;background:var(--coral);display:block!important}
.ed-block.drop-before::before{top:-6px}.ed-block.drop-after::after{bottom:-6px}
.ed-block-head{display:flex;align-items:center;gap:10px;min-width:0;padding:10px 12px 10px 6px;cursor:pointer}
.ed-grip{width:18px;flex-shrink:0;color:#c4c4c8;cursor:grab;display:inline-flex;justify-content:center}
.ed-block-head[draggable="true"]:active .ed-grip{cursor:grabbing}
/* Touch dragging: the lifted copy that follows the finger. */
.ed-lift{position:fixed;top:0;z-index:700;margin:0;gap:0;pointer-events:none;will-change:transform}
.ed-lift-card{background:var(--ed-card,#fff);box-shadow:0 0 0 1.5px var(--coral),0 22px 44px -14px rgba(16,24,40,.38)!important;animation:edLift .18s cubic-bezier(.22,1,.36,1) both}
.ed-lift-card .ed-grip{color:var(--coral)}
@keyframes edLift{from{transform:scale(1)}to{transform:scale(1.03) rotate(-.6deg)}}
@media (pointer:coarse){
  /* A bigger grip to grab with a thumb; it never scrolls the page. */
  .ed-grip{width:34px;align-self:stretch;align-items:center;margin:-10px -4px -10px -6px;color:#a1a1aa;touch-action:none}
  .ed-block-head{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
}
@media (prefers-reduced-motion:reduce){.ed-lift-card{animation:none}}
.ed-block-ic{width:36px;height:36px;flex-shrink:0;border-radius:12px;background:var(--ed-fill);color:var(--ink);display:flex;align-items:center;justify-content:center}
.ed-block.open .ed-block-ic{background:color-mix(in srgb,var(--coral) 13%,var(--ed-card));color:var(--coral)}
.ed-block-title{display:flex;flex-direction:column;flex:1;min-width:0}
.ed-block-title b{font-size:14px;font-weight:650;color:var(--ink)}
.ed-block-title small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px;color:var(--ed-muted)}
.ed-block-actions{display:flex;gap:2px;flex-shrink:0}
.ed-block-actions button{width:32px;height:32px;border:0;border-radius:999px;background:none;color:var(--ed-muted);cursor:pointer;display:flex;align-items:center;justify-content:center}
.ed-block-actions button:hover:not(:disabled){background:var(--ed-fill);color:var(--ink)}
.ed-block-actions button:disabled{opacity:.3;cursor:default}
.ed-block-body{display:flex;flex-direction:column;gap:8px;padding:6px 16px 16px;border-top:1px solid var(--ed-line)}
.ed-block-body .ed-label{margin:8px 0 2px}
.ed-row{display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap}
.ed-row.ed-linkrow{flex-wrap:nowrap}
.ed-linkrow .ed-input{min-width:0}
.ed-linkrow .ed-input:first-child{flex:0 0 34%;max-width:150px}
.ed-linkrow .ed-iconbtn{flex-shrink:0}
.ed-row>.ed-input{flex:1 1 160px}
.ed-row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ed-switch{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:0;border-radius:16px;background:var(--ed-soft);font:inherit;text-align:left;cursor:pointer}
.ed-switch-t{flex:1;min-width:0}
.ed-switch-t b{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.ed-switch-t small{display:block;margin-top:2px;font-size:12.5px;color:var(--ed-muted)}
.ed-sw{position:relative;flex-shrink:0;width:40px;height:24px;border-radius:999px;background:#d4d4d8;transition:background .2s}
.ed-sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.ed .ed-switch[aria-checked="true"] .ed-sw{background:var(--coral)}
.ed-switch[aria-checked="true"] .ed-sw::after{transform:translateX(16px)}
.ed-toolbar{display:flex;align-items:center;gap:4px;margin-top:6px;flex-wrap:wrap}
.ed-toolbar button{width:34px;height:32px;border:0;border-radius:10px;background:var(--ed-fill);color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center}
.ed-toolbar button:hover{background:var(--ed-fill-2)}
.ed-seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--ed-fill)}
.ed-seg button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:0;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--ed-muted);cursor:pointer;white-space:nowrap}
.ed-seg button.on{background:var(--ed-card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.1)}
.ed-seg.small button{height:30px;padding:0 12px;font-size:12.5px}
.ed-add-g+.ed-add-g{margin-top:12px}
.ed-add-gt{display:block;margin:0 2px 6px;font-size:12px;font-weight:600;color:var(--ed-muted)}
.ed-add{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
.ed-add button{display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 6px;border:0;border-radius:16px;background:var(--ed-soft);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:background .15s,box-shadow .15s,transform .15s}
.ed-add button:hover{background:var(--ed-card);box-shadow:0 0 0 1.5px var(--coral);transform:translateY(-1px)}
.ed-add-ic{width:38px;height:38px;border-radius:12px;background:var(--ed-card);color:var(--ink);display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.ed-add button:hover .ed-add-ic{color:var(--coral)}
.ed-results{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;margin-top:6px}
.ed-results button{display:flex;align-items:center;gap:8px;min-width:0;padding:6px;border:0;border-radius:14px;background:var(--ed-soft);font:inherit;text-align:left;cursor:pointer}
.ed-results button:hover{background:var(--ed-fill)}
.ed-results img,.ed-product img,.ed-noimg{width:40px;height:40px;flex-shrink:0;border-radius:10px;object-fit:cover;background:var(--ed-fill);display:block}
.ed-results span{display:flex;flex-direction:column;flex:1;min-width:0}.ed-results b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;color:var(--ink)}.ed-results small{font-size:12px;color:var(--ed-muted)}
.ed-product{display:flex;gap:8px;align-items:flex-start;margin-top:6px;padding:10px;border-radius:16px;background:var(--ed-soft)}
.ed-product .ed-input{background:var(--ed-card)}
.ed-product-fields{display:flex;flex-direction:column;flex:1;gap:6px;min-width:0}
.ed-img{display:flex;gap:12px;align-items:flex-start}
.ed-img-thumb{width:64px;height:64px;flex-shrink:0;overflow:hidden;border-radius:14px;background:var(--ed-fill);color:var(--ed-muted);display:inline-flex;align-items:center;justify-content:center}
.ed-img-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.ed-img-t{display:flex;flex-direction:column;flex:1;gap:6px;min-width:0}
.ed-cols{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ed-col{display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px;border-radius:16px;background:var(--ed-soft)}
.ed-col .ed-input{background:var(--ed-card)}
.ed-col-t{display:flex;align-items:baseline;justify-content:space-between;gap:6px;font-size:13px;font-weight:650;color:var(--ink)}
.ed-col-t small{font-size:11.5px;font-weight:500;color:var(--ed-muted)}
.ed-design .ed-label:first-child{margin-top:0}
.ed-swatches{display:flex;flex-wrap:wrap;gap:8px}
.ed-sw-c{position:relative;width:34px;height:34px;padding:0;border:0;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12);transition:transform .15s}
.ed-sw-c:hover{transform:scale(1.08)}
.ed-sw-c.on{box-shadow:inset 0 0 0 1px rgba(0,0,0,.12),0 0 0 2px var(--ed-card),0 0 0 4px var(--ink)}
.ed-sw-c.custom{display:inline-flex;align-items:center;justify-content:center;background:conic-gradient(#f87171,#fbbf24,#34d399,#60a5fa,#a78bfa,#f472b6,#f87171);color:#fff}
.ed-sw-c.custom input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.ed-tiles{display:grid;gap:8px}
.ed-tiles.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.ed-tiles.three{grid-template-columns:repeat(3,minmax(0,1fr))}
.ed-tile{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border:0;border-radius:16px;background:var(--ed-soft);font:inherit;font-size:12.5px;font-weight:600;color:var(--ink);cursor:pointer;transition:box-shadow .15s,background .15s}
.ed-tile.on{background:var(--ed-card);box-shadow:0 0 0 1.5px var(--coral),0 6px 18px -10px color-mix(in srgb,var(--coral) 60%,transparent)}
.ed-tile-aa{font-size:24px;font-weight:700;line-height:1}
.ed-tile-shape{width:40px;height:26px;background:var(--ed-fill-2);box-shadow:inset 0 0 0 1.5px #a1a1aa}
.ed-tile.on .ed-tile-shape{box-shadow:inset 0 0 0 1.5px var(--coral);background:color-mix(in srgb,var(--coral) 14%,var(--ed-card))}
.ed-btn-demo{display:inline-flex;align-items:center;height:36px;padding:0 16px;font-size:13px;font-weight:700}
.ed-design-foot{margin-top:18px;padding-top:14px;border-top:1px solid var(--ed-line)}
.ed-link{padding:0;border:0;background:none;font:inherit;font-size:13px;font-weight:650;color:var(--coral);cursor:pointer}
.ed-score{display:flex;align-items:center;gap:14px;margin-bottom:12px;padding:14px;border-radius:18px;background:var(--ed-soft)}
.ed-score b{display:block;font-size:15px;font-weight:650;color:var(--ink)}
.ed-score span:not(.ed-ring){display:block;margin-top:2px;font-size:12.5px;color:var(--ed-muted)}
.ed-ring{--p:0%;position:relative;width:58px;height:58px;flex-shrink:0;border-radius:50%;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;background:conic-gradient(#f59e0b var(--p),var(--ed-fill-2) 0)}
.ed-ring.ok{background:conic-gradient(#22c55e var(--p),var(--ed-fill-2) 0)}
.ed-ring::before{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--ed-soft);display:block!important}
.ed-ring b,.ed-ring small{position:relative;line-height:1}
.ed-ring b{font-size:17px!important}
.ed-ring small{font-size:10.5px;color:var(--ed-muted)}
.ed-check-i{display:flex;align-items:flex-start;gap:11px;width:100%;padding:11px 10px;border:0;border-radius:14px;background:none;font:inherit;text-align:left;cursor:pointer}
.ed-check-i:hover:not(:disabled){background:var(--ed-soft)}
.ed-check-i:disabled{cursor:default}
.ed-check-ic{width:22px;height:22px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:#ef4444}
.ed-check-i.warn .ed-check-ic{background:#f59e0b}
.ed-check-i.tip .ed-check-ic{background:#e0e7ff;color:#4338ca}
.ed-check-i.ok .ed-check-ic{background:#dcfce7;color:#15803d}
.ed-check-t{flex:1;min-width:0}
.ed-check-t b{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.ed-check-i.ok .ed-check-t b{font-weight:500}
.ed-check-t small{display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:var(--ed-muted)}
.ed-check-tag{flex-shrink:0;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700}
.ed-preview-bar{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.ed-preview-l{padding-left:4px;font-family:var(--font-display),-apple-system,sans-serif;font-size:16px;font-weight:700;letter-spacing:-.02em;color:var(--ink)}
.ed-preview-bar .ed-seg{background:var(--ed-card);box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.ed-preview-bar .ed-seg button.on{background:var(--ink);color:var(--ed-card);box-shadow:none}
.ed-stage{position:relative;display:flex;flex-direction:column;min-height:0;height:calc(100vh - 230px);min-height:620px}
.ed-modal-back{position:fixed;inset:0;z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(15,15,20,.4);animation:edFade .16s ease both}
.ed-modal{width:min(1000px,100%);max-height:90vh;overflow-y:auto;padding:24px;border-radius:26px;background:var(--ed-card,#fff);box-shadow:0 30px 80px -20px rgba(16,24,40,.4);animation:edIn .28s cubic-bezier(.22,1,.36,1) both}
.ed-modal-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:18px}
.ed-modal-h h3{margin:0;font-family:var(--font-display),-apple-system,sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em;color:var(--ink)}
.ed-modal-h p{margin:4px 0 0;font-size:13.5px;line-height:1.5;color:var(--ed-muted)}
.ed-modal .tp-card{border:0;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.ed-modal .tp-card:hover{box-shadow:0 0 0 1.5px var(--coral)}
@keyframes edFade{from{opacity:0}to{opacity:1}}
@keyframes edIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
@media (min-width:1101px){
  /* Editor and preview side by side, each the height of the screen: the blocks scroll, the preview stays in view. */
  .ed-grid{height:var(--ed-h,calc(100vh - 230px));min-height:560px;grid-template-rows:minmax(0,1fr);align-items:stretch}
  .ed-left,.ed-right{min-height:0}
  .ed-left{height:100%;overflow:hidden}
  .ed-left .ed-tabs{position:static;flex-shrink:0}
  .ed-pane{flex:1;min-height:0;padding:2px 4px 6px 2px;overflow-y:auto;overscroll-behavior:contain}
  .ed-right{height:100%}
  .ed-stage{flex:1;height:auto;min-height:0}
}
@media (max-width:1100px){.ed-grid{grid-template-columns:minmax(0,1fr)}.ed-stage{height:860px}}
@media (max-width:600px){.ed-row2,.ed-cols{grid-template-columns:1fr}.ed-tiles.four{grid-template-columns:repeat(2,minmax(0,1fr))}.ed-top-actions{width:100%}.ed-top-actions .ed-primary,.ed-top-actions .ed-ghost{flex:1}.ed-name{font-size:19px}.ed-stage{height:700px}.ed-tabs button{font-size:12.5px;gap:5px}}
@media (prefers-reduced-motion:reduce){.ed-modal,.ed-modal-back{animation:none}}
`
