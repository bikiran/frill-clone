import { NextRequest } from 'next/server'
import { powersDb, powersCaller, loadPowers, forgetPowers, roster, json, isMissingPowersSchema, MIGRATION_HINT } from '@/lib/powers/server'
import { cleanConfig, levelFor } from '@/lib/powers/config'
import { loadLocations } from '@/lib/booking'
import { audit } from '@/lib/activity-logging'

export const dynamic = 'force-dynamic'

// Settings → Colvy Powers (owners and admins).
//   GET   ?companyId                         the switch, the rules, the team's wallets, recent coin changes
//   PATCH { companyId, enabled?, config? }   save; turning it on starts counting from now (no back-fill)

export async function GET(req: NextRequest) {
  try {
    const db = powersDb()
    const companyId = req.nextUrl.searchParams.get('companyId')
    const caller = await powersCaller(req, db, companyId)
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can change Colvy Powers.' }, 403)
    const st = await loadPowers(db, companyId!)
    if (st.missing) return json({ setup: true, error: MIGRATION_HINT }, 503)
    const [team, wallets, adjustments, locations] = await Promise.all([
      roster(db, companyId!, st.ownerId),
      db.from('powers_wallets').select('user_id, coins, xp, streak').eq('company_id', companyId),
      db.from('powers_ledger').select('id, user_id, kind, rule, coins, xp, reason, actor_id, created_at')
        .eq('company_id', companyId).in('kind', ['grant', 'revoke', 'reversal']).order('created_at', { ascending: false }).limit(40),
      loadLocations(db, companyId!),
    ])
    const byUser = new Map((wallets.data || []).map((w: any) => [w.user_id, w]))
    const names = new Map(team.map(m => [m.id, m.name]))
    return json({
      enabled: st.enabled, enabledAt: st.enabledAt, config: st.config, features: st.features,
      team: team.map(m => {
        const w: any = byUser.get(m.id) || { coins: 0, xp: 0, streak: 0 }
        const lv = levelFor(w.xp)
        return { id: m.id, name: m.name, role: m.role, locationId: m.locationId, avatar: m.avatar, coins: w.coins, xp: w.xp, level: lv.level, title: lv.title }
      }),
      locations: locations.map((l: any) => ({ id: l.id, label: l.label })),
      audit: (adjustments.data || []).map((r: any) => ({ ...r, name: names.get(r.user_id) || 'Former teammate', by: r.actor_id ? names.get(r.actor_id) || null : null })),
    })
  } catch (e: any) {
    if (isMissingPowersSchema(e)) return json({ setup: true, error: MIGRATION_HINT }, 503)
    return json({ error: e?.message || 'Could not load the settings.' }, 500)
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = powersDb()
    const caller = await powersCaller(req, db, body.companyId)
    if (!caller.ok) return caller.response
    if (!caller.isAdmin) return json({ error: 'Only owners and admins can change Colvy Powers.' }, 403)
    // Read what's saved now, not a cached copy: whether this turns it on
    // decides the "counts from" time, and a stale "on" would let work done
    // while it was off pay later.
    forgetPowers(body.companyId)
    const before = await loadPowers(db, body.companyId)
    if (before.missing) return json({ setup: true, error: MIGRATION_HINT }, 503)
    const enabled = typeof body.enabled === 'boolean' ? body.enabled : before.enabled
    const config = body.config !== undefined ? cleanConfig(body.config) : before.config
    const now = new Date().toISOString()
    const row: any = { company_id: body.companyId, enabled, config, updated_by: caller.userId, updated_at: now }
    if (enabled && !before.enabled) row.enabled_at = now
    const { error } = await db.from('powers_settings').upsert(row, { onConflict: 'company_id' })
    if (error) throw error
    forgetPowers(body.companyId)
    const what = enabled !== before.enabled ? (enabled ? 'Turned Colvy Powers on' : 'Turned Colvy Powers off') : 'Changed the Colvy Powers settings'
    await audit(req, db, body.companyId, 'powers_settings_updated', what, { enabled })
    const st = await loadPowers(db, body.companyId)
    return json({ enabled: st.enabled, enabledAt: st.enabledAt, config: st.config, features: st.features })
  } catch (e: any) {
    if (isMissingPowersSchema(e)) return json({ setup: true, error: MIGRATION_HINT }, 503)
    return json({ error: e?.message || 'Could not save.' }, 500)
  }
}
