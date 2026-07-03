'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) throw sessionError
        if (!session) {
          router.push('/signin')
          return
        }

        // Check for company context from OAuth
        const companyContextStr = localStorage.getItem('oauth_company_context')
        let companyContext = null
        
        if (companyContextStr) {
          try {
            companyContext = JSON.parse(companyContextStr)
            localStorage.removeItem('oauth_company_context')
          } catch (e) {
            console.error('Failed to parse company context')
          }
        }

        // Check for company_id from email confirmation signup
        const companyId = params.get('company_id')
        if (companyId && !companyContext) {
          const { data: company } = await supabase
            .from('companies')
            .select('id, slug, name')
            .eq('id', companyId)
            .single()
          
          if (company) {
            companyContext = company
          }
        }

        // Check for slug from regular new company signup
        const slug = params.get('slug')
        if (slug && !companyContext) {
          const { data: company } = await supabase
            .from('companies')
            .select('id, slug, name')
            .eq('slug', slug)
            .single()
          
          if (company) {
            companyContext = company
          }
        }

        // Determine redirect URL
        let redirectUrl = '/admin'
        
        if (companyContext) {
          const hostname = window.location.hostname
          const isLocal = hostname.includes('localhost') || hostname.includes('vercel.app')
          
          if (!isLocal && companyContext.slug) {
            redirectUrl = `https://${companyContext.slug}.colvy.com/`
          } else {
            redirectUrl = '/'
          }
        }

        router.push(redirectUrl)
      } catch (error) {
        console.error('Auth callback error:', error)
        router.push('/signin')
      }
    }

    handleCallback()
  }, [router, params])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, border: '4px solid #f0f0f0', borderTop: '4px solid #ff7a6b', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 20px' }} />
        <p style={{ color: '#6b6b70', fontSize: 14 }}>Completing sign in...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  )
}
