'use client'

// The SMS composer's Checks card: everything worth fixing before sending,
// errors first, then things worth a look, then tips, then what's already fine.

import type { SmsCheck } from '@/lib/sms-checks'

const RANK = { error: 0, warn: 1, tip: 2 } as const

export default function SmsChecksCard({ checks }: { checks: SmsCheck[] }) {
  const open = checks.filter(c => !c.ok)
  const issues = open.filter(c => c.level !== 'tip').length
  const sorted = [...checks].sort((a, b) => Number(a.ok) - Number(b.ok) || RANK[a.level] - RANK[b.level])
  return (
    <div className="sck">
      <style>{CSS}</style>
      <div className="sck-h">
        <b>Checks</b>
        <span className={`sck-badge${issues ? ' bad' : ''}`}>{issues ? `${issues} to fix` : 'Ready'}</span>
      </div>
      <ul>
        {sorted.map(c => (
          <li key={c.id} className={c.ok ? 'ok' : c.level}>
            <span className="sck-ic" aria-hidden>{c.ok ? '✓' : c.level === 'tip' ? '✦' : '!'}</span>
            <span className="sck-t"><b>{c.title}</b><small>{c.detail}</small></span>
            {!c.ok && c.level === 'tip' && <span className="sck-tag">Tip</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

const CSS = `
.sck{border-radius:20px;background:#fff;padding:16px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04)}
.sck-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.sck-h b{font-size:14.5px;color:var(--ink)}
.sck-badge{height:24px;padding:0 10px;border-radius:999px;background:#dcfce7;color:#15803d;font-size:12px;font-weight:700;line-height:24px}
.sck-badge.bad{background:#fef3c7;color:#b45309}
.sck ul{list-style:none;margin:0;padding:0}
.sck li{display:flex;align-items:flex-start;gap:10px;padding:8px 0}.sck li+li{border-top:1px solid #f4f4f5}
.sck-ic{width:20px;height:20px;flex-shrink:0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;margin-top:1px}
.sck li.ok .sck-ic{background:#dcfce7;color:#15803d}.sck li.error .sck-ic{background:#fee2e2;color:#b91c1c}
.sck li.warn .sck-ic{background:#fef3c7;color:#b45309}.sck li.tip .sck-ic{background:#e0ecff;color:#1d4ed8}
.sck-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}.sck-t b{font-size:13px;color:var(--ink)}.sck-t small{font-size:12px;line-height:1.4;color:#71717a}
.sck li.ok .sck-t b{color:#52525b;font-weight:600}
.sck-tag{flex-shrink:0;height:20px;padding:0 7px;border-radius:999px;background:#f4f4f5;color:#71717a;font-size:11px;font-weight:700;line-height:20px}
[data-theme="dark"] .sck{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
[data-theme="dark"] .sck li+li{border-color:#2a2a2e}[data-theme="dark"] .sck-tag{background:#2a2a2e}
[data-theme="dark"] .sck li.ok .sck-t b{color:#d4d4d8}
`
