// Admin styles for announcements (an-* classes). Admin CSS variables, so dark
// mode follows; full width of the admin content area at every size.

export const ADMIN_CSS = `
.an-root { --an-card: var(--card, #fff); --an-line: var(--border, #f0f0f0); --an-soft: var(--canvas, #fafafa); --an-strong: #e4e4e7; width: 100%; min-width: 0; box-sizing: border-box; padding: 18px 16px 48px; color: var(--ink); }
@media (min-width: 640px) { .an-root { padding: 22px 20px 56px; } }
@media (min-width: 1024px) { .an-root { padding: 26px 32px 64px; } }
[data-theme="dark"] .an-root { --an-strong: #3a3a3a; }
.an-root *, .an-root *::before, .an-root *::after { box-sizing: border-box; }
.an-root :focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
.an-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.an-dim { color: var(--slate); }

.an-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 38px; padding: 0 15px; border-radius: 10px; border: 1px solid var(--an-strong); background: var(--an-card); color: var(--ink); font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background .15s, border-color .15s, opacity .15s; }
.an-btn:hover:not([disabled]) { background: var(--an-soft); border-color: #d4d4d8; }
.an-btn[disabled] { opacity: .55; cursor: default; }
.an-btn-primary { background: var(--coral); border-color: var(--coral); color: #fff; }
.an-btn-primary:hover:not([disabled]) { background: var(--coral-hover, #f56354); border-color: var(--coral-hover, #f56354); }
.an-btn-ghost { border-color: transparent; background: transparent; }
.an-btn-sm { height: 32px; padding: 0 11px; font-size: 13px; border-radius: 9px; }
.an-btn-ai { color: #6d28d9; border-color: #ddd6fe; background: #f5f3ff; }
.an-btn-ai:hover:not([disabled]) { background: #ede9fe; border-color: #c4b5fd; }
[data-theme="dark"] .an-btn-ai { background: rgba(124,58,237,.14); border-color: rgba(124,58,237,.35); color: #c4b5fd; }
.an-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; border: 1px solid transparent; background: transparent; color: var(--slate); cursor: pointer; flex-shrink: 0; }
.an-icon-btn:hover { background: var(--an-soft); color: var(--ink); border-color: var(--an-line); }

.an-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.an-h1 { font-size: 26px; font-weight: 700; margin: 0; line-height: 1.2; color: var(--ink); }
.an-sub { margin: 4px 0 0; font-size: 13.5px; color: var(--slate); }
.an-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }

.an-notice { display: flex; gap: 10px; align-items: flex-start; margin: 16px 0 0; padding: 12px 14px; border-radius: 12px; border: 1px solid #fde68a; background: #fffbeb; color: #92400e; font-size: 13.5px; line-height: 1.45; }
[data-theme="dark"] .an-notice { background: rgba(217,119,6,.12); border-color: rgba(217,119,6,.35); color: #fcd34d; }
.an-notice svg { flex-shrink: 0; margin-top: 1px; }

.an-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 18px; }
.an-kpi { border: 1px solid var(--an-line); background: var(--an-card); border-radius: 14px; padding: 14px 16px; min-width: 0; }
.an-kpi-label { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; color: var(--slate); }
.an-kpi-num { margin-top: 6px; font-size: 24px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1.1; }
.an-kpi-hint { margin-top: 2px; font-size: 12px; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.an-toolbar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 18px 0 14px; }
.an-search { position: relative; display: flex; align-items: center; gap: 8px; flex: 1 1 240px; min-width: 0; height: 38px; padding: 0 10px 0 12px; border: 1px solid var(--an-strong); border-radius: 10px; background: var(--an-card); color: var(--slate); }
.an-search:focus-within { border-color: var(--coral); }
.an-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 14px; color: var(--ink); }
.an-seg { display: inline-flex; padding: 3px; gap: 2px; border: 1px solid var(--an-strong); border-radius: 10px; background: var(--an-soft); overflow-x: auto; max-width: 100%; scrollbar-width: none; }
.an-seg::-webkit-scrollbar { display: none; }
.an-seg-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 30px; padding: 0 11px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--slate); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; flex-shrink: 0; }
.an-seg-btn:hover { color: var(--ink); }
.an-seg-btn.on { background: var(--an-card); color: var(--ink); border-color: var(--an-strong); }
.an-seg-n { font-weight: 500; color: var(--slate); margin-left: 3px; }
.an-select { height: 38px; padding: 0 10px; border: 1px solid var(--an-strong); border-radius: 10px; background: var(--an-card); color: var(--ink); font-size: 13.5px; font-weight: 600; cursor: pointer; max-width: 100%; }

.an-pill { display: inline-flex; align-items: center; gap: 5px; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.an-pill::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.an-pill.s-published { background: #dcfce7; color: #15803d; }
.an-pill.s-scheduled { background: #e0f2fe; color: #0369a1; }
.an-pill.s-draft { background: var(--an-soft); color: var(--slate); border: 1px solid var(--an-line); }
.an-pill.s-expired { background: #f4f4f5; color: #71717a; }
[data-theme="dark"] .an-pill.s-published { background: rgba(34,197,94,.16); color: #4ade80; }
[data-theme="dark"] .an-pill.s-scheduled { background: rgba(14,165,233,.16); color: #7dd3fc; }
.an-cat { display: inline-flex; align-items: center; height: 20px; padding: 0 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; white-space: nowrap; }
.an-tag { display: inline-flex; align-items: center; gap: 4px; height: 20px; padding: 0 7px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--slate); background: var(--an-soft); border: 1px solid var(--an-line); white-space: nowrap; }

/* List */
.an-list { width: 100%; border: 1px solid var(--an-line); border-radius: 14px; background: var(--an-card); }
.an-list-head, .an-row { display: grid; grid-template-columns: minmax(0, 3.4fr) minmax(150px, 1.2fr) minmax(70px, .6fr) minmax(80px, .6fr) minmax(110px, .9fr) 44px; align-items: center; column-gap: 16px; padding: 0 10px 0 16px; }
.an-list-head { height: 40px; border-bottom: 1px solid var(--an-line); font-size: 12px; font-weight: 600; color: var(--slate); text-transform: uppercase; letter-spacing: .04em; }
.an-row { position: relative; min-height: 76px; border-bottom: 1px solid var(--an-line); font-size: 14px; transition: background .12s; }
.an-row:last-child { border-bottom: none; border-radius: 0 0 14px 14px; }
.an-row:hover { background: var(--an-soft); }
.an-row.menu-open { z-index: 3; }
.an-main { display: flex; align-items: center; gap: 14px; min-width: 0; padding: 12px 0; }
.an-thumb { width: 64px; height: 48px; border-radius: 10px; object-fit: cover; flex-shrink: 0; border: 1px solid var(--an-line); background: var(--an-soft); }
.an-thumb-ph { display: inline-flex; align-items: center; justify-content: center; }
.an-main-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.an-title { color: var(--ink); text-decoration: none; font-weight: 600; font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-title:hover { text-decoration: underline; }
.an-row-link::after { content: ''; position: absolute; inset: 0; z-index: 0; }
.an-excerpt { font-size: 12.5px; color: var(--slate); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.an-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.an-cell { min-width: 0; font-size: 13.5px; }
.an-when { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
.an-when-text { font-size: 12.5px; color: var(--slate); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.an-num { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
.an-sent { display: flex; flex-direction: column; gap: 2px; font-size: 12.5px; color: var(--slate); }
.an-sent span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
.an-send-btn { position: relative; z-index: 1; }
.an-cell-menu { position: relative; z-index: 1; display: flex; justify-content: flex-end; }
.an-mobile-meta { display: none; }

/* Grid */
.an-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; width: 100%; }
.an-card { position: relative; display: flex; flex-direction: column; min-width: 0; border: 1px solid var(--an-line); border-radius: 14px; background: var(--an-card); transition: border-color .15s, box-shadow .15s; }
.an-card:hover { border-color: var(--an-strong); box-shadow: 0 6px 18px -12px rgba(0,0,0,.25); }
.an-card.menu-open { z-index: 3; }
.an-card-cover { display: block; aspect-ratio: 16 / 8; border-radius: 13px 13px 0 0; overflow: hidden; background: var(--an-soft); }
.an-card-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
.an-card-cover.ph { display: flex; align-items: center; justify-content: center; }
.an-card-body { display: flex; flex-direction: column; gap: 8px; padding: 12px 10px 14px 16px; }
.an-card-top { display: flex; align-items: flex-start; gap: 8px; }
.an-card-title { flex: 1; min-width: 0; font-weight: 600; font-size: 15px; color: var(--ink); text-decoration: none; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.an-card-stats { display: flex; gap: 12px; font-size: 12.5px; color: var(--slate); flex-wrap: wrap; }
.an-card-stats span { display: inline-flex; align-items: center; gap: 4px; }

/* Menu */
.an-menu-wrap { position: relative; }
.an-menu { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; min-width: 220px; padding: 6px; border: 1px solid var(--an-strong); border-radius: 12px; background: var(--an-card); box-shadow: 0 16px 40px -16px rgba(0,0,0,.3); }
.an-menu-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; border-radius: 8px; background: none; color: var(--ink); font-size: 13.5px; font-weight: 500; text-align: left; text-decoration: none; cursor: pointer; }
.an-menu-item svg { color: var(--slate); flex-shrink: 0; }
.an-menu-item:hover { background: var(--an-soft); }
.an-menu-item.is-danger, .an-menu-item.is-danger svg { color: #dc2626; }
.an-menu-item.is-danger:hover { background: #fef2f2; }
.an-menu-sep { height: 1px; margin: 5px 4px; background: var(--an-line); }

/* Empty / loading */
.an-empty { width: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding: 64px 20px; border: 1px dashed var(--an-strong); border-radius: 16px; background: var(--an-card); }
.an-empty-art { display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 18px; background: var(--peach, #fff4f1); color: var(--coral); margin-bottom: 16px; }
.an-empty-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--ink); }
.an-empty-text { margin: 6px 0 0; font-size: 14px; color: var(--slate); line-height: 1.5; max-width: 520px; }
.an-empty-actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 20px; }
.an-skel-row { display: flex; align-items: center; gap: 12px; height: 76px; padding: 0 16px; border-bottom: 1px solid var(--an-line); }
.an-skel-row:last-child { border-bottom: none; }
.an-skel { display: block; border-radius: 8px; background: var(--an-soft); animation: anPulse 1.2s ease-in-out infinite; }
@keyframes anPulse { 50% { opacity: .5; } }
@media (prefers-reduced-motion: reduce) { .an-skel { animation: none; } }

.an-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 60; max-width: calc(100vw - 32px); padding: 10px 16px; border-radius: 12px; background: var(--ink, #111); color: var(--an-card, #fff); font-size: 13.5px; font-weight: 500; box-shadow: 0 10px 30px -10px rgba(0,0,0,.4); display: flex; align-items: center; gap: 10px; }
.an-toast a { color: inherit; font-weight: 700; }

/* Dialog */
.an-overlay { position: fixed; inset: 0; z-index: 70; background: rgba(15,15,20,.42); display: flex; align-items: center; justify-content: center; padding: 16px; }
.an-dialog { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--an-card, #fff); color: var(--ink); border-radius: 18px; border: 1px solid var(--an-line); box-shadow: 0 30px 80px -20px rgba(0,0,0,.45); }
.an-dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 20px 6px; }
.an-dialog-title { margin: 0; font-size: 18px; font-weight: 700; }
.an-dialog-sub { margin: 4px 0 0; font-size: 13.5px; color: var(--slate); line-height: 1.45; }
.an-dialog-body { padding: 10px 20px 4px; display: flex; flex-direction: column; gap: 10px; }
.an-dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px 20px; flex-wrap: wrap; }
.an-choice { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border: 1px solid var(--an-line); border-radius: 12px; cursor: pointer; background: var(--an-card); }
.an-choice:hover { border-color: var(--an-strong); }
.an-choice.on { border-color: var(--coral); box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 14%, transparent); }
.an-choice input { margin-top: 3px; accent-color: var(--coral); width: 16px; height: 16px; flex-shrink: 0; }
.an-choice-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: var(--an-soft); color: var(--ink); flex-shrink: 0; }
.an-choice-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 13px; color: var(--slate); line-height: 1.4; }
.an-choice-text strong { font-size: 14px; color: var(--ink); font-weight: 600; }

/* Phones and narrow tablets */
@media (max-width: 900px) {
  .an-list-head { display: none; }
  .an-row { grid-template-columns: minmax(0, 1fr) 40px; padding: 0 6px 0 12px; column-gap: 8px; }
  .an-row > .an-cell { display: none; }
  .an-mobile-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; margin-top: 4px; font-size: 12.5px; color: var(--slate); }
  .an-thumb { width: 52px; height: 52px; }
  .an-h1 { font-size: 22px; }
  .an-search { flex-basis: 100%; }
}
`
