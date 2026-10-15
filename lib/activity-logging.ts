import { createClient } from '@supabase/supabase-js'

export type ActivityType = 
  | 'form_created'
  | 'form_updated'
  | 'form_deleted'
  | 'form_published'
  | 'response_received'
  | 'idea_created'
  | 'idea_updated'
  | 'announcement_created'
  | 'announcement_deleted'
  | 'team_member_invited'
  | 'team_member_invite_resent'
  | 'team_member_added'
  | 'team_member_removed'
  | 'team_member_role_changed'
  | 'team_member_permissions_changed'
  | 'team_member_updated'
  | 'settings_updated'
  | 'integration_added'

interface ActivityLog {
  company_id: string
  user_id?: string
  activity_type: ActivityType
  description: string
  metadata?: Record<string, any>
  ip_address?: string
  user_agent?: string
}

export async function logActivity(
  supabase: any,
  activity: ActivityLog,
  request?: Request
) {
  try {
    // x-forwarded-for is "client, proxy, proxy" — the first entry is the person.
    const fwd = request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = fwd || request?.headers.get('x-real-ip') || request?.headers.get('cf-connecting-ip') || 'unknown'
    const userAgent = request?.headers.get('user-agent') || 'unknown'

    // Pass a service-role client: since COLVY_V364 only the server may write
    // here, so a signed-in browser can't forge or tidy up its own history.
    const { error } = await (supabase as any).from('activity_logs').insert({
      ...activity,
      ip_address: ip,
      user_agent: userAgent.slice(0, 500),
      created_at: new Date().toISOString(),
    })
    // Supabase reports a failed insert (e.g. the table hasn't been created
    // yet) rather than throwing — say so in the server log, carry on.
    if (error) console.warn('Activity log not written:', error.message)
  } catch (error) {
    console.error('Failed to log activity:', error)
    // Don't throw - activity logging shouldn't break the main operation
  }
}

// Helper functions for common activities
export async function logFormCreated(
  supabase: any,
  companyId: string,
  userId: string,
  formTitle: string,
  request?: Request
) {
  return logActivity(supabase, {
    company_id: companyId,
    user_id: userId,
    activity_type: 'form_created',
    description: `Created form "${formTitle}"`,
    metadata: { formTitle },
  }, request)
}

export async function logFormPublished(
  supabase: any,
  companyId: string,
  userId: string,
  formTitle: string,
  request?: Request
) {
  return logActivity(supabase, {
    company_id: companyId,
    user_id: userId,
    activity_type: 'form_published',
    description: `Published form "${formTitle}"`,
    metadata: { formTitle },
  }, request)
}

export async function logResponseReceived(
  supabase: any,
  companyId: string,
  formTitle: string,
  request?: Request
) {
  return logActivity(supabase, {
    company_id: companyId,
    activity_type: 'response_received',
    description: `Received response for "${formTitle}"`,
    metadata: { formTitle },
  }, request)
}

export async function logTeamMemberInvited(
  supabase: any,
  companyId: string,
  userId: string,
  invitedEmail: string,
  role: string,
  request?: Request
) {
  return logActivity(supabase, {
    company_id: companyId,
    user_id: userId,
    activity_type: 'team_member_invited',
    description: `Invited ${invitedEmail} as ${role}`,
    metadata: { invitedEmail, role },
  }, request)
}

export async function logSettingsUpdated(
  supabase: any,
  companyId: string,
  userId: string,
  setting: string,
  request?: Request
) {
  return logActivity(supabase, {
    company_id: companyId,
    user_id: userId,
    activity_type: 'settings_updated',
    description: `Updated ${setting}`,
    metadata: { setting },
  }, request)
}
