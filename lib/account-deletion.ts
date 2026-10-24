// Deleting an account (App Store guideline 5.1.1(v)), shared by
// POST /api/account/delete and the daily purge.
//
//   • The user's login is deleted at once, with their push tokens, call devices
//     and memberships of other workspaces.
//   • A workspace they OWN is closed: every member is set to 'removed' (so
//     nobody can open it), its numbers stop routing (lib/inbound-company), its
//     subscription is cancelled, and it's marked to be purged in 30 days.
//   • purgeClosedCompanies() erases a closed workspace's data once its 30 days
//     are up. Tax invoices, credit notes and billing ledgers are kept (legal
//     retention); so are platform-wide tables.

import { deleteAnalyticsPerson } from '@/lib/analytics-server'

export const PURGE_AFTER_DAYS = 30

// Every table that holds a workspace's own data, by company_id. Deleted
// children-first over a few passes so foreign keys can't block the parent.
const COMPANY_TABLES = [
  'messages', 'conversation_events', 'conversation_notes', 'conversation_pins', 'conversation_sales', 'conversation_tasks',
  'task_comments', 'task_activity', 'drafts', 'scheduled_messages', 'mention_notifications', 'notifications',
  'chat_interactions', 'chat_payments', 'saved_cards', 'payment_methods', 'link_clicks', 'link_conversions', 'short_links',
  'calls', 'call_legs', 'call_transfers', 'call_handoff_events', 'call_devices', 'call_routing', 'missed_call_texts',
  'conversations', 'conversation_categories',
  'contact_addresses', 'customer_identities', 'customer_identity_audit', 'customer_memory', 'consent_events', 'whatsapp_consent',
  'contact_form_submissions', 'contact_forms', 'custom_fields', 'contacts',
  'order_items', 'order_notes', 'order_events', 'order_shipments', 'order_fulfillments', 'order_stock_alerts', 'order_chat_events',
  'order_drafts', 'order_tags', 'delivery_updates', 'tracking_events', 'shipments', 'doa_claims', 'orders',
  'woocommerce_orders', 'woocommerce_products', 'woo_sync_jobs', 'woocommerce_integrations',
  'shopify_checkouts', 'shopify_customers', 'shopify_products', 'shopify_sync_jobs', 'shopify_oauth_states', 'shopify_integrations',
  'abandoned_cart_hits', 'abandoned_carts', 'stock_waitlist', 'outlet_stock_locations',
  'bookings', 'booking_invites', 'booking_services', 'booking_waitlist_offers', 'booking_waitlist_jobs', 'booking_waitlist', 'calendar_events',
  'campaign_recipients', 'campaigns', 'campaign_templates', 'email_campaign_recipients', 'email_events', 'email_designs',
  'email_rules', 'email_signatures', 'email_suppressions', 'email_sending_domains', 'email_channels',
  'review_requests', 'reviews', 'google_reviews', 'google_business_accounts', 'social_comments', 'social_comment_categories', 'social_posts',
  'support_tickets', 'ticket_messages', 'ticket_counters', 'surveys', 'polls', 'announcements', 'policies', 'legal_pages',
  'media_item_categories', 'media_item_notes', 'media_favorites', 'media_items', 'media_folders', 'media_categories',
  'media_request_files', 'media_requests', 'upload_sessions', 'notes', 'quick_responses', 'keyword_reply_hits', 'keyword_replies', 'sms_keywords',
  'agent_steps', 'agent_runs', 'agent_approvals', 'agent_presence', 'agent_roles', 'agent_policies', 'agent_connections',
  'ai_actions', 'ai_assistant_events', 'ai_coupons', 'ai_facts', 'ai_flows', 'ai_knowledge_files', 'ai_knowledge', 'ai_settings',
  'ai_unanswered', 'ai_usage', 'ai_usage_log', 'business_memory',
  'whatsapp_messages', 'whatsapp_templates', 'whatsapp_senders', 'meta_channels',
  'integration_deliveries', 'integration_configs', 'prexty_integrations', 'realestate_integrations', 'mcp_tokens', 'mcp_auth_codes',
  'import_jobs', 'webhook_events', 'api_logs', 'activity_logs', 'feedback_reports', 'company_locations', 'company_secrets',
  'company_sms_policy', 'company_entitlements', 'company_admin_notes', 'user_preferences', 'user_settings', 'push_tokens',
  'phone_numbers', 'number_orders', 'number_regulatory_bundles', 'porting_request_events', 'porting_request_files', 'porting_requests',
  'twilio_integrations', 'telnyx_user_credentials', 'telnyx_integrations', 'team_members',
]

async function stripeClient(): Promise<any | null> {
  const key = String(process.env.STRIPE_SECRET_KEY || '').trim()
  if (!key) return null
  try { const Stripe = (await import('stripe')).default; return new Stripe(key, { apiVersion: '2024-06-20' as any }) } catch { return null }
}

