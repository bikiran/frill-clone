'use client'

// Browser side of the admin's announcement calls. Every read and write goes
// through /api/announcements* (service role, staff-checked), never straight
// to the table.

import { authFetch } from '@/lib/auth-fetch'

export type AdminData = {
  announcements: any[]
  company: { id: string; name: string; slug: string; logo_url?: string | null; accent_color?: string | null; industry?: string | null } | null
  outlets: { id: string; label?: string | null; suburb?: string | null; is_primary?: boolean }[]
  ideas: { id: string; title: string; status?: string | null; votes?: number | null }[]
  schemaReady: boolean
}

async function json(res: Response) {
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j?.error || 'Something went wrong. Please try again.')
  return j
}

export async function loadAdmin(companyId: string): Promise<AdminData> {
  return json(await authFetch(`/api/announcements?companyId=${encodeURIComponent(companyId)}`))
}

export async function annAction(companyId: string, action: string, id?: string | null, data?: any): Promise<any> {
  return json(await authFetch('/api/announcements', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, action, id: id || undefined, data }),
  }))
}

export async function notifyCounts(companyId: string, id: string): Promise<{ board: number; email: number; emailSkipped: number; emailReady: boolean; notifiedAt: string | null; done?: { board?: boolean; email?: boolean } }> {
  return json(await authFetch(`/api/announcements/notify?companyId=${encodeURIComponent(companyId)}&announcementId=${encodeURIComponent(id)}`))
}

export async function sendNotify(companyId: string, id: string, opts: { board: boolean; email: boolean }): Promise<{ inAppCount: number; emailCount: number; emailFailed?: number; emailSkipped: number; errors: string[]; done?: { board?: boolean; email?: boolean } }> {
  return json(await authFetch('/api/announcements/notify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, announcementId: id, ...opts }),
  }))
}

export async function askAi(companyId: string, body: { mode: 'write' | 'improve' | 'sms' | 'social'; brief?: string; title?: string; body?: string; category?: string }) {
  return json(await authFetch('/api/announcements/ai', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, ...body }),
  }))
}

/** Upload a picture or video for a post; returns its public URL. */
export async function uploadMedia(companyId: string, file: File): Promise<string> {
  const { compressImage, uploadDirect } = await import('@/lib/upload-attachment')
  const prefix = `media-gallery/${companyId}/announcements`
  if (file.type.startsWith('video/') || file.size > 3.5 * 1024 * 1024) {
    const prepared = file.type.startsWith('image/') ? await compressImage(file) : file
    if (prepared.size <= 3.5 * 1024 * 1024 && !prepared.type.startsWith('video/')) return putSmall(prefix, prepared)
    const url = await uploadDirect(prepared, prefix, (prepared as File).name)
    if (!url) throw new Error('That file couldn’t be uploaded. Try a smaller one, or paste a link instead.')
    return url
  }
  return putSmall(prefix, file.type.startsWith('image/') ? await compressImage(file) : file)
}

async function putSmall(prefix: string, f: File): Promise<string> {
  const fd = new FormData()
  fd.append('file', f)
  fd.append('prefix', prefix)
  const j = await json(await authFetch('/api/storage/put', { method: 'POST', body: fd }))
  if (!j?.url) throw new Error('Upload failed')
  return j.url
}

export function boardBase(company: AdminData['company']): string {
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'www.colvy.com') return window.location.origin
  }
  return company?.slug ? `https://${company.slug}.colvy.com` : ''
}
