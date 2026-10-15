'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import ConfirmModal from '@/components/ConfirmModal'
import { SkeletonList } from '@/components/Skeleton'
import PageHeader from '@/components/PageHeader'
import { PERMISSION_SUITES, ALL_FEATURE_KEYS, restrictedDefault } from '@/lib/permissions'


// Create User's throwaway password. Math.random isn't a secure source; the
// browser's crypto is. The suffix keeps any "needs a symbol and a digit" rule happy.
function makeTempPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('') + 'A!1'
}

export default function TeamPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [outlets, setOutlets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
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
      // arrive, and profile names fill in after.
      const [{ data }, locsRes] = await Promise.all([
        (supabase as any).from('team_members').select('*').eq('company_id', cid).order('created_at', { ascending: false }),
        // Outlets for the "default outlet" picker (scoped to this company).
        Promise.resolve((supabase as any).from('company_locations')
          .select('id, label, suburb, is_primary').eq('company_id', cid).order('is_primary', { ascending: false })).catch(() => ({ data: [] })),
      ])
      const rows: any[] = data || []
      setMembers(rows)
      setOutlets(locsRes?.data || [])
      setLoading(false)
      // Fill in real profile names for members who've signed in (their name
      // lives in auth metadata, which the client can't read for other users —
      // so resolve it server-side).
      const ids = Array.from(new Set(rows.map((m: any) => m.user_id).filter(Boolean)))
      if (ids.length) {
        try {
          const res = await authFetch('/api/team/names', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: ids }),
          })
          const { names } = await res.json()
          setMembers(cur => cur.map((m: any) => ({
            ...m,
            display_name: m.name || names?.[m.user_id]?.name || null,
            avatar_url: m.avatar_url || names?.[m.user_id]?.avatar_url || null,
          })))
        } catch { /* fall back to email */ }
      }
    } catch {}
    setLoading(false)
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
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
        <div className="mb-4 p-3 rounded-lg text-sm font-medium" style={msgErr ? { background: '#fee2e2', color: '#b91c1c' } : { background: '#d1fae5', color: '#059669' }}>
          {msgErr ? '⚠ ' : '✓ '}{msg}
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
              className="flex-1 px-3 py-2 rounded-lg border text-xs"
              style={{ borderColor: 'var(--border)', background: 'white' }}
            />
            <button
              onClick={async () => {
                try { await navigator.clipboard.writeText(lastInvite.link); showMsg('Invite link copied.') }
                catch { showMsg('Could not copy — select the link and copy it manually.', true) }
              }}
              className="px-3 py-2 rounded-lg text-white text-xs font-semibold whitespace-nowrap"
              style={{ background: 'var(--coral, #ff7a6b)' }}
            >
              Copy link
            </button>
            <button
              onClick={() => setLastInvite(null)}
              className="px-2 py-2 rounded-lg text-xs"
              style={{ color: 'var(--slate)' }}
              aria-label="Dismiss invite link"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Horizontal scroll on narrow screens: the 12-column grid needs room, and
          squeezing it into a phone width made the header labels and the
          role/status/actions cells overlap. A min width keeps the columns intact
          and lets the card scroll sideways instead. */}
      <div className="overflow-x-auto">
      <div className="bg-white rounded-2xl border overflow-hidden min-w-[760px]" style={{ borderColor: 'var(--border)' }}>
        {/* Header */}
        <div className="grid grid-cols-12 px-5 py-3 border-b text-xs font-semibold uppercase tracking-wider" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
          <div className="col-span-4">User</div>
          <div className="col-span-2">Mobile (for SMS)</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-3 text-right">Actions</div>
        </div>

        {/* Current admin — column spans mirror the header (4/3/2/1/2) so the
            Owner and Active pills line up under Role and Status. */}
        <div className="grid grid-cols-12 px-5 py-4 border-b items-center" style={{ borderColor: 'var(--border)' }}>
          <div className="col-span-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: 'var(--coral)' }}>
              {user.email?.[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{user.email}</p>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>You ({myRoleLabel})</p>
            </div>
          </div>
          <div className="col-span-2" />
          <div className="col-span-2">
            <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{myRoleLabel}</span>
          </div>
          <div className="col-span-1">
            <span className="text-xs px-2 py-1 rounded-full" style={{ background: '#d1fae5', color: '#059669' }}>Active</span>
          </div>
          <div className="col-span-3 text-right text-xs" style={{ color: 'var(--slate)' }}>—</div>
        </div>

        {loading ? (
          <SkeletonList rows={5} />
        ) : visibleMembers.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-4xl mb-3">👥</div>
            <p className="text-sm mb-2 font-medium" style={{ color: 'var(--ink)' }}>No team members yet</p>
            <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>Invite colleagues or create users on-the-fly</p>
            {!viewOnly && <div className="flex gap-2 justify-center">
              <button onClick={() => setShowCreate(true)} className="text-sm font-medium cursor-pointer hover:opacity-70" style={{ color: 'var(--coral)' }}>+ Create User</button>
              <span style={{ color: 'var(--slate)' }}>·</span>
              <button onClick={() => setShowInvite(true)} className="text-sm font-medium cursor-pointer hover:opacity-70" style={{ color: 'var(--coral)' }}>+ Invite Member</button>
            </div>}
          </div>
        ) : (
          visibleMembers.map(m => (
            <div key={m.id} className="grid grid-cols-12 px-5 py-4 border-b last:border-b-0 items-center" style={{ borderColor: 'var(--border)' }}>
              <div className="col-span-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold overflow-hidden" style={{ background: '#6b7280' }}>
                  {m.avatar_url ? <img src={m.avatar_url} alt="" className="w-full h-full object-cover" /> : (m.display_name || m.email || '?')[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm truncate flex items-center gap-1.5" style={{ color: 'var(--ink)', fontWeight: 600 }}>
                    <span className="truncate">{m.display_name || m.email}</span>
                    {m.department && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0" style={{ background: '#eef2ff', color: '#4338ca' }}>{m.department}</span>}
                  </p>
                  {m.display_name && <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{m.email}</p>}
                  {outlets.length > 0 && (
                    <select value={m.default_location_id || ''} onChange={e => updateDefaultOutlet(m.id, e.target.value)} disabled={viewOnly}
                      title="Default outlet — used to pre-filter their Tasks page"
                      className="text-xs mt-1 px-2 py-1 rounded border focus:outline-none cursor-pointer bg-white max-w-full"
                      style={{ borderColor: 'var(--border)', color: m.default_location_id ? 'var(--coral)' : 'var(--slate)' }}>
                      <option value="">No default outlet</option>
                      {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
                    </select>
                  )}
                </div>
              </div>
              {/* Mobile — SMS reminders for assigned events go to this number.
                  Saved on blur so it doesn't write on every keystroke. */}
              <div className="col-span-2 pr-3">
                <input
                  defaultValue={m.phone || ''}
                  placeholder="+61…"
                  onBlur={e => updatePhone(m.id, e.target.value)}
                  disabled={viewOnly}
                  className="text-xs px-2 py-1 rounded border focus:outline-none w-full bg-white"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
              </div>
              <div className="col-span-2">
                <select value={m.role} onChange={e => updateRole(m.id, e.target.value)} disabled={viewOnly}
                  className="text-xs px-2 py-1 rounded border focus:outline-none cursor-pointer bg-white"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  {/* A co-owner shows as Owner; ownership isn't handed out from here. */}
                  {(m.role || '').toLowerCase() === 'owner' && <option value={m.role} disabled>Owner</option>}
                  <option value="admin">Admin</option>
                  <option value="editor">Agent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="col-span-1">
                <span className="text-xs px-2 py-1 rounded-full"
                  style={{ background: m.status === 'active' ? '#d1fae5' : '#fef3c7', color: m.status === 'active' ? '#059669' : '#ca8a04' }}>
                  {m.status === 'active' ? 'Active' : 'Invited'}
                </span>
              </div>
              <div className="col-span-3 text-right flex items-center justify-end gap-2.5 whitespace-nowrap">
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
                <button onClick={() => setConfirmDelete(m)} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: '#dc2626' }}>
                  Remove
                </button>
                </>}
              </div>
            </div>
          ))
        )}
      </div>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Invite team member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>They'll receive a magic link to sign in</p>
            </div>
            <div className="p-6 space-y-4">
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
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Edit member</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{editMember.email}</p>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-white text-xl font-bold shrink-0" style={{ background: '#6b7280' }}>
                  {editAvatar ? <img src={editAvatar} alt="" className="w-full h-full object-cover" /> : (editName || editMember.email || '?')[0].toUpperCase()}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium cursor-pointer px-3 py-2 rounded-lg border inline-block" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {editUploading ? 'Uploading…' : 'Upload photo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadMemberPhoto(f) }} disabled={editUploading} />
                  </label>
                  {editAvatar && (
                    <button onClick={() => setEditAvatar('')} className="text-xs cursor-pointer hover:underline text-left" style={{ color: '#dc2626' }}>Remove photo</button>
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
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-modal mx-4 flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Permissions</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                Choose what <strong>{permMember.display_name || permMember.email}</strong> can see and open. Off = hidden from their sidebar and blocked if they open the link directly.
              </p>
            </div>
            <div className="p-6 overflow-y-auto space-y-5" style={{ flex: 1 }}>
              {PERMISSION_SUITES.map(suite => {
                const allOn = suite.features.every(f => permDraft[f.key])
                return (
                  <div key={suite.key}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>{suite.label}</span>
                      <button onClick={() => setSuite(suite.key, !allOn)} className="text-xs font-medium cursor-pointer hover:underline" style={{ color: 'var(--coral)' }}>
                        {allOn ? 'Turn all off' : 'Turn all on'}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {suite.features.map(f => (
                        <label key={f.key} className="flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)', background: permDraft[f.key] ? 'var(--peach)' : 'white' }}>
                          <input type="checkbox" checked={!!permDraft[f.key]} onChange={() => toggleFeature(f.key)} />
                          <span className="truncate">{f.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
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
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-white rounded-2xl shadow-2xl animate-modal mx-4">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create new user</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Add a user to your team on-the-fly</p>
            </div>
            <div className="p-6 space-y-4">
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
            <div className="flex gap-3 p-6 border-t" style={{ borderColor: 'var(--border)' }}>
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