/** Delete a user's account (see top of file). Returns what was done. */
export async function deleteAccount(db: any, user: { id: string; email?: string | null }, accessToken?: string) {
  const now = new Date()
  const purgeAfter = new Date(now.getTime() + PURGE_AFTER_DAYS * 86400000).toISOString()
  const meta: any = { closed: [], left: [], subscriptions: [] }

  // Workspaces they own: close them.
  const { data: owned } = await db.from('companies').select('id, name').eq('owner_id', user.id)
  const ownedIds: string[] = (owned || []).map((c: any) => c.id)
  for (const c of owned || []) {
    const { data: members } = await db.from('team_members').select('id, status').eq('company_id', c.id)
    meta.closed.push({ id: c.id, name: c.name, members: (members || []).map((m: any) => ({ id: m.id, status: m.status })) })
    try { await db.from('team_members').update({ status: 'removed' }).eq('company_id', c.id) } catch {}
    const { error } = await db.from('companies').update({ closed_at: now.toISOString(), purge_after: purgeAfter, closed_reason: 'owner deleted account' }).eq('id', c.id)
    if (error) throw new Error(`Couldn't close the workspace: ${error.message}`)
  }

  // Their subscription(s): cancel, so billing stops.
  try {
    const { data: subs } = await db.from('subscriptions').select('stripe_subscription_id').eq('user_id', user.id)
    const stripe = (subs || []).some((s: any) => s.stripe_subscription_id) ? await stripeClient() : null
    for (const s of subs || []) {
      if (!s.stripe_subscription_id) continue
      try { await stripe?.subscriptions.cancel(s.stripe_subscription_id); meta.subscriptions.push(s.stripe_subscription_id) } catch (e: any) { meta.subscriptions.push(`${s.stripe_subscription_id}: ${e?.message || 'cancel failed'}`) }
    }
  } catch {}

  // Memberships of other workspaces: leave them.
  const { data: rows } = await db.from('team_members').select('id, company_id').eq('user_id', user.id)
  for (const r of rows || []) {
    if (ownedIds.includes(r.company_id)) continue
    meta.left.push(r.company_id)
    try { await db.from('team_members').delete().eq('id', r.id) } catch {}
  }
  for (const t of ['push_tokens', 'call_devices', 'user_preferences', 'user_settings']) {
    try { await db.from(t).delete().eq('user_id', user.id) } catch {}
  }

  try {
    await db.from('account_deletions').insert({
      user_id: user.id, email: user.email || null, company_ids: ownedIds, meta,
      purge_after: ownedIds.length ? purgeAfter : null, status: ownedIds.length ? 'closed' : 'deleted',
    })
  } catch {}

  // Sign them out everywhere first.
  if (accessToken) { try { await db.auth.admin.signOut(accessToken, 'global') } catch {} }

  // The login itself, last: everything above needed it to find their rows.
  // Their analytics profile and events go too (Colvy's PostHog).
  await deleteAnalyticsPerson(user.id)
  const { error: delErr } = await db.auth.admin.deleteUser(user.id)
  if (delErr) {
    // Older rows can still point at the login (a foreign key with no ON DELETE
    // rule), which makes Supabase refuse the delete. Then the login is made
    // unusable and anonymous instead: banned, with its email, phone and name
    // replaced — nothing identifies the person and nobody can sign in with it.
    const { error: anonErr } = await db.auth.admin.updateUserById(user.id, {
      email: `deleted-${user.id}@deleted.colvy.com`,
      phone: '',
      password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
      user_metadata: { deleted: true },
      ban_duration: '876000h',
    } as any)
    if (anonErr) throw new Error(`Couldn't delete the login: ${delErr.message}`)
    try { await db.from('account_deletions').update({ meta: { ...meta, login: 'anonymised (delete refused: ' + delErr.message + ')' } }).eq('user_id', user.id) } catch {}
  }

  return { closedWorkspaces: (owned || []).map((c: any) => c.name || c.id), purgeAfter: ownedIds.length ? purgeAfter : null }
}

/** Erase closed workspaces whose 30 days are up. */
export async function purgeClosedCompanies(db: any, limit = 5) {
  const { data: due } = await db.from('companies').select('id')
    .not('closed_at', 'is', null).lte('purge_after', new Date().toISOString()).limit(limit)
  const purged: string[] = []
  for (const c of due || []) {
    const id = c.id
    for (let pass = 0; pass < 3; pass++) {
      for (const t of COMPANY_TABLES) { try { await db.from(t).delete().eq('company_id', id) } catch {} }
    }
    const { error } = await db.from('companies').delete().eq('id', id)
    if (!error) {
      purged.push(id)
      try { await db.from('account_deletions').update({ purged_at: new Date().toISOString(), status: 'purged' }).contains('company_ids', [id]) } catch {}
    } else {
      console.error('[purge] company delete blocked', id, error.message)
    }
  }
  return purged
}
