'use client'

import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useBodyClass } from '@/lib/body-class'
import AiBuddy from '@/components/AiBuddy'
import { COLVY_ICON, I, ICONS, SETUP_CSS, SetupPreview, PreviewSection, PreviewRow, useSetupTheme } from '@/components/setup/SetupKit'
import { MAIL, LOCK, UNLOCK, EyeIcon, EmailChip, firstFromEmail, usePanelZoom, useWorkspaceLook, AUTH_CSS } from '@/components/setup/AuthKit'

// What makes a password stronger. Only the length of 6 is required (as
// before); the rest is a guide, ticked off live in the preview.
const CHECKS: { label: string; ok: (p: string) => boolean }[] = [
  { label: 'At least 8 characters', ok: p => p.length >= 8 },
  { label: 'Upper and lower case', ok: p => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'A number', ok: p => /\d/.test(p) },
  { label: 'A symbol', ok: p => /[^A-Za-z0-9]/.test(p) },
]
const LEVELS = [
  { label: '', color: '#e4e4e7' },
  { label: 'Weak', color: '#ef4444' },
  { label: 'Fair', color: '#f59e0b' },
  { label: 'Good', color: '#84cc16' },
  { label: 'Strong', color: '#22c55e' },
]
/** 0 (nothing typed) to 4 (strong); never above Weak under 6 characters. */
function strengthOf(p: string): number {
  if (!p) return 0
  const n = CHECKS.filter(c => c.ok(p)).length
  return p.length < 6 ? 1 : Math.max(1, n)
}

const SAVING = ['Saving your new password…', 'Signing you in…', 'Opening your inbox…']

