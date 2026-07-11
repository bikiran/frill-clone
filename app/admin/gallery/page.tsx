'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useCompanyUser } from '../crm-settings/_shared'
import MediaGallery from '@/components/MediaGallery'

export default function GalleryPage() {
  const { companyId, loading } = useCompanyUser()
  const [folders, setFolders] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [activeFolder, setActiveFolder] = useState<string | null>(null) // null = all
  const [search, setSearch] = useState('')
  const [loadingData, setLoadingData] = useState(false)
  const [uploading, setUploading] = useState(false)
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

  const connectSource = (source: 'google_drive' | 'canva') => {
    // These require OAuth apps to be configured. Until then, be honest.
    const name = source === 'google_drive' ? 'Google Drive' : 'Canva'
    alert(`${name} import isn't connected yet. Once we set up the ${name} app, you'll be able to pick files from ${name} here. For now, download from ${name} and use Upload media.`)
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
                  <button onClick={e => { e.stopPropagation(); connectSource('google_drive') }} style={connectBtn}>
                    <GoogleDriveIcon /> Google Drive
                  </button>
                  <button onClick={e => { e.stopPropagation(); connectSource('canva') }} style={connectBtn}>
                    <CanvaIcon /> Canva
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
              {items.map((item, i) => (
                <div key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
                  <div onClick={() => setLightboxIndex(i)} style={{ position: 'relative', paddingTop: '75%', cursor: 'pointer', background: 'var(--canvas)' }}>
                    {item.kind === 'video' ? (
                      <video src={item.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img src={item.thumbnail_url || item.url} alt={item.title || ''} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    {item.kind === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>▶</div>}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || 'Untitled'}</p>
                    {item.sku && <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>SKU: {item.sku}</p>}
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <select value={item.folder_id || ''} onChange={e => moveItem(item, e.target.value || null)} style={{ flex: 1, fontSize: 11, padding: '3px 5px', borderRadius: 6, border: '1px solid var(--border)' }}>
                        <option value="">Unfiled</option>
                        {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                      <button onClick={() => deleteItem(item)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                    </div>
                  </div>
                </div>
              ))}
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
