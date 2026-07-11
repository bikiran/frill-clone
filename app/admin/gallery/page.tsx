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

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
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
            <div style={{ textAlign: 'center', padding: '50px 20px', color: 'var(--slate)' }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🖼️</div>
              <p style={{ fontSize: 14 }}>No media here yet. Upload photos or videos to get started.</p>
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
