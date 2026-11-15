'use client'

// "Assisted by Colvy AI": on a note or task Colvy AI created or changed when a
// teammate asked it to (lib/note-ai, lib/ai-assistant). Colvy AI's own coral,
// whatever the workspace's brand colour. Hover for what it did and for whom.

export default function AiAssistedBadge({ title, compact = false }: { title?: string; compact?: boolean }) {
  return (
    <span className={'ai-assisted' + (compact ? ' compact' : '')} title={title || 'Colvy AI helped with this'}>
      <style>{`
        .ai-assisted { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 11px 0 9px; border-radius: 999px; background: linear-gradient(135deg, #fff1ee, #fff6f0); color: #d4432f; font-size: 12.5px; font-weight: 700; letter-spacing: -.005em; white-space: nowrap; box-shadow: inset 0 0 0 1px rgba(255,122,107,.22); flex-shrink: 0; }
        .ai-assisted.compact { height: 22px; padding: 0 8px 0 6px; font-size: 11.5px; gap: 4px; }
        .ai-assisted svg { flex-shrink: 0; }
        [data-theme="dark"] .ai-assisted { background: rgba(255,122,107,.14); color: #ff9d91; box-shadow: inset 0 0 0 1px rgba(255,122,107,.28); }
      `}</style>
      <svg width={compact ? 12 : 14} height={compact ? 12 : 14} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
        <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity=".7" />
      </svg>
      Assisted by Colvy AI
    </span>
  )
}
