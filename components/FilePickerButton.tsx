'use client'

import { useRef } from 'react'

/**
 * A styled file picker.
 *
 * The native <input type="file"> renders differently in every browser and never
 * matches the app's design — the "Choose files" control looked out of place
 * throughout. This hides the input and drives it from a normal button, so it
 * inherits the app's styling everywhere it's used.
 */
interface Props {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  label?: string
  disabled?: boolean
  compact?: boolean
}

export default function FilePickerButton({
  onFiles, accept, multiple = true, label = 'Choose files', disabled, compact,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null)

  return (
    <>
      <input
        ref={ref} type="file" accept={accept} multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => {
          onFiles(Array.from(e.target.files || []))
          // Reset so picking the same file again still fires onChange.
          if (ref.current) ref.current.value = ''
        }}
      />
      <button
        type="button" disabled={disabled}
        onClick={() => ref.current?.click()}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: compact ? '7px 12px' : '9px 14px',
          borderRadius: 9, border: '1px dashed var(--border)',
          background: 'var(--canvas)', color: 'var(--slate)',
          fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1, width: '100%', justifyContent: 'center',
        }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {label}
      </button>
    </>
  )
}
