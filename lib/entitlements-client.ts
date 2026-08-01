'use client'

import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { getCompanyByOwner } from './board'
import { resolveEntitlements, Plan } from './plan'

// Runtime resolution of the CURRENT user's effective entitlements — the plan
// defaults with any per-company overrides (company_entitlements) applied on top.
// This is what feature gates should consult so a super-admin override actually
// takes effect. Cached briefly so a page with several gates does one lookup.

export interface EffectiveState {
  ready: boolean
  companyId: string | null
  plan: Plan
  isComplimentary: boolean
  features: Record<string, boolean>
  limits: Record<string, any>
}

const EMPTY: EffectiveState = { ready: true, companyId: null, plan: 'free', isComplimentary: false, features: {}, limits: {} }

let _cache: { at: number; data: EffectiveState } | null = null
const TTL = 60_000

export function clearEntitlementsCache() { _cache = null }

async function resolveCompany(): Promise<any | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null
  // On a company subdomain, that company is authoritative.
  if (typeof window !== 'undefined') {
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && !['colvy.com', 'www.colvy.com', 'admin.colvy.com'].includes(h)) {
      const slug = h.replace('.colvy.com', '')
      const { data } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
      if (data) return data
    }
  }
  // Otherwise: the company they own, else a company they're a member of.
  const owned = await getCompanyByOwner(session.user.id)
  if (owned) return owned
  const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
  if (mem?.length) {
    const { data } = await (supabase as any).from('companies').select('*').eq('id', mem[0].company_id).maybeSingle()
    if (data) return data
  }
  return null
}

export async function getEffectiveEntitlements(): Promise<EffectiveState> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.data
  try {
    const co = await resolveCompany()
    if (!co) return EMPTY
    const plan = (co.plan || 'free') as Plan
    const eff = await resolveEntitlements(supabase, co.id, plan)
    const data: EffectiveState = {
      ready: true, companyId: co.id, plan, isComplimentary: !!co.is_complimentary,
      features: eff.features, limits: eff.limits,
    }
    _cache = { at: Date.now(), data }
    return data
  } catch { return EMPTY }
}

// React hook: returns the effective state plus convenience checkers. `ready` is
// false until the async resolve completes — gates should treat "not ready" as
// "don't flash the wrong state" (see ProGate).
export function useEntitlements() {
  const [state, setState] = useState<EffectiveState>({ ...EMPTY, ready: false })
  useEffect(() => {
    let on = true
    getEffectiveEntitlements().then(d => { if (on) setState(d) })
    return () => { on = false }
  }, [])
  return {
    ...state,
    hasFeature: (key: string) => !!state.features?.[key],
    limitOf: (key: string) => state.limits?.[key],
  }
}
