import { createClient } from '@supabase/supabase-js'

export type UserRole = 'viewer' | 'editor' | 'admin' | 'owner'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export async function getUserRole(userId: string, companyId: string): Promise<UserRole> {
  try {
    // Check if user is company owner
    const { data: company } = await (supabase as any)
      .from('companies')
      .select('owner_id')
      .eq('id', companyId)
      .single()

    if (company?.owner_id === userId) {
      return 'owner'
    }

    // Check team member role
    const { data: member } = await (supabase as any)
      .from('team_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('user_id', userId)
      .maybeSingle()

    return (member?.role as UserRole) || 'viewer'
  } catch (error) {
    console.error('Failed to get user role:', error)
    return 'viewer'
  }
}

export function canEdit(role: UserRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export function canManageTeam(role: UserRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canDeleteContent(role: UserRole): boolean {
  return role === 'owner' || role === 'admin' || role === 'editor'
}

export function canAccessBilling(role: UserRole): boolean {
  return role === 'owner' || role === 'admin'
}

export function canAccessAnalytics(role: UserRole): boolean {
  return role !== 'viewer'
}
