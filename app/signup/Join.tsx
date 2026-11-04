'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import Turnstile, { TurnstileHandle, TURNSTILE_SITE_KEY } from '@/components/Turnstile'
import { COLVY_ICON, I, ICONS, SETUP_CSS, useSetupTheme } from '@/components/setup/SetupKit'
import { EMAIL_RE, MAIL, firstFromEmail, EyeIcon, EmailChip, PhoneBand, useWorkspaceLook, AUTH_CSS } from '@/components/setup/AuthKit'

type Company = { id: string; name: string; slug: string }
type Idea = { id: string; title: string; votes: number }

const UP = <polyline points="18 15 12 9 6 15" />

// Joining a workspace's public board (its own address, e.g. roxy.colvy.com),
// in sign-in's style. The preview is the board itself: its real top ideas,
// your name on a member card as you type it, and your vote landing on the
// top idea; once you join, the confirmation email lands ("Sent", then
// "Delivered"). Phones get the same as a strip under the logo.
export default function JoinWorkspace({ company }: { company: Company }) {
  const { dark } = useSetupTheme()
  const look = useWorkspaceLook()
  const color = look.color
  const logo = look.logo
  const wsName = company.name

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [sent, setSent] = useState(false)
  const [resent, setResent] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [humanToken, setHumanToken] = useState('')
  const humanRef = useRef<TurnstileHandle>(null)
  const waitingForHuman = !!TURNSTILE_SITE_KEY && !humanToken

  // The board's top public ideas (none on a private board, or none yet:
  // then plain placeholders, never made-up ones).
  const [ideas, setIdeas] = useState<Idea[] | null>(null)
  useEffect(() => {
    let live = true
    ;(supabase as any).from('ideas').select('id, title, votes, is_private').eq('company_id', company.id)
      .order('votes', { ascending: false }).limit(12)
      .then(({ data }: any) => {
        if (!live) return
        const open = (data || []).filter((i: any) => !i.is_private && String(i.title || '').trim())
        setIdeas(open.slice(0, 3).map((i: any) => ({ id: String(i.id), title: String(i.title).replace(/^\[[^\]]+\]\s*/, ''), votes: Number(i.votes) || 0 })))
      }, () => { if (live) setIdeas([]) })
    return () => { live = false }
  }, [company.id])

  // "Sent" turns to "Delivered" a moment after the email lands.
  const [delivered, setDelivered] = useState(false)
  useEffect(() => {
    setDelivered(false)
    if (!sent) return
    const t = setTimeout(() => setDelivered(true), 1500)
    return () => clearTimeout(t)
  }, [sent, resent])

  const addr = email.trim()
  const emailOk = EMAIL_RE.test(addr)
  const first = name.trim().split(/\s+/)[0] || (emailOk ? firstFromEmail(addr) : '')
  const initial = (name.trim() || addr || '?')[0].toUpperCase()
  const passOk = password.length >= 6
  const voted = !!name.trim() || sent

  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setNotice('')
    if (!passOk) { setError('Password must be at least 6 characters'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, password, name: name.trim() || null, companyId: company.id, turnstileToken: humanToken }),
      })
      const data = await res.json()
      if (!res.ok) { humanRef.current?.reset(); throw new Error(data.error || 'Signup failed') }
      localStorage.setItem('pending_company_join', JSON.stringify({ userId: data.userId, companyId: company.id, email: addr, role: 'viewer' }))
      track('signup_submitted', { via: 'email', joining: true })
      if (data.emailSent === false) setNotice('Your account is ready, but the email didn’t go out. Tap “Send it again”.')
      setSent(true)
    } catch (err: any) { setError(err.message) }
    setLoading(false)
  }

  // Another confirmation email (the route checks the password first).
  const resend = async () => {
    setResending(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/auth/send-confirmation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, password, companyId: company.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'The email couldn’t be sent. Please try again.')
      if (data.alreadyConfirmed) setNotice('That email is already confirmed. You can sign in.')
      else setResent(n => n + 1)
    } catch (err: any) { setError(err.message) }
    setResending(false)
  }

  const brandMark = (cls: string) => logo
    ? <span className={cls}><img src={logo} alt="" /></span>
    : <span className={`${cls} ini`}>{(wsName[0] || '?').toUpperCase()}</span>
  const ticks = <span className="jn-ticks">{I(ICONS.check, 12, 3)}{delivered && I(ICONS.check, 12, 3)}</span>
  const status = <em className={`jn-st${delivered ? ' ok' : ''}`} key={(delivered ? 'd' : 's') + resent}>{ticks}{delivered ? 'Delivered' : 'Sent'}</em>

  // The top ideas, the first one taking your vote once there's a name.
  const ideaRows = (max: number) => {
    const list = ideas || []
    if (!list.length) {
      return [62, 48, 70].slice(0, max).map((w, i) => (
        <div key={i} className="jn-idea ghost"><span className="jn-vote">{I(UP, 14, 2.4)}<b>&nbsp;</b></span><span className="nw-bar" style={{ width: `${w}%` }} /></div>
      ))
    }
    return list.slice(0, max).map((idea, i) => {
      const mine = i === 0 && voted
      const n = idea.votes + (mine ? 1 : 0)
      return (
        <div key={idea.id} className="jn-idea" style={{ animationDelay: `${i * 80}ms` }}>
          <span className={`jn-vote${mine ? ' on' : ''}`}>{I(UP, 14, 2.4)}<b key={n}>{n}</b></span>
          <span className="jn-idea-t">{idea.title}</span>
          {mine && <span className="jn-you" key={initial}>{initial}</span>}
        </div>
      )
    })
  }

  const mailCard = (
    <div className="jn-mail" key={'mail' + resent}>
      <div className="jn-mail-head">
        <img src={COLVY_ICON} alt="" />
        <span><b>Colvy</b><small>to {addr}</small></span>
        <em>now</em>
      </div>
      <h4>Confirm your email address</h4>
      <p>Tap the button to finish joining <b>{wsName}</b>.</p>
      <span className="jn-mail-btn">{I(ICONS.check, 13, 2.6)}Confirm and join</span>
      <div className="jn-mail-foot">{status}</div>
    </div>
  )

  return (
    <div className={`nw nw-form${dark ? ' dark' : ''} si jn`} style={{ ['--c' as string]: color } as React.CSSProperties}>
      <style>{SETUP_CSS + AUTH_CSS + JN_CSS}</style>

      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand jn-brand">{brandMark('jn-mark')}<span>{wsName}</span></div>
          <a href="/signin" className="nw-top-link si-top-link">Sign in</a>
        </div>

        {/* Phones: the board's top ideas taking your vote, then the email landing. */}
        <PhoneBand corner={<EmailChip email={email} />} title={sent ? 'Check your inbox' : first ? `Hi, ${first} 👋` : 'Top ideas'}>
          {sent ? (
            <div className="jn-bmail" key={'bm' + resent}>
              <img src={COLVY_ICON} alt="" />
              <span><b>Confirm your email</b><small>Colvy · to {addr}</small></span>
              {status}
            </div>
          ) : <div className="jn-bideas">{ideaRows(2)}</div>}
        </PhoneBand>

        <div className="nw-body">
          <div key={sent ? 'sent' : 'form'} className="nw-step fwd">
            {sent ? (
              <div className="si-sent">
                <span className="si-sent-ic">{I(MAIL, 26)}</span>
                <h1>Check your email</h1>
                <p className="nw-sub">We sent a link to <b>{addr}</b>. Open it to finish joining <b>{wsName}</b>.</p>
                {notice && <div role="status" className="jn-notice">{notice}</div>}
                {error && <div role="alert" className="nw-error si-error">{error}</div>}
                <p className="jn-hint">Not there? Check your spam folder, or send it again.</p>
                <div className="si-sent-btns">
                  <button type="button" className="nw-back" onClick={resend} disabled={resending}>{resending ? <span className="nw-spin" /> : I(MAIL, 15)}{resending ? 'Sending…' : 'Send it again'}</button>
                  <button type="button" className="nw-back" onClick={() => { setSent(false); setError(''); setNotice('') }}>{I(ICONS.back, 15)}Use a different email</button>
                </div>
              </div>
            ) : (<>
              <h1>Join {wsName}</h1>
              <p className="nw-sub">Vote on ideas and see what&rsquo;s coming next.</p>

              <form onSubmit={join}>
                <label className="si-field"><span>Your name</span>
                  <input className="nw-input" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" autoComplete="name" autoFocus />
                </label>
                <label className="si-field"><span>Email</span>
                  <input className="nw-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" autoComplete="email" />
                </label>
                <div className="si-field">
                  <span><label htmlFor="jn-password">Password</label><em className={`jn-len${passOk ? ' ok' : ''}`}>{passOk && I(ICONS.check, 12, 3)}6+ characters</em></span>
                  <div className="nw-input nw-domain si-pass">
                    <input id="jn-password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Choose a password" autoComplete="new-password" />
                    <button type="button" className="si-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                      <EyeIcon off={showPassword} />
                    </button>
                  </div>
                </div>

                <Turnstile ref={humanRef} onToken={setHumanToken} action="join" />
                {error && <div role="alert" className="nw-error si-error">{error}</div>}

                <button type="submit" className="nw-next si-submit" disabled={loading || waitingForHuman}>
                  {loading ? <><span className="nw-spin si-spin" />Joining…</> : waitingForHuman ? 'Checking…' : <>Join {wsName}{I(ICONS.next, 15)}</>}
                </button>
              </form>
            </>)}
          </div>
        </div>

        <div className="nw-foot">
          <p className="nw-legal si-new">Already a member? <a href="/signin">Sign in</a></p>
        </div>
      </div>

      {/* ── The live preview: the board you're joining ─────────────────── */}
      <div className="nw-panel" aria-hidden="true">
        <EmailChip email={email} />
        <div className="nw-app jn-app">
          <div className="jn-bar">
            {brandMark('jn-bar-logo')}
            <b>{wsName}</b>
            <span className="jn-tabs"><span className="on">Ideas</span><span>Roadmap</span><span>Updates</span></span>
          </div>
          <div className="jn-feed">
            <div className={`jn-me${name.trim() ? ' named' : ''}`}>
              <span className="jn-av" key={initial}>{initial === '?' ? I(ICONS.people, 18) : initial}</span>
              <span className="jn-me-tx">
                {name.trim() ? <b key="n">{name.trim()}</b> : <span className="nw-bar" style={{ width: '46%', height: 13 }} />}
                {emailOk ? <small key="e">{addr}</small> : <span className="nw-bar thin" style={{ width: '64%' }} />}
              </span>
              {name.trim() && <span className="jn-badge">{sent ? 'Almost in' : 'New member'}</span>}
            </div>
            {sent && mailCard}
            <div className="jn-label">Top ideas</div>
            {ideaRows(3)}
          </div>
        </div>
      </div>
    </div>
  )
}

