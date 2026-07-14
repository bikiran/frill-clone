'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useCompanyUser } from '../crm-settings/_shared'
import MediaGallery from '@/components/MediaGallery'
import { useGoogleDrivePicker } from '@/components/GoogleDrivePicker'
import PhoneUploadQR from '@/components/PhoneUploadQR'

export default function GalleryPage() {
  const { companyId, loading } = useCompanyUser()
  const [folders, setFolders] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = all
  const [search, setSearch] = useState('')
  const [loadingData, setLoadingData] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showQR, setShowQR] = useState(false)

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
    try {
      const res = await fetch(`/api/media/categories?companyId=${companyId}`)
      const d = await res.json()
      setCategories(d.categories || [])
      setItemCats(d.byItem || {})
    } catch {}
  }, [companyId])

  useEffect(() => { loadCategories() }, [loadCategories])

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

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}? This can't be undone.`)) return
    setBulkBusy(true)
    try {
      await (supabase as any).from('media_items').delete().in('id', Array.from(selected))
      clearSelection()
      await load()
    } catch (e: any) {
      alert('Could not delete: ' + e.message)
    } finally { setBulkBusy(false) }
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
  const [dragOver, setDragOver] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [prextyStatus, setPrextyStatus] = useState('')

  const load = useCallback(async () => {
    if (!companyId) return
    setLoadingData(true)
    try {
      const params = new URLSearchParams({ companyId })
      if (activeFolder) params.set('folderId', activeFolder)
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/media?${params}`)
      const data = await res.json()
      setFolders(data.folders || [])
      setItems(data.items || [])
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

  const deleteFolder = async (f: any) => {
    if (!companyId || !confirm(`Delete folder "${f.name}"? Its media will move to Unfiled.`)) return
    await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete_folder', folderId: f.id }) })
    if (activeFolder === f.id) setActiveFolder(null)
    load()
  }

  const uploadFiles = async (files: File[]) => {
    if (!files.length || !companyId) return
    setUploading(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('file', file); fd.append('companyId', companyId)
        if (activeFolder) fd.append('folderId', activeFolder)
        await fetch('/api/media/upload', { method: 'POST', body: fd })
      }
      load()
    } catch {} finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
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

  const deleteItem = async (item: any) => {
    if (!companyId || !confirm('Delete this media?')) return
    await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action: 'delete_item', itemId: item.id }) })
    load()
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

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Media Gallery</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={syncPrexty} style={{ padding: '9px 16px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Sync from Prexty</button>
          {driveConfigured && <button onClick={() => connectSource('google_drive')} disabled={driveLoading || driveImporting} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><GoogleDriveIcon /> {driveImporting ? 'Importing…' : 'Google Drive'}</button>}
          {categories.length > 0 && (
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: 9, border: `1px solid ${catFilter ? 'var(--coral)' : 'var(--border)'}`, background: catFilter ? 'var(--peach)' : '#fff', color: catFilter ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <option value="">All categories</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

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

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Folders sidebar */}
        <div style={{ width: 210, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase' }}>Categories</span>
            <button onClick={createFolder} style={{ background: 'none', border: 'none', color: 'var(--coral)', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          <button onClick={() => setActiveFolder(null)} style={folderBtn(activeFolder === null)}>All media</button>
          {folders.map(f => (
            <div key={f.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => setActiveFolder(f.id)} style={{ ...folderBtn(activeFolder === f.id), flex: 1 }}>{f.name}{f.external_source === 'prexty' ? ' 🔄' : ''}</button>
              <button onClick={() => renameFolder(f)} title="Rename" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', fontSize: 12 }}>✎</button>
              <button onClick={() => deleteFolder(f)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>

        {/* Items grid */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by title, SKU, description…" style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, boxSizing: 'border-box', marginBottom: 14 }} />
          {loadingData ? (
            <p style={{ color: 'var(--slate)', fontSize: 13.5 }}>Loading…</p>
          ) : items.length === 0 ? (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={e => { e.preventDefault(); setDragOver(false) }}
              onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(Array.from(e.dataTransfer.files || [])) }}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {items.filter((it: any) => !catFilter || (itemCats[it.id] || []).includes(catFilter)).map((item, i) => {
                const isSelected = selected.has(item.id)
                return (
                <div key={item.id} style={{ border: `1px solid ${isSelected ? 'var(--coral)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: isSelected ? '0 0 0 2px var(--peach)' : 'none', transition: 'all 0.12s' }}>
                  <div style={{ position: 'relative', paddingTop: '75%', cursor: 'pointer', background: 'var(--canvas)' }}
                    onClick={() => selectMode ? toggleSelect(item.id) : setLightboxIndex(i)}>
                    {item.kind === 'video' ? (
                      <video src={item.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img src={item.thumbnail_url || item.url} alt={item.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, position: 'relative' }} data-cat-picker>
                      <button type="button"
                        onClick={e => { e.stopPropagation(); setCatMenuFor(catMenuFor === item.id ? null : item.id) }}
                        style={{ flex: 1, fontSize: 11, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: (itemCats[item.id] || []).length ? 'var(--ink)' : 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, textAlign: 'left' }}>
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
                      <button onClick={() => setTaggingItem(item)} title="Categories"
                        style={{ background: 'none', border: 'none', color: 'var(--slate)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
                      </button>
                      <button onClick={() => deleteItem(item)} title="Delete" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 2 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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

      {lightboxIndex !== null && items[lightboxIndex] && (
        <MediaGallery
          items={items.map(it => ({ url: it.url, kind: it.kind, name: it.title }))}
          index={lightboxIndex}
          onIndex={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
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
                      <button onClick={async (e) => {
                        e.preventDefault(); e.stopPropagation()
                        if (!confirm(`Delete the "${c.name}" category? Photos aren't deleted.`)) return
                        try { await catApi({ action: 'delete', id: c.id }); await loadCategories() } catch (err: any) { alert(err.message) }
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
          border: '1px solid rgba(255,255,255,0.10)', flexWrap: 'wrap', maxWidth: 'calc(100vw - 32px)',
        }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {selected.size} selected
          </span>

          <button onClick={selectAll} disabled={bulkBusy}
            style={{ padding: '6px 11px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Select all
          </button>

          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.14)' }} />

          <select disabled={bulkBusy} defaultValue=""
            onChange={e => { if (e.target.value !== '') bulkMove(e.target.value === '__none' ? null : e.target.value); e.target.value = '' }}
            style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <option value="" disabled>Move to…</option>
            <option value="__none">Unfiled</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>

          {categories.length > 0 && (
            <select disabled={bulkBusy} defaultValue=""
              onChange={e => { if (e.target.value) bulkAddCategory(e.target.value); e.target.value = '' }}
              style={{ padding: '6px 9px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <option value="" disabled>Add to category…</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

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
    </div>
  )
}

function folderBtn(active: boolean): React.CSSProperties {
  return { display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px', borderRadius: 8, border: 'none', background: active ? 'var(--peach)' : 'transparent', color: active ? 'var(--coral)' : 'var(--ink)', fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer', marginBottom: 2 }
}

const connectBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#fff', color: 'var(--ink)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }

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
