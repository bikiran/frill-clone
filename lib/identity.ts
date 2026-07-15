
// Cross-channel identity linking.
//
// The same person often shows up as separate contacts — a live-chat visitor, an
// SMS number, a Messenger user, an Instagram handle. When we can tell they're
// the same human (same email or same phone), we link them under one
// identity_group_id so their profile and timeline show every channel.
//
// Matching is deliberately conservative: only email and phone (last 8 digits),
// which genuinely identify a person. We never merge on name alone.

const norm = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-8)
const lower = (e?: string | null) => (e || '').trim().toLowerCase()

type DB = any

// Call after creating/updating a contact. Finds other contacts for the same
// company that share this contact's email or phone, links them into one group,
// and records the channel on the contact.
export async function linkContactIdentity(
  db: DB, companyId: string, contactId: string, opts: { email?: string | null; phone?: string | null; channel?: string | null } = {}
): Promise<void> {
  try {
    const { data: me } = await (db as any).from('contacts')
      .select('id, email, phone, identity_group_id, channels_seen').eq('id', contactId).maybeSingle()
    if (!me) return

    const email = lower(opts.email ?? me.email)
    const phone = norm(opts.phone ?? me.phone)

    // Record the channel this contact was just seen on.
    if (opts.channel) {
      const seen: string[] = Array.isArray(me.channels_seen) ? me.channels_seen : []
      if (!seen.includes(opts.channel)) {
        await (db as any).from('contacts').update({ channels_seen: [...seen, opts.channel] }).eq('id', contactId)
      }
    }

    if (!email && !phone) return   // nothing to match on

    // Find other contacts sharing this email or phone.
    const { data: all } = await (db as any).from('contacts')
      .select('id, email, phone, identity_group_id').eq('company_id', companyId)
    const matches = (all || []).filter((c: any) => {
      if (c.id === contactId) return false
      if (email && lower(c.email) === email) return true
      if (phone && norm(c.phone) === phone) return true
      return false
    })
    if (matches.length === 0) return

    // Pick a group id: reuse an existing one among the matches, else this one's,
    // else mint a fresh one.
    const existingGroup = [me, ...matches].map((c: any) => c.identity_group_id).find(Boolean)
    const groupId = existingGroup || crypto.randomUUID()

    const ids = [contactId, ...matches.map((m: any) => m.id)]
    await (db as any).from('contacts').update({ identity_group_id: groupId }).in('id', ids)
  } catch (e) {
    console.error('[identity link] failed', e)
  }
}

// All contacts in the same identity group (for the profile's linked-channels
// panel and the merged timeline).
export async function linkedContacts(db: DB, contactId: string): Promise<any[]> {
  const { data: me } = await (db as any).from('contacts')
    .select('identity_group_id').eq('id', contactId).maybeSingle()
  if (!me?.identity_group_id) return []
  const { data } = await (db as any).from('contacts')
    .select('id, name, email, phone, channels_seen, source, meta_user_id')
    .eq('identity_group_id', me.identity_group_id)
  return data || []
}
