// Scoped styles for the Results page (fr-* classes), in the same inline <style>
// pattern the builder uses for its fb-* classes. Colours come from the admin's
// CSS variables so dark mode follows along.

const CSS = `
.fr-root { --fr-card: var(--card, #fff); --fr-line: var(--border, #f0f0f0); --fr-soft: var(--canvas, #fafafa); --fr-strong: #e4e4e7; padding: 16px; width: 100%; min-width: 0; color: var(--ink); }
@media (min-width: 640px) { .fr-root { padding: 20px; } }
@media (min-width: 1024px) { .fr-root { padding: 24px 28px; } }
[data-theme="dark"] .fr-root { --fr-strong: #3a3a3a; }
.fr-root *, .fr-drawer * { box-sizing: border-box; }

.fr-card { background: var(--fr-card); border: 1px solid var(--fr-line); border-radius: 14px; min-width: 0; }
.fr-muted { color: var(--slate); }
.fr-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--fr-strong); background: var(--fr-card); color: var(--ink); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; text-decoration: none; transition: background .15s, border-color .15s; }
.fr-btn:hover:not([disabled]) { background: var(--fr-soft); border-color: #d4d4d8; }
.fr-btn[disabled], .fr-btn[aria-disabled="true"] { opacity: .5; cursor: not-allowed; }
.fr-btn-sm { height: 30px; padding: 0 10px; font-size: 12.5px; border-radius: 8px; }
.fr-btn-danger { color: #dc2626; border-color: #fecaca; }
.fr-btn-danger:hover:not([disabled]) { background: #fef2f2; border-color: #fca5a5; }
.fr-btn-primary { background: #18181b; border-color: #18181b; color: #fff; }
.fr-btn-primary:hover:not([disabled]) { background: #000; border-color: #000; }
.fr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--slate); cursor: pointer; }
.fr-icon-btn:hover:not([disabled]) { background: var(--fr-soft); color: var(--ink); border-color: var(--fr-line); }
.fr-icon-btn[disabled] { opacity: .35; cursor: default; }
.fr-link { background: none; border: none; padding: 0; color: var(--coral); font-weight: 600; font-size: 13px; cursor: pointer; }
.fr-link:hover { text-decoration: underline; }
.fr-root :focus-visible, .fr-drawer :focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }

.fr-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.fr-title { font-size: 22px; font-weight: 700; color: var(--ink); margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-pill { font-size: 12px; padding: 3px 10px; border-radius: 999px; font-weight: 600; flex-shrink: 0; }
.fr-tabs { display: flex; gap: 22px; border-bottom: 1px solid var(--fr-line); margin-top: 14px; overflow-x: auto; scrollbar-width: none; }
.fr-tabs::-webkit-scrollbar { display: none; }
.fr-tab { position: relative; background: none; border: none; padding: 10px 0 11px; font-size: 14px; font-weight: 600; color: var(--slate); cursor: pointer; white-space: nowrap; }
.fr-tab:hover { color: var(--ink); }
.fr-tab[aria-selected="true"] { color: var(--ink); }
.fr-tab[aria-selected="true"]::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--ink); border-radius: 2px; }
.fr-tab-count { font-weight: 500; color: var(--slate); margin-left: 4px; }

.fr-filterbar { position: sticky; top: 0; z-index: 5; background: var(--fr-card); border-bottom: 1px solid var(--fr-line); margin: 0 -16px 18px; padding: 10px 16px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
@media (min-width: 640px) { .fr-filterbar { margin: 0 -20px 18px; padding: 10px 20px; } }
@media (min-width: 1024px) { .fr-filterbar { margin: 0 -28px 20px; padding: 10px 28px; } }
.fr-select, .fr-input { height: 32px; border-radius: 8px; border: 1px solid var(--fr-strong); background: var(--fr-card); color: var(--ink); font-size: 13px; padding: 0 10px; min-width: 0; }
.fr-input:focus, .fr-select:focus { outline: none; border-color: var(--coral); }
.fr-fchip { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 6px 0 10px; border-radius: 999px; border: 1px solid var(--fr-strong); background: var(--fr-soft); font-size: 12.5px; color: var(--ink); max-width: 320px; }
.fr-fchip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-fchip button { display: inline-flex; border: none; background: none; color: var(--slate); cursor: pointer; padding: 2px; border-radius: 999px; }
.fr-fchip button:hover { color: #dc2626; background: #fee2e2; }
.fr-pop { position: absolute; z-index: 30; top: calc(100% + 6px); background: var(--fr-card); border: 1px solid var(--fr-strong); border-radius: 12px; box-shadow: 0 16px 40px -12px rgba(0,0,0,.25); padding: 8px; min-width: 240px; max-width: min(360px, calc(100vw - 32px)); }
.fr-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: none; background: none; border-radius: 8px; font-size: 13px; color: var(--ink); cursor: pointer; text-align: left; }
.fr-menu-item:hover:not([disabled]) { background: var(--fr-soft); }
.fr-menu-item[disabled] { opacity: .45; cursor: default; }
.fr-menu-label { font-size: 11px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .06em; padding: 6px 10px 4px; }

.fr-banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--fr-line); background: var(--fr-soft); color: var(--slate); font-size: 13px; margin-bottom: 14px; }
.fr-banner-warn { border-color: #fde68a; background: #fffbeb; color: #92400e; }

.fr-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 20px; }
.fr-kpi { padding: 14px 16px; }
.fr-kpi-v { font-size: 24px; font-weight: 800; color: var(--ink); line-height: 1.15; margin-top: 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fr-kpi-l { font-size: 12px; color: var(--slate); margin-top: 2px; }
.fr-kpi-s { font-size: 11.5px; color: var(--slate); margin-top: 4px; opacity: .85; }

.fr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(340px, 100%), 1fr)); gap: 16px; align-items: start; }
.fr-root[data-wide="1"] .fr-span2 { grid-column: span 2; }
.fr-qcard { padding: 18px; }
.fr-qhead { display: flex; align-items: flex-start; gap: 10px; }
.fr-num { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 24px; padding: 0 7px; border-radius: 6px; font-size: 12px; font-weight: 700; flex-shrink: 0; }
.fr-type { font-size: 11.5px; color: var(--slate); font-weight: 600; }
.fr-qtitle { font-size: 15px; font-weight: 700; color: var(--ink); margin: 1px 0 0; overflow-wrap: anywhere; }
.fr-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 6px; background: #ebe5fc; color: #6a45d6; flex-shrink: 0; }
.fr-meta { font-size: 12px; color: var(--slate); margin: 10px 0 14px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

.fr-bar-row { margin-bottom: 10px; }
.fr-bar-top { display: flex; align-items: center; gap: 8px; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.fr-bar-label { color: var(--ink); min-width: 0; overflow-wrap: anywhere; display: flex; align-items: center; gap: 8px; }
.fr-bar-num { color: var(--slate); font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
.fr-track { height: 8px; border-radius: 999px; background: var(--fr-soft); border: 1px solid var(--fr-line); overflow: hidden; }
.fr-fill { height: 100%; border-radius: 999px; min-width: 0; transition: width .3s ease; }
.fr-thumb { width: 28px; height: 28px; border-radius: 6px; object-fit: cover; border: 1px solid var(--fr-line); flex-shrink: 0; }
.fr-big { font-size: 30px; font-weight: 800; line-height: 1; color: var(--ink); }
.fr-cols { display: flex; align-items: flex-end; gap: 4px; height: 110px; }
.fr-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; min-width: 0; }
.fr-col-bar { width: 100%; border-radius: 5px 5px 2px 2px; min-height: 2px; }
.fr-col-n { font-size: 11px; color: var(--slate); font-variant-numeric: tabular-nums; }
.fr-col-x { font-size: 11px; color: var(--slate); font-weight: 600; }
.fr-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 8px; }
.fr-tile { border: 1px solid var(--fr-line); border-radius: 10px; padding: 10px 12px; background: var(--fr-soft); min-width: 0; }
.fr-tile b { display: block; font-size: 18px; font-weight: 800; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-tile span { font-size: 11.5px; color: var(--slate); }
.fr-list { display: flex; flex-direction: column; gap: 6px; }
.fr-li { padding: 9px 12px; border-radius: 10px; background: var(--fr-soft); border: 1px solid var(--fr-line); font-size: 13.5px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.fr-li small { display: block; font-size: 11px; color: var(--slate); margin-top: 3px; }
.fr-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.fr-gtile { position: relative; aspect-ratio: 1; border-radius: 10px; border: 1px solid var(--fr-line); background: var(--fr-soft); overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 6px; color: var(--slate); font-size: 11px; text-decoration: none; cursor: pointer; }
.fr-gtile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.fr-gtile span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-matrix { width: 100%; border-collapse: separate; border-spacing: 3px; font-size: 12.5px; }
.fr-matrix th { font-weight: 600; color: var(--slate); text-align: center; padding: 4px; }
.fr-matrix th:first-child { text-align: left; }
.fr-matrix td { text-align: center; padding: 7px 4px; border-radius: 6px; font-variant-numeric: tabular-nums; color: var(--ink); }
.fr-matrix td:first-child { text-align: left; font-weight: 600; background: none !important; }
.fr-other { margin: 6px 0 0 0; padding-left: 10px; border-left: 2px solid var(--fr-line); }

.fr-tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 14px; }
.fr-table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; font-size: 13px; }
.fr-table th { position: sticky; top: 0; background: var(--fr-soft); color: var(--slate); font-weight: 600; font-size: 12px; text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--fr-line); white-space: nowrap; max-width: 240px; overflow: hidden; text-overflow: ellipsis; z-index: 1; }
.fr-table td { padding: 10px 12px; border-bottom: 1px solid var(--fr-line); max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); background: var(--fr-card); }
.fr-table tr.fr-row { cursor: pointer; }
.fr-table tr.fr-row:hover td { background: var(--fr-soft); }
.fr-table tr.fr-row.on td { background: #fff7f5; }
.fr-table .fr-sticky { position: sticky; left: 0; z-index: 2; box-shadow: 1px 0 0 var(--fr-line), 6px 0 10px -6px rgba(0,0,0,.12); min-width: 210px; }
.fr-table th.fr-sticky { z-index: 3; }
.fr-skip { font-style: italic; color: var(--slate); }
.fr-dash { color: #c0c4cc; }
.fr-check { width: 16px; height: 16px; cursor: pointer; accent-color: var(--coral); flex-shrink: 0; }
.fr-bulk { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 12px; border: 1px solid #fecaca; background: #fff7f7; margin-bottom: 12px; font-size: 13px; }

.fr-overlay { position: fixed; inset: 0; z-index: 70; background: rgba(0,0,0,.25); animation: frFade .18s ease both; }
.fr-drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 71; width: min(520px, 100vw); background: var(--card, #fff); border-left: 1px solid var(--border, #f0f0f0); display: flex; flex-direction: column; box-shadow: -24px 0 48px -24px rgba(0,0,0,.25); animation: frSlide .26s cubic-bezier(.16,1,.3,1) both; outline: none; color: var(--ink); }
.fr-drawer-head { display: flex; align-items: center; gap: 6px; padding: 12px 14px; border-bottom: 1px solid var(--border, #f0f0f0); }
.fr-drawer-body { flex: 1; overflow-y: auto; padding: 16px 18px 28px; }
.fr-sec { font-size: 11px; font-weight: 700; color: var(--slate); text-transform: uppercase; letter-spacing: .06em; margin: 20px 0 8px; }
.fr-mchip { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--slate); padding: 4px 9px; border-radius: 999px; border: 1px solid var(--border, #f0f0f0); background: var(--canvas, #fafafa); max-width: 100%; }
.fr-mchip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fr-steps { list-style: none; margin: 0; padding: 0; }
.fr-step { position: relative; padding: 0 0 12px 22px; font-size: 13px; color: var(--ink); }
.fr-step::before { content: ''; position: absolute; left: 5px; top: 6px; width: 8px; height: 8px; border-radius: 999px; background: var(--ink); }
.fr-step::after { content: ''; position: absolute; left: 8.5px; top: 16px; bottom: 0; width: 1px; background: var(--fr-strong, #e4e4e7); }
.fr-step:last-child::after { display: none; }
.fr-step small { display: block; color: var(--slate); font-size: 12px; margin-top: 2px; }
.fr-ans { margin-bottom: 14px; }
.fr-ans-q { font-size: 12px; font-weight: 600; color: var(--slate); margin-bottom: 6px; }
.fr-ans-a { border-radius: 12px; padding: 10px 13px; background: var(--canvas, #fafafa); border: 1px solid var(--border, #f0f0f0); font-size: 14px; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }

.fr-paths { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
.fr-root[data-wide="1"] .fr-paths { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.fr-funnel-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; margin-bottom: 10px; font-size: 13px; }
.fr-funnel-row .fr-track { grid-column: 1 / -1; }

.fr-skel { background: linear-gradient(90deg, var(--fr-soft) 25%, var(--fr-line) 50%, var(--fr-soft) 75%); background-size: 200% 100%; animation: frShimmer 1.2s linear infinite; border-radius: 8px; }
@keyframes frShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
@keyframes frFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes frSlide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .fr-overlay, .fr-drawer, .fr-skel, .fr-fill { animation: none !important; transition: none !important; } }
`

export function ResultsStyles() {
  return <style>{CSS}</style>
}
