'use client'

import { useState, useRef } from 'react'
import { uploadIdeaImage, deleteIdeaImage, reorderIdeaImages } from '@/lib/imageGallery'

export default function ImageGallery({ ideaId, images, onUpdate, isAdmin }: {
  ideaId: string
  images: any[]
  onUpdate: () => void
  isAdmin: boolean
}) {
  const [gallery, setGallery] = useState(images)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadIdeaImage(ideaId, file)
      onUpdate()
      setGallery(prev => [...prev])
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDelete = async (imageId: string) => {
    if (!confirm('Delete image?')) return
    try {
      await deleteIdeaImage(imageId)
      onUpdate()
    } catch (err: any) {
      alert('Delete failed: ' + err.message)
    }
  }

  if (gallery.length === 0) {
    return isAdmin ? (
      <div className="mb-6">
        <button onClick={() => fileRef.current?.click()}
          className="w-full p-6 rounded-2xl border-2 border-dashed text-center cursor-pointer transition-colors hover:bg-gray-50"
          style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
          </svg>
          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Add images to this idea</p>
          <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Click to upload or drag files here</p>
        </button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
      </div>
    ) : null
  }

  const current = gallery[selectedIdx]

  return (
    <div className="mb-6">
      {/* Main gallery view */}
      <div className="relative bg-black rounded-2xl overflow-hidden mb-3 group">
        <img
          src={current.image_url}
          alt={`Image ${selectedIdx + 1}`}
          className="w-full h-80 object-cover cursor-zoom-in"
          onClick={() => {
            // Could open fullscreen lightbox here
          }}
        />
        
        {/* Gallery controls */}
        {gallery.length > 1 && (
          <>
            {selectedIdx > 0 && (
              <button
                onClick={() => setSelectedIdx(selectedIdx - 1)}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            )}
            {selectedIdx < gallery.length - 1 && (
              <button
                onClick={() => setSelectedIdx(selectedIdx + 1)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white cursor-pointer transition-all"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            )}
          </>
        )}

        {/* Delete button (admin only) */}
        {isAdmin && (
          <button
            onClick={() => handleDelete(current.id)}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-600 flex items-center justify-center text-white cursor-pointer transition-all"
            title="Delete"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

        {/* Gallery counter */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm font-medium text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>
          {selectedIdx + 1} / {gallery.length}
        </div>
      </div>

      {/* Thumbnails */}
      {gallery.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {gallery.map((img, idx) => (
            <button
              key={img.id}
              onClick={() => setSelectedIdx(idx)}
              className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 cursor-pointer transition-all"
              style={{
                borderColor: selectedIdx === idx ? 'var(--coral)' : 'var(--border)',
                opacity: selectedIdx === idx ? 1 : 0.6,
              }}
            >
              <img src={img.image_url} alt={`Thumb ${idx}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Upload button (admin only) */}
      {isAdmin && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full mt-3 px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-smooth hover:bg-gray-50"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
        >
          {uploading ? '📤 Uploading...' : '+ Add more images'}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" multiple />
    </div>
  )
}
