'use client'

// Builder-only pieces for app/admin/forms/[id]/page.tsx. The classes they use
// (fb-tip, fb-toggle, fb-soft, fb-ghost, fb-pv-*) live in the page's <style>.

import { useState } from 'react'
import type { FormQuestion, WelcomeSettings } from '@/lib/form-logic'
import { MAX_BUTTON_TEXT } from '@/lib/form-logic'
import { isExclusiveLabel, otherChoiceLabel } from '@/lib/form-choice-options'
import {
  OTHER_OPTION_TYPES, buttonTextPatch, countPatch, hasOtherOption, isExclusiveChoice, isMultiSelect,
  responseCountText, rulesSetText, setExclusive, setOtherOption, timePatch,
} from './helpers'

export function Toggle({ on, onChange, label, color }: { on: boolean; onChange: (on: boolean) => void; label: string; color: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="fb-toggle"
      onClick={() => onChange(!on)} style={{ background: on ? color : '#d1d5db' }}>
      <span style={{ left: on ? 20 : 3 }} />
    </button>
  )
}

/** "?" with a bubble: hover or focus on desktop, tap to toggle on touch (iOS doesn't focus buttons on tap). */
export function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <button type="button" className="fb-tip" aria-label={text} data-tip={text} data-open={open ? 'true' : undefined}
      onClick={() => setOpen(o => !o)} onBlur={() => setOpen(false)}
      onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>?</button>
  )
}

export function BranchIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="5" r="2.2" /><circle cx="6" cy="19" r="2.2" /><circle cx="18" cy="8" r="2.2" />
      <path d="M6 7.2v9.6" /><path d="M18 10.2c0 4-6 3.5-11 7" />
    </svg>
  )
}

/** Typeform-style panel icon: a rect with a divider near the left (or right) edge. */
export function PanelIcon({ side }: { side: 'left' | 'right' }) {
  const x = side === 'left' ? 9 : 15
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" /><line x1={x} y1="4" x2={x} y2="20" />
    </svg>
  )
}

const LABEL = { fontSize: 13, color: 'var(--ink)', fontWeight: 600 } as const
const SUB = { fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 8 } as const

/** Right-panel settings shown when "Welcome screen" is selected. */
export function WelcomeSettingsPanel({ welcome, onPatch, themeColor, uploading, onUpload }: {
  welcome: WelcomeSettings
  onPatch: (patch: Partial<WelcomeSettings>) => void
  themeColor: string
  uploading: boolean
  onUpload: (file: File) => void
}) {
  const text = welcome.buttonText ?? 'Start'
  const timeOn = welcome.showTimeToComplete !== false
  const countOn = welcome.showResponseCount === true
  return (
    <div>
      <h3 className="fb-h">Welcome screen</h3>
      <div className="fb-set-row">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={LABEL}>Time to complete</span>
          <Tip text="Shows roughly how long the form takes, based on how many questions people will see." />
        </span>
        <Toggle on={timeOn} onChange={v => onPatch(timePatch(v))} label="Time to complete" color={themeColor} />
      </div>
      <div className="fb-set-row">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={LABEL}>Number of submissions</span>
          <Tip text="Shows how many people have filled this out, once at least one person has." />
        </span>
        <Toggle on={countOn} onChange={v => onPatch(countPatch(v))} label="Number of submissions" color={themeColor} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <label htmlFor="fb-welcome-btn" style={{ ...SUB, marginBottom: 0 }}>Button</label>
          <span aria-live="polite" style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: text.length >= MAX_BUTTON_TEXT ? '#b45309' : 'var(--slate)', fontWeight: text.length >= MAX_BUTTON_TEXT ? 700 : 500 }}>
            {text.length}/{MAX_BUTTON_TEXT}
          </span>
        </div>
        <input id="fb-welcome-btn" value={text} maxLength={MAX_BUTTON_TEXT} placeholder="Start"
          onChange={e => onPatch(buttonTextPatch(e.target.value))}
          className="fb-field" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <span style={SUB}>Image or video</span>
        {welcome.mediaUrl ? (
          <div style={{ position: 'relative' }}>
            {welcome.mediaType === 'video'
              ? <video src={welcome.mediaUrl} controls style={{ width: '100%', borderRadius: 10, maxHeight: 140, objectFit: 'cover' }} />
              : <img src={welcome.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, maxHeight: 140, objectFit: 'cover' }} />}
            <button type="button" aria-label="Remove image or video" onClick={() => onPatch({ mediaUrl: undefined, mediaType: undefined })}
              style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        ) : (
          <label className="fb-soft" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, color: themeColor, fontSize: 12, fontWeight: 600, cursor: uploading ? 'wait' : 'pointer' }}>
            {uploading ? 'Uploading...' : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add image or video
              </>
            )}
            <input type="file" accept="image/*,video/*" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onUpload(f) }} />
          </label>
        )}
      </div>
    </div>
  )
}

