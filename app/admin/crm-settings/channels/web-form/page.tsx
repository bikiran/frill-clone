'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { S, useCompanyUser } from '../../_shared'

const FORMS_DOMAIN = process.env.NEXT_PUBLIC_FORMS_DOMAIN || 'forms.colvy.com'
const hex = (s: string) => (s || '').replace(/[^a-f0-9]/gi, '').toLowerCase()

const FAQ = [
  { q: 'What is this email address for?', a: 'Point your website contact form (WordPress, Wix, Squarespace, Typeform, etc.) to send its submissions to this address. Each submission arrives in your Colvy inbox as a new conversation for that location.' },
  { q: 'How do I set up Web Forms?', a: 'In your form builder, set the notification/recipient email to the address below (or add it as a CC). That\'s it — the next submission shows up in your inbox.' },
  { q: 'My forms are coming into Colvy, but they don\'t look right.', a: 'Most form tools let you customise the notification email body. Put each field on its own line (e.g. "Name: {{name}}") so it\'s easy to read in the inbox. Plain-text notifications work best.' },
  { q: 'Do I have to add CC on all forms?', a: 'No. You can either set this address as the sole recipient, or CC it alongside your own inbox — whichever you prefer.' },
]

export default function WebFormChannel() {
  const { companyId } = useCompanyUser()
  const [locations, setLocations] = useState<any[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  const [testMsg, setTestMsg] = useState<Record<string, string>>({})

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: locs }, { data: chans }, { data: co }] = await Promise.all([
      (supabase as any).from('company_locations').select('id, label, suburb, is_primary').eq('company_id', companyId).order('is_primary', { ascending: false }),
      (supabase as any).from('email_channels').select('*').eq('company_id', companyId).eq('provider', 'webform'),
      (supabase as any).from('companies').select('name').eq('id', companyId).maybeSingle(),
    ])
    setLocations(locs || [])
    setRows(chans || [])
    setCompanyName(co?.name || '')
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])

  const addressFor = (locationId: string | null) =>
    rows.find(r => (r.location_id || null) === (locationId || null))

  // Create a web-form inbound address for a location (or company-wide).
  const provision = async (locationId: string | null, label: string) => {
    if (!companyId || busy) return
    setBusy(true)
    try {
      const token = `${hex(companyId).slice(0, 6)}.${locationId ? hex(locationId).slice(0, 2) : 'all'}`
      const inbound = `${token}@${FORMS_DOMAIN}`
      const { data, error } = await (supabase as any).from('email_channels').insert({
        company_id: companyId, inbound_address: inbound, provider: 'webform',
        location_id: locationId, label: `Web Form — ${label}`, is_active: true, from_address: null,
      }).select('*').maybeSingle()
      if (!error && data) setRows(r => [...r, data])
    } finally { setBusy(false) }
  }

  const copy = (addr: string) => { navigator.clipboard?.writeText(addr); setCopied(addr); setTimeout(() => setCopied(null), 1500) }

  const sendTest = async (addr: string) => {
    setTesting(addr); setTestMsg(m => ({ ...m, [addr]: '' }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/web-form/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ address: addr }),
      })
      const d = await res.json()
      setTestMsg(m => ({ ...m, [addr]: res.ok ? 'Test submission sent — check your inbox ✓' : (d.error || 'Test failed') }))
    } catch (e: any) { setTestMsg(m => ({ ...m, [addr]: e.message || 'Test failed' })) } finally { setTesting(null) }
  }

  // The rows to show: one per location, plus a company-wide fallback when there
  // are no locations.
  const targets = locations.length > 0
    ? locations.map(l => ({ id: l.id, label: l.label || l.suburb || 'Location' }))
    : [{ id: null as string | null, label: companyName || 'All submissions' }]

  return (
    <div style={{ maxWidth: 760 }}>
      <Link href="/admin/crm-settings/channels" style={{ fontSize: 13, color: 'var(--slate)', textDecoration: 'none' }}>← Back to channels</Link>
      <h1 style={{ ...S.h1, marginTop: 12 }}>Web Form</h1>
      <p style={S.sub}>Give any website form a Colvy address. Point your form's notification email here and every submission lands in your inbox for that location.</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--slate)' }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {targets.map(t => {
            const existing = addressFor(t.id)
            return (
              <div key={t.id || 'all'} style={{ ...S.card, marginBottom: 0, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: existing ? 10 : 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{t.label}</span>
                </div>
                {existing ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <code style={{ flex: 1, fontSize: 13.5, color: 'var(--ink)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{existing.inbound_address}</code>
                      <button onClick={() => copy(existing.inbound_address)} title="Copy" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', color: 'var(--slate)', fontSize: 12, fontWeight: 600 }}>{copied === existing.inbound_address ? 'Copied!' : 'Copy'}</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                      <button onClick={() => sendTest(existing.inbound_address)} disabled={testing === existing.inbound_address} style={{ ...S.btnGhost, padding: '7px 14px', fontSize: 12.5 }}>{testing === existing.inbound_address ? 'Sending…' : 'Send a test'}</button>
                      {testMsg[existing.inbound_address] && <span style={{ fontSize: 12.5, color: testMsg[existing.inbound_address].includes('✓') ? '#059669' : '#dc2626' }}>{testMsg[existing.inbound_address]}</span>}
                    </div>
                  </>
                ) : (
                  <button onClick={() => provision(t.id, t.label)} disabled={busy} style={{ ...S.btnGhost, marginTop: 10 }}>{busy ? 'Generating…' : 'Generate address'}</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h2 style={{ ...S.h2, fontSize: 15 }}>FAQs</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {FAQ.map((f, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '13px 15px', background: '#fff', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{f.q}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" style={{ transform: openFaq === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {openFaq === i && <p style={{ margin: 0, padding: '0 15px 14px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.55 }}>{f.a}</p>}
          </div>
        ))}
      </div>
    </div>
  )
}
