import { supabase } from '@/lib/supabase'

export async function signInWithGoogle(options?: { slug?: string; name?: string; industry?: string; companyId?: string }) {
  const base = `${window.location.origin}/auth/callback`
  let redirectTo = base
  if (options?.slug && options?.name) {
    // New company signup via Google — carry slug/name through the OAuth flow
    redirectTo = `${base}?slug=${encodeURIComponent(options.slug)}&name=${encodeURIComponent(options.name)}&industry=${encodeURIComponent(options.industry || '')}`
  } else if (options?.companyId) {
    redirectTo = `${base}?company_id=${options.companyId}`
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
  return { data, error }
}

export async function signInWithGitHub(options?: { slug?: string; name?: string; industry?: string; companyId?: string }) {
  const base = `${window.location.origin}/auth/callback`
  let redirectTo = base
  if (options?.slug && options?.name) {
    redirectTo = `${base}?slug=${encodeURIComponent(options.slug)}&name=${encodeURIComponent(options.name)}&industry=${encodeURIComponent(options.industry || '')}`
  } else if (options?.companyId) {
    redirectTo = `${base}?company_id=${options.companyId}`
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo },
  })
  return { data, error }
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signUpWithEmail(email: string, password: string, name?: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } })
  return { data, error }
}
