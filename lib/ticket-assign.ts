// Auto-assignment for new support tickets (server-only).
//
// Load-balanced round robin: the ticket goes to the active teammate with the
// FEWEST open tickets right now (ties go to whoever was assigned least
// recently). Fairer than a strict rotation when people work different hours or
// someone's queue is already full. Only runs when the company turned on
// "Auto-assign new tickets" (companies.ticket_sla_settings.auto_assign).

import { resolveSla } from '@/lib/ticket-sla'

export async function autoAssignTicket(db: any, companyId: string, ticketId: string): Promise<{ userId: string; name: string } | null> {
  try {
    const { data: co } = await db.from('companies').select('owner_id, ticket_sla_settings').eq('id', companyId).maybeSingle()
    if (!resolveSla(co?.ticket_sla_settings).auto_assign) return null

    const { data: members } = await db.from('team_members').select('user_id, name, email, status').eq('company_id', companyId)
    const pool = new Map<string, string>()
    for (const m of members || []) {
      if (!m.user_id) continue
      // Skip people who haven't joined yet or were switched off.
      if (['invited', 'pending', 'inactive', 'disabled', 'removed', 'suspended'].includes(String(m.status || '').toLowerCase())) continue
      pool.set(m.user_id, m.name || (m.email || '').split('@')[0] || 'Teammate')
    }
    if (co?.owner_id && !pool.has(co.owner_id)) pool.set(co.owner_id, 'Owner')
    if (!pool.size) return null

    const { data: open } = await db.from('support_tickets').select('assigned_to, updated_at')
      .eq('company_id', companyId).in('status', ['open', 'in_progress']).not('assigned_to', 'is', null)
    const load = new Map<string, { n: number; last: number }>()
    for (const id of Array.from(pool.keys())) load.set(id, { n: 0, last: 0 })
    for (const t of open || []) {
      const l = load.get(t.assigned_to)
      if (!l) continue
      l.n++
      l.last = Math.max(l.last, new Date(t.updated_at || 0).getTime())
    }
    const [userId] = Array.from(load.entries()).sort((a, b) => a[1].n - b[1].n || a[1].last - b[1].last)[0]

    const { error } = await db.from('support_tickets').update({ assigned_to: userId }).eq('id', ticketId).is('assigned_to', null)
    if (error) return null
    return { userId, name: pool.get(userId) || 'Teammate' }
  } catch { return null }
}

// Everyone a ticket can be assigned to: active teammates plus the owner.
export async function loadTicketTeam(db: any, companyId: string): Promise<{ userId: string; name: string }[]> {
  const team: { userId: string; name: string }[] = []
  try {
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    const { data: tm } = await db.from('team_members').select('user_id, name, email, status').eq('company_id', companyId)
    for (const m of tm || []) {
      if (!m.user_id || team.some(t => t.userId === m.user_id)) continue
      if (['invited', 'pending', 'inactive', 'disabled', 'removed', 'suspended'].includes(String(m.status || '').toLowerCase())) continue
      team.push({ userId: m.user_id, name: m.name || (m.email || '').split('@')[0] || 'Teammate' })
    }
    if (co?.owner_id && !team.some(t => t.userId === co.owner_id)) {
      let ownerName = 'Owner'
      try {
        const { data: u } = await (db.auth.admin as any).getUserById(co.owner_id)
        ownerName = u?.user?.user_metadata?.display_name || u?.user?.user_metadata?.full_name || (u?.user?.email || '').split('@')[0] || 'Owner'
      } catch {}
      team.unshift({ userId: co.owner_id, name: ownerName })
    }
  } catch {}
  return team
}
