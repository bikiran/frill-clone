'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser } from '@/lib/client-cache'
import ConfirmModal from '@/components/ConfirmModal'
import { SkeletonList } from '@/components/Skeleton'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { PERMISSION_SUITES, ALL_FEATURE_KEYS, restrictedDefault, isExplicitFeature } from '@/lib/permissions'
import { loadTeamList, loadMoreViewers, mergeTeam, isViewerRow, VIEWER_PAGE } from '@/lib/team-list'
import EmptyScroll from '@/components/EmptyScroll'


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
  // The member panel's profile fields (display name, photo, department).
  const [editName, setEditName] = useState('')
  const [editAvatar, setEditAvatar] = useState<string>('')
  const [editDept, setEditDept] = useState<string>('')
  const [editUploading, setEditUploading] = useState(false)
  // Department is organisational only (grouping/reporting/routing), separate from
  // role + permissions which control access. The workspace's own teams (picked
  // when it was created, companies.inbox_settings.teams) when it has them.
  const [teams, setTeams] = useState<string[]>([])
  const DEPARTMENTS = teams.length ? teams : ['Sales', 'Support', 'Fulfillment', 'Front Desk', 'Marketing', 'Management']

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

  // Per-member feature permissions, edited in the member panel.
  const [permDraft, setPermDraft] = useState<Record<string, boolean>>({})
  // Show what actually applies: everything ON when the member has no map yet
  // (full access); otherwise their saved choices, with features the map doesn't
  // mention yet at their restricted default (new pages start hidden).
  const permsOf = (m: any) => {
    const existing = m.permissions && typeof m.permissions === 'object' ? m.permissions : null
    const draft: Record<string, boolean> = {}
    // Explicit actions (Issue refunds) are off unless they were turned on.
    for (const key of ALL_FEATURE_KEYS) draft[key] = isExplicitFeature(key) ? existing?.[key] === true : existing ? (key in existing ? existing[key] !== false : restrictedDefault(key)) : true
    return draft
  }
  const toggleFeature = (key: string) => setPermDraft(d => ({ ...d, [key]: !d[key] }))
  const setSuite = (suiteKey: string, on: boolean) => {
    const suite = PERMISSION_SUITES.find(s => s.key === suiteKey)
    if (!suite) return
    // Turning a whole suite on never grants an explicit action (Issue refunds):
    // that one is switched on by itself. Turning the suite off clears it too.
    setPermDraft(d => { const n = { ...d }; for (const f of suite.features) { if (on && f.explicit) continue; n[f.key] = on } return n })
  }

  // The member open in the side panel. Everything there (profile, role,
  // outlet, mobile, access) waits for one Save; `panelBase` is what the panel
  // opened with, so it knows what changed.
  const [panelId, setPanelId] = useState<string | null>(null)
  const [panelBase, setPanelBase] = useState<{ name: string; avatar: string; dept: string; role: string; outlet: string; phone: string; perms: string } | null>(null)
  const [roleDraft, setRoleDraft] = useState('editor')
  const [outletDraft, setOutletDraft] = useState('')
  const [phoneDraft, setPhoneDraft] = useState('')
  const [panelSaving, setPanelSaving] = useState(false)
  // Filters: a summary tile picks who's listed; the search narrows it.
  const [view, setView] = useState<'all' | 'admin' | 'editor' | 'viewer' | 'invited'>('all')
  const [query, setQuery] = useState('')

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
      ;(supabase as any).from('companies').select('inbox_settings').eq('id', cid).maybeSingle()
        .then(({ data }: any) => { const t = data?.inbox_settings?.teams; if (Array.isArray(t)) setTeams(t.filter((x: unknown) => typeof x === 'string' && x)) }, () => {})

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
      alertDialog('Failed to create user: ' + err.message)
    }
    setWorking(false)
  }

  const updateRole = async (id: string, role: string) => {
    setMembers(ms => ms.map(m => m.id === id ? { ...m, role } : m))
    try { await teamApi('PATCH', { memberId: id, role }) }
    catch (e: any) { showMsg('Could not change the role: ' + e.message, true) }
    fetchMembers()
  }

  const removeMember = async (id: string) => {
    try { await teamApi('DELETE', { memberId: id }) }
    catch (e: any) { showMsg('Could not remove them: ' + e.message, true) }
    setConfirmDelete(null)
    setPanelId(p => (p === id ? null : p))
    fetchMembers()
  }

  const openPanel = (m: any) => {
    const name = m.display_name || m.name || ''
    const perms = permsOf(m)
    setEditName(name); setEditAvatar(m.avatar_url || ''); setEditDept(m.department || '')
    setRoleDraft(m.role || 'editor'); setOutletDraft(m.default_location_id || ''); setPhoneDraft(m.phone || '')
    setPermDraft(perms)
    setPanelBase({ name, avatar: m.avatar_url || '', dept: m.department || '', role: m.role || 'editor', outlet: m.default_location_id || '', phone: m.phone || '', perms: JSON.stringify(perms) })
    setPanelId(m.id)
  }
  const pm = panelId ? members.find(m => m.id === panelId) || null : null
  const draftHasAccess = ['editor', 'viewer'].includes(roleDraft.toLowerCase())
  const changed = panelBase ? {
    profile: editName.trim() !== panelBase.name.trim() || editAvatar !== panelBase.avatar || editDept !== panelBase.dept,
    role: roleDraft !== panelBase.role,
    outlet: outletDraft !== panelBase.outlet,
    phone: phoneDraft.trim() !== panelBase.phone.trim(),
    perms: draftHasAccess && JSON.stringify(permDraft) !== panelBase.perms,
  } : null
  const dirty = !!changed && Object.values(changed).some(Boolean)
  const asking = useRef(false)
  const closePanel = async () => {
    if (asking.current) return
    if (dirty) {
      asking.current = true
      const ok = await confirmDialog({ title: 'Discard changes?', message: 'Your changes to this team member haven’t been saved.', confirmLabel: 'Discard', tone: 'danger' })
      asking.current = false
      if (!ok) return
    }
    setPanelId(null); setPanelBase(null)
  }
  // Each part goes through /api/team/members on its own, as the rows did.
  const savePanel = async () => {
    if (!pm || !changed) return
    setPanelSaving(true)
    try {
      if (changed.profile) {
        const patch = { name: editName.trim() || null, avatar_url: editAvatar || null, department: editDept || null }
        await teamApi('PATCH', { memberId: pm.id, ...patch })
        setMembers(ms => ms.map(m => m.id === pm.id ? { ...m, name: patch.name, avatar_url: patch.avatar_url, department: patch.department, display_name: patch.name || m.display_name } : m))
      }
      if (changed.role) {
        await teamApi('PATCH', { memberId: pm.id, role: roleDraft })
        setMembers(ms => ms.map(m => m.id === pm.id ? { ...m, role: roleDraft } : m))
      }
      if (changed.outlet) {
        await teamApi('PATCH', { memberId: pm.id, default_location_id: outletDraft || null })
        setMembers(ms => ms.map(m => m.id === pm.id ? { ...m, default_location_id: outletDraft || null } : m))
      }
      // Mobile for SMS reminders on assigned calendar events. The server tidies
      // it into +61 form ("0405 636 304" and "405636304" both become
      // "+61405636304") so Telnyx accepts it.
      let phone = phoneDraft.trim()
      if (changed.phone) {
        const { member } = await teamApi('PATCH', { memberId: pm.id, phone: phone || null })
        phone = member?.phone ?? ''
        setPhoneDraft(phone)
        setMembers(ms => ms.map(m => m.id === pm.id ? { ...m, phone: member?.phone ?? null } : m))
      }
      if (changed.perms) {
        await teamApi('PATCH', { memberId: pm.id, permissions: permDraft })
        setMembers(ms => ms.map(m => m.id === pm.id ? { ...m, permissions: permDraft } : m))
      }
      setPanelBase({ name: editName, avatar: editAvatar, dept: editDept, role: roleDraft, outlet: outletDraft, phone, perms: JSON.stringify(permDraft) })
      showMsg(`Saved changes for ${editName.trim() || pm.display_name || pm.email}`)
      if (changed.role) fetchMembers()
    } catch (e: any) {
      showMsg('Could not save: ' + String(e?.message || 'error'), true)
      fetchMembers()
    } finally {
      setPanelSaving(false)
    }
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

  // Escape closes the member panel (asking first if something's unsaved).
  useEffect(() => {
    if (!panelId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePanel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!user) return <div style={{ padding: '36px 44px' }}><SkeletonList rows={6} /></div>

  // The current viewer is already shown as the "You" row at the top, so don't
  // list them AGAIN from team_members below — that duplicate is why the owner
  // appeared a second time with a different role (e.g. Editor). Match on
  // user_id first, then fall back to email for rows that were invited before
  // the person signed in (no user_id yet).
  const meEmail = (user.email || '').toLowerCase()
  const visibleMembers = members.filter(
    (m: any) => m.user_id !== user.id && (m.email || '').toLowerCase() !== meEmail
  )
  const roleKey = (m: any): 'admin' | 'editor' | 'viewer' => {
    const r = String(m.role || 'editor').toLowerCase()
    return r === 'owner' || r === 'admin' ? 'admin' : r === 'viewer' ? 'viewer' : 'editor'
  }
  const q = query.trim().toLowerCase()
  const matches = (m: any) =>
    (view === 'all' || (view === 'invited' ? m.status !== 'active' : roleKey(m) === view)) &&
    (!q || [m.display_name, m.name, m.email, m.department, m.phone].filter(Boolean).join(' ').toLowerCase().includes(q))
  // A busy board: staff first, so the board's visitors can't push them down
  // the list, then the viewers a page at a time. Otherwise everyone is listed
  // together, newest first, as before.
  const staffRows = split ? visibleMembers.filter(m => !isViewerRow(m)) : visibleMembers
  const listed = staffRows.filter(matches)
  const listedViewers = split ? visibleMembers.filter(isViewerRow).filter(matches) : []
  const viewersLoaded = members.filter(isViewerRow).length
  const meIsAdmin = !myRole || myRole === 'owner' || myRole === 'admin'
  const showMe = !q && (view === 'all' || (view === 'admin' && meIsAdmin))
  const counts = {
    all: 1 + staffRows.length + (split ? viewerTotal : 0),
    admin: (meIsAdmin ? 1 : 0) + visibleMembers.filter(m => roleKey(m) === 'admin').length,
    editor: (myRole === 'editor' ? 1 : 0) + visibleMembers.filter(m => roleKey(m) === 'editor').length,
    viewer: (myRole === 'viewer' ? 1 : 0) + (split ? viewerTotal : visibleMembers.filter(m => roleKey(m) === 'viewer').length),
    invited: visibleMembers.filter(m => m.status !== 'active').length,
  }
  const outletName = (id: string | null) => {
    const o = id ? outlets.find((x: any) => x.id === id) : null
    return o ? (o.label || o.suburb || 'Outlet') : null
  }
  const nameOf = (m: any) => m.display_name || m.email || 'Team member'
  const myName = user.user_metadata?.display_name || user.user_metadata?.full_name || ''

  const avatar = (name: string, url: string | null, size: number) => {
    const h = hueOf(name)
    return url
      ? <img src={url} alt="" className="tp-av" style={{ width: size, height: size }} />
      : <span className="tp-av" aria-hidden="true" style={{ width: size, height: size, background: h.bg, color: h.fg, fontSize: Math.round(size * 0.36) }}>{initialsOf(name)}</span>
  }
  const roleTag = (role: string) => {
    const k = String(role || 'editor').toLowerCase()
    const meta = ROLE_META[k] || ROLE_META.editor
    return <span className="tp-tag dot" style={tint(meta.color)}>{meta.label}</span>
  }
  const statusTag = (m: any) => m.status === 'active'
    ? <span className="tp-tag dot" style={tint('#22c55e')}>Active</span>
    : <span className="tp-tag dot" style={tint('#f59e0b')}>Invited</span>
  const I = (d: React.ReactNode, size = 16) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  const chev = I(<path d="m9 18 6-6-6-6" />, 16)

  const memberRow = (m: any) => {
    const owner = String(m.role || '').toLowerCase() === 'owner'
    const out = outletName(m.default_location_id)
    return (
      <div key={m.id} className={`tp-row${panelId === m.id ? ' sel' : ''}`} role="button" tabIndex={0} aria-label={`Open ${nameOf(m)}`}
        onClick={() => openPanel(m)} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPanel(m) } }}>
        <div className="tp-who">
          {avatar(nameOf(m), m.avatar_url, 40)}
          <div className="tp-who-t">
            <span className="tp-name"><b>{nameOf(m)}</b>{m.department && <span className="tp-tag sm">{m.department}</span>}</span>
            {m.display_name && <small>{m.email}</small>}
          </div>
        </div>
        {outlets.length > 0 && (
          <div className="tp-out">
            {out ? <>{I(<><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></>, 14)}<span>{out}</span></> : <span className="tp-muted">No default outlet</span>}
          </div>
        )}
        <div className="tp-role" onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
          {owner || viewOnly ? roleTag(m.role) : (
            <select className="cv-select tp-sel" value={m.role} aria-label={`Role for ${nameOf(m)}`} onChange={e => updateRole(m.id, e.target.value)}>
              <option value="admin">Admin</option>
              <option value="editor">Agent</option>
              <option value="viewer">Viewer</option>
            </select>
          )}
        </div>
        <div className="tp-status">{statusTag(m)}</div>
        <span className="tp-chev">{chev}</span>
      </div>
    )
  }

  const tiles: { key: typeof view; label: string; sub: string; color: string; icon: React.ReactNode }[] = [
    { key: 'all', label: 'Everyone', sub: 'In this workspace', color: '#52525b', icon: I(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
    { key: 'admin', label: 'Admins', sub: 'Full access', color: ROLE_META.admin.color, icon: I(<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />) },
    { key: 'editor', label: 'Agents', sub: 'Day-to-day work', color: ROLE_META.editor.color, icon: I(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z" /><path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>) },
    { key: 'viewer', label: 'Viewers', sub: 'Read only', color: ROLE_META.viewer.color, icon: I(<><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>) },
    { key: 'invited', label: 'Waiting to join', sub: 'Invite not accepted yet', color: '#d97706', icon: I(<><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>) },
  ]
  const nothingListed = !loading && visibleMembers.length > 0 && listed.length === 0 && listedViewers.length === 0 && !showMe

  const roleOptions = (value: string, onPick: (k: string) => void, disabled = false) => (
    <div className="tp-roles" role="radiogroup" aria-label="Role">
      {ROLE_CHOICES.map(rc => (
        <button key={rc.key} type="button" role="radio" aria-checked={value === rc.key} disabled={disabled}
          className={`tp-roleopt${value === rc.key ? ' on' : ''}`} onClick={() => onPick(rc.key)}>
          <span className="tp-radio" aria-hidden="true" />
          <span className="tp-roleopt-t"><b>{rc.label}</b><small>{rc.desc}</small></span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="tp">
      <style>{TP_CSS}</style>
      <div className="tp-head">
        <div>
          <h1>Team</h1>
          <p>Who can sign in, what they can open and where they work.</p>
        </div>
        {!viewOnly && (
          <div className="tp-head-acts">
            <button type="button" className="cv-btn" onClick={() => setShowCreate(true)}>Create a login</button>
            <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowInvite(true)}>
              {I(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)} Invite member
            </button>
          </div>
        )}
      </div>

      {viewOnly && (
        <div className="tp-banner">
          {I(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>, 16)}
          <span>Only the owner or an admin can invite people or change roles and access. Ask one of them if something here needs updating.</span>
        </div>
      )}

      {lastInvite && (
        <div className="tp-invite">
          <span className="tp-invite-ic">{I(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 17)}</span>
          <div className="tp-invite-main">
            <p>Invite link for <b>{lastInvite.email}</b></p>
            <small>Send it to them directly by email, SMS or WhatsApp.</small>
            <div className="tp-invite-row">
              <input readOnly value={lastInvite.link} onFocus={e => e.currentTarget.select()} aria-label="Invite link" className="tp-invite-link" />
              <button type="button" className="cv-btn cv-btn-primary" onClick={async () => {
                try { await navigator.clipboard.writeText(lastInvite.link); showMsg('Invite link copied.') }
                catch { showMsg('Could not copy — select the link and copy it manually.', true) }
              }}>Copy link</button>
            </div>
          </div>
          <button type="button" className="tp-round" onClick={() => setLastInvite(null)} aria-label="Dismiss invite link">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 14)}</button>
        </div>
      )}

      {/* Who's here; a tile filters the list. */}
      <div className="tp-tiles">
        {tiles.map(t => (
          <button key={t.key} type="button" className={`tp-tile${view === t.key ? ' on' : ''}`} aria-pressed={view === t.key}
            onClick={() => setView(view === t.key && t.key !== 'all' ? 'all' : t.key)} style={{ ['--t' as any]: t.color }}>
            <span className="tp-tile-top"><span className="tp-tile-l">{t.label}</span><span className="tp-tile-ic">{t.icon}</span></span>
            <span className="tp-tile-v">{loading && t.key !== 'all' ? '–' : counts[t.key].toLocaleString()}</span>
            <span className="tp-tile-s">{t.sub}</span>
          </button>
        ))}
      </div>

      <div className="tp-bar">
        <label className="tp-search">
          {I(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, 15)}
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name, email or department" aria-label="Search the team" />
          {query && <button type="button" className="tp-x" onClick={() => setQuery('')} aria-label="Clear search">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 12)}</button>}
        </label>
        {view !== 'all' && <button type="button" className="tp-clear" onClick={() => setView('all')}>Show everyone</button>}
      </div>

      <div className={`tp-card${outlets.length ? '' : ' no-out'}`}>
        <div className="tp-thead" aria-hidden="true">
          <span>Member</span>{outlets.length > 0 && <span>Default outlet</span>}<span>Role</span><span>Status</span><span />
        </div>

        {showMe && (
          <div className="tp-row me" role="button" tabIndex={0} onClick={() => router.push('/admin/crm-settings/profile')}
            onKeyDown={e => { if (e.key === 'Enter') router.push('/admin/crm-settings/profile') }} title="Edit your profile">
            <div className="tp-who">
              {avatar(myName || user.email || 'You', user.user_metadata?.avatar_url || null, 40)}
              <div className="tp-who-t">
                <span className="tp-name"><b>{myName || user.email}</b><span className="tp-tag sm you">You</span></span>
                {myName && <small>{user.email}</small>}
              </div>
            </div>
            {outlets.length > 0 && <div className="tp-out"><span className="tp-muted">—</span></div>}
            <div className="tp-role">{roleTag(myRole || 'owner')}</div>
            <div className="tp-status"><span className="tp-tag dot" style={tint('#22c55e')}>Active</span></div>
            <span className="tp-chev">{chev}</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding: '8px 20px' }}><SkeletonList rows={5} /></div>
        ) : visibleMembers.length === 0 ? (
          <div className="tp-empty">
            <EmptyScroll kinds={['contact']} title="No team members yet" line="Invite colleagues by email, or create a login for them yourself."
              action={!viewOnly ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                <button type="button" onClick={() => setShowInvite(true)} className="cv-btn cv-btn-primary">Invite member</button>
                <button type="button" onClick={() => setShowCreate(true)} className="cv-btn">Create a login</button>
              </div> : undefined} />
          </div>
        ) : nothingListed ? (
          <div className="tp-empty">
            <EmptyScroll kinds={['contact']} title="No one matches" line={q ? `Nobody here matches “${query.trim()}”.` : 'Nobody in this group yet.'}
              action={<button type="button" className="cv-btn" onClick={() => { setQuery(''); setView('all') }}>Show everyone</button>} />
          </div>
        ) : (
          <>
            {listed.map(memberRow)}
            {split && listedViewers.length + (viewersLoaded < viewerTotal ? 1 : 0) > 0 && (
              <>
                <div className="tp-group">
                  <b>Viewers</b><span className="tp-count">{viewerTotal.toLocaleString()}</span>
                  <small>Board visitors and anyone given the Viewer role, newest first</small>
                </div>
                {listedViewers.map(memberRow)}
                {viewersLoaded < viewerTotal && (
                  <div className="tp-more">
                    <span>Showing {viewersLoaded.toLocaleString()} of {viewerTotal.toLocaleString()}</span>
                    <button type="button" className="cv-btn" onClick={showMoreViewers} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Show more'}</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* What each role can do */}
      <div className="tp-roles-explain">
        <h2>What each role can do</h2>
        <div className="tp-explain-grid">
          {ROLE_CHOICES.map(rc => (
            <div key={rc.key} className="tp-explain" style={{ ['--t' as any]: ROLE_META[rc.key].color }}>
              <span className="tp-explain-ic">{rc.key === 'admin' ? tiles[1].icon : rc.key === 'editor' ? tiles[2].icon : tiles[3].icon}</span>
              <b>{rc.label}</b>
              <p>{rc.long}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Member panel: floats in from the right. */}
      {pm && panelBase && (() => {
        const owner = String(pm.role || '').toLowerCase() === 'owner'
        const shownName = editName.trim() || pm.display_name || pm.email
        return (
          <>
            <div className="tp-scrim" onClick={closePanel} />
            <aside className="tp-panel" role="dialog" aria-modal="true" aria-label={`Team member ${shownName}`}>
              <div className="tp-ph">
                <div className="tp-ph-top">
                  {avatar(shownName, editAvatar || null, 56)}
                  <div className="tp-ph-t">
                    <h2>{shownName}</h2>
                    <p>{pm.email}</p>
                  </div>
                  <button type="button" className="tp-round lg" onClick={closePanel} aria-label="Close" title="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16)}</button>
                </div>
                <div className="tp-ph-tags">
                  {roleTag(pm.role)}{statusTag(pm)}
                  {pm.department && <span className="tp-tag">{pm.department}</span>}
                  {outletName(pm.default_location_id) && <span className="tp-tag">{outletName(pm.default_location_id)}</span>}
                </div>
                {pm.status !== 'active' && !viewOnly && (
                  <div className="tp-ph-note">
                    <span>They haven’t accepted their invite yet.</span>
                    <button type="button" className="tp-pill" onClick={() => resendInvite(pm)} disabled={resendingId === pm.id}>{resendingId === pm.id ? 'Sending…' : 'Resend invite'}</button>
                  </div>
                )}
              </div>

              <div className="tp-pbody">
                {viewOnly && <p className="tp-sect tp-fine" style={{ margin: 0 }}>Only the owner or an admin can change a team member.</p>}

                <section className="tp-sect">
                  <p className="tp-sect-h">Profile</p>
                  <div className="tp-photo">
                    {avatar(shownName, editAvatar || null, 52)}
                    {!viewOnly && (
                      <>
                        <label className={`tp-pill${editUploading ? ' busy' : ''}`}>
                          {editUploading ? 'Uploading…' : editAvatar ? 'Change photo' : 'Upload photo'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} disabled={editUploading}
                            onChange={e => { const f = e.target.files?.[0]; if (f) uploadMemberPhoto(f); e.target.value = '' }} />
                        </label>
                        {editAvatar && <button type="button" className="tp-pill danger" onClick={() => setEditAvatar('')}>Remove</button>}
                      </>
                    )}
                  </div>
                  <label className="tp-field">
                    <span>Display name</span>
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" disabled={viewOnly} />
                    <small>Shows across the inbox, read receipts and everywhere they appear.</small>
                  </label>
                  <label className="tp-field">
                    <span>Department</span>
                    <select value={DEPARTMENTS.includes(editDept) || !editDept ? editDept : '__custom'} disabled={viewOnly}
                      onChange={e => { if (e.target.value !== '__custom') setEditDept(e.target.value) }}>
                      <option value="">No department</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      {editDept && !DEPARTMENTS.includes(editDept) && <option value="__custom">{editDept}</option>}
                    </select>
                    <small>For grouping and routing only. It doesn’t change what they can open.</small>
                  </label>
                </section>

                <section className="tp-sect">
                  <p className="tp-sect-h">Role</p>
                  {owner
                    ? <p className="tp-fine">Owners can open everything. Ownership isn’t changed from here.</p>
                    : roleOptions(roleDraft, setRoleDraft, viewOnly)}
                </section>

                <section className="tp-sect">
                  <p className="tp-sect-h">Where they work</p>
                  {outlets.length > 0 && (
                    <label className="tp-field">
                      <span>Default outlet</span>
                      <select value={outletDraft} onChange={e => setOutletDraft(e.target.value)} disabled={viewOnly}>
                        <option value="">No default outlet</option>
                        {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.label || o.suburb || 'Outlet'}</option>)}
                      </select>
                      <small>Their Tasks page opens filtered to this outlet.</small>
                    </label>
                  )}
                  <label className="tp-field">
                    <span>Mobile for SMS</span>
                    <input type="tel" value={phoneDraft} onChange={e => setPhoneDraft(e.target.value)} placeholder="+61…" disabled={viewOnly} />
                    <small>Reminders for calendar events assigned to them are texted here.</small>
                  </label>
                </section>

                <section className="tp-sect">
                  <p className="tp-sect-h">What they can open</p>
                  {!draftHasAccess ? (
                    <p className="tp-fine">{owner ? 'Owners' : 'Admins'} can open everything, including settings and the team.</p>
                  ) : (
                    <>
                      <p className="tp-fine" style={{ margin: '-2px 0 12px' }}>Anything turned off is hidden from their menu and blocked if they open the link.</p>
                      <div className="tp-suites">
                        {PERMISSION_SUITES.map(suite => {
                          const on = suite.features.filter(f => permDraft[f.key]).length
                          const allOn = on === suite.features.length
                          return (
                            <div key={suite.key} className="tp-suite">
                              <div className="tp-suite-h">
                                <b>{suite.label}</b>
                                <span className="tp-count">{on}/{suite.features.length}</span>
                                {!viewOnly && <button type="button" className="tp-link" onClick={() => setSuite(suite.key, !allOn)}>{allOn ? 'Turn all off' : 'Turn all on'}</button>}
                              </div>
                              <div className="tp-feats">
                                {suite.features.map(f => (
                                  <label key={f.key} className="tp-feat">
                                    <span>{f.label}</span>
                                    <input type="checkbox" role="switch" className="tp-switch" checked={!!permDraft[f.key]} onChange={() => toggleFeature(f.key)} disabled={viewOnly} aria-label={f.label} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </section>

                {!viewOnly && !owner && (
                  <section className="tp-sect tp-danger">
                    <div>
                      <b>Remove from the team</b>
                      <small>They’ll no longer be able to sign in to this workspace.</small>
                    </div>
                    <button type="button" className="tp-pill danger" onClick={() => setConfirmDelete(pm)}>Remove</button>
                  </section>
                )}
              </div>

              {dirty && !viewOnly && (
                <div className="tp-savebar" role="region" aria-label="Unsaved changes">
                  <span>Unsaved changes</span>
                  <button type="button" className="tp-pill" onClick={() => openPanel(pm)} disabled={panelSaving}>Discard</button>
                  <button type="button" className="cv-btn cv-btn-primary" onClick={savePanel} disabled={panelSaving || editUploading}>{panelSaving ? 'Saving…' : 'Save changes'}</button>
                </div>
              )}
            </aside>
          </>
        )
      })()}

      {/* Invite */}
      {showInvite && (
        <div className="tp-overlay" onClick={() => setShowInvite(false)}>
          <div className="tp-modal" role="dialog" aria-modal="true" aria-label="Invite a team member" onClick={e => e.stopPropagation()}>
            <div className="tp-mh">
              <div>
                <h2>Invite a team member</h2>
                <p>We’ll email them a link to join. You can copy the link too.</p>
              </div>
              <button type="button" className="tp-round lg" onClick={() => setShowInvite(false)} aria-label="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16)}</button>
            </div>
            <div className="tp-mb">
              <label className="tp-field">
                <span>Email address</span>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter' && inviteEmail.trim() && !working) inviteMember() }} />
              </label>
              <div className="tp-field"><span>Role</span>{roleOptions(inviteRole, setInviteRole)}</div>
            </div>
            <div className="tp-mf">
              <button type="button" className="cv-btn" onClick={() => setShowInvite(false)}>Cancel</button>
              <button type="button" className="cv-btn cv-btn-primary" onClick={inviteMember} disabled={!inviteEmail.trim() || working}>{working ? 'Sending…' : 'Send invite'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Create a login */}
      {showCreate && (
        <div className="tp-overlay" onClick={() => setShowCreate(false)}>
          <div className="tp-modal" role="dialog" aria-modal="true" aria-label="Create a login" onClick={e => e.stopPropagation()}>
            <div className="tp-mh">
              <div>
                <h2>Create a login</h2>
                <p>Add someone to the team straight away, without an invite.</p>
              </div>
              <button type="button" className="tp-round lg" onClick={() => setShowCreate(false)} aria-label="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16)}</button>
            </div>
            <div className="tp-mb">
              <label className="tp-field">
                <span>Email address</span>
                <input type="email" value={createEmail} onChange={e => setCreateEmail(e.target.value)} placeholder="user@company.com" autoFocus />
              </label>
              <label className="tp-field">
                <span>Display name <em>(optional)</em></span>
                <input type="text" value={createName} onChange={e => setCreateName(e.target.value)} placeholder="Jane Smith" />
              </label>
              <div className="tp-field"><span>Role</span>{roleOptions(createRole, setCreateRole)}</div>
              <p className="tp-tip">They can sign in with this email at any time. To set their own password they use “Forgot password” on the sign-in page.</p>
            </div>
            <div className="tp-mf">
              <button type="button" className="cv-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="button" className="cv-btn cv-btn-primary" onClick={createUser} disabled={!createEmail.trim() || working}>{working ? 'Creating…' : 'Add to team'}</button>
            </div>
          </div>
        </div>
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

      {msg && (
        <div className={`tp-toast${msgErr ? ' err' : ''}`} role="status">
          {msgErr ? I(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></>, 16) : I(<path d="M20 6 9 17l-5-5" />, 16)}
          <span>{msg}</span>
        </div>
      )}
    </div>
  )
}

const ROLE_META: Record<string, { label: string; color: string }> = {
  owner: { label: 'Owner', color: '#7c3aed' },
  admin: { label: 'Admin', color: '#2563eb' },
  editor: { label: 'Agent', color: '#0891b2' },
  viewer: { label: 'Viewer', color: '#71717a' },
}
const ROLE_CHOICES = [
  { key: 'admin', label: 'Admin', desc: 'Everything, including settings and the team', long: 'Full access to everything, including settings, billing and the team.' },
  { key: 'editor', label: 'Agent', desc: 'Day-to-day work; you choose what they can open', long: 'Day-to-day work. You choose exactly what each agent can open.' },
  { key: 'viewer', label: 'Viewer', desc: 'Can look, can’t change', long: 'Read-only access to the dashboard.' },
]
const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties
const HUES: [string, string][] = [['#e0f2fe', '#0369a1'], ['#fce7f3', '#be185d'], ['#ede9fe', '#6d28d9'], ['#dcfce7', '#15803d'], ['#fef3c7', '#b45309'], ['#ffe4e6', '#be123c'], ['#e0e7ff', '#4338ca'], ['#ccfbf1', '#0f766e']]
const hueOf = (s: string) => { let h = 0; for (const ch of s || '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0; const [bg, fg] = HUES[h % HUES.length]; return { bg, fg } }
const initialsOf = (s: string) => {
  const w = String(s || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean)
  return ((w[0]?.[0] || '?') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase()
}

// The Team look: a big bold header, tiles that filter, a soft list of
// members and a floating panel per member.
const TP_CSS = `
.tp{padding:36px 44px 48px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.tp button::before,.tp-panel button::before,.tp-modal button::before{display:none}
.tp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.tp-head h1{margin:0;font-size:30px!important;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.tp-head p{margin:6px 0 0;font-size:14.5px;color:#71717a}
.tp-head-acts{display:flex;gap:8px;flex-wrap:wrap}
.tp-banner{display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;padding:12px 16px;border-radius:16px;background:#f4f4f5;color:#52525b;font-size:13.5px;line-height:1.5}
.tp-banner svg{flex-shrink:0;margin-top:2px}
.tp-invite{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;padding:14px 16px;border-radius:18px;background:color-mix(in srgb,var(--coral) 6%,#fff);box-shadow:0 0 0 1px color-mix(in srgb,var(--coral) 18%,transparent)}
.tp-invite-ic{width:36px;height:36px;border-radius:999px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--coral) 14%,#fff);color:var(--coral)}
.tp-invite-main{flex:1;min-width:0}
.tp-invite-main p{margin:0;font-size:14px;color:var(--ink)}
.tp-invite-main small{display:block;margin-top:2px;font-size:12.5px;color:#71717a}
.tp-invite-row{display:flex;gap:8px;margin-top:10px}
.tp .tp-invite-link{flex:1;min-width:0;height:38px;padding:0 14px;border:1.5px solid transparent;border-radius:999px!important;background-color:#fff!important;font:inherit;font-size:13px;color:#3f3f46}
.tp-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}
.tp-tile{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px 16px;border:none;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0;transition:box-shadow .15s,transform .2s cubic-bezier(.22,1,.36,1)}
.tp-tile:hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(0,0,0,.08),0 10px 24px -14px rgba(0,0,0,.3)}
.tp-tile.on{box-shadow:0 0 0 2px var(--t)}
.tp-tile-top{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
.tp-tile-l{font-size:13.5px;font-weight:600;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-tile-ic{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 11%,#fff);color:var(--t)}
.tp-tile-ic svg{width:15px;height:15px}
.tp-tile-v{margin-top:2px;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.tp-tile-s{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.tp-bar{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.tp-search{flex:1;min-width:0;max-width:440px;display:flex;align-items:center;gap:8px;height:40px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.tp-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.tp .tp-search input{flex:1;min-width:0;height:36px;padding:0;border:none!important;background:transparent!important;box-shadow:none!important;outline:none;font:inherit;font-size:14px;color:var(--ink);-webkit-appearance:none;appearance:none}
.tp-search input::-webkit-search-cancel-button{display:none}
.tp-x{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.tp-clear{height:36px;padding:0 12px;border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--coral);cursor:pointer}
.tp-clear:hover{background:#f4f4f5}
.tp-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);overflow:hidden}
.tp-thead,.tp-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,220px) 140px 104px 18px;align-items:center;gap:16px;padding:0 20px}
.tp-card.no-out .tp-thead,.tp-card.no-out .tp-row{grid-template-columns:minmax(0,1fr) 140px 104px 18px}
.tp-thead{height:44px;font-size:12.5px;font-weight:600;color:#8e8e93;border-bottom:1px solid #f0f0f2}
.tp-row{min-height:68px;padding-top:12px;padding-bottom:12px;border-bottom:1px solid #f4f4f5;cursor:pointer;transition:background-color .12s}
.tp-row:last-child{border-bottom:none}
.tp-row:hover{background-color:#fafafa}
.tp-row.sel{background-color:color-mix(in srgb,var(--coral) 6%,#fff)}
.tp-row:focus-visible{outline:none;box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--coral) 45%,transparent)}
.tp-who{display:flex;align-items:center;gap:12px;min-width:0}
.tp-av{border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;font-weight:700;object-fit:cover;letter-spacing:.01em}
.tp-who-t{min-width:0;display:flex;flex-direction:column;gap:1px}
.tp-name{display:flex;align-items:center;gap:7px;min-width:0}
.tp-name b{font-size:14.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-who-t small{font-size:13px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-out{display:flex;align-items:center;gap:6px;min-width:0;font-size:13.5px;color:#3f3f46}
.tp-out svg{flex-shrink:0;color:#a1a1aa}
.tp-out span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-muted{color:#a1a1aa}
.tp-chev{color:#c4c4c8;display:inline-flex}
.tp-row:hover .tp-chev{color:#71717a}
.tp .tp-sel{height:32px;max-width:100%;padding:0 32px 0 12px;border:none;border-radius:999px;background-color:#f4f4f5;background-position:right 11px center;font-size:13px;font-weight:600;color:var(--ink);box-shadow:none}
.tp .tp-sel:hover{background-color:#ececef}
.tp-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap;background:#f4f4f5;color:#52525b;flex-shrink:0}
.tp-tag.dot{background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 80%,#000)}
.tp-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.tp-tag.sm{height:20px;padding:0 7px;font-size:11.5px}
.tp-tag.you{background:#18181b;color:#fff}
.tp-group{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;padding:14px 20px 10px;background:#fafafa;border-bottom:1px solid #f0f0f2}
.tp-group b{font-size:14px}
.tp-group small{font-size:12.5px;color:#8e8e93}
.tp-count{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 7px;box-sizing:border-box;border-radius:999px;background:rgba(0,0,0,.06);font-size:11.5px;font-weight:700;color:#52525b}
.tp-more{display:flex;align-items:center;justify-content:center;gap:12px;padding:14px 20px;font-size:13px;color:#8e8e93}
.tp-empty{padding:24px 12px}
.tp-roles-explain{margin-top:28px}
.tp-roles-explain h2{margin:0 0 12px;font-size:17px;font-weight:700;letter-spacing:-.01em}
.tp-explain-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tp-explain{padding:16px;border-radius:18px;background:#f6f6f7}
.tp-explain-ic{width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 12%,#fff);color:var(--t);margin-bottom:10px}
.tp-explain b{display:block;font-size:14.5px}
.tp-explain p{margin:3px 0 0;font-size:13.5px;color:#52525b;line-height:1.5}
.tp-round{width:32px;height:32px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background-color .15s}
.tp-round:hover{background-color:#ececef;color:#18181b}
.tp-round.lg{width:34px;height:34px}
.tp-pill{display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.tp-pill:hover{background-color:#ececef}
.tp-pill:disabled,.tp-pill.busy{opacity:.6;cursor:default}
.tp-pill.danger{color:#e11d48}
.tp-pill.danger:hover{background-color:#fff1f2}
.tp-link{border:none;background:none;padding:0;font:inherit;font-size:12.5px;font-weight:600;color:var(--coral);cursor:pointer}
@keyframes tpIn{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
@keyframes tpFade{from{opacity:0}to{opacity:1}}
@keyframes tpRise{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}
@keyframes tpUp{from{transform:translateY(100%)}to{transform:none}}
.tp-scrim{position:fixed;inset:0;z-index:5600;background:rgba(15,15,20,.3);animation:tpFade .2s ease}
.tp-panel{position:fixed;top:8px;right:8px;bottom:8px;width:480px;max-width:calc(100vw - 16px);z-index:5601;display:flex;flex-direction:column;background:#f4f4f5;border-radius:24px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.22),0 0 0 1px rgba(0,0,0,.05);animation:tpIn .32s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.tp-ph{flex-shrink:0;background:#fff;border-bottom:1px solid #ececef;padding:16px 18px}
.tp-ph-top{display:flex;align-items:center;gap:14px}
.tp-ph-t{flex:1;min-width:0}
.tp-ph-t h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-ph-t p{margin:2px 0 0;font-size:13.5px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-ph-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.tp-ph-note{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;padding:10px 10px 10px 14px;border-radius:14px;background:color-mix(in srgb,#f59e0b 10%,#fff);font-size:13px;color:#92400e}
.tp-ph-note .tp-pill{background:#fff}
.tp-pbody{flex:1;overflow-y:auto;padding:10px;display:flex;flex-direction:column;gap:10px}
.tp-sect{background:#fff;border-radius:18px;padding:16px}
.tp-sect-h{margin:0 0 12px;font-size:15px;font-weight:700;letter-spacing:-.01em}
.tp-fine{margin:0;font-size:13px;color:#71717a;line-height:1.5}
.tp-photo{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.tp-photo .tp-av{margin-right:6px}
.tp-field{display:block;margin-bottom:14px}
.tp-field:last-child{margin-bottom:0}
.tp-field > span{display:block;margin-bottom:6px;font-size:13.5px;font-weight:600;color:var(--ink)}
.tp-field > span em{font-style:normal;font-weight:400;color:#8e8e93}
.tp-field > small{display:block;margin-top:6px;font-size:12.5px;color:#8e8e93;line-height:1.45}
.tp-panel .tp-field :is(input,select),.tp-modal .tp-field :is(input,select){display:block;width:100%;box-sizing:border-box;height:42px;padding:0 14px;border:1.5px solid transparent;border-radius:12px;background-color:#f4f4f5;font:inherit;font-size:14.5px;color:var(--ink);outline:none}
.tp-panel .tp-field select,.tp-modal .tp-field select{appearance:none;-webkit-appearance:none;padding-right:38px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-size:14px}
.tp-panel .tp-field :is(input,select):focus,.tp-modal .tp-field :is(input,select):focus{background-color:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.tp-panel .tp-field :is(input,select):disabled{opacity:.7;cursor:default}
.tp-roles{display:flex;flex-direction:column;gap:6px}
.tp-roleopt{display:flex;align-items:flex-start;gap:12px;width:100%;padding:12px 14px;border:none;border-radius:14px;background:#f4f4f5;font:inherit;text-align:left;cursor:pointer;color:inherit;transition:background-color .15s,box-shadow .15s}
.tp-roleopt:hover:not(:disabled){background-color:#ececef}
.tp-roleopt.on{background:color-mix(in srgb,var(--coral) 8%,#fff);box-shadow:0 0 0 1.5px var(--coral)}
.tp-roleopt:disabled{cursor:default;opacity:.75}
.tp-radio{width:18px;height:18px;border-radius:50%;flex-shrink:0;margin-top:1px;box-sizing:border-box;border:2px solid #c4c4c8;background:#fff;transition:border .15s}
.tp-roleopt.on .tp-radio{border:5.5px solid var(--coral)}
.tp-roleopt-t b{display:block;font-size:14px;font-weight:600}
.tp-roleopt-t small{display:block;margin-top:1px;font-size:12.5px;color:#71717a;line-height:1.4}
.tp-suites{display:flex;flex-direction:column;gap:8px}
.tp-suite{border-radius:16px;background:#fafafa;box-shadow:0 0 0 1px #f0f0f2;padding:12px}
.tp-suite-h{display:flex;align-items:center;gap:8px;margin:0 2px 8px}
.tp-suite-h b{font-size:13.5px;font-weight:700}
.tp-suite-h .tp-link{margin-left:auto}
.tp-feats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.tp-feat{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px;padding:6px 8px 6px 12px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px #ececef;font-size:13px;font-weight:500;cursor:pointer;min-width:0}
.tp-feat span{min-width:0;line-height:1.3}
.tp-switch{appearance:none;-webkit-appearance:none;flex-shrink:0;width:36px;height:22px;margin:0;border-radius:999px;background:#d4d4d8;position:relative;cursor:pointer;transition:background-color .2s}
.tp-switch::after{content:'';position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.tp-switch:checked{background:#34c759}
.tp-switch:checked::after{transform:translateX(14px)}
.tp-switch:disabled{opacity:.6;cursor:default}
.tp-switch:focus{outline:none;box-shadow:none}
.tp-switch:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
.tp-danger{display:flex;align-items:center;justify-content:space-between;gap:12px}
.tp-danger b{display:block;font-size:14px}
.tp-danger small{display:block;margin-top:2px;font-size:12.5px;color:#8e8e93}
.tp-savebar{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:12px 14px 12px 18px;background:#fff;border-top:1px solid #ececef;animation:tpUp .25s cubic-bezier(.22,1,.36,1)}
.tp-savebar > span{flex:1;font-size:13.5px;font-weight:600;color:#52525b}
.tp-overlay{position:fixed;inset:0;z-index:5700;background:rgba(15,15,20,.35);display:flex;align-items:center;justify-content:center;padding:20px;animation:tpFade .18s ease}
.tp-modal{width:480px;max-width:100%;max-height:calc(100dvh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:24px;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:tpRise .24s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.tp-mh{display:flex;align-items:flex-start;gap:12px;padding:22px 22px 6px}
.tp-mh > div{flex:1;min-width:0}
.tp-mh h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
.tp-mh p{margin:4px 0 0;font-size:14px;color:#71717a}
.tp-mb{flex:1;min-height:0;overflow-y:auto;padding:14px 22px 6px}
.tp-mf{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px 20px}
.tp-tip{margin:4px 0 8px;padding:12px 14px;border-radius:14px;background:#f6f6f7;font-size:13px;color:#52525b;line-height:1.5}
.tp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:5800;display:flex;align-items:flex-start;gap:8px;padding:12px 18px;border-radius:18px;background:#18181b;color:#fff;font-size:13.5px;font-weight:500;line-height:1.45;box-shadow:0 12px 30px rgba(0,0,0,.25);width:max-content;max-width:min(560px,calc(100vw - 32px))}
.tp-toast svg{flex-shrink:0;margin-top:1px;color:#4ade80}
.tp-toast.err svg{color:#f87171}
.tp-tile:focus-visible,.tp-pill:focus-visible,.tp-round:focus-visible,.tp-roleopt:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media(max-width:1180px){.tp-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:1000px){
  .tp-thead,.tp-row{grid-template-columns:minmax(0,1fr) 130px 96px 18px}
  .tp-thead > :nth-child(2),.tp-row > .tp-out{display:none}
  .tp-card.no-out .tp-thead,.tp-card.no-out .tp-row{grid-template-columns:minmax(0,1fr) 130px 96px 18px}
}
@media(max-width:700px){
  .tp{padding:20px 16px 40px}
  .tp-head{align-items:flex-start}
  .tp-head h1{font-size:26px!important}
  .tp-head-acts{width:100%}
  .tp-head-acts .cv-btn{flex:1}
  .tp-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .tp-tiles > :first-child{grid-column:1 / -1}
  .tp-tile{padding:12px 14px}
  .tp-tile-v{font-size:22px}
  .tp-search{max-width:none}
  .tp-thead{display:none}
  .tp-row,.tp-card.no-out .tp-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:14px 16px}
  .tp-who{flex:1 1 calc(100% - 30px);order:1}
  .tp-chev{order:2}
  .tp-role{order:3;margin-left:52px}
  .tp-status{order:4}
  .tp-row > .tp-out{display:flex;order:5;flex-basis:100%;margin-left:52px}
  .tp-row > .tp-out:has(.tp-muted){display:none}
  .tp-explain-grid{grid-template-columns:1fr}
  .tp-panel{top:6px;right:6px;bottom:6px;left:6px;width:auto;max-width:none;border-radius:22px}
  .tp-feats{grid-template-columns:1fr}
  .tp-overlay{padding:0;align-items:flex-end}
  .tp-modal{width:100%;border-radius:24px 24px 0 0;max-height:94dvh}
  .tp-panel .tp-field :is(input,select),.tp-modal .tp-field :is(input,select){font-size:16px}
  .tp-invite-row{flex-direction:column}
}
@media (prefers-reduced-motion: reduce){.tp-panel,.tp-scrim,.tp-modal,.tp-overlay,.tp-savebar{animation:none}.tp-tile:hover{transform:none}}
`
