'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import ConfirmModal from '@/components/ConfirmModal'
import { SkeletonList } from '@/components/Skeleton'
import PageHeader from '@/components/PageHeader'
import { PERMISSION_SUITES, ALL_FEATURE_KEYS, restrictedDefault } from '@/lib/permissions'
import { loadTeamList, loadMoreViewers, mergeTeam, isViewerRow, VIEWER_PAGE } from '@/lib/team-list'


// Create User's throwaway password. Math.random isn't a secure source; the
// browser's crypto is. The suffix keeps any "needs a symbol and a digit" rule happy.
function makeTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('') + 'A!1'
}

// Fill in real profile names for members who've signed in (their name lives in
// auth metadata, which the client can't read for other users — so resolve it
// server-side, up to 1,000 ids a request). Only `rows` are updated.
async function fillNames(rows: any[], setMembers: (update: (cur: any[]) => any[]) => void) {
  const ids = Array.from(new Set(rows.map((m: any) => m.user_id).filter(Boolean)))
  if (!ids.length) return
  const these = new Set(rows.map((m: any) => m.id))
  try {
    const batches: any[][] = []
    for (let i = 0; i < ids.length; i += 1000) batches.push(ids.slice(i, i + 1000))
    const found = await Promise.all(batches.map(async userIds => {
      const res = await authFetch('/api/team/names', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      })
      return (await res.json())?.names || {}
    }))
    const names = Object.assign({}, ...found)
    setMembers(cur => cur.map((m: any) => !these.has(m.id) ? m : ({
      ...m,
      display_name: m.name || names?.[m.user_id]?.name || null,
      avatar_url: m.avatar_url || names?.[m.user_id]?.avatar_url || null,
    })))
  } catch { /* fall back to email */ }
}

