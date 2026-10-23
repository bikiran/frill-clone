'use client'

import FeatureIcon from '@/components/FeatureIcon'
import { AGENTS, AGENT_PLANS_LABEL, CONTROL_STEPS } from '@/lib/agents-marketing'

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

// "Your AI team": the five agents as a roster, each with the first thing it
// checks, then how much they do on their own. Used on the landing page and the
// compare pages; the full story is on /ai-agents.
export default function AgentTeamBand({ dark = false, title = 'Five AI agents. One team that never clocks off.', id }: { dark?: boolean; title?: string; id?: string }) {
  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.6)' : 'rgba(15,17,25,0.58)'
  const line = dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,17,25,0.09)'
  const card = dark ? 'rgba(255,255,255,0.035)' : '#ffffff'
  return (
    <section id={id} style={{ background: dark ? '#0a0b10' : '#f7f6f3', padding: 'clamp(64px, 9vw, 110px) 24px', overflow: 'hidden' }}>
      <style>{`
        .cv-agent{transition:transform .25s cubic-bezier(0.16,1,0.3,1), border-color .25s}
        .cv-agent:hover{transform:translateY(-4px)}
        @media (prefers-reduced-motion: reduce){.cv-agent{transition:none}.cv-agent:hover{transform:none}}
      `}</style>
      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 34 }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, marginBottom: 14 }}>AI agents · {AGENT_PLANS_LABEL}</div>
            <h2 style={{ fontSize: 'clamp(30px, 4.6vw, 54px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: 0, color: text }}>{title}</h2>
          </div>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: muted, margin: 0, maxWidth: 400 }}>They look things up before they answer, start out as drafts for your team, and hand over anything that needs a person.</p>
        </div>

        <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
          {AGENTS.map((a, i) => (
            <li key={a.key}>
              <a href={`/ai-agents#${a.key}`} className="cv-agent" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', padding: 20, borderRadius: 20, border: `1px solid ${line}`, background: card, color: text, textDecoration: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                  <span style={{ width: 36, height: 36, borderRadius: 11, background: a.color + '1f', color: a.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><FeatureIcon name={a.icon} color={a.color} size={18} /></span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, color: muted }}>{String(i + 1).padStart(2, '0')}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', marginBottom: 6 }}>{a.name}</div>
                <p style={{ fontSize: 14, lineHeight: 1.5, color: muted, margin: '0 0 16px', flex: 1 }}>{a.role}</p>
                <div style={{ fontFamily: MONO, fontSize: 11.5, lineHeight: 1.5, color: muted, borderTop: `1px dashed ${line}`, paddingTop: 12 }}>
                  <span style={{ color: a.color }}>✓</span> {a.example.checks[0]}
                </div>
              </a>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '14px 18px', borderRadius: 16, border: `1px solid ${line}`, background: card }}>
          {CONTROL_STEPS.map((s, i) => (
            <span key={s.title} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 14, color: text }}>
              {i > 0 && <span aria-hidden style={{ color: muted }}>→</span>}
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted }}>{s.tag}</span>
              <b style={{ fontWeight: 700 }}>{s.title}</b>
            </span>
          ))}
          <a href="/ai-agents" style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: '#ff6a4d', textDecoration: 'none', whiteSpace: 'nowrap' }}>Meet the agents →</a>
        </div>
      </div>
    </section>
  )
}
