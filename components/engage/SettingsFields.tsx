'use client'

// The settings both editors share: close date, one answer per person /
// changes, results visibility (polls), asking for a name or contact,
// thank-you message and notifications.

import type { EngageKind, EngageSettings, AskField, NotifyMode, ShowResults } from '@/lib/engage-core'
import { SHOW_RESULTS } from '@/lib/engage-core'

/** ISO → the value a datetime-local input wants, in the browser's zone. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A datetime-local value (browser's zone) → ISO with the offset applied, or null. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

export function SettingsFields({ kind, value, onChange, hasSettingsColumn }: {
  kind: EngageKind
  value: EngageSettings
  onChange: (next: EngageSettings) => void
  /** False before V386: these settings can't be saved yet. */
  hasSettingsColumn: boolean
}) {
  const set = <K extends keyof EngageSettings>(k: K, v: EngageSettings[K]) => onChange({ ...value, [k]: v })
  const noun = kind === 'poll' ? 'poll' : 'survey'
  return (
    <div className="eg-card">
      <h3 className="eg-h3">Settings</h3>
      {!hasSettingsColumn && (
        <div className="eg-note is-warn" role="status">
          These settings need the latest database update (V386). Until it&apos;s run they won&apos;t be saved, and the {noun} works as it always has.
        </div>
      )}
      <div className="eg-settings">
        <label className="eg-field">
          <span className="eg-label">Close automatically <small>(optional)</small></span>
          <input type="datetime-local" className="eg-input" value={toLocalInput(value.closes_at)} onChange={e => set('closes_at', fromLocalInput(e.target.value))} />
          <span className="eg-help" style={{ display: 'block', marginTop: 6 }}>No more {kind === 'poll' ? 'votes' : 'answers'} after this time. Leave empty to keep it open until you close it.</span>
        </label>

        {kind === 'poll' && (
          <label className="eg-field">
            <span className="eg-label">Show results to voters</span>
            <select className="eg-input eg-select" value={value.show_results} onChange={e => set('show_results', e.target.value as ShowResults)}>
              {SHOW_RESULTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        )}

        <label className="eg-field">
          <span className="eg-label">Ask for their name</span>
          <select className="eg-input eg-select" value={value.ask_name} onChange={e => set('ask_name', e.target.value as AskField)}>
            <option value="off">No, keep it anonymous</option>
            <option value="optional">Yes, optional</option>
            <option value="required">Yes, required</option>
          </select>
        </label>

        <label className="eg-field">
          <span className="eg-label">Ask for an email or mobile</span>
          <select className="eg-input eg-select" value={value.ask_contact} onChange={e => set('ask_contact', e.target.value as AskField)}>
            <option value="off">No</option>
            <option value="optional">Yes, optional</option>
            <option value="required">Yes, required</option>
          </select>
          <span className="eg-help" style={{ display: 'block', marginTop: 6 }}>Handy for following up. A second {kind === 'poll' ? 'vote' : 'answer'} with the same email or mobile is turned away.</span>
        </label>

        <label className="eg-field">
          <span className="eg-label">Let the team know</span>
          <select className="eg-input eg-select" value={value.notify} onChange={e => set('notify', e.target.value as NotifyMode)}>
            <option value="off">Don&apos;t notify</option>
            <option value="each">For each new {kind === 'poll' ? 'vote' : 'response'}</option>
            {kind === 'survey' && <option value="low">Only for low scores</option>}
          </select>
        </label>

        <div className="eg-field" style={{ display: 'grid', gap: 10 }}>
          <span className="eg-label" style={{ marginBottom: 0 }}>One {kind === 'poll' ? 'vote' : 'response'} per person</span>
          {kind === 'poll' ? (
            <label className="eg-toggle">
              <input type="checkbox" checked={value.allow_change} onChange={e => set('allow_change', e.target.checked)} />
              <span>Let people change their vote<small>From the same browser. Otherwise a second try shows what they already voted.</small></span>
            </label>
          ) : <span className="eg-help" style={{ margin: 0 }}>A second try from the same browser, email or mobile is turned away.</span>}
          {kind === 'survey' && (
            <label className="eg-toggle">
              <input type="checkbox" checked={value.allow_repeat} onChange={e => set('allow_repeat', e.target.checked)} />
              <span>Let people answer again a day later<small>For feedback after each visit, delivery or booking.</small></span>
            </label>
          )}
        </div>
      </div>

      <label className="eg-field" style={{ marginTop: 14 }}>
        <span className="eg-label">Thank-you message <small>(optional)</small></span>
        <textarea className="eg-input" rows={2} maxLength={500} value={value.thank_you} onChange={e => set('thank_you', e.target.value)}
          placeholder={kind === 'poll' ? 'Thanks for voting!' : 'Thanks for your feedback. It really helps.'} />
      </label>
    </div>
  )
}
