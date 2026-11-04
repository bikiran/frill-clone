'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useBodyClass } from '@/lib/body-class'
import { COLVY_ICON, I, ICONS, SETUP_CSS, SetupPreview, PreviewSection, PreviewRow, useSetupTheme } from '@/components/setup/SetupKit'
import { EMAIL_RE, MAIL, LOCK, firstFromEmail, EmailChip, useWorkspaceLook, AUTH_CSS } from '@/components/setup/AuthKit'

// Forgot password, in sign-in's style. The preview tells the story: Colvy
// offers to help, your email goes on the account, and once it's sent the
// reset email lands with its button ("Sent", then "Delivered").
export default function ForgotPasswordPage() {
  useBodyClass('nw-on')
  const { dark } = useSetupTheme()
  const look = useWorkspaceLook()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')
  // The email box opens focused (autoFocus), before onFocus can say so.
  const [field, setField] = useState(true)
  // "Sent" turns to "Delivered" a moment after the email card lands.
  const [delivered, setDelivered] = useState(false)
  useEffect(() => {
    setDelivered(false)
    if (!sent) return
    const t = setTimeout(() => setDelivered(true), 1500)
    return () => clearTimeout(t)
  }, [sent, resent])

  const send = async () => {
    setLoading(true)
    setError('')
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm`,
      })
      if (err) throw err
      if (sent) setResent(r => !r)
      setSent(true)
    } catch (err: any) {
      const msg = String(err?.message || '')
      setError(/rate|too many|seconds|security purposes/i.test(msg) ? 'A link was sent a moment ago. Give it a minute before asking for another.' : msg || 'The link couldn’t be sent. Please try again.')
    }
    setLoading(false)
  }
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); send() }

  const addr = email.trim()
  const emailOk = EMAIL_RE.test(addr)
  const first = emailOk ? firstFromEmail(addr) : ''

  return (
    <div className={`nw nw-form${dark ? ' dark' : ''} si`} style={{ ['--c' as string]: look.color } as React.CSSProperties}>
      <style>{SETUP_CSS + AUTH_CSS + FP_CSS}</style>

      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand"><img src={COLVY_ICON} alt="" width={30} height={30} /><span>Colvy</span></div>
          <a href="/signin" className="nw-top-link si-top-link">Sign in</a>
        </div>

        <div className="nw-body">
          <div key={sent ? 'sent' : 'form'} className="nw-step fwd">
            {sent ? (
              <div className="si-sent">
                <span className="si-sent-ic">{I(MAIL, 26)}</span>
                <h1>Check your email</h1>
                <p className="nw-sub">We sent a link to <b>{addr}</b>. Open it to choose a new password. It works once and expires soon.</p>
                {error && <div role="alert" className="nw-error si-error">{error}</div>}
                <p className="fp-hint">Not there? Check your spam folder, or send it again.</p>
                <div className="si-sent-btns">
                  <button type="button" className="nw-back" onClick={send} disabled={loading}>{loading ? <span className="nw-spin" /> : I(MAIL, 15)}{loading ? 'Sending…' : 'Send it again'}</button>
                  <button type="button" className="nw-back" onClick={() => { setSent(false); setError('') }}>{I(ICONS.back, 15)}Use a different email</button>
                </div>
              </div>
            ) : (<>
              <h1>Forgot your password?</h1>
              <p className="nw-sub">It happens. Enter the email you sign in with{look.name ? <> to <b className="fp-ws">{look.name}</b></> : null} and we&rsquo;ll send you a link to set a new one.</p>

              <form onSubmit={handleSubmit}>
                <label className="si-field"><span>Email</span>
                  <input className="nw-input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus placeholder="you@company.com" autoComplete="email"
                    onFocus={() => setField(true)} onBlur={() => setField(false)} />
                </label>

                {error && <div role="alert" className="nw-error si-error">{error}</div>}

                <button type="submit" className="nw-next si-submit" disabled={loading || !emailOk}>
                  {loading ? <><span className="nw-spin si-spin" />Sending…</> : <>Send reset link{I(ICONS.next, 15)}</>}
                </button>
              </form>
            </>)}
          </div>
        </div>

        <div className="nw-foot">
          <p className="nw-legal si-new">Remember it? <a href="/signin">Back to sign in</a></p>
        </div>
      </div>

      {/* ── The live preview ───────────────────────────────────────────── */}
      <SetupPreview panelRef={{ current: null }} phase="form" from={null} name={look.name || 'Your account'}
        focus={field && !sent ? 'name' : 'overview'}
        logo={look.logo ? { kind: 'img', src: look.logo } : { kind: 'colvy' }}
        corner={<EmailChip email={email} />}
        sub={look.slug ? <div className="nw-ws-site">{I(ICONS.chat, 13)}{look.slug}.colvy.com</div> : undefined}
        sections={
          <PreviewSection k="account" icon={ICONS.people} title="Account">
            <PreviewRow color="#3b82f6" icon={MAIL} label="Email" fresh={false} verified={sent}
              detail={emailOk ? addr : 'Your email'} />
            <PreviewRow color={look.color} icon={LOCK} label="Password" fresh={false}
              detail={sent ? <span key="s" className="si-new-n">Reset link sent</span> : 'Forgotten'} />
          </PreviewSection>
        }
        conv={
          <div className="nw-thread si-thread">
            <div className="nw-msg"><img src={COLVY_ICON} alt="" /><p>Locked out{first ? <>, <b>{first}</b></> : null}? No problem. Tell me your email and I&rsquo;ll send you a link to set a new password.</p></div>
            {loading && !sent && <div className="nw-msg"><img src={COLVY_ICON} alt="" /><p className="fp-typing" aria-label="Sending"><span /><span /><span /></p></div>}
            {sent && <>
              <div className="nw-msg" key={'done' + resent}><img src={COLVY_ICON} alt="" /><p>Done! A reset link is on its way to <b>{addr}</b>.</p></div>
              <div className="fp-mail" key={'mail' + resent}>
                <div className="fp-mail-head">
                  <img src={COLVY_ICON} alt="" />
                  <span><b>{look.name || 'Colvy'}</b><small>to {addr}</small></span>
                  <em>now</em>
                </div>
                <h4>Reset your password</h4>
                <p>Tap the button to choose a new password. The link works once and expires soon.</p>
                <span className="fp-mail-btn">{I(LOCK, 13, 2.2)}Set a new password</span>
                <div className={`fp-mail-st${delivered ? ' ok' : ''}`} key={delivered ? 'd' : 's'}>
                  <span className="fp-ticks">{I(ICONS.check, 12, 3)}{delivered && I(ICONS.check, 12, 3)}</span>{delivered ? 'Delivered' : 'Sent'}
                </div>
              </div>
            </>}
          </div>
        }
        build={null} />
    </div>
  )
}

const FP_CSS = `
.fp-ws{font-weight:650;color:#18181b}
.fp-hint{margin:-8px 0 16px;font-size:13.5px;color:#8e8e93}
.fp-typing{display:inline-flex!important;gap:5px;align-items:center;padding:15px 16px!important}
.fp-typing span{width:7px;height:7px;border-radius:50%;background:#a1a1aa;animation:fpDot 1s ease-in-out infinite}
.fp-typing span:nth-child(2){animation-delay:.15s}.fp-typing span:nth-child(3){animation-delay:.3s}
@keyframes fpDot{0%,80%,100%{opacity:.35;transform:none}40%{opacity:1;transform:translateY(-3px)}}
/* The reset email, as it lands. */
.fp-mail{margin-left:44px;border-radius:18px;padding:14px 16px 12px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 30px -12px rgba(0,0,0,.22);animation:fpMail .7s cubic-bezier(.2,.9,.3,1.15) .35s both}
@keyframes fpMail{from{opacity:0;transform:translateY(18px) rotate(-1.5deg) scale(.96)}to{opacity:1;transform:none}}
.fp-mail-head{display:flex;align-items:center;gap:10px;padding-bottom:10px;margin-bottom:10px;border-bottom:1px solid #f0f0f2}
.fp-mail-head img{width:30px;height:30px;border-radius:9px;object-fit:contain}
.fp-mail-head span{min-width:0;display:flex;flex-direction:column;line-height:1.25}
.fp-mail-head b{font-size:13.5px;font-weight:650;color:#18181b}
.fp-mail-head small{font-size:12px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fp-mail-head em{margin-left:auto;font-style:normal;font-size:11.5px;color:#a1a1aa}
.fp-mail h4{margin:0 0 4px;font-size:15px;font-weight:700;color:#18181b}
.fp-mail p{margin:0 0 12px;font-size:13px;line-height:1.45;color:#52525b}
.fp-mail-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 16px;border-radius:999px;background:var(--c);color:#fff;font-size:13px;font-weight:650;box-shadow:0 6px 16px -6px color-mix(in srgb,var(--c) 70%,transparent)}
.fp-mail-st{display:flex;align-items:center;justify-content:flex-end;gap:2px;margin-top:8px;font-size:11.5px;font-weight:600;color:#a1a1aa;animation:nwFade .35s ease both}
.fp-ticks{display:inline-flex;margin-right:4px}
.fp-ticks svg+svg{margin-left:-7px}
.fp-mail-st.ok{color:#16a34a}
.nw.dark .fp-ws{color:#f4f4f5}
.nw.dark .fp-mail{background:#1c1c1f;box-shadow:0 0 0 1px rgba(255,255,255,.07)}
.nw.dark .fp-mail-head{border-bottom-color:#2c2c31}
.nw.dark .fp-mail-head b,.nw.dark .fp-mail h4{color:#f4f4f5}
.nw.dark .fp-mail p{color:#a1a1aa}
@media (prefers-reduced-motion: reduce){.fp-mail,.fp-typing span,.fp-mail-st{animation:none!important}}
`