function ResetPasswordForm() {
  useBodyClass('nw-on')
  const { dark } = useSetupTheme()
  const look = useWorkspaceLook()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [who, setWho] = useState('')
  const { phase, from, panelRef, zoomOut, line, lineKey } = usePanelZoom(SAVING)

  // Make this page self-sufficient: if the recovery tokens are in the URL hash
  // (the reset link may land here directly), establish the session from them so
  // updateUser() has an authenticated recovery session to act on. Also strip the
  // hash afterwards so a reload doesn't re-parse a now-consumed token.
  useEffect(() => {
    if (typeof window === 'undefined') return
    // Whose password this is, for the preview (once the session is in).
    const whoIs = () => supabase.auth.getUser().then(({ data }: any) => { if (data?.user?.email) setWho(data.user.email) }, () => {})
    const hash = window.location.hash || ''
    if (!hash.includes('access_token=')) { whoIs(); return }
    const p = new URLSearchParams(hash.replace(/^#/, ''))
    const access_token = p.get('access_token')
    const refresh_token = p.get('refresh_token')
    if (access_token && refresh_token) {
      supabase.auth.setSession({ access_token, refresh_token })
        .catch(() => {})
        .finally(() => { try { window.history.replaceState(null, '', window.location.pathname) } catch {}; whoIs() })
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }

    setLoading(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      // Saved: the preview fills the screen while the dashboard opens.
      zoomOut()
      setTimeout(() => router.push('/admin'), 2000)
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const score = strengthOf(password)
  const level = LEVELS[score]
  const strong = score >= 4
  const matches = !!confirmPassword && confirmPassword === password
  const first = who ? firstFromEmail(who) : ''
  const dots = '•'.repeat(Math.min(password.length, 12))

  return (
    <div className={`nw nw-${phase}${dark ? ' dark' : ''} si`} style={{ ['--c' as string]: look.color, ['--s' as string]: level.color } as React.CSSProperties}>
      <style>{SETUP_CSS + AUTH_CSS + RP_CSS}</style>

      <div className="nw-left">
        <div className="nw-top">
          <div className="nw-brand"><img src={COLVY_ICON} alt="" width={30} height={30} /><span>Colvy</span></div>
          <a href="/signin" className="nw-top-link si-top-link">Sign in</a>
        </div>

        <div className="nw-body">
          <div className="nw-step fwd">
            <h1>Set a new password</h1>
            <p className="nw-sub">{who ? <>For <b className="rp-who">{who}</b>. </> : null}Choose a strong one you haven&rsquo;t used before.</p>

            <form onSubmit={handleSubmit}>
              <div className="si-field">
                <span><label htmlFor="rp-new">New password</label>{password ? <em className="rp-level" key={score}>{level.label}</em> : null}</span>
                <div className="nw-input nw-domain si-pass">
                  <input id="rp-new" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoFocus
                    placeholder="At least 6 characters" autoComplete="new-password" />
                  <button type="button" className="si-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                    <EyeIcon off={showPassword} />
                  </button>
                </div>
                <div className="rp-meter" aria-hidden="true">{[1, 2, 3, 4].map(i => <span key={i} className={i <= score ? 'on' : ''} />)}</div>
              </div>

              <div className="si-field">
                <span><label htmlFor="rp-confirm">Confirm password</label>{confirmPassword ? <em className={`rp-match${matches ? ' ok' : ''}`} key={String(matches)}>{matches ? <>{I(ICONS.check, 12, 3)}Matches</> : 'Doesn’t match yet'}</em> : null}</span>
                <input id="rp-confirm" className="nw-input" type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required
                  placeholder="Type it again" autoComplete="new-password" />
              </div>

              {error && <div role="alert" className="nw-error si-error">{error}</div>}

              <button type="submit" className="nw-next si-submit" disabled={loading || done || !password}>
                {loading ? <><span className="nw-spin si-spin" />Updating…</> : <>Update password{I(ICONS.next, 15)}</>}
              </button>
            </form>
          </div>
        </div>

        <div className="nw-foot">
          <p className="nw-legal si-new">Remembered it? <a href="/signin">Back to sign in</a></p>
        </div>
      </div>

      {/* ── The live preview ───────────────────────────────────────────── */}
      <SetupPreview panelRef={panelRef} phase={phase} from={from} name={look.name || 'Your account'}
        // The strength card is the point here: the camera stays on the whole app.
        focus="overview"
        logo={look.logo ? { kind: 'img', src: look.logo } : { kind: 'colvy' }}
        corner={<EmailChip email={who} />}
        sub={look.slug ? <div className="nw-ws-site">{I(ICONS.chat, 13)}{look.slug}.colvy.com</div> : undefined}
        sections={
          <PreviewSection k="account" icon={ICONS.people} title="Account">
            <PreviewRow color="#3b82f6" icon={MAIL} label="Email" fresh={false} verified={!!who} detail={who || 'Your email'} />
            <PreviewRow color={look.color} icon={strong ? LOCK : UNLOCK} label="Password" fresh={false} verified={done}
              detail={done ? <span key="u" className="si-new-n">Updated</span> : password ? <span className="rp-dots">{dots}{level.label ? ` · ${level.label}` : ''}</span> : 'Choose a new one'} />
          </PreviewSection>
        }
        conv={
          <div className="nw-thread si-thread">
            <div className="nw-msg"><img src={COLVY_ICON} alt="" /><p>Welcome back{first ? <>, <b>{first}</b></> : null}! Pick a new password. I&rsquo;ll tick things off as you type.</p></div>
            <div className="nw-card rp-card">
              <div className="rp-card-top">
                <span className={`rp-lock${strong ? ' shut' : ''}`} key={strong ? 'shut' : 'open'}>{I(strong ? LOCK : UNLOCK, 22, 2)}</span>
                <span className="rp-card-t"><b>New password</b><small key={score}>{password ? (level.label || '—') : 'Start typing'}</small></span>
              </div>
              <div className="rp-bar"><span style={{ width: `${score * 25}%` }} /></div>
              <div className="rp-checks">
                {CHECKS.map(c => {
                  const ok = c.ok(password)
                  return <div key={c.label} className={ok ? 'on' : ''}><span className="rp-tick" key={String(ok)}>{ok ? I(ICONS.check, 11, 3.2) : null}</span>{c.label}</div>
                })}
              </div>
              {confirmPassword && <div className={`rp-same${matches ? ' ok' : ''}`} key={String(matches)}>{matches ? <>{I(ICONS.check, 13, 3)}Both passwords match</> : 'The two passwords don’t match yet'}</div>}
            </div>
          </div>
        }
        build={
          <div className="nw-build">
            <AiBuddy size={84} color={look.color} shadow />
            <h2>Password updated</h2>
            {first && <p className="nw-build-for">Welcome back, {first}</p>}
            <p className="nw-build-line" key={lineKey}>{line}</p>
          </div>
        } />
    </div>
  )
}

const RP_CSS = `
.rp-who{font-weight:600;color:#18181b}
.rp-level{font-style:normal;font-size:12.5px;font-weight:700;color:var(--s);animation:nwFade .3s ease both}
.rp-meter{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.rp-meter span{height:5px;border-radius:999px;background:#ececef;transition:background-color .35s ease}
.rp-meter span.on{background:var(--s)}
.rp-match{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:12.5px;font-weight:600;color:#a1a1aa;animation:nwFade .3s ease both}
.rp-match.ok{color:#16a34a}
.rp-dots{letter-spacing:.06em}
/* The strength card in the preview. */
.rp-card{display:flex;flex-direction:column;gap:12px;padding:16px 18px}
.rp-card-top{display:flex;align-items:center;gap:12px}
.rp-lock{width:46px;height:46px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--s) 14%,#fff);color:var(--s);transition:background-color .35s,color .35s;animation:nwFlip .6s cubic-bezier(.22,1,.36,1) both}
.rp-lock.shut{animation:rpShut .55s cubic-bezier(.2,.9,.3,1.4) both}
@keyframes rpShut{0%{transform:scale(.8) rotate(-8deg)}60%{transform:scale(1.12) rotate(3deg)}100%{transform:none}}
.rp-card-t{display:flex;flex-direction:column;line-height:1.3}
.rp-card-t b{font-size:15px;font-weight:700;color:#18181b}
.rp-card-t small{font-size:13px;font-weight:600;color:var(--s);animation:nwFade .3s ease both}
.rp-bar{height:8px;border-radius:999px;background:#f0f0f2;overflow:hidden}
.rp-bar span{display:block;height:100%;border-radius:999px;background:var(--s);transition:width .45s cubic-bezier(.22,1,.36,1),background-color .35s}
.rp-checks{display:grid;grid-template-columns:1fr;gap:9px}
.rp-checks div{display:flex;align-items:center;gap:8px;font-size:13px;color:#8e8e93;transition:color .3s}
.rp-checks div.on{color:#18181b;font-weight:600}
.rp-tick{width:18px;height:18px;flex-shrink:0;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid #d4d4d8;color:#fff}
.rp-checks div.on .rp-tick{border-color:#22c55e;background:#22c55e;animation:nwPopIn .4s cubic-bezier(.2,.9,.3,1.3) both}
.rp-same{display:flex;align-items:center;gap:6px;padding:9px 12px;border-radius:12px;background:#f4f4f5;font-size:13px;font-weight:600;color:#71717a;animation:nwFwd .4s cubic-bezier(.22,1,.36,1) both}
.rp-same.ok{background:#f0fdf4;color:#15803d}
.nw.dark .rp-who,.nw.dark .rp-card-t b,.nw.dark .rp-checks div.on{color:#f4f4f5}
.nw.dark .rp-meter span{background:#2c2c31}
.nw.dark .rp-meter span.on{background:var(--s)}
.nw.dark .rp-bar{background:#26262b}
.nw.dark .rp-lock{background:color-mix(in srgb,var(--s) 20%,#18181b)}
.nw.dark .rp-tick{border-color:#3f3f46}
.nw.dark .rp-same{background:#232327;color:#a1a1aa}
.nw.dark .rp-same.ok{background:rgba(34,197,94,.12);color:#86efac}
@media (prefers-reduced-motion: reduce){.rp-lock,.rp-lock.shut,.rp-checks div.on .rp-tick,.rp-same,.rp-level,.rp-match{animation:none!important}}
`

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</div>}>
      <ResetPasswordForm />
    </Suspense>
  )
}