export default function TeamPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [outlets, setOutlets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  // A busy board's team doesn't fit one read (lib/team-list.ts): then staff are
  // listed first and viewers (board visitors) a page at a time. How many
  // viewers there are, and how many to read when the list reloads.
  const [split, setSplit] = useState(false)
  const [viewerTotal, setViewerTotal] = useState(0)
  const viewerLimit = useRef(VIEWER_PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  // `?invite=1` (the setup checklist's "Invite a teammate") opens the invite
  // form straight away. The admin shell only renders pages in the browser.
  const [showInvite, setShowInvite] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('invite') === '1')
  const [showCreate, setShowCreate] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createRole, setCreateRole] = useState('editor')
  const [working, setWorking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  // The last invite link we generated, shown so it can be shared directly when
  // email delivery is unavailable (or as a reliable backup either way).
  const [lastInvite, setLastInvite] = useState<{ email: string; link: string } | null>(null)
  // The viewer's own role here, from the server. Only owners and admins can
  // change the team; everyone else sees it read-only. Null until known (the
  // controls stay as they were — the server has the final say either way).
  const [myRole, setMyRole] = useState<string | null>(null)
  const [canManage, setCanManage] = useState<boolean | null>(null)
  const viewOnly = canManage === false
  const MY_ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', editor: 'Agent', viewer: 'Viewer' }
  const myRoleLabel = MY_ROLE_LABEL[myRole || 'owner'] || 'Owner'
  // Owner edit of a member's profile (display name + photo).
  const [editMember, setEditMember] = useState<any>(null)
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState<string>('')
  const [editDept, setEditDept] = useState<string>('')
  const [editSaving, setEditSaving] = useState(false)
  const [editUploading, setEditUploading] = useState(false)
  // Department is organisational only (grouping/reporting/routing), separate from
  // role + permissions which control access.
  const DEPARTMENTS = ['Sales', 'Support', 'Fulfillment', 'Front Desk', 'Marketing', 'Management']

  const openEdit = (m: any) => {
    setEditName(m.display_name || m.name || '')
    setEditAvatar(m.avatar_url || '')
    setEditDept(m.department || '')
    setEditMember(m)
  }
  const uploadMemberPhoto = async (file: File) => {
    setEditUploading(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const fileName = `team-avatars/${Date.now()}.${ext}`
      let bucket = 'settings'
      let { data, error } = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true })
      if (error) {
        bucket = 'idea-images'
        const r = await supabase.storage.from(bucket).upload(fileName, file, { upsert: true })
        data = r.data; error = r.error
      }
      if (error) throw error
      const { data: pub } = supabase.storage.from(bucket).getPublicUrl(data!.path)
      setEditAvatar(pub.publicUrl)
    } catch (e: any) {
      showMsg('Photo upload failed: ' + (e?.message || 'error') + ' — a public "settings" or "idea-images" storage bucket is required.', true)
    } finally {
      setEditUploading(false)
    }
  }
  // Every change to the team goes through /api/team/members, which checks the
  // caller is an owner or admin, applies the rules (no raising your own role,
  // owners protected) and writes the audit log. The database no longer accepts
  // team_members writes from the browser (COLVY_V364).
  const teamApi = async (method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, any>) => {
    const res = await authFetch('/api/team/members', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data?.error || 'Something went wrong')
    return data
  }

  const saveMemberProfile = async () => {
    if (!editMember) return
    setEditSaving(true)
    try {
      const patch = { name: editName.trim() || null, avatar_url: editAvatar || null, department: editDept || null }
      await teamApi('PATCH', { memberId: editMember.id, ...patch })
      setMembers(ms => ms.map(m => m.id === editMember.id
        ? { ...m, name: patch.name, avatar_url: patch.avatar_url, department: patch.department, display_name: patch.name || m.display_name }
        : m))
      showMsg('Member profile updated.')
      setEditMember(null)
    } catch (e: any) {
      showMsg('Could not save: ' + String(e?.message || 'error'), true)
    } finally {
      setEditSaving(false)
    }
  }

  // Per-member feature permissions editor.
  const [permMember, setPermMember] = useState<any>(null)
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({})
  const [permSaving, setPermSaving] = useState(false)

  const openPermissions = (m: any) => {
    const existing = m.permissions && typeof m.permissions === 'object' ? m.permissions : null
    const draft: Record<string, boolean> = {}
    // Show what actually applies: everything ON when the member has no map yet
    // (full access); otherwise their saved choices, with features the map doesn't
    // mention yet at their restricted default (new pages start hidden).
    for (const key of ALL_FEATURE_KEYS) draft[key] = existing ? (key in existing ? existing[key] !== false : restrictedDefault(key)) : true
    setPermDraft(draft)
    setPermMember(m)
  }
  const toggleFeature = (key: string) => setPermDraft(d => ({ ...d, [key]: !d[key] }))
  const setSuite = (suiteKey: string, on: boolean) => {
    const suite = PERMISSION_SUITES.find(s => s.key === suiteKey)
    if (!suite) return
    setPermDraft(d => { const n = { ...d }; for (const f of suite.features) n[f.key] = on; return n })
  }
  const savePermissions = async () => {
    if (!permMember) return
    setPermSaving(true)
    try {
      await teamApi('PATCH', { memberId: permMember.id, permissions: permDraft })
      setMembers(ms => ms.map(m => m.id === permMember.id ? { ...m, permissions: permDraft } : m))
      showMsg(`Permissions updated for ${permMember.display_name || permMember.email}.`)
      setPermMember(null)
    } catch (e: any) {
      showMsg('Could not save permissions: ' + String(e?.message || 'error'), true)
    } finally {
      setPermSaving(false)
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    fetchMembers()
  }, [router])

  const fetchMembers = async () => {
    try {
      // Resolve THIS admin's company first, then only ever load that company's
      // members. The query used to be unscoped (no company_id filter), so it
      // returned every company's team members — a cross-tenant leak. On a board
      // subdomain we use the subdomain's company (only if the viewer owns it or
      // is a member); otherwise the company they own.
      const { data: sess } = await supabase.auth.getSession()
      const u = sess?.session?.user
      if (!u) { setMembers([]); setLoading(false); return }

      // The admin shell has already checked which company this person may use.
      let cid: string | null = peekCompanyUser()?.companyId || null
      const host = typeof window !== 'undefined' ? window.location.hostname : ''
      if (!cid && host.endsWith('.colvy.com') && host !== 'colvy.com' && host !== 'www.colvy.com') {
        const slug = host.split('.')[0]
        const { data: coBySlug } = await (supabase as any).from('companies').select('id, owner_id').eq('slug', slug).maybeSingle()
        if (coBySlug) {
          if (coBySlug.owner_id === u.id) cid = coBySlug.id
          else {
            const { data: mem } = await (supabase as any).from('team_members').select('role').eq('company_id', coBySlug.id).eq('user_id', u.id).limit(1)
            if (mem && mem.length) cid = coBySlug.id
          }
        }
      }
      if (!cid) {
        const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', u.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
        cid = owned?.id || null
      }
      setCompanyId(cid)
      if (!cid) { setMembers([]); setLoading(false); return }

      // Whether this person may change the team (owner/admin), alongside.
      authFetch(`/api/team/members?companyId=${encodeURIComponent(cid)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) { setMyRole(d.role || null); setCanManage(!!d.canManage) } })
        .catch(() => {})

      // Members and outlets side by side; the list shows as soon as members
      // arrive, and profile names fill in after. On a busy board staff come in
      // full and viewers a page at a time, so visitors can't crowd staff out.
      const want = viewerLimit.current
      const [team, locsRes] = await Promise.all([
        loadTeamList(supabase, cid, want),
        // Outlets for the "default outlet" picker (scoped to this company).
        Promise.resolve((supabase as any).from('company_locations')
          .select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })).catch(() => ({ data: [] })),
      ])
      // "Show more" pressed while this was loading: keep what it added.
      if (team.split && viewerLimit.current > want) {
        team.viewers = mergeTeam(team.viewers, await loadMoreViewers(supabase, cid, want, viewerLimit.current - want))
      }
      setMembers(mergeTeam([], [...team.staff, ...team.viewers]))
      setSplit(team.split)
      setViewerTotal(team.viewerTotal)
      setOutlets(locsRes?.data || [])
      setLoading(false)
      // Staff first, so they're never the ones past the names lookup's limit.
      await fillNames([...team.staff, ...team.viewers], setMembers)
    } catch {}
    setLoading(false)
  }

  const showMoreViewers = async () => {
    if (!companyId || loadingMore) return
    setLoadingMore(true)
    // Raised first, so a reload that finishes meanwhile reads these too.
    const from = viewerLimit.current
    viewerLimit.current = from + VIEWER_PAGE
    try {
      const more = await loadMoreViewers(supabase, companyId, from)
      setMembers(cur => mergeTeam(cur, more))
      await fillNames(more, setMembers)
    } catch (e: any) {
      if (viewerLimit.current === from + VIEWER_PAGE) viewerLimit.current = from
      showMsg('Could not load more viewers: ' + String(e?.message || 'error'), true)
    }
    setLoadingMore(false)
  }

  const updateDefaultOutlet = async (id: string, locId: string) => {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, default_location_id: locId || null } : m))
    try { await teamApi('PATCH', { memberId: id, default_location_id: locId || null }) }
    catch (e: any) { showMsg('Could not change the outlet: ' + e.message, true); fetchMembers() }
  }

  const showMsg = (text: string, isError = false) => {
    setMsg(text)
    setMsgErr(isError)
    // Errors stay up longer than the quick success confirmation.
    setTimeout(() => setMsg(''), isError ? 8000 : 4000)
  }

  // The workspace this page manages: the one fetchMembers resolved (which
  // handles a board subdomain and membership), else the oldest one this person
  // owns, looked up with a fresh session id (the `user` state can lag).
  const resolveCompanyId = async (): Promise<string | null> => {
    if (companyId) return companyId
    const uid = user?.id || (await supabase.auth.getSession()).data.session?.user?.id || null
    if (!uid) return null
    const { data: owned } = await (supabase as any).from('companies').select('id').eq('owner_id', uid).order('created_at', { ascending: true }).limit(1)
    return owned?.[0]?.id || null
  }

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return
    setWorking(true)
    try {
      const cid = await resolveCompanyId()
      if (!cid) {
        showMsg('Could not determine your company — reload the page and try again.', true)
        setWorking(false)
        return
      }
      // The server checks the inviter, writes the invite row and hands back the
      // link's one-time code (only its hash is stored), plus the workspace's
      // slug and name for the link and the email.
      const created = await teamApi('POST', { companyId: cid, email: inviteEmail.trim().toLowerCase(), role: inviteRole })
      const company = created.company || {}
      const invite = { token: created.token as string }

      // Send a stable invite link (NOT a magic link — those expire fast and get
      // consumed by email prefetch bots, causing "otp_expired"). This link points
      // to /team/join, which handles sign-up/sign-in and membership acceptance.
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://colvy.com'
      const inviteLink = `${origin}/team/join?company=${encodeURIComponent(company?.slug || '')}&email=${encodeURIComponent(inviteEmail.trim().toLowerCase())}&role=${inviteRole}&token=${invite.token}`
      const invitedEmail = inviteEmail.trim().toLowerCase()
      let emailed = false
      try {
        const res = await authFetch('/api/send-team-invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: company.id,
            email: invitedEmail,
            companyName: company?.name || 'the team',
            role: inviteRole,
            inviteLink,
            inviterName: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'A teammate',
          }),
        })
        const data = await res.json().catch(() => ({}))
        emailed = res.ok && data?.emailed === true
      } catch { emailed = false }
      // Always keep the link on screen — it's the reliable way to bring someone in
      // regardless of whether the email went out.
      setLastInvite({ email: invitedEmail, link: inviteLink })
      if (emailed) {
        showMsg(`Invitation emailed to ${invitedEmail}. You can also copy the link below to send it directly.`)
      } else {
        showMsg(`Invite created for ${invitedEmail}, but the email couldn’t be sent. Copy the link below and send it to them directly.`, true)
      }
      setInviteEmail('')
      setShowInvite(false)
      fetchMembers()
    } catch (err: any) {
      showMsg('Could not invite: ' + err.message, true)
    }
    setWorking(false)
  }

  const createUser = async () => {
    if (!createEmail.trim()) return
    // A random temporary password nobody knows — the user sets their own via forgot-password
    const tempPassword = makeTempPassword()
    setWorking(true)
    try {
      // Scope the new user to this workspace.
      const cid = await resolveCompanyId()
      if (!cid) {
        showMsg('Could not determine your company — reload the page and try again.', true)
        setWorking(false)
        return
      }
      const { data: sess } = await supabase.auth.getSession()
      const token = sess?.session?.access_token
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          email: createEmail.trim(),
          password: tempPassword,
          name: createName.trim(),
          role: createRole,
          companyId: cid,
        }),
      })
      const result = await res.json()
      if (result.error) throw new Error(result.error)

      showMsg(`User ${result.email} created and added to your team.`)
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setShowCreate(false)
      fetchMembers()
    } catch (err: any) {
      alert('Failed to create user: ' + err.message)
    }
    setWorking(false)
  }

  const updateRole = async (id: string, role: string) => {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, role } : m))
    try { await teamApi('PATCH', { memberId: id, role }) }
    catch (e: any) { showMsg('Could not change the role: ' + e.message, true) }
    fetchMembers()
  }

  // Mobile number used for SMS reminders on assigned calendar events. The
  // server tidies it into +61 form ("0405 636 304" and "405636304" both become
  // "+61405636304") so Telnyx accepts it.
  const updatePhone = async (id: string, raw: string) => {
    const before = members.find(m => m.id === id)?.phone || null
    if ((raw.trim() || null) === before) return
    try {
      const { member } = await teamApi('PATCH', { memberId: id, phone: raw.trim() || null })
      setMembers(ms => ms.map(m => m.id === id ? { ...m, phone: member?.phone ?? null } : m))
    } catch (e: any) { showMsg('Could not save the number: ' + e.message, true) }
  }

  const removeMember = async (id: string) => {
    try { await teamApi('DELETE', { memberId: id }) }
    catch (e: any) { showMsg('Could not remove them: ' + e.message, true) }
    setConfirmDelete(null)
    fetchMembers()
  }

  const [resendingId, setResendingId] = useState<string | null>(null)
  const resendInvite = async (m: any) => {
    setResendingId(m.id)
    try {
      // A fresh code each resend, so the old link stops working. The server
      // checks this person may manage the team and returns the workspace's slug
      // and name for the link.
      const { token, company } = await teamApi('POST', { action: 'resend', memberId: m.id })
      if (!company?.slug) {
        showMsg('Could not resolve your company — reload the page and try again.', true)
        setResendingId(null)
        return
      }
      const invite = { token: token as string }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://colvy.com'
      const inviteLink = `${origin}/team/join?company=${encodeURIComponent(company.slug)}&email=${encodeURIComponent(m.email)}&role=${m.role}&token=${invite.token}`
      const res = await authFetch('/api/send-team-invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId: company.id, email: m.email, companyName: company?.name || 'the team', role: m.role, inviteLink,
          inviterName: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'A teammate',
        }),
      })
      const o = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(o.error || 'Failed to resend')
      setLastInvite({ email: m.email, link: inviteLink })
      if (o?.emailed === true) showMsg(`Invitation resent to ${m.email}. You can also copy the link below to send it directly.`)
      else showMsg(`Couldn’t email ${m.email}. Copy the link below and send it to them directly.`, true)
    } catch (e: any) {
      showMsg(`Could not resend: ${e.message}`, true)
    } finally {
      setResendingId(null)
    }
  }

  if (!user) return <SkeletonList rows={6} />

  // The current viewer is already shown as the "You (Owner)" row at the top, so
  // don't list them AGAIN from team_members below — that duplicate is why the
  // owner appeared a second time with a different role (e.g. Editor). Match on
  // user_id first, then fall back to email for rows that were invited before the
  // person signed in (no user_id yet).
  const meEmail = (user.email || '').toLowerCase()
  const visibleMembers = members.filter(
    (m: any) => m.user_id !== user.id && (m.email || '').toLowerCase() !== meEmail
  )
  // A busy board: staff first, so the board's visitors can't push them down
  // the list, then the viewers a page at a time. Otherwise everyone is listed
  // together, newest first, as before.
  const listed = split ? visibleMembers.filter(m => !isViewerRow(m)) : visibleMembers
  const listedViewers = split ? visibleMembers.filter(isViewerRow) : []
  const viewersLoaded = members.filter(isViewerRow).length

  const memberRow = (m: any) => (
    <div key={m.id} className="tm-row tm-grid px-5 py-4 border-b last:border-b-0 items-center" style={{ borderColor: 'var(--border)' }}>
      <div className="tm-user">
        <div className="tm-avatar w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden shrink-0" style={{ background: '#6b7280' }}>
          {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.display_name || m.email || '?')[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-sm truncate flex items-center gap-1.5" style={{ color: 'var(--ink)', fontWeight: 600 }}>
            <span className="truncate">{m.display_name || m.email}</span>
            {m.department && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#eef2ff', color: '#4338ca' }}>{m.department}</span>}
          </p>
          {m.display_name && <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{m.email}</p>}
        </div>
        {outlets.length > 0 && (
          <label className="tm-outlet">
            <span className="tm-mlabel">Default outlet</span>
            <select value={m.default_location_id || ''} onChange={e => updateDefaultOutlet(m.id, e.target.value)} disabled={viewOnly}
              title="Default outlet — used to pre-filter their Tasks page"
              className="tm-field tm-select text-xs rounded border focus:outline-none cursor-pointer bg-white max-w-full"
              style={{ borderColor: 'var(--border)', color: m.default_location_id ? 'var(--coral)' : 'var(--slate)' }}>
              <option value="">No default outlet</option>
              {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
            </select>
          </label>
        )}
      </div>
      {/* Mobile — SMS reminders for assigned events go to this number.
          Saved on blur so it doesn't write on every keystroke. */}
      <label className="tm-phone">
        <span className="tm-mlabel">Mobile for SMS</span>
        <input
          type="tel"
          defaultValue={m.phone || ''}
          placeholder="+61…"
          aria-label="Mobile for SMS"
          onBlur={e => updatePhone(m.id, e.target.value)}
          disabled={viewOnly}
          className="tm-field text-xs px-2 py-1 rounded border focus:outline-none w-full bg-white"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
      </label>
      <div className="tm-role">
        <select value={m.role} aria-label="Role" onChange={e => updateRole(m.id, e.target.value)} disabled={viewOnly}
          className="tm-field tm-select text-xs rounded border focus:outline-none cursor-pointer bg-white"
          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
          {/* A co-owner shows as Owner; ownership isn't handed out from here. */}
          {(m.role || '').toLowerCase() === 'owner' && <option value={m.role} disabled>Owner</option>}
          <option value="admin">Admin</option>
          <option value="editor">Agent</option>
          <option value="viewer">Viewer</option>
        </select>
      </div>
      <div className="tm-status">
        <span className="tm-pill text-xs px-2 py-1 rounded-full whitespace-nowrap"
          style={{ background: m.status === 'active' ? '#d1fae5' : '#fef3c7', color: m.status === 'active' ? '#059669' : '#ca8a04' }}>
          {m.status === 'active' ? 'Active' : 'Invited'}
        </span>
      </div>
      <div className={`tm-actions${viewOnly ? ' tm-actions-none' : ''}`}>
        {viewOnly ? <span className="text-xs" style={{ color: 'var(--slate)' }}>—</span> : <>
        <button onClick={() => openEdit(m)} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: 'var(--slate)' }}>
          Edit
        </button>
        {['editor', 'viewer'].includes((m.role || '').toLowerCase()) && (
          <button onClick={() => openPermissions(m)} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: 'var(--slate)' }}>
            Permissions
          </button>
        )}
        {m.status !== 'active' && (
          <button onClick={() => resendInvite(m)} disabled={resendingId === m.id} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>
            {resendingId === m.id ? 'Sending…' : 'Resend'}
          </button>
        )}
        <button onClick={() => setConfirmDelete(m)} className="tm-remove text-xs font-medium cursor-pointer hover:underline" style={{ color: '#dc2626' }}>
          Remove
        </button>
        </>}
      </div>
    </div>
  )

  return (
    <div className="team-page px-6 py-8">
      <style>{`
        /* Table (768px and up): the header and every row share one column
           template, so the columns always line up. Status and Actions have a
           floor (an "Invited" pill, four action links that may wrap), so on a
           narrow screen the User column gives way instead of the actions
           spilling over the status pill or the table scrolling sideways.
           Role and Status floors fit their widest content (a 'Viewer' select,
           an 'Invited' pill), so the User column gets the slack. */
        .tm-grid { display: grid; grid-template-columns: minmax(0, 4fr) minmax(120px, 2fr) minmax(84px, 2fr) minmax(70px, 1fr) minmax(160px, 3fr); }
        /* padding-right: a gutter so the outlet select and a cut-off email
           never touch the Mobile field next to them. */
        .tm-user { display: grid; grid-template-columns: 36px minmax(0, 1fr); column-gap: 12px; align-items: center; min-width: 0; padding-right: 12px; }
        .tm-avatar { grid-row: 1 / span 2; }
        .tm-outlet { grid-column: 2; justify-self: start; min-width: 0; max-width: 100%; margin-top: 4px; }
        /* Narrow tables: the outlet select takes the whole User cell under the
           name (not just the part right of the avatar), so outlet names fit. */
        @media (min-width: 768px) and (max-width: 1099px) {
          .tm-avatar { grid-row: auto; }
          .tm-outlet { grid-column: 1 / -1; margin-top: 8px; }
        }
        .tm-phone { display: block; min-width: 0; padding-right: 12px; }
        .tm-mlabel { display: none; }
        /* Selects keep the global arrow (globals.css) with room for it. */
        .tm-select { padding: 4px 26px 4px 8px; background-position: right 7px center; text-overflow: ellipsis; }
        .tm-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 2px 10px; min-width: 0; }
        .tm-actions button { white-space: nowrap; padding: 4px 0; }
        @media (max-width: 767px) {
          .team-page { padding: 24px 16px !important; }
          .team-page > .ph-root { margin: -24px -16px 16px !important; }
          /* Phones: each member is a small card instead of a table row:
             name, then outlet and mobile full width, then role and status on
             one row, then the actions. */
          .tm-head { display: none !important; }
          .tm-row { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 16px !important; }
          .tm-user, .tm-phone, .tm-actions { grid-column: 1 / -1; }
          .tm-role { grid-column: 1; min-width: 0; }
          .tm-status { grid-column: 2; justify-self: end; }
          .tm-avatar { grid-row: auto; }
          .tm-outlet { grid-column: 1 / -1; justify-self: stretch; margin-top: 12px; }
          .tm-user, .tm-phone { padding-right: 0; }
          .tm-phone:empty { display: none; }
          .tm-mlabel { display: block; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--slate); margin-bottom: 4px; }
          /* 16px so iOS doesn't zoom the page when a field is tapped. */
          .tm-field { display: block; width: 100%; max-width: none; min-height: 44px; font-size: 16px; line-height: 22px; padding: 10px 12px; border-radius: 10px; }
          .tm-select { padding-right: 36px; background-position: right 13px center; }
          .tm-role .tm-select { width: auto; min-width: 140px; max-width: 100%; }
          .tm-pill { display: inline-block; font-size: 12.5px; padding: 5px 11px; }
          .tm-actions { justify-content: flex-start; gap: 6px; }
          .tm-actions button { flex: 1 1 auto; min-height: 40px; padding: 0 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--card); font-size: 13px; font-weight: 600; text-decoration: none; }
          .tm-actions button:active { border-color: currentColor; }
          .tm-actions-none { display: none !important; }
          .tm-viewers-note { display: block; margin: 2px 0 0 !important; }
          .tm-modal > div { padding: 20px; }
          .team-page > .ph-root .ph-actions > button { min-height: 42px; }
          .tm-invite-link { font-size: 16px; }
        }
        /* Touch screens at table widths (an iPad, a touch laptop): the table
           keeps its layout, but every control is a 40px+ tap target. A mouse
           keeps the compact table. */
        @media (min-width: 768px) and (pointer: coarse) {
          /* A wider Actions floor keeps Edit / Permissions / Remove on one
             line at 768 now that each is a 40px target. */
          .tm-grid { grid-template-columns: minmax(0, 4fr) minmax(120px, 2fr) minmax(84px, 2fr) minmax(70px, 1fr) minmax(190px, 3fr); }
          .tm-field { min-height: 40px; }
          .tm-actions { gap: 0 2px; }
          .tm-actions button { min-height: 40px; min-width: 40px; padding: 0 6px; }
          .team-page > .ph-root .ph-actions > button { min-height: 42px; }
        }
        /* #dc2626 is too dark to read on the dark theme's card (Remove,
           Remove photo). */
        [data-theme="dark"] .tm-remove { color: #f87171 !important; }
        /* Invite link panel: Copy link and the dismiss button on touch. */
        @media (max-width: 767px), (pointer: coarse) {
          .tm-tap { min-height: 40px; min-width: 40px; display: inline-flex; align-items: center; justify-content: center; }
          .tm-invite-link { min-height: 40px; }
        }
      `}</style>
      <PageHeader
        title="Team Members"
        subtitle="Manage who can access your workspace"
        bleed={24}
        bleedTop={32}
        action={viewOnly ? undefined :
          <>
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            + Create User
          </button>
          <button onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-smooth cursor-pointer"
            style={{ background: 'var(--coral)' }}>
            + Invite Member
          </button>
          </>
        }
      />

      {viewOnly && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#f8fafc', border: '1px solid var(--border)', color: 'var(--slate)' }}>
          Only the owner or an admin can invite people or change roles and access. Ask one of them if something here needs updating.
        </div>
      )}

      {msg && (
        <div className="mb-4 p-3 rounded-lg text-sm font-medium flex items-start gap-2" style={msgErr ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#d1fae5', color: '#059669' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0" style={{ marginTop: 2 }}>
            {msgErr ? <><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></> : <path d="M20 6 9 17l-5-5" />}
          </svg>
          <span className="min-w-0">{msg}</span>
        </div>
      )}

      {lastInvite && (
        <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: '#f8fafc', border: '1px solid var(--border)' }}>
          <div className="mb-2" style={{ color: 'var(--slate)' }}>
            Invite link for <strong>{lastInvite.email}</strong> — send it to them directly (email, SMS, WhatsApp):
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={lastInvite.link}
              onFocus={(e) => e.currentTarget.select()}
              aria-label="Invite link"
              className="tm-invite-link flex-1 min-w-0 px-3 py-2 rounded-lg border text-xs"
              style={{ borderColor: 'var(--border)', background: 'white' }}
            />
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(lastInvite.link); showMsg('Invite link copied.') }
                catch { showMsg('Could not copy — select the link and copy it manually.', true) }
              }}
              className="tm-tap px-3 py-2 rounded-lg text-white text-xs font-semibold whitespace-nowrap"
              style={{ background: 'var(--coral, #ff7a6b)' }}
            >
              Copy link
            </button>
            <button
              onClick={() => setLastInvite(null)}
              className="tm-tap px-2 py-2 rounded-lg text-xs"
              style={{ color: 'var(--slate)' }}
              aria-label="Dismiss invite link"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* One card: a table from 768px up (columns from .tm-grid, which never
          needs a sideways scroll), a list of member cards on phones. */}
      <div className="tm-card bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="tm-head tm-grid px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
          <div>User</div>
          <div className="pr-3">Mobile (for SMS)</div>
          <div>Role</div>
          <div>Status</div>
          <div className="text-right">Actions</div>
        </div>

        {/* Current admin — same column template as the header, so the Owner
            and Active pills line up under Role and Status. */}
        <div className="tm-row tm-grid px-5 py-4 border-b items-center" style={{ borderColor: 'var(--border)' }}>
          <div className="tm-user">
            <div className="tm-avatar w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'var(--coral)' }}>
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{user.email}</p>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>You ({myRoleLabel})</p>
            </div>
          </div>
          <div className="tm-phone" />
          <div className="tm-role">
            <span className="tm-pill text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{myRoleLabel}</span>
          </div>
          <div className="tm-status">
            <span className="tm-pill text-xs px-2 py-1 rounded-full whitespace-nowrap" style={{ background: '#d1fae5', color: '#059669' }}>Active</span>
          </div>
          <div className="tm-actions tm-actions-none text-xs" style={{ color: 'var(--slate)' }}>—</div>
        </div>

        {loading ? (
          <SkeletonList rows={5} />
        ) : visibleMembers.length === 0 ? (
          <div className="px-6 py-10 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <p className="text-sm mb-1 font-semibold" style={{ color: 'var(--ink)' }}>No team members yet</p>
            <p className="text-xs mb-4 max-w-xs" style={{ color: 'var(--slate)' }}>Invite colleagues by email, or create a login for them yourself.</p>
            {!viewOnly && <div className="flex flex-wrap gap-2 justify-center">
              <button onClick={() => setShowInvite(true)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>Invite member</button>
              <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Create user</button>
            </div>}
          </div>
        ) : (
          <>
            {listed.map(memberRow)}
            {split && (
              <>
                <div className="px-5 py-2.5 border-b text-xs" style={{ borderColor: 'var(--border)', background: '#f8fafc', color: 'var(--slate)' }}>
                  <span className="font-semibold uppercase tracking-wider">Viewers · {viewerTotal.toLocaleString()}</span>
                  <span className="tm-viewers-note ml-2">Board visitors and anyone given the Viewer role, newest first</span>
                </div>
                {listedViewers.map(memberRow)}
                {viewersLoaded < viewerTotal && (
                  <div className="px-5 py-3 text-center text-xs" style={{ color: 'var(--slate)' }}>
                    Showing {viewersLoaded.toLocaleString()} of {viewerTotal.toLocaleString()} ·{' '}
                    <button onClick={showMoreViewers} disabled={loadingMore} className="font-medium cursor-pointer hover:underline disabled:opacity-50" style={{ color: 'var(--coral)' }}>
                      {loadingMore ? 'Loading…' : 'Show more'}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Role legend */}
      <div className="mt-6 p-4 rounded-xl border" style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
        <p className="text-sm font-bold mb-2 text-blue-900">Role permissions</p>
        <div className="grid sm:grid-cols-3 gap-2 text-xs text-blue-800">
          <div><strong>Admin</strong> — Full access, settings, team</div>
          <div><strong>Agent</strong> — Day-to-day work; exact access set per member in Permissions</div>
          <div><strong>Viewer</strong> — Read-only dashboard access</div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowInvite(false)} />
          <div className="tm-modal fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl animate-modal flex flex-col" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
            <div className="p-6 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Invite team member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>They'll receive a magic link to sign in</p>
            </div>
            <div className="p-6 space-y-4 flex-auto min-h-0 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="colleague@company.com" autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowInvite(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={inviteMember} disabled={!inviteEmail.trim() || working}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {working ? 'Sending...' : 'Send Invite'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edit Member Profile Modal */}
      {editMember && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setEditMember(null)} />
          <div className="tm-modal fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl animate-modal flex flex-col" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
            <div className="p-6 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Edit member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{editMember.email}</p>
            </div>
            <div className="p-6 space-y-5 flex-auto min-h-0 overflow-y-auto">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ background: '#6b7280' }}>
                  {editAvatar ? <img src={editAvatar} alt="" className="w-full h-full object-cover" /> : (editName || editMember.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-medium text-center cursor-pointer px-3 py-2.5 rounded-lg border inline-block" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {editUploading ? 'Uploading…' : 'Upload photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadMemberPhoto(f) }} disabled={editUploading} />
                  </label>
                  {editAvatar && (
                    <button onClick={() => setEditAvatar('')} className="tm-remove text-sm font-medium cursor-pointer px-3 py-2.5 rounded-lg border" style={{ borderColor: 'var(--border)', color: '#dc2626' }}>Remove photo</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Display name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <p className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>Shows across the inbox, read receipts and everywhere this member appears.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Department</label>
                <select value={DEPARTMENTS.includes(editDept) || !editDept ? editDept : '__custom'} onChange={e => { if (e.target.value !== '__custom') setEditDept(e.target.value) }}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="">No department</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  {editDept && !DEPARTMENTS.includes(editDept) && <option value="__custom">{editDept}</option>}
                </select>
                <p className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>Organisational only — for grouping and routing. Doesn’t change what they can access.</p>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setEditMember(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={saveMemberProfile} disabled={editSaving || editUploading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Permissions Modal */}
      {permMember && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setPermMember(null)} />
          <div className="tm-modal fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl animate-modal flex flex-col" style={{ maxHeight: 'min(85vh, calc(100dvh - 2rem))' }}>
            <div className="p-6 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Permissions</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                Choose what <strong>{permMember.display_name || permMember.email}</strong> can see and open. Off = hidden from their sidebar and blocked if they open the link directly.
              </p>
            </div>
            <div className="p-6 space-y-5 flex-auto min-h-0 overflow-y-auto">
              {PERMISSION_SUITES.map(suite => {
                const allOn = suite.features.every(f => permDraft[f.key])
                return (
                  <div key={suite.key}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>{suite.label}</span>
                      <button onClick={() => setSuite(suite.key, !allOn)} className="text-xs font-medium cursor-pointer hover:underline min-h-[40px] px-2 -mr-2 -my-3" style={{ color: 'var(--coral)' }}>
                        {allOn ? 'Turn all off' : 'Turn all on'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {suite.features.map(f => (
                        <label key={f.key} className="flex items-center gap-2 px-3 py-2 min-h-[44px] min-w-0 rounded-lg border cursor-pointer text-sm"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: permDraft[f.key] ? 'var(--peach)' : 'white' }}>
                          <input type="checkbox" checked={!!permDraft[f.key]} onChange={() => toggleFeature(f.key)} className="shrink-0" />
                          <span className="min-w-0 leading-snug break-words">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3 p-6 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setPermMember(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={savePermissions} disabled={permSaving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {permSaving ? 'Saving…' : 'Save permissions'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <>
          <div className="fixed inset-0 z-40 backdrop-blur-sm animate-backdrop" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCreate(false)} />
          <div className="tm-modal fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-white rounded-2xl shadow-2xl animate-modal flex flex-col" style={{ maxHeight: 'calc(100dvh - 2rem)' }}>
            <div className="p-6 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create new user</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Add a user to your team on-the-fly</p>
            </div>
            <div className="p-6 space-y-4 flex-auto min-h-0 overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)}
                  placeholder="user@company.com" autoFocus
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Display name (optional)</label>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)}
                  placeholder="Jane Smith"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Role</label>
                <select value={createRole} onChange={e => setCreateRole(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}>
                  <option value="admin">Admin</option>
                  <option value="editor">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="p-3 rounded-lg text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
                <strong>Note:</strong> This adds the user to your team roster. They can sign in at any time using their email. To set their password, they use the "Forgot password" flow or you can share their email with them.
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t shrink-0" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium border cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>Cancel</button>
              <button onClick={createUser} disabled={!createEmail.trim() || working}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                {working ? 'Creating...' : 'Add to Team'}
              </button>
            </div>
          </div>
        </>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Remove member"
          message={`Remove ${confirmDelete.email} from the team?`}
          confirmLabel="Remove"
          variant="danger"
          onConfirm={() => removeMember(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
