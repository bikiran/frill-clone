'use client'

// The poll and survey as customers see them: on the public pages
// (/polls/<id>, /surveys/<id>, and their ?embed=1 iframes) and as the live
// preview in the editors. Presentational: the caller does the fetching and
// passes onVote / onSubmit (or nothing, for a preview).

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { StatusMark } from '@/components/StatusMark'
import { closeNote, canSeeResults, type PollTally } from '@/lib/engage-core'
import type { PublicPoll, PublicSurvey } from '@/lib/engage-server'
import { EngageIcon } from './icons'

const ACCENT = '#ff7a6b'
const accentOf = (c: string | null | undefined) => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : ACCENT)

export function PublicShell({ company, embed, children, accent }: { company: PublicPoll['company']; embed?: boolean; children: ReactNode; accent: string }) {
  return (
    <div className={`pv-root${embed ? ' is-embed' : ''}`} style={{ ['--pv-accent' as any]: accent } as CSSProperties}>
      <PublicStyles />
      <div className="pv-wrap">
        {!embed && company?.name && (
          <div className="pv-brand">
            {company.logo_url ? <img src={company.logo_url} alt="" className="pv-logo" /> : <span className="pv-logo pv-logo-letter" aria-hidden="true">{company.name.charAt(0).toUpperCase()}</span>}
            <span>{company.name}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function Who({ ask, name, contact, onName, onContact }: { ask: { name: string; contact: string }; name: string; contact: string; onName: (v: string) => void; onContact: (v: string) => void }) {
  if (ask.name === 'off' && ask.contact === 'off') return null
  return (
    <div className="pv-who">
      {ask.name !== 'off' && (
        <label className="pv-field"><span>Your name{ask.name === 'optional' ? ' (optional)' : ''}</span>
          <input className="pv-input" value={name} onChange={e => onName(e.target.value)} maxLength={120} autoComplete="name" />
        </label>
      )}
      {ask.contact !== 'off' && (
        <label className="pv-field"><span>Email or mobile{ask.contact === 'optional' ? ' (optional)' : ''}</span>
          <input className="pv-input" value={contact} onChange={e => onContact(e.target.value)} maxLength={160} autoComplete="email" inputMode="email" />
        </label>
      )}
    </div>
  )
}

// ── Poll ─────────────────────────────────────────────────────────────────────

export function PublicPollCard({ poll, results, myVote, onVote, preview, now = Date.now(), notice }: {
  poll: PublicPoll
  results: PollTally | null
  myVote: string[] | null
  onVote?: (picks: string[], who: { name: string; contact: string }) => Promise<string | null>
  preview?: boolean
  now?: number
  notice?: string | null
}) {
  const [picks, setPicks] = useState<string[]>(() => (poll.type === 'ranking' ? poll.options.map(o => o.text) : []))
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [changing, setChanging] = useState(false)
  const voted = !!myVote && myVote.length > 0
  const closed = poll.status === 'closed'
  const showForm = !closed && (!voted || changing)
  // The server only sends totals the visitor may see; a preview shows them when the setting would.
  const allowed = !!results && (preview ? poll.show_results !== 'never' : canSeeResults(poll.show_results, poll.status, voted))
  const showResults = allowed && (!showForm || poll.show_results === 'always')
  const choices = poll.type === 'rating' ? Array.from({ length: poll.scale }, (_, i) => String(i + 1)) : poll.options.map(o => o.text)
  const rankOrder = poll.type === 'ranking' ? (picks.length === choices.length ? picks : choices) : []

  const toggle = (c: string) => {
    if (poll.type === 'multiple_choice') setPicks(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]))
    else setPicks([c])
  }
  const move = (i: number, d: -1 | 1) => setPicks(() => {
    const list = rankOrder.slice()
    const j = i + d
    if (j < 0 || j >= list.length) return list
    ;[list[i], list[j]] = [list[j], list[i]]
    return list
  })

  const submit = async () => {
    if (!onVote || busy) return
    const chosen = poll.type === 'ranking' ? rankOrder : picks
    if (!chosen.length) { setError(poll.type === 'multiple_choice' ? 'Choose at least one answer.' : 'Choose an answer first.'); return }
    setBusy(true); setError('')
    const err = await onVote(chosen, { name, contact })
    setBusy(false)
    if (err) setError(err)
    else setChanging(false)
  }

  const closes = !closed ? closeNote(poll.closes_at, now) : ''
  return (
    <article className="pv-card" aria-labelledby="pv-q">
      {poll.image_url && <img className="pv-cover" src={poll.image_url} alt="" />}
      <div className="pv-body">
        <div className="pv-meta">
          <span className={`pv-badge${closed ? ' is-closed' : ''}`}>{closed ? 'Closed' : 'Poll'}</span>
          {closes && <span className="pv-dim"><EngageIcon name="calendar" size={13} /> {closes}</span>}
          {results && <span className="pv-dim">{results.voters.toLocaleString('en-AU')} {results.voters === 1 ? 'vote' : 'votes'}</span>}
        </div>
        <h1 className="pv-q" id="pv-q">{poll.question || (preview ? 'Your question' : 'Poll')}</h1>
        {poll.description && <p className="pv-desc">{poll.description}</p>}
        {notice && <p className="pv-note">{notice}</p>}

        {showForm && (
          <>
            {poll.type === 'multiple_choice' && <p className="pv-hint">Choose as many as you like.</p>}
            {poll.type === 'ranking' && <p className="pv-hint">Put them in order, most important first.</p>}
            {choices.length === 0 ? <p className="pv-hint">{preview ? 'Add some answers to see them here.' : 'This poll has no answers yet.'}</p>
              : poll.type === 'rating' ? (
                <div className="pv-scale" role="radiogroup" aria-label="Rating">
                  {choices.map(c => (
                    <button key={c} type="button" role="radio" aria-checked={picks[0] === c} className={`pv-scale-btn${picks[0] === c ? ' on' : ''}`} onClick={() => toggle(c)}>
                      {poll.scale === 5 ? <EngageIcon name="star" size={22} fill={picks[0] && Number(c) <= Number(picks[0]) ? 'currentColor' : 'none'} /> : c}
                      {poll.scale === 5 && <span className="pv-sr">{c} of 5</span>}
                    </button>
                  ))}
                </div>
              ) : poll.type === 'ranking' ? (
                <ol className="pv-rank">
                  {rankOrder.map((c, i) => {
                    const o = poll.options.find(x => x.text === c)
                    return (
                      <li key={c} className="pv-rank-row">
                        <span className="pv-rank-n">{i + 1}</span>
                        {o?.image && <img src={o.image} alt="" className="pv-opt-img" />}
                        <span className="pv-opt-text">{c}{o?.description && <small>{o.description}</small>}</span>
                        <span className="pv-rank-tools">
                          <button type="button" className="pv-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c} up`}><EngageIcon name="up" size={16} /></button>
                          <button type="button" className="pv-icon" onClick={() => move(i, 1)} disabled={i === rankOrder.length - 1} aria-label={`Move ${c} down`}><EngageIcon name="down" size={16} /></button>
                        </span>
                      </li>
                    )
                  })}
                </ol>
              ) : (
                <div className="pv-opts" role={poll.type === 'multiple_choice' ? 'group' : 'radiogroup'} aria-labelledby="pv-q">
                  {poll.options.map(o => {
                    const on = picks.includes(o.text)
                    return (
                      <button key={o.text} type="button" role={poll.type === 'multiple_choice' ? 'checkbox' : 'radio'} aria-checked={on} className={`pv-opt${on ? ' on' : ''}`} onClick={() => toggle(o.text)}>
                        <span className={`pv-tick${poll.type === 'multiple_choice' ? ' is-box' : ''}`} aria-hidden="true">{on && <EngageIcon name="check" size={13} strokeWidth={3} />}</span>
                        {o.image && <img src={o.image} alt="" className="pv-opt-img" />}
                        <span className="pv-opt-text">{o.text}{o.description && <small>{o.description}</small>}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            <Who ask={{ name: poll.ask_name, contact: poll.ask_contact }} name={name} contact={contact} onName={setName} onContact={setContact} />
            {error && <p className="pv-error" role="alert">{error}</p>}
            <div className="pv-actions">
              <button type="button" className="pv-btn" onClick={submit} disabled={busy || preview || !choices.length}>{busy ? 'Sending…' : changing ? 'Update my vote' : 'Vote'}</button>
              {changing && <button type="button" className="pv-link" onClick={() => setChanging(false)}>Cancel</button>}
            </div>
          </>
        )}

        {!showForm && voted && (
          <div className="pv-done">
            <StatusMark kind="success" size={28} />
            <div>
              <b>{poll.thank_you || 'Thanks for voting!'}</b>
              <span>You voted for {myVote!.join(poll.type === 'ranking' ? ' › ' : ', ')}.</span>
            </div>
            {poll.allow_change && !closed && onVote && <button type="button" className="pv-link" onClick={() => { setPicks(poll.type === 'ranking' ? myVote! : myVote!); setChanging(true) }}>Change my vote</button>}
          </div>
        )}
        {closed && !voted && <p className="pv-hint">This poll has closed and isn&apos;t taking votes.</p>}

        {showResults && results && (
          <div className="pv-results" aria-label="Results">
            {poll.type === 'rating' && results.average != null && <p className="pv-avg"><b>{results.average}</b> average from {results.voters.toLocaleString('en-AU')} {results.voters === 1 ? 'rating' : 'ratings'}</p>}
            {results.rows.map(r => {
              const mine = !!myVote?.includes(r.label)
              const lead = results.leaders.includes(r.label)
              return (
                <div key={r.label} className={`pv-res${mine ? ' is-mine' : ''}`}>
                  <div className="pv-res-top">
                    <span className="pv-res-label">{mine && <EngageIcon name="check" size={14} strokeWidth={3} />}{poll.type === 'rating' ? `${r.label} ${poll.scale === 5 ? (r.label === '1' ? 'star' : 'stars') : ''}` : r.label}</span>
                    <span className="pv-res-num">{r.pct}%</span>
                  </div>
                  <div className="pv-track"><div className={`pv-fill${lead || mine ? ' is-strong' : ''}`} style={{ width: `${r.pct}%` }} /></div>
                </div>
              )
            })}
            {poll.type === 'multiple_choice' && <p className="pv-dim" style={{ marginTop: 8 }}>People could choose more than one.</p>}
            {poll.type === 'ranking' && <p className="pv-dim" style={{ marginTop: 8 }}>Ordered by overall ranking.</p>}
          </div>
        )}
        {!showResults && voted && !showForm && poll.show_results === 'closed' && <p className="pv-hint">Results will show here once the poll closes.</p>}
      </div>
    </article>
  )
}

// ── Survey ───────────────────────────────────────────────────────────────────

const FACES: { icon: 'frown' | 'meh' | 'smile'; label: string; tint: string }[] = [
  { icon: 'frown', label: 'Very unhappy', tint: '#dc2626' },
  { icon: 'frown', label: 'Unhappy', tint: '#ea580c' },
  { icon: 'meh', label: 'Okay', tint: '#ca8a04' },
  { icon: 'smile', label: 'Happy', tint: '#65a30d' },
  { icon: 'smile', label: 'Very happy', tint: '#16a34a' },
]

export function PublicSurveyCard({ survey, answered, onSubmit, preview }: {
  survey: PublicSurvey
  answered: boolean
  onSubmit?: (body: { score?: number; comment?: string; answers?: Record<string, unknown>; name: string; contact: string }) => Promise<string | null>
  preview?: boolean
}) {
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const range = survey.range
  const scores = useMemo(() => (range ? Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i) : []), [range])
  const low = survey.low_label || (survey.mode === 'nps' ? 'Not likely' : 'Very unhappy')
  const high = survey.high_label || (survey.mode === 'nps' ? 'Very likely' : 'Very happy')
  const closed = survey.status === 'closed'

  const submit = async () => {
    if (!onSubmit || busy) return
    if (range && score === null) { setError(`Pick a score from ${range.min} to ${range.max} first.`); return }
    if (survey.mode === 'text' && !comment.trim()) { setError('Write your answer first.'); return }
    setBusy(true); setError('')
    const err = await onSubmit({ ...(range ? { score: score as number } : {}), comment, answers, name, contact })
    setBusy(false)
    if (err) setError(err); else setDone(true)
  }

  if (done || answered) {
    return (
      <article className="pv-card pv-center">
        <div className="pv-body">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><StatusMark kind="success" size={done ? 88 : 56} celebrate={done} /></div>
          <h1 className="pv-q" style={{ textAlign: 'center' }}>{done ? 'Thank you!' : 'You’ve already answered'}</h1>
          <p className="pv-desc" style={{ textAlign: 'center' }}>{survey.thank_you || 'Your feedback has been recorded. We appreciate your time.'}</p>
        </div>
      </article>
    )
  }

  return (
    <article className="pv-card" aria-labelledby="pv-q">
      <div className="pv-body">
        <div className="pv-meta">
          <span className={`pv-badge${closed ? ' is-closed' : ''}`}>{closed ? 'Closed' : 'Survey'}</span>
          {!closed && closeNote(survey.closes_at) && <span className="pv-dim"><EngageIcon name="calendar" size={13} /> {closeNote(survey.closes_at)}</span>}
        </div>
        {survey.title && <p className="pv-kicker">{survey.title}</p>}
        <h1 className="pv-q" id="pv-q">{survey.mode === 'questions' ? (survey.description || 'We’d love your feedback') : (survey.question || (preview ? 'Your question' : 'Survey'))}</h1>
        {survey.mode !== 'questions' && survey.description && <p className="pv-desc">{survey.description}</p>}

        {closed ? <p className="pv-hint">This survey has closed and isn&apos;t taking answers.</p> : (
          <>
            {range && survey.mode === 'csat' && range.max === 5 ? (
              <div className="pv-faces" role="radiogroup" aria-labelledby="pv-q">
                {FACES.map((f, i) => {
                  const v = i + 1
                  return (
                    <button key={v} type="button" role="radio" aria-checked={score === v} className={`pv-face${score === v ? ' on' : ''}`} style={{ ['--tint' as any]: f.tint } as CSSProperties} onClick={() => setScore(v)}>
                      <EngageIcon name={f.icon} size={30} strokeWidth={1.8} />
                      <span>{f.label}</span>
                    </button>
                  )
                })}
              </div>
            ) : range ? (
              <>
                <div className={`pv-nps${scores.length > 6 ? ' is-11' : ''}`} role="radiogroup" aria-labelledby="pv-q">
                  {scores.map(n => (
                    <button key={n} type="button" role="radio" aria-checked={score === n} className={`pv-nps-btn${score === n ? ' on' : ''}`} onClick={() => setScore(n)}>{n}</button>
                  ))}
                </div>
                <div className="pv-ends"><span>{low}</span><span>{high}</span></div>
              </>
            ) : null}

            {survey.mode === 'questions' && survey.questions.map((q, qi) => (
              <fieldset key={q.id} className="pv-qblock">
                <legend><span className="pv-qn">{qi + 1}</span>{q.title}{q.isRequired && <span className="pv-req" aria-label="required"> *</span>}</legend>
                {q.description && <p className="pv-hint" style={{ marginTop: 0 }}>{q.description}</p>}
                {q.type === 'text' && <textarea className="pv-input" rows={3} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />}
                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div className="pv-opts">
                    {(q.options || []).map(o => {
                      const multi = q.type === 'multiple_choice'
                      const cur = answers[q.id]
                      const on = multi ? Array.isArray(cur) && cur.includes(o) : cur === o
                      return (
                        <button key={o} type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} className={`pv-opt is-small${on ? ' on' : ''}`}
                          onClick={() => setAnswers(a => ({ ...a, [q.id]: multi ? (on ? (a[q.id] || []).filter((x: string) => x !== o) : [...(a[q.id] || []), o]) : o }))}>
                          <span className={`pv-tick${multi ? ' is-box' : ''}`} aria-hidden="true">{on && <EngageIcon name="check" size={12} strokeWidth={3} />}</span>
                          <span className="pv-opt-text">{o}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {q.type === 'rating' && (
                  <div className="pv-nps" role="radiogroup">
                    {Array.from({ length: (q.maxRating ?? 5) - (q.minRating ?? 1) + 1 }, (_, i) => (q.minRating ?? 1) + i).map(n => (
                      <button key={n} type="button" role="radio" aria-checked={answers[q.id] === n} className={`pv-nps-btn${answers[q.id] === n ? ' on' : ''}`} onClick={() => setAnswers(a => ({ ...a, [q.id]: n }))}>{n}</button>
                    ))}
                  </div>
                )}
              </fieldset>
            ))}

            {survey.mode !== 'questions' && (
              <label className="pv-field" style={{ marginTop: 16 }}>
                <span>{survey.mode === 'text' ? 'Your answer' : survey.follow_up || 'Tell us more (optional)'}</span>
                <textarea className="pv-input" rows={4} value={comment} onChange={e => setComment(e.target.value)} maxLength={4000} />
              </label>
            )}

            <Who ask={{ name: survey.ask_name, contact: survey.ask_contact }} name={name} contact={contact} onName={setName} onContact={setContact} />
            {error && <p className="pv-error" role="alert">{error}</p>}
            <div className="pv-actions">
              <button type="button" className="pv-btn" onClick={submit} disabled={busy || preview}>{busy ? 'Sending…' : 'Send'}</button>
            </div>
          </>
        )}
      </div>
    </article>
  )
}

export function accentFor(company: PublicPoll['company']): string {
  return accentOf(company?.accent_color)
}

const CSS = `
.pv-root { --pv-accent: ${ACCENT}; min-height: 100vh; background: var(--canvas, #fafafa); color: var(--ink, #1a1a1a); padding: 32px 16px 48px; box-sizing: border-box; font-size: 15px; }
.pv-root *, .pv-root *::before, .pv-root *::after { box-sizing: border-box; }
.pv-root.is-embed { min-height: 0; background: transparent; padding: 0; }
.pv-root :focus-visible { outline: 2px solid var(--pv-accent); outline-offset: 2px; }
.pv-wrap { width: 100%; max-width: 640px; margin: 0 auto; }
.pv-root.is-embed .pv-wrap { max-width: none; }
.pv-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; font-weight: 700; font-size: 15px; color: var(--ink); }
.pv-logo { width: 32px; height: 32px; border-radius: 9px; object-fit: cover; }
.pv-logo-letter { display: inline-flex; align-items: center; justify-content: center; background: var(--pv-accent); color: #fff; font-size: 15px; }
.pv-card { background: var(--card, #fff); border: 1px solid var(--border, #f0f0f0); border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px -30px rgba(0,0,0,.25); }
.pv-root.is-embed .pv-card { box-shadow: none; }
.pv-cover { display: block; width: 100%; max-height: 240px; object-fit: cover; }
.pv-body { padding: 24px; }
@media (min-width: 560px) { .pv-body { padding: 30px 32px; } }
.pv-center { text-align: center; }
.pv-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; font-size: 12.5px; }
.pv-badge { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11.5px; font-weight: 700; letter-spacing: .02em; background: color-mix(in srgb, var(--pv-accent) 14%, transparent); color: var(--pv-accent); }
.pv-badge.is-closed { background: #f1f5f9; color: #475569; }
.pv-dim { color: var(--slate, #6b7280); display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; }
.pv-kicker { margin: 0 0 4px; font-size: 13px; font-weight: 600; color: var(--slate, #6b7280); }
.pv-q { margin: 0; font-size: 22px; line-height: 1.3; font-weight: 800; color: var(--ink); overflow-wrap: anywhere; }
@media (min-width: 560px) { .pv-q { font-size: 25px; } }
.pv-desc { margin: 8px 0 0; color: var(--slate, #6b7280); line-height: 1.55; white-space: pre-wrap; }
.pv-note { margin: 12px 0 0; padding: 10px 12px; border-radius: 10px; background: #fffbeb; color: #92400e; font-size: 13.5px; }
.pv-hint { margin: 16px 0 0; color: var(--slate, #6b7280); font-size: 13.5px; }
.pv-opts { display: grid; gap: 10px; margin-top: 18px; }
.pv-opt { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 14px 16px; border-radius: 14px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--ink); font-size: 15px; font-weight: 600; cursor: pointer; transition: border-color .15s, background .15s, transform .1s; }
.pv-opt:hover { border-color: color-mix(in srgb, var(--pv-accent) 60%, #e5e7eb); }
.pv-opt:active { transform: scale(.995); }
.pv-opt.on { border-color: var(--pv-accent); background: color-mix(in srgb, var(--pv-accent) 8%, var(--card, #fff)); }
.pv-opt.is-small { padding: 10px 12px; font-size: 14px; border-radius: 12px; }
.pv-tick { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex-shrink: 0; border-radius: 50%; border: 2px solid #d4d4d8; color: #fff; }
.pv-tick.is-box { border-radius: 6px; }
.pv-opt.on .pv-tick { background: var(--pv-accent); border-color: var(--pv-accent); }
.pv-opt-img { width: 44px; height: 44px; border-radius: 10px; object-fit: cover; flex-shrink: 0; }
.pv-opt-text { min-width: 0; overflow-wrap: anywhere; }
.pv-opt-text small { display: block; font-weight: 400; font-size: 13px; color: var(--slate, #6b7280); margin-top: 2px; }
.pv-scale { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
.pv-scale-btn { min-width: 48px; height: 48px; padding: 0 10px; border-radius: 12px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--slate, #6b7280); font-weight: 700; font-size: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.pv-scale-btn.on, .pv-scale-btn:hover { border-color: var(--pv-accent); color: var(--pv-accent); }
.pv-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.pv-rank { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 8px; }
.pv-rank-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); font-weight: 600; }
.pv-rank-n { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; background: color-mix(in srgb, var(--pv-accent) 14%, transparent); color: var(--pv-accent); font-size: 13px; font-weight: 800; flex-shrink: 0; }
.pv-rank-row .pv-opt-text { flex: 1; }
.pv-rank-tools { display: flex; gap: 4px; }
.pv-icon { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--ink); cursor: pointer; }
.pv-icon[disabled] { opacity: .35; cursor: default; }
.pv-who { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-top: 18px; }
.pv-field { display: block; }
.pv-field > span { display: block; font-size: 13px; font-weight: 600; margin-bottom: 6px; color: var(--ink); }
.pv-input { width: 100%; padding: 11px 13px; border-radius: 12px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--ink); font-size: 16px; font-family: inherit; resize: vertical; }
.pv-input:focus { outline: none; border-color: var(--pv-accent); }
.pv-error { margin: 14px 0 0; color: #b91c1c; font-size: 14px; }
.pv-actions { display: flex; align-items: center; gap: 14px; margin-top: 20px; flex-wrap: wrap; }
.pv-btn { min-width: 140px; height: 48px; padding: 0 24px; border: none; border-radius: 14px; background: var(--pv-accent); color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; transition: filter .15s, transform .1s; }
.pv-btn:hover:not([disabled]) { filter: brightness(.95); }
.pv-btn:active:not([disabled]) { transform: scale(.98); }
.pv-btn[disabled] { opacity: .55; cursor: default; }
.pv-link { border: none; background: none; padding: 4px 0; color: var(--pv-accent); font-weight: 700; font-size: 14px; cursor: pointer; }
.pv-done { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 18px; padding: 14px 16px; border-radius: 14px; background: color-mix(in srgb, #22c55e 9%, var(--card, #fff)); border: 1px solid color-mix(in srgb, #22c55e 30%, transparent); }
.pv-done > div { flex: 1; min-width: 180px; }
.pv-done b { display: block; font-size: 15px; }
.pv-done span { font-size: 13.5px; color: var(--slate, #6b7280); }
.pv-results { margin-top: 20px; display: grid; gap: 12px; }
.pv-avg { margin: 0 0 4px; color: var(--slate, #6b7280); font-size: 14px; }
.pv-avg b { font-size: 26px; color: var(--ink); margin-right: 6px; }
.pv-res-top { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.pv-res-label { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow-wrap: anywhere; }
.pv-res.is-mine .pv-res-label { color: var(--pv-accent); }
.pv-res-num { font-variant-numeric: tabular-nums; color: var(--slate, #6b7280); }
.pv-track { height: 10px; border-radius: 999px; background: color-mix(in srgb, var(--ink, #111) 7%, transparent); overflow: hidden; }
.pv-fill { height: 100%; border-radius: 999px; background: color-mix(in srgb, var(--pv-accent) 45%, #cbd5e1); transition: width .6s cubic-bezier(.16,1,.3,1); }
.pv-fill.is-strong { background: var(--pv-accent); }
.pv-nps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; margin-top: 18px; }
.pv-nps.is-11 { grid-template-columns: repeat(11, minmax(0, 1fr)); }
@media (max-width: 480px) { .pv-nps.is-11 { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.pv-nps-btn { height: 46px; border-radius: 10px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--ink); font-weight: 700; font-size: 15px; cursor: pointer; }
.pv-nps-btn:hover { border-color: var(--pv-accent); }
.pv-nps-btn.on { background: var(--pv-accent); border-color: var(--pv-accent); color: #fff; }
.pv-ends { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; font-size: 12.5px; color: var(--slate, #6b7280); }
.pv-faces { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
.pv-face { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 4px; border-radius: 14px; border: 1.5px solid var(--border, #e5e7eb); background: var(--card, #fff); color: var(--slate, #6b7280); cursor: pointer; font-size: 11.5px; font-weight: 600; }
.pv-face:hover, .pv-face.on { color: var(--tint); border-color: var(--tint); }
.pv-face.on { background: color-mix(in srgb, var(--tint) 8%, var(--card, #fff)); }
@media (max-width: 420px) { .pv-face span { display: none; } }
.pv-qblock { border: none; padding: 0; margin: 22px 0 0; min-width: 0; }
.pv-qblock legend { display: flex; align-items: baseline; gap: 8px; font-size: 16px; font-weight: 700; color: var(--ink); margin-bottom: 10px; padding: 0; }
.pv-qn { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 22px; border-radius: 6px; background: color-mix(in srgb, var(--pv-accent) 14%, transparent); color: var(--pv-accent); font-size: 12px; font-weight: 800; }
.pv-req { color: #dc2626; }
.pv-qblock .pv-opts, .pv-qblock .pv-nps { margin-top: 0; }
@media (prefers-reduced-motion: reduce) { .pv-fill, .pv-opt, .pv-btn { transition: none; } }
`

export function PublicStyles() {
  return <style>{CSS}</style>
}
