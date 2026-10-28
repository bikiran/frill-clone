'use client'

import { useState } from 'react'
import MarketingNav from '@/components/MarketingNav'
import MarketingFooter from '@/components/MarketingFooter'
import { TESTIMONIALS, ratingSummary, type Testimonial } from '@/lib/testimonials'

// What customers say about Colvy (lib/testimonials): only real quotes from
// people who agreed to be named, with the rating they gave. With none yet the
// page says so plainly. "Add yours" emails the team (/api/contact-sales,
// source "testimonial"); a quote goes up once they've confirmed the wording.

const CORAL = '#ff6a4d'
const STAR = 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z'

const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
  <span className="tm-stars" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map(i => <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={i <= n ? '#f5a524' : '#e4e4e7'} /></svg>)}
  </span>
)
const initials = (name: string) => name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
const when = (d: string) => { const t = new Date(d + 'T00:00:00'); return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) }

function Card({ t }: { t: Testimonial }) {
  return (
    <figure className="tm-card">
      <div className="tm-card-top">
        {t.logo ? <img src={t.logo} alt={t.company} className="tm-logo" /> : <span className="tm-co">{t.company}</span>}
        <Stars n={t.rating} />
      </div>
      <blockquote>{t.quote}</blockquote>
      <figcaption>
        {t.photo ? <img src={t.photo} alt="" className="tm-av" /> : <span className="tm-av tm-av-ini">{initials(t.name)}</span>}
        <span><b>{t.name}</b><small>{[t.role, t.company].filter(Boolean).join(', ')}{t.date ? ` · ${when(t.date)}` : ''}</small></span>
      </figcaption>
    </figure>
  )
}

