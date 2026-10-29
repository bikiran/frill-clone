'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { readStored, writeStored } from '@/lib/client-cache'
import { faceFor, type AgentFace, type AgentFaces } from '@/lib/agent-faces'

// The workspace's AI team as the inbox needs it: each agent's face (lib/agent-
// faces), which agents are switched on, the channels Support and Reception
// answer, whether agents are paused, and whether Support may send on its own.
// What this browser saw last paints straight away; it's refreshed underneath.

export type AgentTeam = {
  faces: AgentFaces
  enabled: string[]
  channels: string[]
  paused: boolean
  autoSend: boolean
}

const ROLE_NAMES: Record<string, string> = { support: 'Support Agent', reception: 'Reception Agent', reputation: 'Reputation Agent', sales: 'Sales Agent', operations: 'Operations Agent' }
export const agentName = (role: string) => ROLE_NAMES[role] || 'Support Agent'

/** "Colvy Reception Agent", "Sales Agent"… → its role key (Support when unsure). */
export function roleFromName(name?: string | null): string {
  const n = String(name || '').toLowerCase()
  return ['reception', 'reputation', 'sales', 'operations'].find(k => n.includes(k)) || 'support'
}

/** A conversation's channel as the agents' switch key (lib/agent/pilot channelKey). */
export function agentChannel(channel?: string | null): string | null {
  const c = String(channel || 'chat').toLowerCase()
  if (c === 'widget' || c === 'chat' || c === 'live_chat') return 'chat'
  if (c === 'messenger') return 'facebook'
  return ['sms', 'email', 'facebook', 'instagram', 'whatsapp'].includes(c) ? c : null
}

const key = (companyId: string | null) => (companyId ? `agent-team:${companyId}` : null)

// One request for every card and bar on the page, refreshed at most once a minute.
const loads = new Map<string, { at: number; p: Promise<AgentTeam | null> }>()
function loadTeam(companyId: string): Promise<AgentTeam | null> {
  const hit = loads.get(companyId)
  if (hit && Date.now() - hit.at < 60_000) return hit.p
  const p = Promise.all([
    authFetch(`/api/agent/settings?companyId=${companyId}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
    authFetch(`/api/agent/roles?companyId=${companyId}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
  ]).then(([s, r]) => {
    if (!s && !r) { loads.delete(companyId); return null }
    return {
      faces: s?.faces || {},
      enabled: Array.isArray(r?.roles) ? r.roles.filter((x: any) => x.enabled).map((x: any) => x.key) : [],
      channels: Array.isArray(s?.channels) ? s.channels : ['sms', 'chat'],
      paused: !!s?.pause?.paused,
      autoSend: !!s?.autoSend?.enabled,
    } as AgentTeam
  })
  loads.set(companyId, { at: Date.now(), p })
  return p
}

export function useAgentTeam(companyId: string | null) {
  const [team, setTeam] = useState<AgentTeam | null>(() => readStored<AgentTeam>(key(companyId)) || null)
  useEffect(() => {
    if (!companyId) return
    let live = true
    const cached = readStored<AgentTeam>(key(companyId))
    if (cached) setTeam(cached)
    loadTeam(companyId).then(next => {
      if (!live || !next) return
      setTeam(next); writeStored(key(companyId), next)
    })
    return () => { live = false }
  }, [companyId])
  const faceOf = (role: string): AgentFace => faceFor(role, team?.faces)
  return { team, faceOf }
}
