'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { compressImage, uploadDirect } from '@/lib/upload-attachment'
import { supabase } from '@/lib/supabase'
import { readCache, writeCache } from '@/lib/client-cache'
import { useCompanyUser } from '../crm-settings/_shared'
import MediaGallery from '@/components/MediaGallery'
import ImageAnnotator from '@/components/ImageAnnotator'
import MentionInput, { resolveMentions } from '@/components/MentionInput'
import { useGoogleDrivePicker } from '@/components/GoogleDrivePicker'
import PhoneUploadQR from '@/components/PhoneUploadQR'

export default function GalleryPage() {
  const { companyId, user, loading } = useCompanyUser()
  const userId: string | null = user?.id ?? null
  const me = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Me'
  // Team roster for @mentions in item notes.
  const [team, setTeam] = useState<{ id: string; user_id: string; name: string; email?: string }[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = all
  const [search, setSearch] = useState('')
  const [loadingData, setLoadingData] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showQR, setShowQR] = useState(false)
  // Optimistic upload tiles: a local preview shows in the grid the instant a
  // file is picked, so uploading feels immediate instead of waiting on the
  // round trip. Each { id, previewUrl, kind, name, status } is reconciled away
  // once the server refetch brings back the real item.
  const [pending, setPending] = useState<any[]>([])

  // ── Categories: a photo can belong to several at once ────────────────────
  const [categories, setCategories] = useState<any[]>([])
  const [itemCats, setItemCats] = useState<Record<string, string[]>>({})
  const [catFilter, setCatFilter] = useState<string>('')
  const [showCatManager, setShowCatManager] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [taggingItem, setTaggingItem] = useState<any>(null)
  const [catMenuFor, setCatMenuFor] = useState<string | null>(null)   // which card's category picker is open
  const [quickCat, setQuickCat] = useState('')

  const loadCategories = useCallback(async () => {
    if (!companyId) return
    const cacheKey = `media-cats:${companyId}`
    const cached = readCache<{ categories: any[]; byItem: Record<string, string[]> }>(cacheKey)
    if (cached) {
      setCategories(cached.categories)
      setItemCats(cached.byItem)
    }
    try {
      const res = await fetch(`/api/media/categories?companyId=${companyId}`)
      const d = await res.json()
      const categories = d.categories || []
      const byItem = d.byItem || {}
      setCategories(categories)
      setItemCats(byItem)
      writeCache(cacheKey, { categories, byItem })
    } catch {}
  }, [companyId])

  useEffect(() => { loadCategories() }, [loadCategories])

  // Load the team roster (owner + members) so item notes can @mention people.
  useEffect(() => {
    if (!companyId) return
    let active = true
    ;(async () => {
      try {
        const members: { id: string; user_id: string; name: string; email?: string }[] = []
        const { data: co } = await (supabase as any).from('companies').select('owner_id, name').eq('id', companyId).maybeSingle()
        if (co?.owner_id) members.push({ id: co.owner_id, user_id: co.owner_id, name: co.name ? `${co.name} (Owner)` : 'Owner' })
        const { data: tm } = await (supabase as any).from('team_members').select('*').eq('company_id', companyId)
        for (const m of (tm || [])) {
          const uid = m.user_id || m.id
          if (members.some(x => x.user_id === uid)) continue
          members.push({ id: m.id, user_id: uid, name: m.name || m.display_name || (m.email ? m.email.split('@')[0] : 'Team member'), email: m.email })
        }
        if (active) setTeam(members)
      } catch { /* notes still work without the roster */ }
    })()
    return () => { active = false }
  }, [companyId])

  const catApi = async (body: any) => {
    const res = await fetch('/api/media/categories', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    })
    const d = await res.json()
    if (!res.ok) throw new Error(d.error || 'Request failed')
    return d
  }

  const createCategory = async () => {
    if (!newCatName.trim()) return
    try {
      await catApi({ action: 'create', name: newCatName.trim() })
      setNewCatName('')
      await loadCategories()
    } catch (e: any) { alert(e.message) }
  }

  const toggleItemCategory = async (itemId: string, catId: string) => {
    const current = itemCats[itemId] || []
    const next = current.includes(catId) ? current.filter(c => c !== catId) : [...current, catId]
    setItemCats(prev => ({ ...prev, [itemId]: next }))   // optimistic
    try { await catApi({ action: 'set_item', itemId, categoryIds: next }) }
    catch (e: any) { alert(e.message); await loadCategories() }
  }

  // Create a category AND put this photo in it, without leaving the card.
  const quickAddCategory = async (itemId: string) => {
    const name = quickCat.trim()
    if (!name) return
    try {
      const d = await catApi({ action: 'create', name })
      setQuickCat('')
      const created = d.category || d.categories?.find((c: any) => c.name === name)
      await loadCategories()
      if (created?.id) await toggleItemCategory(itemId, created.id)
    } catch (e: any) { alert(e.message) }
  }

  // Close the category picker when clicking elsewhere.
  useEffect(() => {
    if (!catMenuFor) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-cat-picker]')) setCatMenuFor(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [catMenuFor])

  const bulkAddCategory = async (catId: string) => {
    try {
      await catApi({ action: 'bulk_add', itemIds: Array.from(selected), categoryId: catId })
      clearSelection()
      await loadCategories()
    } catch (e: any) { alert(e.message) }
  }

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const selectMode = selected.size > 0

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(items.map((i: any) => i.id)))
  const clearSelection = () => setSelected(new Set())

  const bulkDelete = () => {
    const n = selected.size
    askConfirm({
      title: `Delete ${n} item${n === 1 ? '' : 's'}`,
      message: `This permanently removes ${n === 1 ? 'this item' : 'these items'} from the gallery. This can't be undone.`,
      confirmLabel: `Delete ${n} item${n === 1 ? '' : 's'}`, danger: true,
      onConfirm: async () => {
        setBulkBusy(true)
        try {
          await (supabase as any).from('media_items').delete().in('id', Array.from(selected))
          clearSelection()
          await load()
        } catch (e: any) {
          alert('Could not delete: ' + e.message)
        } finally { setBulkBusy(false) }
      },
    })
  }

  const bulkMove = async (folderId: string | null) => {
    setBulkBusy(true)
    try {
      await (supabase as any).from('media_items')
        .update({ folder_id: folderId }).in('id', Array.from(selected))
      clearSelection()
      await load()
    } catch (e: any) {
      alert('Could not move: ' + e.message)
    } finally { setBulkBusy(false) }
  }

  // Download each selected file. Browsers throttle rapid downloads, so we stagger.
  const bulkDownload = () => {
    const chosen = items.filter((i: any) => selected.has(i.id))
    chosen.forEach((item: any, idx: number) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = item.url
        a.download = item.title || 'download'
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        a.remove()
      }, idx * 350)
    })
  }
  // Lightweight toast for share/send feedback.
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2600) }

  const toAttachment = (it: any) => ({ url: it.url, kind: it.kind || ((it.type || '').startsWith('video/') ? 'video' : 'image'), name: it.title || it.name || '', type: it.type })

  // Share = one short, branded colvy link that opens a scrollable gallery page
  // (the same /m/ viewer customers get) with a download button per item —
  // rather than a wall of raw storage URLs.
  const [sharing, setSharing] = useState(false)
  const shareItems = async (list: any[]) => {
    if (!list.length || !companyId || sharing) return
    setSharing(true); showToast('Creating link…')
    try {
      const mediaUrls = list.map((it: any) => ({ url: it.url, name: it.title || 'File', type: it.type || (it.kind === 'video' ? 'video/mp4' : 'image/jpeg') }))
      const res = await fetch('/api/short-links/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // `url` is the required target; the full set rides along in mediaUrls.
        body: JSON.stringify({ companyId, kind: 'media', url: list[0].url, mediaUrls, sentBy: me, label: list.length === 1 ? (list[0].title || 'Shared media') : `${list.length} items` }),
      })
      const d = await res.json()
      if (!res.ok || !d.url) throw new Error(d.error || 'link failed')
      try { if ((navigator as any).share) { await (navigator as any).share({ url: d.url, title: 'Shared media' }); return } } catch { /* fall through to copy */ }
      try { await navigator.clipboard.writeText(d.url); showToast('Gallery link copied') }
      catch { showToast(d.url) }
    } catch {
      // Never leave the user empty-handed: fall back to the raw links.
      const urls = list.map((i: any) => i.url).filter(Boolean)
      try { await navigator.clipboard.writeText(urls.join('\n')); showToast('Links copied') }
      catch { showToast('Could not create the link') }
    } finally { setSharing(false) }
  }

  // Send/forward media into a contact's chat — mirrors the Inbox forward: find
  // or open a conversation, text it if we have a number, and drop it on the
  // thread. `forwardItems` holds the media the picker is choosing a target for.
  const [forwardItems, setForwardItems] = useState<any[] | null>(null)
  const [forwardSearch, setForwardSearch] = useState('')
  const [forwardResults, setForwardResults] = useState<any[]>([])
  const [forwardBusy, setForwardBusy] = useState(false)
  const searchForwardTargets = async (q: string) => {
    setForwardSearch(q)
    if (!companyId || q.trim().length < 2) { setForwardResults([]); return }
    const { data } = await (supabase as any).from('contacts')
      .select('id, name, email, phone').eq('company_id', companyId)
      .or(`name.ilike.%${q.trim()}%,email.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`).limit(10)
    setForwardResults(data || [])
  }
  const doForward = async (contactTarget: any) => {
    if (!companyId || !forwardItems?.length || !user) return
    setForwardBusy(true)
    try {
      let convId: string | null = null
      const { data: existing } = await (supabase as any).from('conversations')
        .select('id').eq('company_id', companyId).eq('contact_id', contactTarget.id)
        .order('last_message_at', { ascending: false }).limit(1)
      convId = existing?.[0]?.id || null
      if (!convId) {
        const { data: created } = await (supabase as any).from('conversations').insert({
          company_id: companyId, channel: 'chat', contact_id: contactTarget.id,
          subject: contactTarget.name || contactTarget.email, status: 'open', is_unread: false,
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        convId = created?.id || null
      }
      if (!convId) throw new Error('Could not open a conversation with that contact')
      const attachments = forwardItems.map(toAttachment)
      const phone = contactTarget.phone
      if (phone) {
        for (const att of attachments) {
          try {
            await fetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId, conversationId: convId, to: phone, text: '', attachments: [att], senderName: me, skipChatMessage: true }),
            })
          } catch {}
        }
      }
      await (supabase as any).from('messages').insert(attachments.map((att: any) => ({
        conversation_id: convId, company_id: companyId,
        sender_type: 'agent', sender_id: user.id, sender_name: me, sender_email: user.email,
        content: '', attachments: [att], delivery_channel: phone ? 'sms' : 'chat',
        metadata: { forwarded: true, from_gallery: true },
      })))
      await (supabase as any).from('conversations').update({ last_message: '📎 Attachment', last_message_at: new Date().toISOString() }).eq('id', convId)
      const label = forwardItems.length === 1 ? 'Media' : `${forwardItems.length} items`
      setForwardItems(null); setForwardSearch(''); setForwardResults([])
      showToast(`${label} sent to ${contactTarget.name || contactTarget.email}`)
    } catch (e: any) {
      showToast('Could not send: ' + e.message)
    } finally { setForwardBusy(false) }
  }

  // Grid density / view options (top-right switcher). Persisted so the choice
  // sticks between visits.
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable' | 'large'>('comfortable')
  useEffect(() => {
    try { const v = localStorage.getItem('gallery-view'); if (v === 'compact' || v === 'comfortable' || v === 'large') setViewMode(v) } catch {}
  }, [])
  const changeView = (v: 'compact' | 'comfortable' | 'large') => { setViewMode(v); try { localStorage.setItem('gallery-view', v) } catch {} }

  // Image editing (Markup). Opens the shared annotator on a same-origin proxied
  // copy of the image so the canvas can be exported on Save.
  const [editingItem, setEditingItem] = useState<any>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const saveEditedImage = async (item: any, dataUrl: string) => {
    if (!companyId || savingEdit) return
    setSavingEdit(true); showToast('Saving edited image…')
    try {
      const blob = await (await fetch(dataUrl)).blob()
      const base = (item.title || 'image').replace(/\.[a-z0-9]+$/i, '')
      const file = new File([blob], `${base}-edited.png`, { type: 'image/png' })
      const fd = new FormData()
      fd.append('file', file); fd.append('companyId', companyId)
      if (item.folder_id) fd.append('folderId', item.folder_id)
      fd.append('title', `${base} (edited)`)
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('upload failed')
      setEditingItem(null)
      await load()
      showToast('Saved as a new image')
    } catch {
      showToast('Could not save the edit')
    } finally { setSavingEdit(false) }
  }

  const [dragOver, setDragOver] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)   // details slideout for the lightbox item
  const fileRef = useRef<HTMLInputElement>(null)
  const [prextyStatus, setPrextyStatus] = useState('')

  // In-app confirmation dialog (replaces the browser's native confirm()).
  const [confirmState, setConfirmState] = useState<null | {
    title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void
  }>(null)
  const askConfirm = (opts: {
    title: string; message: string; confirmLabel?: string; danger?: boolean; onConfirm: () => void
  }) => setConfirmState(opts)

  const load = useCallback(async () => {
    if (!companyId) return
    const cacheKey = `media:${companyId}:${activeFolder || ''}:${search.trim()}`
    // Instant paint: if we've shown this view before, render the cached items
    // right away and refresh in the background instead of blanking to a spinner.
    const cached = readCache<{ folders: any[]; items: any[] }>(cacheKey)
    if (cached) {
      setFolders(cached.folders)
      setItems(cached.items)
      setLoadingData(false)
    } else {
      setLoadingData(true)
    }
    try {
      const params = new URLSearchParams({ companyId })
      if (activeFolder) params.set('folderId', activeFolder)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/media?${params}`)
      const data = await res.json()
      const folders = data.folders || []
      const items = data.items || []
      setFolders(folders)
      setItems(items)
      writeCache(cacheKey, { folders, items })
    } catch {} finally { setLoadingData(false) }
  }, [companyId, activeFolder, search])

  useEffect(() => { load() }, [load])

  const createFolder = async () => {
    const name = prompt('Folder name (e.g. Fish, Tanks, Plants)')
    if (!name || !companyId) return
    await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'create_folder', name }) })
    load()
  }

  const renameFolder = async (f: any) => {
    const name = prompt('Rename folder', f.name)
    if (!name || !companyId) return
    await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'rename_folder', folderId: f.id, name }) })
    load()
  }

  const deleteFolder = (f: any) => {
    if (!companyId) return
    askConfirm({
      title: 'Delete category',
      message: `Delete “${f.name}”? Its media won't be removed — it will move to Unfiled.`,
      confirmLabel: 'Delete category', danger: true,
      onConfirm: async () => {
        await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete_folder', folderId: f.id }) })
        if (activeFolder === f.id) setActiveFolder(null)
        load()
      },
    })
  }

  const uploadFiles = async (files: File[]) => {
    if (!files.length || !companyId) return
    setUploading(true)

    // Show a local preview tile for every file up front, before any bytes move.
    const drafts = files.map((file, i) => ({
      id: `pending-${Date.now()}-${i}`,
      previewUrl: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      name: file.name,
      status: 'uploading' as 'uploading' | 'error',
    }))
    setPending(prev => [...drafts, ...prev])

    // Upload each file independently so one failure can't abort the batch — a
    // failed tile is marked with an error badge and left in place for retry.
    const uploadOne = async (file: File): Promise<boolean> => {
      // Compress images in the browser before upload (same as the inbox).
      let toSend: File = file
      try {
        if (file.type.startsWith('image/')) toSend = await compressImage(file)
      } catch {}

      // Big files (videos) go straight to R2 via a presigned URL, then we
      // register the gallery item with just the URL.
      const isLarge = toSend.type.startsWith('video/') || toSend.size > 4 * 1024 * 1024
      if (isLarge) {
        const url = await uploadDirect(toSend, `media-gallery/${companyId}/${activeFolder || 'unfiled'}`, file.name)
        if (url) {
          const fd = new FormData()
          fd.append('companyId', companyId!)
          if (activeFolder) fd.append('folderId', activeFolder)
          fd.append('url', url); fd.append('name', file.name); fd.append('type', toSend.type)
          const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
          return res.ok
        }
      }

      const fd = new FormData()
      fd.append('file', toSend); fd.append('companyId', companyId!)
      if (activeFolder) fd.append('folderId', activeFolder)
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd })
      return res.ok
    }

    // Upload one at a time (as before) so a big batch doesn't spike memory
    // compressing everything at once or flood R2 with parallel transfers.
    let anySucceeded = false
    for (let i = 0; i < files.length; i++) {
      const draftId = drafts[i].id
      let ok = false
      try { ok = await uploadOne(files[i]) } catch { ok = false }
      if (ok) anySucceeded = true
      else setPending(prev => prev.map(p => p.id === draftId ? { ...p, status: 'error' } : p))
    }

    // Reconcile: refetch the real items, then drop the optimistic tiles that
    // landed (keeping any that errored so the failure stays visible). Revoke the
    // object URLs we created to avoid leaking them.
    if (anySucceeded) await load()
    setPending(prev => {
      const keep = prev.filter(p => p.status === 'error')
      prev.forEach(p => { if (p.status !== 'error') { try { URL.revokeObjectURL(p.previewUrl) } catch {} } })
      return keep
    })

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Dismiss a failed optimistic tile.
  const dismissPending = (id: string) => {
    setPending(prev => {
      const gone = prev.find(p => p.id === id)
      if (gone) { try { URL.revokeObjectURL(gone.previewUrl) } catch {} }
      return prev.filter(p => p.id !== id)
    })
  }

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await uploadFiles(Array.from(e.target.files || []))
  }

  // Google Drive picker → import selected files server-side into the gallery.
  const [driveImporting, setDriveImporting] = useState(false)
  const { configured: driveConfigured, loading: driveLoading, openPicker } = useGoogleDrivePicker(async (picked) => {
    if (!companyId || picked.length === 0) return
    setDriveImporting(true)
    try {
      const res = await fetch('/api/media/import-drive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, folderId: activeFolder, accessToken: picked[0].accessToken, files: picked.map(p => ({ id: p.id, name: p.name, mimeType: p.mimeType })) }),
      })
      const data = await res.json()
      if (data.imported != null) load()
    } catch {} finally { setDriveImporting(false) }
  })

  const connectSource = (source: 'google_drive' | 'canva') => {
    if (source === 'google_drive') {
      if (!driveConfigured) { alert('Google Drive import needs to be configured first (Google API key + OAuth client ID). Once those are set, this button opens your Drive to pick files.'); return }
      openPicker()
      return
    }
    alert("Canva import isn't connected yet. Once we set up the Canva app, you'll be able to pick designs here. For now, export from Canva and use Upload media.")
  }

  const deleteItem = (item: any) => {
    if (!companyId) return
    askConfirm({
      title: 'Delete media',
      message: `Delete “${item.title || 'this item'}” from the gallery? This can't be undone.`,
      confirmLabel: 'Delete', danger: true,
      onConfirm: async () => {
        await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete_item', itemId: item.id }) })
        load()
      },
    })
  }

  const moveItem = async (item: any, folderId: string | null) => {
    if (!companyId) return
    await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'update_item', itemId: item.id, folder_id: folderId }) })
    load()
  }

  const syncPrexty = async () => {
    if (!companyId) return
    setPrextyStatus('Syncing…')
    try {
      const res = await fetch('/api/media/prexty-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })
      const data = await res.json()
      setPrextyStatus(data.message || (data.ok ? `Synced ${data.synced} items` : 'Not available yet'))
    } catch (e: any) { setPrextyStatus(e.message) }
  }

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  // The grid and the lightbox must see the same list, otherwise a category
  // filter would open the wrong item (the click index is into this list).
  const visibleItems = items.filter((it: any) => !catFilter || (itemCats[it.id] || []).includes(catFilter))

  return (
    <div className="gal-root" style={{ padding: '28px 36px' }}>
      <style>{`
        .gal-toolbar-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .gal-layout { display: flex; gap: 24px; align-items: flex-start; }
        .gal-sidebar { width: 210px; flex-shrink: 0; position: sticky; top: 16px; }
        .gal-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 16px; }
        .gal-grid.compact { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
        .gal-grid.large { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
        /* Segmented view switcher */
        .gal-viewseg { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 10px; border: 1px solid var(--border); background: #fff; }
        .gal-viewseg button { display: flex; align-items: center; justify-content: center; width: 30px; height: 28px; border: none; background: transparent; border-radius: 7px; cursor: pointer; color: var(--slate); transition: background 0.14s ease, color 0.14s ease; }
        .gal-viewseg button.on { background: var(--peach); color: var(--coral); }
        .gal-spin { animation: gal-spin-kf 0.7s linear infinite; }
        @keyframes gal-spin-kf { to { transform: rotate(360deg); } }
        /* Smoother cards: lift on hover, gentle image zoom, softer shadows. */
        .gal-card { transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease; }
        .gal-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.10); }
        .gal-card .gal-thumb img, .gal-card .gal-thumb video { transition: transform 0.28s ease; }
        .gal-card:hover .gal-thumb img, .gal-card:hover .gal-thumb video { transform: scale(1.04); }

        /* Category rows: the edit/delete actions stay hidden until you hover the
           row, so the list reads clean. Icons animate in and react on hover. */
        .gal-folder-row { position: relative; display: flex; align-items: center; gap: 2px; border-radius: 8px; padding-right: 2px; transition: background 0.14s ease; }
        .gal-folder-row:hover { background: #f6f7f9; }
        .gal-folder-actions { display: flex; align-items: center; gap: 2px; opacity: 0; transform: translateX(6px); transition: opacity 0.16s ease, transform 0.16s ease; }
        .gal-folder-row:hover .gal-folder-actions, .gal-folder-row:focus-within .gal-folder-actions { opacity: 1; transform: translateX(0); }
        .gal-icon-btn { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--slate); flex-shrink: 0; transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease; }
        .gal-icon-btn svg { transition: transform 0.2s ease; }
        .gal-icon-btn.edit:hover { background: var(--peach); color: var(--coral); transform: translateY(-1px); }
        .gal-icon-btn.edit:hover svg { transform: rotate(-14deg) scale(1.1); }
        .gal-icon-btn.del:hover { background: #fee2e2; color: #dc2626; transform: translateY(-1px); }
        .gal-icon-btn.del:hover svg { animation: gal-shake 0.42s ease; }
        @keyframes gal-shake { 0%,100% { transform: rotate(0) scale(1.08); } 25% { transform: rotate(-10deg) scale(1.08); } 75% { transform: rotate(10deg) scale(1.08); } }

        /* In-app dialog + details slideout animations. */
        @keyframes gal-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes gal-pop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes gal-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

        /* Horizontal category strip is hidden on desktop (the sidebar handles it). */
        .gal-cat-strip { display: none; }

        @media (max-width: 760px) {
          .gal-root { padding: 16px 14px; }
          /* Stack: the folder sidebar becomes a horizontal chip strip on top. */
          .gal-layout { flex-direction: column; gap: 12px; }
          .gal-sidebar { display: none; }
          .gal-cat-strip {
            display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px;
            -webkit-overflow-scrolling: touch; scrollbar-width: none;
          }
          .gal-cat-strip::-webkit-scrollbar { display: none; }
          .gal-cat-chip {
            flex-shrink: 0; padding: 7px 14px; border-radius: 20px;
            font-size: 12.5px; font-weight: 700; white-space: nowrap; cursor: pointer;
            border: 1px solid var(--border); background: #fff; color: var(--slate);
          }
          .gal-cat-chip.on { border-color: var(--coral); background: var(--peach); color: var(--coral); }
          /* Denser grid so thumbnails fill a phone screen (density switcher is
             desktop-only — the phone always uses this compact layout). */
          .gal-grid, .gal-grid.compact, .gal-grid.comfortable, .gal-grid.large { grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; }
          .gal-viewseg { display: none; }
          /* Primary actions full width, secondary ones wrap. */
          .gal-toolbar-btns { width: 100%; }
          /* Details slideout takes the full width on a phone. */
          .gal-details-panel { width: 100% !important; max-width: 100% !important; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Media Gallery</h1>
        <div className="gal-toolbar-btns">
          <button onClick={syncPrexty} style={{ padding: '9px 16px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sync from Prexty</button>
          {driveConfigured && <button onClick={() => connectSource('google_drive')} disabled={driveLoading || driveImporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><GoogleDriveIcon /> {driveImporting ? 'Importing…' : 'Google Drive'}</button>}
          {categories.length > 0 && (
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 9, border: `1px solid ${catFilter ? 'var(--coral)' : 'var(--border)'}`, background: catFilter ? 'var(--peach)' : '#fff', color: catFilter ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <option value="">All categories</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          <div className="gal-viewseg" role="group" aria-label="View options">
            <button className={viewMode === 'compact' ? 'on' : ''} onClick={() => changeView('compact')} title="Compact grid" aria-label="Compact grid">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
            <button className={viewMode === 'comfortable' ? 'on' : ''} onClick={() => changeView('comfortable')} title="Comfortable grid" aria-label="Comfortable grid">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>
            </button>
            <button className={viewMode === 'large' ? 'on' : ''} onClick={() => changeView('large')} title="Large grid" aria-label="Large grid">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="12" x2="21" y2="12"/></svg>
            </button>
          </div>

          <button onClick={() => setShowQR(true)} title="Upload from your phone by scanning a QR code"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><line x1="14" y1="14" x2="14" y2="14.01"/><line x1="18" y1="14" x2="21" y2="14"/><line x1="14" y1="18" x2="14" y2="21"/><line x1="18" y1="18" x2="21" y2="21"/></svg>
            Phone upload
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{uploading ? 'Uploading…' : '+ Upload media'}</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple onChange={onUpload} style={{ display: 'none' }} />
        </div>
      </div>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px' }}>Store and categorise photos and videos (fish, tanks, plants…) to send to customers in chat.</p>
      {prextyStatus && <div style={{ background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 9, padding: '9px 12px', marginBottom: 16, fontSize: 12.5, color: 'var(--ink)' }}>{prextyStatus}</div>}

      <div className="gal-layout">
        {/* Folders sidebar (desktop) */}
        <div className="gal-sidebar">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Categories</span>
            <button onClick={createFolder} style={{ background: 'none', border: 'none', color: 'var(--coral)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          <button onClick={() => setActiveFolder(null)} style={folderBtn(activeFolder === null)}>All media</button>
          {folders.map(f => (
            <div key={f.id} className="gal-folder-row">
              <button onClick={() => setActiveFolder(f.id)} style={{ ...folderBtn(activeFolder === f.id), flex: 1, marginBottom: 0 }}>{f.name}{f.external_source === 'prexty' ? ' 🔄' : ''}</button>
              <span className="gal-folder-actions">
                <button className="gal-icon-btn edit" onClick={() => renameFolder(f)} title="Rename">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button className="gal-icon-btn del" onClick={() => deleteFolder(f)} title="Delete">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                </button>
              </span>
            </div>
          ))}
        </div>

        {/* Items grid — the whole column is a drop target, so files can be
            dragged in whether the gallery is empty or already full. */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}
          onDragOver={e => { e.preventDefault(); if (!dragOver) setDragOver(true) }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}
          onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files || [])) }}>
          {/* Drop hint over a populated grid (the empty state shows its own). */}
          {dragOver && (items.length > 0 || pending.length > 0) && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none',
              borderRadius: 16, border: '2px dashed var(--coral)',
              background: 'rgba(255,244,241,0.82)', backdropFilter: 'blur(1px)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--coral)', margin: 0 }}>Drop to upload</p>
            </div>
          )}
          {/* Mobile category strip (mirrors the desktop sidebar) */}
          <div className="gal-cat-strip">
            <button className={'gal-cat-chip' + (activeFolder === null ? ' on' : '')} onClick={() => setActiveFolder(null)}>All media</button>
            {folders.map(f => (
              <button key={f.id} className={'gal-cat-chip' + (activeFolder === f.id ? ' on' : '')} onClick={() => setActiveFolder(f.id)}>
                {f.name}{f.external_source === 'prexty' ? ' 🔄' : ''}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, SKU, description…" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />
          {loadingData ? (
            <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>Loading…</p>
          ) : items.length === 0 && pending.length === 0 ? (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                position: 'relative', textAlign: 'center', padding: '54px 24px', cursor: 'pointer', overflow: 'hidden',
                borderRadius: 20, border: `2px dashed ${dragOver ? 'var(--coral)' : 'var(--border)'}`,
                background: dragOver ? 'var(--peach)' : 'linear-gradient(160deg, #fffdfc 0%, #fff4f1 100%)',
                transition: 'all 0.2s',
              }}>
              {/* Fancy background SVG art */}
              <svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5, pointerEvents: 'none' }}>
                <defs>
                  <linearGradient id="mg1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.10" />
                  </linearGradient>
                  <radialGradient id="mg2" cx="0.5" cy="0.5" r="0.5">
                    <stop offset="0%" stopColor="var(--coral)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--coral)" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="90" cy="70" r="120" fill="url(#mg2)" />
                <circle cx="520" cy="240" r="150" fill="url(#mg2)" />
                <path d="M0 220 Q150 160 300 210 T600 190 V300 H0 Z" fill="url(#mg1)" />
                <path d="M0 250 Q150 200 300 240 T600 230 V300 H0 Z" fill="var(--coral)" opacity="0.05" />
                {[70, 150, 230, 310, 390, 470, 540].map((x, i) => (
                  <circle key={i} cx={x} cy={40 + (i % 3) * 30} r={3 + (i % 3)} fill="var(--coral)" opacity="0.15" />
                ))}
              </svg>

              <div style={{ position: 'relative' }}>
                {/* Stacked-photos icon */}
                <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: 18, background: '#fff', boxShadow: '0 8px 24px rgba(255,122,107,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </div>
                <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>{dragOver ? 'Drop to upload' : 'It feels kinda empty here'}</p>
                <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 20px' }}>Upload or drag and drop your media here — photos and videos to send to customers in chat.</p>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button onClick={e => { e.stopPropagation(); fileRef.current?.click() }} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Upload media</button>
                  <button onClick={e => { e.stopPropagation(); connectSource('google_drive') }} disabled={driveLoading || driveImporting} style={connectBtn}>
                    <GoogleDriveIcon /> {driveImporting ? 'Importing…' : driveLoading ? 'Opening…' : 'Google Drive'}
                  </button>
                  <button onClick={e => { e.stopPropagation(); connectSource('canva') }} style={connectBtn}>
                    <CanvaIcon /> Canva
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className={`gal-grid ${viewMode}`}>
              {/* Optimistic upload tiles — local previews shown while the file
                  is still being uploaded, before the real item exists. */}
              {pending.map((p: any) => {
                const errored = p.status === 'error'
                return (
                  <div key={p.id} style={{ border: `1px solid ${errored ? '#dc2626' : 'var(--border)'}`, borderRadius: 12, background: '#fff', position: 'relative' }}>
                    <div style={{ position: 'relative', paddingTop: '75%', background: 'var(--canvas)', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
                      {p.kind === 'video' ? (
                        <video src={p.previewUrl} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
                      ) : (
                        <img src={p.previewUrl} alt={p.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }} />
                      )}
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.35)' }}>
                        {errored ? (
                          <>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: '#dc2626' }}>Upload failed</span>
                            <button type="button" onClick={() => dismissPending(p.id)}
                              style={{ fontSize: 11, padding: '3px 12px', borderRadius: 6, border: '1px solid #dc2626', background: '#fff', color: '#dc2626', cursor: 'pointer', fontWeight: 600 }}>Dismiss</button>
                          </>
                        ) : (
                          <div className="gal-spin" style={{ width: 26, height: 26, borderRadius: '50%', border: '3px solid var(--peach)', borderTopColor: 'var(--coral)' }} />
                        )}
                      </div>
                    </div>
                    <div style={{ padding: '7px 9px', fontSize: 11, color: errored ? '#dc2626' : 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {errored ? p.name : 'Uploading…'}
                    </div>
                  </div>
                )
              })}
              {visibleItems.map((item, i) => {
                const isSelected = selected.has(item.id)
                return (
                <div key={item.id} className="gal-card" style={{ border: `1px solid ${isSelected ? 'var(--coral)' : 'var(--border)'}`, borderRadius: 12, background: '#fff', boxShadow: isSelected ? '0 0 0 2px var(--peach)' : 'none', position: 'relative' }}>
                  <div className="gal-thumb" style={{ position: 'relative', paddingTop: '75%', cursor: 'pointer', background: 'var(--canvas)', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}
                    onClick={() => selectMode ? toggleSelect(item.id) : setLightboxIndex(i)}>
                    {item.kind === 'video' ? (
                      <video src={item.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img loading="lazy" decoding="async" src={item.thumbnail_url || item.url} alt={item.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    {item.kind === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}><svg width="34" height="34" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg></div>}

                    {/* Select checkbox — always available on hover, sticky in select mode */}
                    <button type="button"
                      onClick={e => { e.stopPropagation(); toggleSelect(item.id) }}
                      title={isSelected ? 'Deselect' : 'Select'}
                      style={{
                        position: 'absolute', top: 8, left: 8, width: 24, height: 24, borderRadius: 7,
                        border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.9)',
                        background: isSelected ? 'var(--coral)' : 'rgba(0,0,0,0.28)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', padding: 0, backdropFilter: 'blur(3px)',
                      }}>
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </button>

                    {/* Edit (Markup) — images only. Opens the annotator to crop-free
                        draw/arrow/text, saved back as a new image. */}
                    {item.kind !== 'video' && !selectMode && (
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setEditingItem(item) }}
                        title="Edit image (markup)"
                        style={{
                          position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 8,
                          border: 'none', background: 'rgba(0,0,0,0.42)', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0, backdropFilter: 'blur(3px)',
                        }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                      </button>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || 'Untitled'}</p>
                    {item.sku && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>SKU: {item.sku}</p>}
                    {/* Categories — a photo can be in several at once */}
                    {(itemCats[item.id] || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 5 }}>
                        {(itemCats[item.id] || []).slice(0, 3).map(cid => {
                          const c = categories.find((x: any) => x.id === cid)
                          if (!c) return null
                          return (
                            <span key={cid} style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'var(--peach)', color: 'var(--coral)' }}>
                              {c.name}
                            </span>
                          )
                        })}
                        {(itemCats[item.id] || []).length > 3 && (
                          <span style={{ fontSize: 9.5, color: 'var(--slate)', fontWeight: 700 }}>+{(itemCats[item.id] || []).length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Categories: a MULTI-select. The old control here was a
                        single-select folder dropdown, which forced each photo
                        into exactly one place — a 4ft tank with a sump belongs
                        in both. Toggling here writes to the many-to-many join. */}
                    <div style={{ marginTop: 6, position: 'relative' }} data-cat-picker>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setCatMenuFor(catMenuFor === item.id ? null : item.id) }}
                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: (itemCats[item.id] || []).length ? 'var(--ink)' : 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, textAlign: 'left' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(itemCats[item.id] || []).length
                            ? `${(itemCats[item.id] || []).length} categor${(itemCats[item.id] || []).length === 1 ? 'y' : 'ies'}`
                            : 'Unfiled'}
                        </span>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>

                      {catMenuFor === item.id && (
                        <div onClick={e => e.stopPropagation()}
                          style={{ position: 'absolute', bottom: '110%', left: 0, width: 200, maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', zIndex: 60, padding: 6 }}>
                          <p style={{ margin: '2px 6px 6px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>In categories</p>
                          {categories.length === 0 && (
                            <p style={{ margin: 0, padding: '8px 6px', fontSize: 11.5, color: 'var(--slate)' }}>No categories yet — add one on the left.</p>
                          )}
                          {categories.map((c: any) => {
                            const on = (itemCats[item.id] || []).includes(c.id)
                            return (
                              <label key={c.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px', borderRadius: 7, cursor: 'pointer', background: on ? 'var(--peach)' : 'transparent' }}>
                                <input type="checkbox" checked={on}
                                  onChange={() => toggleItemCategory(item.id, c.id)}
                                  style={{ width: 15, height: 15, accentColor: 'var(--coral)', cursor: 'pointer' }} />
                                <span style={{ fontSize: 12, color: on ? 'var(--coral)' : 'var(--ink)', fontWeight: on ? 700 : 500 }}>{c.name}</span>
                              </label>
                            )
                          })}
                          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6, display: 'flex', gap: 6 }}>
                            <input value={quickCat} onChange={e => setQuickCat(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') quickAddCategory(item.id) }}
                              placeholder="New category…"
                              style={{ flex: 1, fontSize: 11.5, padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', outline: 'none', minWidth: 0 }} />
                            <button type="button" onClick={() => quickAddCategory(item.id)}
                              style={{ padding: '5px 9px', borderRadius: 6, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Add</button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions on their own right-aligned row so they never spill
                        past the card edge, regardless of card width. */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginTop: 8 }}>
                      <button onClick={() => shareItems([item])} title="Share / copy link"
                        style={galAction()}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                      </button>
                      <button onClick={() => setForwardItems([item])} title="Send to a chat"
                        style={galAction()}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      </button>
                      <button onClick={() => setTaggingItem(item)} title="Categories"
                        style={galAction()}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                      </button>
                      <button onClick={() => deleteItem(item)} title="Delete" style={galAction('#dc2626')}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {lightboxIndex !== null && visibleItems[lightboxIndex] && (
        <MediaGallery
          items={visibleItems.map(it => ({ url: it.url, kind: it.kind, name: it.title }))}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => { setLightboxIndex(null); setDetailsOpen(false) }}
          onViewDetails={() => setDetailsOpen(true)}
        />
      )}

      {/* Details slideout for the current lightbox item */}
      {detailsOpen && lightboxIndex !== null && visibleItems[lightboxIndex] && (
        <MediaDetailsPanel
          item={visibleItems[lightboxIndex]}
          folders={folders}
          categories={categories}
          itemCats={itemCats}
          companyId={companyId}
          userId={userId}
          me={me}
          team={team}
          onClose={() => setDetailsOpen(false)}
          onEdit={(it) => { setDetailsOpen(false); setLightboxIndex(null); setEditingItem(it) }}
        />
      )}

      {/* In-app confirmation dialog (no more native browser popups) */}
      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => { const fn = confirmState.onConfirm; setConfirmState(null); fn() }}
        />
      )}

      {/* Send to a chat — pick a contact, forward the media into their thread. */}
      {forwardItems && (
        <div onClick={() => { setForwardItems(null); setForwardSearch(''); setForwardResults([]) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 460, maxWidth: '95vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 18, overflow: 'hidden' }}>
            <div style={{ padding: 18, borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Send to a chat</h3>
              <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--slate)' }}>
                {forwardItems.length === 1 ? 'This photo/video' : `${forwardItems.length} items`} will be sent to the contact’s conversation — and texted to them if we have a mobile number.
              </p>
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {forwardItems.slice(0, 6).map((it: any, i: number) => (
                  <div key={i} style={{ width: 40, height: 40, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)', background: '#111', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {it.kind === 'video' ? <span style={{ color: '#fff' }}>▶</span> : <img src={it.thumbnail_url || it.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  </div>
                ))}
                {forwardItems.length > 6 && <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--slate)' }}>+{forwardItems.length - 6}</span>}
              </div>
              <input autoFocus value={forwardSearch} onChange={e => searchForwardTargets(e.target.value)}
                placeholder="Search contacts by name, email or phone…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {forwardSearch.trim().length < 2 ? (
                <p style={{ padding: 18, fontSize: 13, color: 'var(--slate)' }}>Type at least 2 characters to find a contact.</p>
              ) : forwardResults.length === 0 ? (
                <p style={{ padding: 18, fontSize: 13, color: 'var(--slate)' }}>No contacts match “{forwardSearch}”.</p>
              ) : (
                forwardResults.map(c => (
                  <button key={c.id} type="button" onClick={() => doForward(c)} disabled={forwardBusy}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: '#fff', cursor: forwardBusy ? 'default' : 'pointer' }}>
                    <span style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{(c.name || c.email || '?').charAt(0).toUpperCase()}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{c.name || c.email || 'Contact'}</div>
                      <div style={{ fontSize: 12, color: 'var(--slate)' }}>{c.phone || c.email || ''}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Transient toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 500, background: 'var(--ink)', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600, boxShadow: '0 8px 30px rgba(0,0,0,0.28)' }}>{toast}</div>
      )}

      {/* Categorise a photo — it can be in as many as you like */}
      {taggingItem && (
        <div onClick={() => setTaggingItem(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 420, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Categories</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--slate)' }}>
              A photo can belong to several categories at once — it isn&rsquo;t duplicated.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createCategory() }}
                placeholder="New category…"
                style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
              <button onClick={createCategory}
                style={{ padding: '9px 16px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Add</button>
            </div>

            {categories.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', textAlign: 'center', padding: 20 }}>No categories yet — create one above.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categories.map((c: any) => {
                  const on = (itemCats[taggingItem.id] || []).includes(c.id)
                  return (
                    <label key={c.id}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 12px', borderRadius: 10, border: `1px solid ${on ? 'var(--coral)' : 'var(--border)'}`, background: on ? 'var(--peach)' : '#fff', cursor: 'pointer' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <input type="checkbox" checked={on}
                          onChange={() => toggleItemCategory(taggingItem.id, c.id)}
                          style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
                        <span style={{ fontSize: 13.5, fontWeight: on ? 700 : 500, color: 'var(--ink)' }}>{c.name}</span>
                      </span>
                      <button onClick={(e) => {
                        e.preventDefault(); e.stopPropagation()
                        askConfirm({
                          title: 'Delete category',
                          message: `Delete the “${c.name}” category? Your photos aren't deleted — they just leave this category.`,
                          confirmLabel: 'Delete category', danger: true,
                          onConfirm: async () => {
                            try { await catApi({ action: 'delete', id: c.id }); await loadCategories() } catch (err: any) { alert(err.message) }
                          },
                        })
                      }}
                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15, padding: 0 }}>×</button>
                    </label>
                  )
                })}
              </div>
            )}

            <button onClick={() => setTaggingItem(null)}
              style={{ width: '100%', marginTop: 18, padding: '11px 0', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}

      {/* Bulk action bar — appears when items are selected */}
      {selectMode && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 300,
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 14,
          background: '#0d0f14', color: '#fff', boxShadow: '0 12px 40px rgba(0,0,0,0.28)',
          border: '1px solid rgba(255,255,255,0.10)',
          // Keep everything (incl. Delete + ✕) on one row; scroll horizontally
          // on narrow screens rather than wrapping Delete onto a lonely line.
          flexWrap: 'nowrap', overflowX: 'auto', maxWidth: 'calc(100vw - 32px)',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {selected.size} selected
          </span>

          <button onClick={selectAll} disabled={bulkBusy}
            style={{ padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Select all
          </button>

          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />

          <select disabled={bulkBusy} defaultValue=""
            onChange={e => { if (e.target.value !== '') bulkMove(e.target.value === '__none' ? null : e.target.value); e.target.value = '' }}
            style={{ flexShrink: 0, padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <option value="" disabled>Move to…</option>
            <option value="__none">Unfiled</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {categories.length > 0 && (
            <select disabled={bulkBusy} defaultValue=""
              onChange={e => { if (e.target.value) bulkAddCategory(e.target.value); e.target.value = '' }}
              style={{ flexShrink: 0, padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <option value="" disabled>Add to category…</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          <button onClick={() => shareItems(items.filter((i: any) => selected.has(i.id)))} disabled={bulkBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>

          <button onClick={() => setForwardItems(items.filter((i: any) => selected.has(i.id)))} disabled={bulkBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Send to chat
          </button>

          <button onClick={bulkDownload} disabled={bulkBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download
          </button>

          <button onClick={bulkDelete} disabled={bulkBusy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
            {bulkBusy ? '…' : 'Delete'}
          </button>

          <button onClick={clearSelection}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9aa3b2', display: 'flex', padding: 4 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      )}

      {/* Scan-to-upload from a phone */}
      {showQR && companyId && (
        <PhoneUploadQR
          companyId={companyId}
          folderId={activeFolder}
          onClose={() => setShowQR(false)}
          onUploaded={load}
        />
      )}

      {/* Image editor (Markup) — draw / arrow / text over the photo, then save
          as a new image. Loaded through the same-origin proxy so the canvas can
          export on Save. */}
      {editingItem && (
        <ImageAnnotator
          imageSrc={`/api/media/proxy?url=${encodeURIComponent(editingItem.url)}`}
          onClose={() => setEditingItem(null)}
          onSave={(dataUrl) => saveEditedImage(editingItem, dataUrl)}
        />
      )}
    </div>
  )
}

// ── In-app confirmation dialog ────────────────────────────────────────────
// A themed replacement for window.confirm(): keyboard-friendly (Esc cancels,
// Enter confirms), with a danger variant for destructive actions.
function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string; danger?: boolean
  onConfirm: () => void; onCancel: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onConfirm, onCancel])

  return (
    <div onClick={onCancel}
      style={{ position: 'fixed', inset: 0, background: 'rgba(13,15,20,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100050, padding: 20, animation: 'gal-fade 0.14s ease' }}>
      <div onClick={e => e.stopPropagation()} role="alertdialog" aria-label={title}
        style={{ width: 400, maxWidth: '92vw', background: '#fff', borderRadius: 18, padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.30)', animation: 'gal-pop 0.16s ease' }}>
        <div style={{ width: 46, height: 46, borderRadius: 13, background: danger ? '#fee2e2' : 'var(--peach)', color: danger ? '#dc2626' : 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
          {danger ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          )}
        </div>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{title}</h3>
        <p style={{ margin: '0 0 22px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} autoFocus
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: danger ? '#dc2626' : 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── Media details slideout ────────────────────────────────────────────────
// A right-hand panel showing everything we know (and can measure) about one
// media item. Dimensions, duration and file size are read live in the browser,
// since they aren't stored on the row.
function MediaDetailsPanel({ item, folders, categories, itemCats, companyId, userId, me, team, onClose, onEdit }: {
  item: any; folders: any[]; categories: any[]; itemCats: Record<string, string[]>
  companyId: string | null; userId: string | null; me: string; team: { id: string; user_id: string; name: string; email?: string }[]
  onClose: () => void
  onEdit?: (item: any) => void
}) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [sizeBytes, setSizeBytes] = useState<number | null>(null)

  // ── Notes thread ─────────────────────────────────────────────────────────
  const [notes, setNotes] = useState<any[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteMentions, setNoteMentions] = useState<any[]>([])
  const [posting, setPosting] = useState(false)
  const [notesMissing, setNotesMissing] = useState(false)

  useEffect(() => {
    let active = true
    setNotes([]); setNotesMissing(false)
    if (!item?.id) return
    setNotesLoading(true)
    ;(async () => {
      const { data, error } = await (supabase as any)
        .from('media_item_notes').select('*')
        .eq('item_id', item.id).order('created_at', { ascending: true })
      if (!active) return
      if (error) { if (/does not exist|schema cache/i.test(error.message)) setNotesMissing(true) }
      else setNotes(data || [])
      setNotesLoading(false)
    })()
    return () => { active = false }
  }, [item?.id])

  const postNote = async () => {
    const body = noteText.trim()
    if (!body || posting) return
    setPosting(true)
    const mentioned = resolveMentions(body, team as any)
    const row = {
      item_id: item.id, company_id: companyId, body,
      author_id: userId, author_name: me,
      mentions: mentioned.map((m: any) => ({ id: m.id, name: m.name })),
    }
    const { data, error } = await (supabase as any).from('media_item_notes').insert(row).select().maybeSingle()
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) setNotesMissing(true)
      else alert(`Could not save the note: ${error.message}`)
      setPosting(false)
      return
    }
    if (data) setNotes(n => [...n, data])
    setNoteText(''); setNoteMentions([])
    // Reach @mentioned teammates via the shared notifier (bell/email/SMS).
    const ids = Array.from(new Set(
      mentioned.map((m: any) => team.find(t => t.id === m.id || t.user_id === m.id || t.name === m.name)?.user_id)
        .filter((uid: any) => uid && uid !== userId)
    ))
    if (ids.length && companyId) {
      try {
        await fetch('/api/notify/members', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId, userIds: ids, type: 'media_note',
            title: `${me} mentioned you on a media item`,
            body: body.slice(0, 200), link: '/admin/gallery',
          }),
        })
      } catch { /* the note is saved regardless */ }
    }
    setPosting(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Measure dimensions / duration by loading the media, and file size via a
  // best-effort HEAD request (may be blocked by CORS — we degrade to “—”).
  useEffect(() => {
    let cancelled = false
    setDims(null); setDuration(null); setSizeBytes(null)
    if (!item?.url) return
    if (item.kind === 'video') {
      const v = document.createElement('video')
      v.preload = 'metadata'
      v.onloadedmetadata = () => { if (!cancelled) { setDims({ w: v.videoWidth, h: v.videoHeight }); setDuration(v.duration || null) } }
      v.src = item.url
    } else {
      const img = new window.Image()
      img.onload = () => { if (!cancelled) setDims({ w: img.naturalWidth, h: img.naturalHeight }) }
      img.src = item.url
    }
    fetch(item.url, { method: 'HEAD' })
      .then(r => { const len = r.headers.get('content-length'); if (!cancelled && len) setSizeBytes(parseInt(len, 10)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [item?.id, item?.url, item?.kind])

  const fileName = (() => {
    try {
      const base = decodeURIComponent(new URL(item.url).pathname.split('/').pop() || '')
      return base.replace(/^\d{10,}-/, '') || item.title || 'file'   // strip the upload timestamp prefix
    } catch { return item.title || 'file' }
  })()
  const ext = (fileName.split('.').pop() || '').toUpperCase()
  const fileType = /^(JPG|JPEG|PNG|WEBP|GIF|MP4|MOV|WEBM|AVIF|HEIC)$/.test(ext)
    ? (ext === 'JPEG' ? 'JPG' : ext)
    : (item.kind === 'video' ? 'Video' : 'Image')

  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
  const fmtDur = (s: number) => { const m = Math.floor(s / 60); const sec = Math.round(s % 60); return `${m}:${String(sec).padStart(2, '0')}` }
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  const ratio = dims && dims.w && dims.h ? (() => {
    const g = gcd(dims.w, dims.h) || 1
    const rw = dims.w / g, rh = dims.h / g
    return (rw <= 32 && rh <= 32) ? `${rw}:${rh}` : `${(dims.w / dims.h).toFixed(2)}:1`
  })() : null
  const orientation = dims ? (dims.w > dims.h ? 'Landscape' : dims.w < dims.h ? 'Portrait' : 'Square') : null
  const fmtDate = (d?: string) => d ? new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'
  const source = item.external_source === 'prexty' ? 'Prexty'
    : item.external_source === 'google_drive' ? 'Google Drive'
    : item.external_source === 'phone' ? 'Phone upload'
    : item.external_source ? String(item.external_source)
    : 'Manual upload'
  const folder = folders.find((f: any) => f.id === item.folder_id)
  const cats = (itemCats[item.id] || []).map(cid => categories.find((c: any) => c.id === cid)).filter(Boolean)

  const fmtWhen = (d?: string) => d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  // Highlight @mentions of known teammates in a note body.
  const renderNoteBody = (text: string): React.ReactNode => {
    const names = team.map(t => t.name).filter(Boolean)
    if (!text || !names.length) return text
    const escaped = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
    const re = new RegExp(`@(${escaped.join('|')})`, 'g')
    const out: React.ReactNode[] = []
    let last = 0, m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) out.push(text.slice(last, m.index))
      out.push(<span key={m.index} style={{ color: 'var(--coral)', fontWeight: 700 }}>{m[0]}</span>)
      last = m.index + m[0].length
    }
    if (last < text.length) out.push(text.slice(last))
    return out
  }
  const initial = (n?: string) => (n || '?').trim().charAt(0).toUpperCase()

  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12.5, color: 'var(--slate)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', wordBreak: 'break-word' }}>{value ?? '—'}</span>
    </div>
  )

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 100060, background: 'rgba(0,0,0,0.35)', display: 'flex', justifyContent: 'flex-end', animation: 'gal-fade 0.14s ease' }}>
      <div onClick={e => e.stopPropagation()} className="gal-details-panel"
        style={{ width: 380, maxWidth: '92vw', height: '100%', background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column', animation: 'gal-slide-in 0.22s cubic-bezier(0.22,0.61,0.36,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Details</h3>
          <button onClick={onClose} aria-label="Close details"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: 18 }}>
          {/* Preview */}
          <div style={{ borderRadius: 12, overflow: 'hidden', background: 'var(--canvas)', marginBottom: 16, aspectRatio: '4 / 3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {item.kind === 'video'
              ? <video src={item.url} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <img src={item.url} alt={item.title || ''} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
          </div>

          <p style={{ margin: '0 0 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)' }}>Basic information</p>
          <Row label="File name" value={fileName} />
          <Row label="Display title" value={item.title || 'Untitled'} />
          <Row label="Description" value={item.description || '—'} />
          <Row label="File type" value={fileType} />
          <Row label="File size" value={sizeBytes != null ? fmtSize(sizeBytes) : '—'} />
          <Row label="Dimensions" value={dims ? `${dims.w} × ${dims.h} px` : '—'} />
          <Row label="Aspect ratio" value={ratio || '—'} />
          <Row label="Orientation" value={orientation || '—'} />
          {item.kind === 'video' && <Row label="Duration" value={duration != null ? fmtDur(duration) : '—'} />}
          {item.sku && <Row label="SKU" value={item.sku} />}
          <Row label="Category" value={folder?.name || 'Unfiled'} />
          <Row label="Tags" value={cats.length ? (
            <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end' }}>
              {cats.map((c: any) => <span key={c.id} style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: 'var(--peach)', color: 'var(--coral)' }}>{c.name}</span>)}
            </span>
          ) : '—'} />

          <p style={{ margin: '16px 0 4px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)' }}>Origin</p>
          <Row label="Source" value={source} />
          <Row label="Uploaded" value={fmtDate(item.created_at)} />
          <Row label="Uploaded by" value={item.uploaded_by || '—'} />
          <Row label="Last updated" value={item.updated_at ? fmtDate(item.updated_at) : '—'} />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            <a href={item.url} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open original
            </a>
            {item.kind !== 'video' && onEdit && (
              <button onClick={() => onEdit(item)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                Edit image
              </button>
            )}
          </div>

          {/* ── Notes ─────────────────────────────────────────────────── */}
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--slate)' }}>
              Notes {notes.length > 0 && <span style={{ color: 'var(--coral)' }}>· {notes.length}</span>}
            </p>

            {notesMissing ? (
              <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.5, background: 'var(--peach)', border: '1px solid var(--coral)', borderRadius: 9, padding: '9px 11px' }}>
                Notes need a quick database update — run <b>COLVY_V214_MEDIA_NOTES.sql</b> in Supabase, then reload.
              </p>
            ) : (
              <>
                {notesLoading ? (
                  <p style={{ fontSize: 12, color: 'var(--slate)', margin: '0 0 12px' }}>Loading…</p>
                ) : notes.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: '0 0 12px', lineHeight: 1.5 }}>
                    No notes yet. Leave context for your team or <b>@mention</b> someone.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
                    {notes.map((n: any) => (
                      <div key={n.id} style={{ display: 'flex', gap: 9 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                          {initial(n.author_name)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>{n.author_name || 'Someone'}</span>
                            <span style={{ fontSize: 11, color: 'var(--slate)' }}>{fmtWhen(n.created_at)}</span>
                          </div>
                          <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {renderNoteBody(n.body)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Composer */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <MentionInput
                    value={noteText}
                    onChange={(v, mentions) => { setNoteText(v); setNoteMentions(mentions) }}
                    team={team as any}
                    multiline
                    rows={2}
                    placeholder="Add a note… use @ to mention a teammate"
                    onSubmit={postNote}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--slate)' }}>
                      {noteMentions.length > 0 ? `Notifying ${noteMentions.map((m: any) => m.name).join(', ')}` : 'Type @ to mention a teammate'}
                    </span>
                    <button onClick={postNote} disabled={posting || !noteText.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: 'none', background: noteText.trim() ? 'var(--coral)' : 'var(--border)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: noteText.trim() ? 'pointer' : 'default' }}>
                      {posting ? 'Adding…' : 'Add note'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function folderBtn(active: boolean): React.CSSProperties {
  return { display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 8, border: 'none', background: active ? 'var(--peach)' : 'transparent', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: 2 }
}

const connectBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

// Compact, fixed-size icon button for the card action row — flexShrink:0 keeps
// them from being squeezed and spilling outside the card.
function galAction(color = 'var(--slate)'): React.CSSProperties {
  return { flexShrink: 0, width: 28, height: 28, borderRadius: 7, background: 'transparent', border: 'none', color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }
}

function GoogleDriveIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
      <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
      <path d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L1.2 48.4C.4 49.8 0 51.35 0 52.9h27.5z" fill="#00ac47"/>
      <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.798l5.852 11.5z" fill="#ea4335"/>
      <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.9 0H34.4c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
      <path d="M59.8 52.9H27.5L13.75 76.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
      <path d="M73.4 26.5L60.75 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25l16.15 27.9h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
    </svg>
  )
}

function CanvaIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="12" fill="#00C4CC"/>
      <path d="M15.5 14.2c-.9 1.4-2.3 2.3-3.8 2.3-2.1 0-3.4-1.6-3.4-3.9 0-3 1.9-5.6 4.2-5.6 1 0 1.7.5 1.7 1.3 0 .9-.7 1.3-1.1 1.3-.3 0-.5-.2-.5-.5 0-.4.3-.5.3-.8 0-.2-.2-.4-.5-.4-1.1 0-2.2 1.9-2.2 4 0 1.4.6 2.3 1.6 2.3.9 0 1.7-.6 2.4-1.6.2-.3.6-.1.8.2z" fill="#fff"/>
    </svg>
  )
}