/** The welcome card in the live preview. */
export function WelcomePreview({ title, welcomeMessage, onWelcomeMessage, welcome, buttonText, minutes, responseCount }: {
  title: string
  welcomeMessage: string
  onWelcomeMessage: (v: string) => void
  welcome: WelcomeSettings
  buttonText: string
  minutes: number
  responseCount: number | null
}) {
  const timeOn = welcome.showTimeToComplete !== false
  const countOn = welcome.showResponseCount === true
  const media = welcome.mediaUrl && (welcome.mediaType === 'image' || welcome.mediaType === 'video') ? welcome.mediaUrl : ''
  return (
    <div className="fb-pv-in" style={{ textAlign: 'center' }}>
      {media && (welcome.mediaType === 'video'
        ? <video src={media} controls style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 220, objectFit: 'cover' }} />
        : <img src={media} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 220, objectFit: 'cover' }} />)}
      <h1 style={{ fontSize: 28, fontWeight: 600, color: '#0d0d0d', marginBottom: 10, lineHeight: 1.25, letterSpacing: '-0.015em' }}>{title}</h1>
      <textarea className="fb-bare" value={welcomeMessage} onChange={e => onWelcomeMessage(e.target.value)} placeholder="Add a welcome message (optional)"
        style={{ fontSize: 16, color: '#4b5563', lineHeight: 1.55, marginBottom: 24, border: 'none', outline: 'none', resize: 'none', width: '100%', background: 'transparent', textAlign: 'center' }} rows={2} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <span className="fb-pv-ok" style={{ fontSize: 17, padding: '10px 22px' }}>{buttonText}</span>
        <span style={{ fontSize: 12, color: '#6b6b70' }}>press <b style={{ color: '#3f3f46' }}>Enter ↵</b></span>
      </div>
      {(timeOn || countOn) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 14 }}>
          {timeOn && (
            <p className="fb-pv-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
              Takes {minutes} minute{minutes === 1 ? '' : 's'}
            </p>
          )}
          {countOn && (responseCount && responseCount > 0 ? (
            <p className="fb-pv-meta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {responseCountText(responseCount)}
            </p>
          ) : (
            <p className="fb-pv-meta" style={{ fontStyle: 'italic', color: '#9ca3af' }}>Shows once someone has filled this out</p>
          ))}
        </div>
      )}
    </div>
  )
}

/** The "Logic" row that replaced the inline Conditional Logic editor. */
export function LogicRow({ count, errors, onOpen }: { count: number; errors: number; onOpen: () => void }) {
  return (
    <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ ...LABEL, display: 'flex', alignItems: 'center', gap: 6 }}><BranchIcon size={13} />Logic</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>
            {count ? rulesSetText(count) : 'Show, hide, skip or score this question'}
          </span>
          {errors > 0 && (
            <span style={{ display: 'block', fontSize: 11.5, color: '#dc2626', fontWeight: 600, marginTop: 2 }}>
              {errors} rule{errors === 1 ? ' needs' : 's need'} attention
            </span>
          )}
        </div>
        <button type="button" className="fb-ghost" onClick={onOpen}
          style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          Open Logic
        </button>
      </div>
    </div>
  )
}

/** '"Other" option' toggle and per-option "Don't allow with other answers" toggles. */
export function ChoiceOptionSettings({ q, themeColor, onChange }: { q: FormQuestion; themeColor: string; onChange: (next: FormQuestion) => void }) {
  const showOther = OTHER_OPTION_TYPES.includes(q.type)
  const multi = isMultiSelect(q)
  if (!showOther && !multi) return null
  const other = otherChoiceLabel(q)
  const labels = Array.from(new Set((q.options || []).filter(o => typeof o === 'string' && o.trim() !== '' && o !== other)))
  return (
    <div style={{ marginBottom: 16 }}>
      {showOther && (
        <div className="fb-set-row">
          <span>
            <span style={{ ...LABEL, display: 'block' }}>&ldquo;Other&rdquo; option</span>
            <span style={{ fontSize: 11.5, color: 'var(--slate)' }}>Adds a box to type their own answer</span>
          </span>
          <Toggle on={hasOtherOption(q)} onChange={v => onChange(setOtherOption(q, v))} label={'"Other" option'} color={themeColor} />
        </div>
      )}
      {multi && labels.length > 0 && (
        <div>
          <span style={{ ...SUB, marginBottom: 2 }}>Don&rsquo;t allow with other answers</span>
          <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', marginBottom: 8 }}>Picking one of these clears the rest, like &ldquo;None&rdquo;.</span>
          {labels.map(l => (
            <div key={l} className="fb-set-row" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {l}{isExclusiveLabel(l) && <span style={{ fontSize: 11, color: 'var(--slate)', marginLeft: 6 }}>auto</span>}
              </span>
              <Toggle on={isExclusiveChoice(q, l)} onChange={v => onChange(setExclusive(q, l, v))} label={`Don't allow "${l}" with other answers`} color={themeColor} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