export default function TestimonialsPage() {
  const [dark, setDark] = useState(false)
  const summary = ratingSummary()

  // "Add yours"
  const [f, setF] = useState({ name: '', company: '', role: '', email: '', quote: '' })
  const [rating, setRating] = useState(5)
  const [agree, setAgree] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF(v => ({ ...v, [k]: e.target.value }))
  const ready = f.name.trim() && f.company.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim()) && f.quote.trim().length >= 10 && agree
  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ready || state === 'sending') return
    setState('sending'); setError('')
    try {
      const res = await fetch('/api/contact-sales', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: f.name.trim(), email: f.email.trim(), company: f.company.trim(), source: 'testimonial',
          message: `Testimonial for colvy.com\n\nRating: ${rating}/5\nName: ${f.name.trim()}\nRole: ${f.role.trim() || '-'}\nCompany: ${f.company.trim()}\n\n"${f.quote.trim()}"\n\nThey agreed to their name, role, company and these words being shown on colvy.com.`,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Couldn’t send that. Please email support@colvy.com.')
      setState('sent')
    } catch (err: any) { setError(err?.message || 'Couldn’t send that.'); setState('idle') }
  }

  return (
    <div className={`tm${dark ? ' dark' : ''}`}>
      <style>{TM_CSS}</style>
      <MarketingNav dark={dark} onToggleDark={() => setDark(v => !v)} />

      <header className="tm-hero">
        <p className="tm-eyebrow">Testimonials</p>
        <h1>What customers say about Colvy</h1>
        <p className="tm-lede">Every quote here is from a person who agreed to be named, with the rating they gave. Nothing is averaged in from other sites.</p>
        {summary && (
          <span className="tm-summary"><Stars n={Math.round(summary.average)} size={18} /><b>{summary.average.toFixed(1)}</b><span>from {summary.count} review{summary.count === 1 ? '' : 's'}</span></span>
        )}
      </header>

      <section className="tm-wall">
        {TESTIMONIALS.length > 0 ? (
          <div className="tm-grid">{TESTIMONIALS.map(t => <Card key={t.name + t.date} t={t} />)}</div>
        ) : (
          <div className="tm-empty">
            <Stars n={0} size={22} />
            <h2>No reviews here yet</h2>
            <p>Colvy is new, and we&rsquo;d rather show nothing than make something up. The first quotes from real customers will appear here.</p>
          </div>
        )}
      </section>

      <section className="tm-add" id="add">
        <div className="tm-add-card">
          <h2>Use Colvy? Add yours.</h2>
          <p>A sentence and a rating out of five, with your name and company. We&rsquo;ll email you the wording to confirm, and it goes up here once you do.</p>
          {state === 'sent' ? (
            <div className="tm-sent" role="status">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              Thank you! We&rsquo;ll be in touch at {f.email.trim()} to confirm the wording.
            </div>
          ) : (
            <form onSubmit={send} className="tm-form">
              <div className="tm-row">
                <label><span>Your name *</span><input value={f.name} onChange={set('name')} autoComplete="name" required /></label>
                <label><span>Company *</span><input value={f.company} onChange={set('company')} autoComplete="organization" required /></label>
              </div>
              <div className="tm-row">
                <label><span>Your role</span><input value={f.role} onChange={set('role')} placeholder="Owner, Support lead…" autoComplete="organization-title" /></label>
                <label><span>Email *</span><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required /><small>Only to confirm with you. Never shown.</small></label>
              </div>
              <div className="tm-rate"><span>Your rating</span>
                <span role="radiogroup" aria-label="Rating out of 5">
                  {[1, 2, 3, 4, 5].map(i => (
                    <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${i} star${i === 1 ? '' : 's'}`} onClick={() => setRating(i)}>
                      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d={STAR} fill={i <= rating ? '#f5a524' : '#e4e4e7'} /></svg>
                    </button>
                  ))}
                </span>
              </div>
              <label><span>In your words *</span><textarea value={f.quote} onChange={set('quote')} maxLength={600} rows={4} placeholder="What has Colvy changed for you?" required /><small>{f.quote.length}/600</small></label>
              <label className="tm-agree"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /> You can show my name, role, company and these words on colvy.com.</label>
              {error && <p className="tm-error" role="alert">{error}</p>}
              <button type="submit" className="tm-send" disabled={!ready || state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send it to the team'}</button>
            </form>
          )}
        </div>
      </section>

      <MarketingFooter dark={dark} />
    </div>
  )
}

const TM_CSS = `
.tm{--ink:#0f1119;--sub:rgba(15,17,25,.6);--line:rgba(15,17,25,.08);--card:#fff;--soft:#f6f6f8;min-height:100vh;background:#fff;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Inter,sans-serif;transition:background .3s,color .3s}
.tm.dark{--ink:#f4f5fb;--sub:rgba(244,245,251,.62);--line:rgba(255,255,255,.09);--card:#13141c;--soft:#171826;background:#0a0b12}
.tm button::before{display:none}
.tm-hero{max-width:860px;margin:0 auto;padding:clamp(110px,14vw,160px) 24px 36px;text-align:center}
.tm-eyebrow{margin:0 0 14px;font-size:15px;font-weight:700;color:${CORAL}}
.tm h1{margin:0 0 18px;font-size:clamp(36px,5.6vw,64px);font-weight:800;letter-spacing:-.035em;line-height:1.05}
.tm-lede{margin:0 auto;max-width:620px;font-size:clamp(16px,1.8vw,19px);line-height:1.6;color:var(--sub)}
.tm-summary{display:inline-flex;align-items:center;gap:10px;margin-top:28px;padding:10px 18px;border-radius:999px;box-shadow:0 0 0 1px var(--line);font-size:15px;color:var(--sub)}
.tm-summary b{font-size:16px;color:var(--ink)}
.tm-stars{display:inline-flex;gap:2px;vertical-align:middle}
.tm-wall{max-width:1080px;margin:0 auto;padding:24px 24px 40px}
.tm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr));gap:20px}
.tm-card{margin:0;padding:30px 32px;border-radius:24px;background:var(--card);box-shadow:0 0 0 1px var(--line),0 1px 2px rgba(16,24,40,.04)}
.tm-card-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:22px}
.tm-logo{height:34px;max-width:160px;object-fit:contain}
.tm-co{font-size:18px;font-weight:800;letter-spacing:-.02em}
.tm-card blockquote{margin:0 0 26px;font-size:19px;font-weight:600;line-height:1.55;letter-spacing:-.01em}
.tm-card figcaption{display:flex;align-items:center;gap:14px}
.tm-card figcaption span{display:flex;flex-direction:column;gap:2px}
.tm-card figcaption b{font-size:15px}
.tm-card figcaption small{font-size:13px;color:var(--sub)}
.tm-av{width:46px;height:46px;border-radius:50%;object-fit:cover;flex-shrink:0}
.tm-av-ini{display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,${CORAL} 14%,transparent);color:${CORAL};font-weight:800}
.tm-empty{max-width:620px;margin:0 auto;padding:44px 32px;border-radius:24px;border:1.5px dashed var(--line);text-align:center}
.tm-empty h2{margin:14px 0 8px;font-size:22px;font-weight:800;letter-spacing:-.02em}
.tm-empty p{margin:0;font-size:15.5px;line-height:1.6;color:var(--sub)}
.tm-add{padding:40px 24px clamp(64px,9vw,110px)}
.tm-add-card{max-width:880px;margin:0 auto;padding:clamp(28px,4vw,48px);border-radius:28px;background:var(--soft)}
.tm-add-card>h2{margin:0 0 10px;text-align:center;font-size:clamp(26px,3.4vw,34px);font-weight:800;letter-spacing:-.03em}
.tm-add-card>p{max-width:640px;margin:0 auto 28px;text-align:center;font-size:16px;line-height:1.6;color:var(--sub)}
.tm-form{display:flex;flex-direction:column;gap:16px}
.tm-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.tm-form label{display:flex;flex-direction:column;gap:7px;font-size:14px;font-weight:600}
.tm-form input:not([type=checkbox]),.tm-form textarea{width:100%;box-sizing:border-box;padding:13px 16px;border:1.5px solid transparent;border-radius:14px;background:var(--card);font:inherit;font-size:15.5px;font-weight:400;color:var(--ink);outline:none;box-shadow:0 0 0 1px var(--line)}
.tm-form textarea{resize:vertical;min-height:110px}
.tm-form input:focus,.tm-form textarea:focus{border-color:${CORAL}!important;box-shadow:0 0 0 4px color-mix(in srgb,${CORAL} 16%,transparent)!important}
.tm-form small{font-size:12.5px;font-weight:500;color:var(--sub)}
.tm-rate{display:flex;align-items:center;gap:14px;font-size:14px;font-weight:600}
.tm-rate button{padding:2px;border:none;background:none;cursor:pointer;line-height:0;transition:transform .15s cubic-bezier(.22,1,.36,1)}
.tm-rate button:hover{transform:scale(1.15)}
.tm-form label.tm-agree{flex-direction:row;align-items:flex-start;gap:10px;font-weight:500;color:var(--sub);cursor:pointer}
.tm-agree input{margin-top:3px;accent-color:${CORAL}}
.tm-send{align-self:flex-start;height:52px;padding:0 28px;border:none;border-radius:999px;background:var(--ink);color:var(--card);font:inherit;font-size:15.5px;font-weight:700;cursor:pointer;transition:opacity .2s,transform .15s}
.tm-send:hover:not(:disabled){transform:translateY(-1px)}
.tm-send:disabled{opacity:.35;cursor:default}
.tm-error{margin:0;padding:11px 14px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:14px}
.tm-sent{display:flex;align-items:center;justify-content:center;gap:10px;padding:18px;border-radius:16px;background:#ecfdf3;color:#067647;font-size:15.5px;font-weight:600;text-align:center}
@media (max-width:640px){.tm-row{grid-template-columns:1fr}.tm-card{padding:24px}.tm-card blockquote{font-size:17px}}
`
