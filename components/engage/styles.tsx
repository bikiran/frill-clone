// eg-* styles for the poll and survey detail pages (editor, share, results
// extras). The page layout, cards, tabs, KPI tiles and bars come from the form
// Results styles (components/form-results/styles.tsx, fr-* classes), so polls,
// surveys and forms look like one product. Admin CSS variables, so dark mode follows.

const CSS = `
.eg-h3 { font-size: 14px; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
.eg-h2 { font-size: 16px; font-weight: 700; color: var(--ink); margin: 0 0 4px; }
.eg-help { font-size: 12.5px; color: var(--slate); margin: 0 0 10px; line-height: 1.5; }
.eg-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.eg-grow { flex: 1 1 220px; min-width: 0; }
.eg-stack { display: flex; flex-direction: column; gap: 8px; align-items: stretch; }
.eg-stack .fr-btn { justify-content: flex-start; }
.eg-input { height: 38px; border-radius: 10px; border: 1px solid var(--fr-strong, #e4e4e7); background: var(--card, #fff); color: var(--ink); font-size: 14px; padding: 0 12px; width: 100%; min-width: 0; font-family: inherit; }
textarea.eg-input { height: auto; padding: 10px 12px; line-height: 1.45; resize: vertical; }
.eg-input:focus { outline: none; border-color: var(--coral); box-shadow: 0 0 0 3px rgba(255,122,107,.15); }
.eg-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: var(--canvas, #fafafa); }
.eg-select { appearance: auto; }
.eg-btn-coral { background: var(--coral); border-color: var(--coral); color: #fff; }
.eg-btn-coral:hover:not([disabled]) { background: var(--coral-hover, #f56354); border-color: var(--coral-hover, #f56354); }
.eg-note { display: flex; gap: 10px; align-items: flex-start; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--fr-line, #f0f0f0); background: var(--canvas, #fafafa); color: var(--slate); font-size: 13px; line-height: 1.45; margin-bottom: 14px; }
.eg-note svg { margin-top: 1px; }
.eg-note.is-warn { border-color: #fde68a; background: #fffbeb; color: #92400e; }
.eg-note.is-ok { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
[data-theme="dark"] .eg-note.is-warn { background: rgba(251,191,36,.1); border-color: rgba(251,191,36,.3); color: #fcd34d; }
[data-theme="dark"] .eg-note.is-ok { background: rgba(34,197,94,.1); border-color: rgba(34,197,94,.3); color: #86efac; }

.eg-share { display: flex; flex-direction: column; gap: 16px; }
.eg-share-sec { background: var(--card, #fff); border: 1px solid var(--fr-line, #f0f0f0); border-radius: 14px; padding: 16px 18px; min-width: 0; }
.eg-share.is-compact .eg-share-sec { padding: 0; border: none; background: none; }
.eg-share-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr)); gap: 16px; }
.eg-qr { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.eg-qr img, .eg-qr-empty { width: 150px; height: 150px; border-radius: 12px; border: 1px solid var(--fr-line, #f0f0f0); background: #fff; image-rendering: pixelated; }
.eg-qr-empty { display: flex; align-items: center; justify-content: center; color: var(--slate); background: var(--canvas, #fafafa); }

/* Detail header actions */
.eg-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.eg-pill { font-size: 12px; padding: 3px 10px; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
.eg-pill.is-live { background: #dcfce7; color: #15803d; }
.eg-pill.is-closed { background: #f1f5f9; color: #475569; }
.eg-pill.is-draft { background: transparent; color: var(--slate); border: 1px dashed var(--fr-strong, #e4e4e7); }
[data-theme="dark"] .eg-pill.is-live { background: rgba(34,197,94,.16); color: #4ade80; }
[data-theme="dark"] .eg-pill.is-closed { background: rgba(148,163,184,.14); color: #cbd5e1; }
.eg-sub { margin: 8px 0 0; font-size: 13.5px; color: var(--slate); overflow-wrap: anywhere; }
.eg-live { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--slate); }
.eg-live-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 0 0 rgba(34,197,94,.5); animation: egPulse 2s infinite; }
@keyframes egPulse { 0% { box-shadow: 0 0 0 0 rgba(34,197,94,.5); } 70% { box-shadow: 0 0 0 8px rgba(34,197,94,0); } 100% { box-shadow: 0 0 0 0 rgba(34,197,94,0); } }
@media (prefers-reduced-motion: reduce) { .eg-live-dot { animation: none; } }

/* Results extras */
.eg-results { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
@media (min-width: 1100px) { .eg-results.has-side { grid-template-columns: minmax(0, 1.6fr) minmax(min(320px, 100%), 1fr); } }
.eg-bar-big .fr-track { height: 14px; }
.eg-bar-big .fr-bar-top { font-size: 14px; }
.eg-lead { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 6px; background: #fef3c7; color: #92400e; }
.eg-score { font-size: 44px; font-weight: 800; line-height: 1; color: var(--ink); font-variant-numeric: tabular-nums; }
.eg-bands { display: flex; height: 14px; border-radius: 999px; overflow: hidden; background: var(--canvas, #fafafa); border: 1px solid var(--fr-line, #f0f0f0); }
.eg-bands span { height: 100%; }
.eg-legend { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 10px; font-size: 12.5px; color: var(--slate); }
.eg-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 6px; vertical-align: 0; }
.eg-comments { display: flex; flex-direction: column; gap: 8px; max-height: 560px; overflow-y: auto; }
.eg-comment { padding: 10px 12px; border-radius: 10px; background: var(--canvas, #fafafa); border: 1px solid var(--fr-line, #f0f0f0); font-size: 13.5px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.eg-comment small { display: flex; gap: 8px; align-items: center; font-size: 11.5px; color: var(--slate); margin-top: 6px; }
.eg-chip { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 20px; padding: 0 6px; border-radius: 6px; font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
.eg-ai { border: 1px solid #e9d5ff; background: linear-gradient(180deg, #faf5ff 0%, var(--card, #fff) 60%); }
[data-theme="dark"] .eg-ai { border-color: rgba(168,85,247,.35); background: var(--card); }
.eg-theme { padding: 10px 0; border-top: 1px solid var(--fr-line, #f0f0f0); }
.eg-theme:first-child { border-top: none; }
.eg-theme q { display: block; margin-top: 4px; font-size: 12.5px; color: var(--slate); font-style: italic; quotes: none; }
.eg-theme q::before { content: '“'; } .eg-theme q::after { content: '”'; }
.eg-tone { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }

/* Responses table extras */
.eg-table td.is-wrap { white-space: normal; max-width: 420px; }

/* Editor */
.eg-editor { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }
@media (min-width: 1100px) { .eg-editor { grid-template-columns: minmax(0, 1.25fr) minmax(min(360px, 100%), 1fr); } .eg-preview-col { position: sticky; top: 16px; } }
.eg-card { background: var(--card, #fff); border: 1px solid var(--fr-line, #f0f0f0); border-radius: 14px; padding: 18px; min-width: 0; }
.eg-card + .eg-card { margin-top: 16px; }
.eg-field { display: block; margin-bottom: 14px; min-width: 0; }
.eg-field:last-child { margin-bottom: 0; }
.eg-label { display: block; font-size: 13px; font-weight: 600; color: var(--ink); margin-bottom: 6px; }
.eg-label small { font-weight: 400; color: var(--slate); }
.eg-types { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.eg-type { text-align: left; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--fr-strong, #e4e4e7); background: var(--card, #fff); cursor: pointer; color: var(--ink); }
.eg-type b { display: block; font-size: 13.5px; }
.eg-type span { font-size: 12px; color: var(--slate); }
.eg-type.on { border-color: var(--coral); box-shadow: 0 0 0 3px rgba(255,122,107,.15); }
.eg-type[disabled] { opacity: .55; cursor: not-allowed; }
.eg-opt { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 10px; border: 1px solid var(--fr-line, #f0f0f0); border-radius: 12px; background: var(--canvas, #fafafa); margin-bottom: 8px; }
.eg-opt-tools { display: flex; gap: 2px; }
.eg-opt-num { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 38px; font-size: 12px; font-weight: 700; color: var(--slate); }
.eg-opt-img { width: 38px; height: 38px; border-radius: 8px; object-fit: cover; border: 1px solid var(--fr-line, #f0f0f0); }
.eg-settings { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(260px, 100%), 1fr)); gap: 14px 18px; }
.eg-toggle { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; font-size: 13.5px; color: var(--ink); }
.eg-toggle input { width: 16px; height: 16px; margin-top: 2px; accent-color: var(--coral); flex-shrink: 0; }
.eg-toggle small { display: block; color: var(--slate); font-size: 12px; margin-top: 2px; }
.eg-savebar { position: sticky; bottom: 0; z-index: 6; display: flex; align-items: center; gap: 10px; justify-content: flex-end; flex-wrap: wrap; padding: 12px 0; margin-top: 16px; background: linear-gradient(180deg, transparent, var(--canvas, #fafafa) 30%); }
.eg-savebar .eg-saved { font-size: 12.5px; color: var(--slate); margin-right: auto; }
.eg-preview-frame { border-radius: 16px; border: 1px solid var(--fr-line, #f0f0f0); background: var(--canvas, #fafafa); padding: 18px; }
.eg-preview-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--slate); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; }

/* Template picker */
.eg-modal-back { position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.4); backdrop-filter: blur(2px); }
.eg-modal { position: fixed; z-index: 51; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(760px, calc(100% - 32px)); max-height: calc(100vh - 48px); overflow-y: auto; background: var(--card, #fff); border: 1px solid var(--border, #f0f0f0); border-radius: 18px; box-shadow: 0 30px 80px -20px rgba(0,0,0,.35); color: var(--ink); }
.eg-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--border, #f0f0f0); }
.eg-modal-body { padding: 18px 20px 22px; }
.eg-tpls { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.eg-tpl { text-align: left; padding: 14px; border-radius: 12px; border: 1px solid var(--fr-strong, #e4e4e7); background: var(--card, #fff); cursor: pointer; color: var(--ink); display: flex; flex-direction: column; gap: 4px; min-height: 92px; }
.eg-tpl:hover:not([disabled]) { border-color: var(--coral); }
.eg-tpl b { font-size: 14px; }
.eg-tpl span { font-size: 12.5px; color: var(--slate); line-height: 1.4; }
.eg-tpl[disabled] { opacity: .6; cursor: default; }
.eg-tpl.is-ai { border-style: dashed; }

.eg-toast { position: fixed; z-index: 80; left: 50%; transform: translateX(-50%); bottom: 20px; max-width: calc(100% - 32px); padding: 12px 16px; border-radius: 12px; background: #111827; color: #fff; font-size: 13.5px; font-weight: 500; box-shadow: 0 10px 30px rgba(0,0,0,.3); }
`

export function EngageStyles() {
  return <style>{CSS}</style>
}
