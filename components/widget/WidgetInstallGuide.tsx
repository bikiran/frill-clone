'use client'

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import PlatformMark from './PlatformMark'
import { useWidgetInstall } from './useWidgetInstall'
import { installPrompt, isLocalHost, platforms, seenAgo, type InstallState } from '@/lib/widget-install'

const TAB_KEY = 'colvy_install_tab'

// The chat widget's Install page: whether it's live on their site (checked
// every few seconds while waiting), the code for their platform with "Copy
// code" and "Copy as a prompt" for an AI coding assistant, their widget ID,
// and the sites it has loaded on.
export default function WidgetInstallGuide({ companyId }: { companyId: string | null }) {
  const { data, checking, check } = useWidgetInstall(companyId, s => (s?.state === 'live' ? 60_000 : 5_000))
  const [tab, setTab] = useState('html')
  const [copied, setCopied] = useState('')
  const [nudge, setNudge] = useState(false)
  useEffect(() => { try { const t = localStorage.getItem(TAB_KEY); if (t) setTab(t) } catch {} }, [])
  const pick = (k: string) => { setTab(k); try { localStorage.setItem(TAB_KEY, k) } catch {} }

  const slug = data?.slug || ''
  const list = useMemo(() => (slug ? platforms(slug) : []), [slug])
  const p = list.find(x => x.key === tab) || list[0]

  const copy = async (what: string, text: string) => {
    try { await navigator.clipboard.writeText(text) } catch { return }
    setCopied(what); setTimeout(() => setCopied(c => (c === what ? '' : c)), 1800)
  }
  const checkNow = async () => {
    setNudge(false)
    const d = await check()
    if (d && d.state !== 'live') setNudge(true)
  }

  if (!data) return <p style={{ color: 'var(--slate)', fontSize: 14 }}>Loading…</p>
  if (!slug) return <p style={{ color: 'var(--slate)', fontSize: 14 }}>Set up your Colvy address first (Settings → General) to get your widget code.</p>

  return (
    <div className="wig">
      <style>{`
        .wig-tabs { display: flex; gap: 4px; padding: 5px; background: #f3f4f6; border-radius: 14px 14px 0 0; overflow-x: auto; scrollbar-width: none; }
        .wig-tabs::-webkit-scrollbar { display: none; }
        .wig-tab { display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; height: 36px; padding: 0 13px; border: 1px solid transparent; border-radius: 10px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--slate); cursor: pointer; white-space: nowrap; transition: background .15s, color .15s; }
        .wig-tab:hover { color: var(--ink); background: rgba(255,255,255,.6); }
        .wig-tab[aria-selected="true"] { background: #fff; color: var(--ink); border-color: #e5e7eb; box-shadow: 0 1px 2px rgba(16,24,40,.06); }
        .wig-tab:focus-visible, .wig-btn:focus-visible { outline: 2px solid var(--coral); outline-offset: 1px; }
        .wig-code { margin: 0; padding: 18px 20px; overflow-x: auto; font: 13px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #e5e7eb; white-space: pre; tab-size: 2; }
        .wig-btn { display: inline-flex; align-items: center; gap: 7px; height: 36px; padding: 0 12px; border: none; border-radius: 9px; background: none; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; color: #d1d5db; transition: background .15s, color .15s; }
        .wig-btn:hover { background: rgba(255,255,255,.08); color: #fff; }
        @keyframes wigSpin { to { transform: rotate(360deg); } }
        .wig-spin { animation: wigSpin .8s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .wig-spin { animation: none; } }
      `}</style>

      <Status state={data.state} sites={data.sites} tracking={data.tracking} checking={checking} onCheck={checkNow} nudge={nudge} />

      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '28px 0 4px' }}>Add to your site</h2>
      <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 14px', lineHeight: 1.5 }}>{p.where}</p>

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 16, overflow: 'hidden' }}>
        <div className="wig-tabs" role="tablist" aria-label="Your website’s platform">
          {list.map(x => (
            <button key={x.key} type="button" role="tab" aria-selected={x.key === p.key} className="wig-tab" onClick={() => pick(x.key)}>
              <PlatformMark name={x.key} size={15} />{x.label}
            </button>
          ))}
        </div>
        <div style={{ background: '#0d0f14' }}>
          {p.code ? (
            <pre className="wig-code"><Highlight code={p.code} /></pre>
          ) : (
            <ol style={{ margin: 0, padding: '18px 20px 18px 40px', color: '#e5e7eb', fontSize: 14, lineHeight: 1.7 }}>
              {p.steps?.map(s => <li key={s}>{s}</li>)}
            </ol>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderTop: '1px solid rgba(255,255,255,.08)', flexWrap: 'wrap' }}>
            <button type="button" className="wig-btn" onClick={() => copy('prompt', installPrompt(slug, p))} title="Instructions for an AI coding assistant like Cursor, Claude or ChatGPT">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
              {copied === 'prompt' ? 'Copied: paste it into your AI assistant' : 'Copy as a prompt'}
            </button>
            {p.code ? (
              <button type="button" className="wig-btn" onClick={() => copy('code', p.code!)}>
                <CopyIcon />{copied === 'code' ? 'Copied' : 'Copy code'}
              </button>
            ) : p.key === 'wordpress' ? (
              <a className="wig-btn" href="/downloads/colvy-wordpress.zip" download style={{ textDecoration: 'none' }}>Download the plugin</a>
            ) : (
              <Link className="wig-btn" href="/admin/integrations/shopify" style={{ textDecoration: 'none' }}>Open Shopify settings</Link>
            )}
          </div>
        </div>
      </div>

      <div style={{ margin: '26px 0 0' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Widget ID</h2>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 10px', lineHeight: 1.5 }}>Your workspace’s address. It’s the <code>data-slug</code> in the code, and tells the widget whose chat it is.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 6px 0 16px', height: 48, borderRadius: 12, background: '#f8f9fb', border: '1px solid #eef0f3' }}>
          <code style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{slug}</code>
          <button type="button" onClick={() => copy('slug', slug)} aria-label="Copy widget ID" title="Copy"
            style={{ width: 36, height: 36, borderRadius: 9, border: 'none', background: 'none', color: 'var(--slate)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {copied === 'slug' ? <Check /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {data.sites.length > 0 && (
        <div style={{ margin: '26px 0 0' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Where it’s been seen</h2>
          <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 10px' }}>Sites your chat widget has loaded on.</p>
          <div style={{ border: '1px solid #eef0f3', borderRadius: 12, overflow: 'hidden' }}>
            {data.sites.map((s, k) => {
              const local = isLocalHost(s.host)
              return (
                <div key={s.host} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderTop: k ? '1px solid #f1f2f4' : 'none' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: local ? '#f59e0b' : Date.now() - Date.parse(s.last_seen_at) < 14 * 86_400_000 ? '#22c55e' : '#d1d5db' }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.host}{local && <span style={{ fontWeight: 500, color: 'var(--slate)' }}> · testing</span>}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)' }}>Last seen {seenAgo(s.last_seen_at)}</span>
                  </span>
                  {!local && s.page_url && /^https?:\/\//.test(s.page_url) && (
                    <a href={s.page_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--coral)', textDecoration: 'none', flexShrink: 0 }}>Open ↗</a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p style={{ margin: '24px 0 0', fontSize: 13.5, color: 'var(--slate)' }}>
        Next: <Link href="/admin/crm-settings/chat-widget" style={{ color: 'var(--coral)', fontWeight: 600, textDecoration: 'none' }}>choose its colour, label and position →</Link>
      </p>
    </div>
  )
}

// The status at the top: waiting, live, testing only, or not seen lately.
function Status({ state, sites, tracking, checking, onCheck, nudge }: { state: InstallState; sites: { host: string; last_seen_at: string }[]; tracking: boolean; checking: boolean; onCheck: () => void; nudge: boolean }) {
  const live = state === 'live' ? sites.find(s => !isLocalHost(s.host)) : null
  const others = live ? sites.filter(s => s !== live && !isLocalHost(s.host)).length : 0
  const look: Record<InstallState, { title: string; line: ReactNode; tone: string; icon: ReactNode }> = {
    none: { title: 'Not installed yet', line: 'Waiting for the widget to load on your site. Once it’s added, open your website: it shows here within a few seconds.', tone: '#f97316', icon: <ClockIcon /> },
    testing: { title: 'Working while you test', line: `Seen on ${sites[0]?.host || 'your computer'}. Add it to your live site and it shows here.`, tone: '#f59e0b', icon: <ClockIcon /> },
    stale: { title: 'Not seen lately', line: `Last seen on ${sites.find(s => !isLocalHost(s.host))?.host} ${seenAgo(sites.find(s => !isLocalHost(s.host))?.last_seen_at || '')}. Is it still on your site?`, tone: '#f59e0b', icon: <ClockIcon /> },
    live: { title: `Live on ${live?.host || 'your site'}`, line: <>Last seen {seenAgo(live?.last_seen_at || '')}{others ? <>, and on {others} other site{others === 1 ? '' : 's'}</> : null}. Visitors can chat with you.</>, tone: '#16a34a', icon: <Check size={20} /> },
  }
  const L = look[state]
  if (!tracking) return null
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 14, background: state === 'live' ? '#f0fdf4' : '#f8f9fb', border: `1px solid ${state === 'live' ? '#bbf7d0' : '#eef0f3'}` }}>
      <span style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: state === 'live' ? '#16a34a' : 'var(--slate)', background: state === 'live' ? '#dcfce7' : '#fff', border: state === 'live' ? 'none' : '1px solid #e5e7eb' }}>
        {L.icon}
        {state !== 'live' && <span style={{ position: 'absolute', top: 1, right: 1, width: 9, height: 9, borderRadius: '50%', background: L.tone, border: '2px solid #f8f9fb' }} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{L.title}</span>
        <span style={{ display: 'block', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5, marginTop: 1 }}>
          {L.line}
          {nudge && state !== 'live' && <Fragment> Not there yet: open a page of your site in another tab, then check again.</Fragment>}
        </span>
      </span>
      <button type="button" onClick={onCheck} disabled={checking}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0, height: 38, padding: '0 14px', borderRadius: 999, border: '1px solid #e5e7eb', background: '#fff', font: 'inherit', fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', cursor: checking ? 'default' : 'pointer' }}>
        <svg className={checking ? 'wig-spin' : undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></svg>
        {checking ? 'Checking…' : 'Check now'}
      </button>
    </div>
  )
}

// Just enough colour to read code by: tags, strings, keywords, comments.
function Highlight({ code }: { code: string }) {
  const re = /(\/\/[^\n]*)|("[^"\n]*"|'[^'\n]*')|(<\/?[A-Za-z][\w.-]*|\/?>)|\b(import|from|export|default|const|return|if|true|async)\b/g
  const out: ReactNode[] = []
  let at = 0, m: RegExpExecArray | null, k = 0
  while ((m = re.exec(code))) {
    if (m.index > at) out.push(code.slice(at, m.index))
    const color = m[1] ? '#6b7280' : m[2] ? '#a7f3a0' : m[3] ? '#7cc4ff' : '#c4a7ff'
    out.push(<span key={k++} style={{ color }}>{m[0]}</span>)
    at = m.index + m[0].length
  }
  out.push(code.slice(at))
  return <>{out}</>
}

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
)
const Check = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
)
const ClockIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