const JN_CSS = `
.jn-brand{min-width:0}
.jn-brand>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jn-mark{width:32px;height:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border-radius:9px}
.jn-mark img{width:100%;height:100%;object-fit:contain}
.jn-mark.ini,.jn-bar-logo.ini{background:var(--c);color:#fff;font-size:15px;font-weight:800}
.jn-len{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:12.5px;font-weight:600;color:#a1a1aa;transition:color .2s ease}
.jn-len.ok{color:#16a34a}
.jn-hint{margin:-8px 0 16px;font-size:13.5px;color:#8e8e93}
.jn-notice{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:#fffbeb;color:#92400e;font-size:13.5px}
/* The board window. */
.jn-app{flex-direction:column}
.jn-bar{display:flex;align-items:center;gap:10px;padding:16px calc(18px + 7%) 13px 18px;border-bottom:1px solid #f0f0f2}
.jn-bar-logo{width:34px;height:34px;flex-shrink:0;border-radius:10px;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.jn-bar-logo img{width:100%;height:100%;object-fit:contain}
.jn-bar-logo.ini{box-shadow:none}
.jn-bar b{min-width:0;font-size:15px;font-weight:750;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jn-tabs{display:flex;gap:3px;margin-left:auto;flex-shrink:0}
.jn-tabs span{padding:6px 11px;border-radius:999px;font-size:12.5px;font-weight:600;color:#8e8e93}
.jn-tabs span.on{background:color-mix(in srgb,var(--c) 12%,#fff);color:var(--c)}
.jn-feed{flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;padding:16px calc(18px + 7%) 16px 18px;overflow:hidden}
.jn-me{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:#fafafa;box-shadow:0 0 0 1px rgba(0,0,0,.05);transition:box-shadow .3s ease,background-color .3s ease}
.jn-me.named{background:#fff;box-shadow:0 0 0 1px color-mix(in srgb,var(--c) 30%,transparent),0 10px 24px -14px color-mix(in srgb,var(--c) 60%,transparent)}
.jn-av{width:40px;height:40px;border-radius:50%;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--c) 14%,#fff);color:var(--c);font-size:16px;font-weight:800;animation:nwFlip .55s cubic-bezier(.22,1,.36,1) both}
.jn-me-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.jn-me-tx b{font-size:14.5px;font-weight:700;color:#18181b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:nwFade .3s ease both}
.jn-me-tx small{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:nwFade .3s ease both}
.jn-badge{flex-shrink:0;padding:4px 10px;border-radius:999px;background:var(--c);color:#fff;font-size:11.5px;font-weight:700;animation:nwPopIn .45s cubic-bezier(.2,.9,.3,1.3) both}
.jn-label{margin:4px 2px -2px;font-size:11.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#a1a1aa}
.jn-idea{display:flex;align-items:center;gap:12px;padding:9px 12px 9px 9px;border-radius:14px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06);animation:jnIn .5s cubic-bezier(.22,1,.36,1) both}
@keyframes jnIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.jn-idea.ghost .nw-bar{flex:none}
.jn-vote{width:42px;height:46px;flex-shrink:0;border-radius:12px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;background:#f4f4f5;color:#52525b;transition:background-color .35s ease,color .35s ease,transform .45s cubic-bezier(.2,.9,.3,1.4)}
.jn-vote b{font-size:13px;font-weight:750;line-height:1.1;animation:nwFade .35s ease both}
.jn-vote.on{background:var(--c);color:#fff;transform:scale(1.06)}
.jn-idea-t{flex:1;min-width:0;font-size:14px;font-weight:600;line-height:1.35;color:#27272a;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.jn-you{width:24px;height:24px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--c);color:#fff;font-size:11px;font-weight:800;box-shadow:0 0 0 2px #fff;animation:nwPopIn .45s cubic-bezier(.2,.9,.3,1.3) both}
/* The confirmation email, as it lands. */
.jn-mail{border-radius:18px;padding:14px 16px 12px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 14px 32px -14px rgba(0,0,0,.25);animation:jnMail .7s cubic-bezier(.2,.9,.3,1.15) .2s both}
@keyframes jnMail{from{opacity:0;transform:translateY(18px) rotate(-1.5deg) scale(.96)}to{opacity:1;transform:none}}
.jn-mail-head{display:flex;align-items:center;gap:10px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #f0f0f2}
.jn-mail-head img{width:30px;height:30px;border-radius:9px}
.jn-mail-head span{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.jn-mail-head b{font-size:13.5px;color:#18181b}
.jn-mail-head small{font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jn-mail-head em{font-style:normal;font-size:11.5px;color:#a1a1aa}
.jn-mail h4{margin:0 0 4px;font-size:15px;font-weight:750;color:#18181b}
.jn-mail p{margin:0 0 12px;font-size:13px;line-height:1.45;color:#71717a}
.jn-mail p b{color:#3f3f46}
.jn-mail-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:999px;background:var(--c);color:#fff;font-size:13px;font-weight:650}
.jn-mail-foot{display:flex;justify-content:flex-end;margin-top:8px}
.jn-st{display:inline-flex;align-items:center;font-style:normal;font-size:11.5px;font-weight:600;color:#a1a1aa;animation:nwFade .35s ease both}
.jn-st.ok{color:#16a34a}
.jn-ticks{display:inline-flex;margin-right:4px}
.jn-ticks svg+svg{margin-left:-7px}
/* Phones: the strip. */
/* The next idea peeks in under the first, fading out rather than cut. */
.jn-bideas{display:flex;flex-direction:column;gap:6px;height:72px;overflow:hidden;-webkit-mask-image:linear-gradient(#000 64%,transparent 98%);mask-image:linear-gradient(#000 64%,transparent 98%)}
.au-band .jn-idea{padding:5px 8px 5px 5px;gap:10px;border-radius:12px}
.au-band .jn-vote{width:34px;height:38px;border-radius:10px}
.au-band .jn-vote b{font-size:12px}
.au-band .jn-idea-t{font-size:13px;-webkit-line-clamp:1}
.au-band .jn-you{width:20px;height:20px;font-size:10px}
.jn-bmail{display:flex;align-items:center;gap:10px;height:54px;padding:0 12px;box-sizing:border-box;border-radius:16px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 8px 20px -12px rgba(0,0,0,.25);animation:jnMail .7s cubic-bezier(.2,.9,.3,1.15) .15s both}
.jn-bmail img{width:30px;height:30px;border-radius:9px;flex-shrink:0}
.jn-bmail>span{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.jn-bmail b{font-size:13.5px;font-weight:700;color:#18181b}
.jn-bmail small{font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (max-width:900px){
  .jn .au-band ~ .nw-body .nw-sub{margin:6px 0 14px}
}
.nw.dark .jn-bar{border-color:#26262a}
.nw.dark .jn-bar b,.nw.dark .jn-me-tx b,.nw.dark .jn-mail h4,.nw.dark .jn-mail-head b,.nw.dark .jn-bmail b{color:#f4f4f5}
.nw.dark .jn-me{background:#1b1b1e;box-shadow:0 0 0 1px rgba(255,255,255,.06)}
.nw.dark .jn-me.named,.nw.dark .jn-idea,.nw.dark .jn-mail,.nw.dark .jn-bmail{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
.nw.dark .jn-vote{background:#26262a;color:#d4d4d8}
.nw.dark .jn-vote.on{background:var(--c);color:#fff}
.nw.dark .jn-idea-t{color:#e4e4e7}
.nw.dark .jn-mail-head{border-color:#2c2c31}
.nw.dark .jn-notice{background:#2a2414;color:#fcd34d}
@media (prefers-reduced-motion: reduce){.jn-av,.jn-badge,.jn-idea,.jn-you,.jn-mail,.jn-bmail,.jn-st,.jn-vote b,.jn-me-tx b,.jn-me-tx small{animation:none!important}.jn-vote{transition:none}}
`
