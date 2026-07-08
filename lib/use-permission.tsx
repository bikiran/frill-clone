'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getUserRole, canEdit, canManageTeam, canAccessBilling } from './permissions'

export type PermissionRequired = 'edit' | 'manage-team' | 'billing' | 'view'

export function usePermission(required: PermissionRequired = 'view') {
  const router = useRouter()
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    checkPermission()
  }, [required])

  const checkPermission = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/auth/sign-in')
        return
      }

      // Get company ID from hostname or from URL
      let companyId: string | null = null
      const h = typeof window !== 'undefined' ? window.location.hostname : ''
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        companyId = co?.id || null
      }

      if (!companyId) {
        const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
        companyId = co?.id || null
      }

      if (!companyId) {
        router.push('/')
        return
      }

      // Get user role
      const role = await getUserRole(session.user.id, companyId)
      setUserRole(role)

      // Check permissions
      let allowed = true
      if (required === 'edit' && !canEdit(role as any)) allowed = false
      if (required === 'manage-team' && !canManageTeam(role as any)) allowed = false
      if (required === 'billing' && !canAccessBilling(role as any)) allowed = false

      if (!allowed) {
        console.warn(`Access denied: User role '${role}' cannot ${required}`)
        router.push('/admin')
        return
      }

      setHasPermission(true)
    } catch (error) {
      console.error('Permission check error:', error)
      setHasPermission(false)
    }
  }

  return { hasPermission, userRole }
}

export function ProtectedComponent({
  children,
  required = 'view',
  fallback = null,
}: {
  children: React.ReactNode
  required?: PermissionRequired
  fallback?: React.ReactNode
}) {
  const { hasPermission } = usePermission(required)

  if (hasPermission === null) {
    return <div style={{ padding: 32, textAlign: 'center', color: 'var(--slate)' }}>Checking permissions...</div>
  }

  if (!hasPermission) {
    return fallback || (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--slate)', marginBottom: 16 }}>You don't have permission to access this page</p>
        <a href="/admin" style={{ color: 'var(--coral)', textDecoration: 'none', fontWeight: 600 }}>
          ← Back to dashboard
        </a>
      </div>
    )
  }

  return <>{children}</>
}
