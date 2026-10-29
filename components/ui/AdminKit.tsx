'use client'

// The Sellio look for the simpler admin pages (Topics, Statuses, Priorities,
// Segments, Billing, Integrations, Audit log, Create company, form versions):
// a display-type header, white rounded panels, grey fields, pill buttons and
// soft list rows. Pages wrap themselves in <AdminPage> and use the ak-*
// classes below for the pieces inside, so they all read as one family.
//
//   ak-btn (+ go | dark | ghost | danger | sm)   pill buttons
//   ak-field / ak-select                          grey inputs
//   ak-label, ak-hint                             field label and help line
//   ak-list + ak-row                              a list of rounded rows
//   ak-seg (button.on)                            a segmented switch
//   ak-chip (.on)                                 filter chips
//   ak-tag (+ green | red | amber | blue | violet) small status pills
//   ak-note (+ info | warn | good | bad)          a message strip
//   ak-icon-btn                                   a round icon button
//   ak-empty                                      an empty state
//   ak-grid2 / ak-tiles + ak-tile                 layouts

export function AdminPage({ title, sub, actions, back, width = 'md', className, children }: {
  title: React.ReactNode
  sub?: React.ReactNode
  actions?: React.ReactNode
  /** A small "back" link above the title. */
  back?: { href: string; label: string }
  /** sm 760 · md 1040 · lg 1280 · xl 1600 */
  width?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`ak ak-${width}${className ? ' ' + className : ''}`}>
      <style>{AK_CSS}</style>
      <header className="ak-head">
        <div style={{ minWidth: 0 }}>
          {back && (
            <a href={back.href} className="ak-back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="15 18 9 12 15 6" /></svg>
              {back.label}
            </a>
          )}
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {actions && <div className="ak-head-acts">{actions}</div>}
      </header>
      {children}
    </div>
  )
}

/** A white rounded panel with an optional title row. */
export function Panel({ title, sub, right, flush, className, children, id }: {
  title?: React.ReactNode
  sub?: React.ReactNode
  right?: React.ReactNode
  /** No inner padding (for lists and tables that run edge to edge). */
  flush?: boolean
  className?: string
  id?: string
  children?: React.ReactNode
}) {
  return (
    <section id={id} className={`ak-panel${flush ? ' flush' : ''}${className ? ' ' + className : ''}`}>
      {(title || right) && (
        <div className="ak-panel-h">
          <div style={{ minWidth: 0 }}>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  )
}

/** An on/off switch. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      className={`ak-switch${on ? ' on' : ''}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  )
}

export const AK_CSS = `
.ak{--f:#f4f4f5;--f2:#ececef;--line:#ececee;--mut:#71717a;--soft:#8e8e93;margin:0 auto;padding:28px 16px 120px;color:var(--ink)}
[data-theme="dark"] .ak{--f:#2a2a2e;--f2:#333337;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
.ak-sm{max-width:760px}.ak-md{max-width:1040px}.ak-lg{max-width:1280px}.ak-xl{max-width:1600px}
@media (min-width:900px){.ak{padding:32px 32px 120px}}
.ak button::before,.ak a::before{display:none!important}
/* The admin column scrolls with the page; clip it sideways so sticky panels stick. */
.admin-main:has(.ak){overflow-x:clip!important;overflow-y:visible!important;min-width:0}
.ak-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.ak-head h1{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:clamp(28px,3.4vw,36px);font-weight:700;letter-spacing:-.04em;line-height:1.05;color:var(--ink)}
.ak-head p{margin:7px 0 0;max-width:640px;font-size:14.5px;line-height:1.5;color:var(--mut)}
.ak-head-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ak-back{display:inline-flex;align-items:center;gap:4px;margin:0 0 10px -4px;padding:4px 10px 4px 4px;border-radius:999px;font-size:13px;font-weight:600;color:var(--mut);text-decoration:none}
.ak-back:hover{background:var(--f);color:var(--ink)}
.ak-panel{margin-bottom:14px;padding:18px 20px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04);min-width:0}
.ak-panel.flush{padding:0;overflow:hidden}
.ak-panel-h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}
.ak-panel.flush .ak-panel-h{margin:0;padding:16px 20px 12px}
.ak-panel-h h2{margin:0;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:17px;font-weight:700;letter-spacing:-.025em;color:var(--ink)}
.ak-panel-h p{margin:3px 0 0;font-size:13px;line-height:1.5;color:var(--mut)}
.ak-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 17px;border:none;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.08);color:var(--ink);font:inherit;font-size:14px;font-weight:600;text-decoration:none;white-space:nowrap;cursor:pointer;transition:background .15s,filter .15s,transform .12s}
.ak-btn:hover{background:var(--f)}
.ak-btn:active{transform:scale(.98)}
.ak-btn:disabled{opacity:.5;cursor:default;transform:none}
.ak-btn.go{background:var(--coral);color:#fff;box-shadow:none}
.ak-btn.go:hover{background:var(--coral);filter:brightness(.95)}
.ak-btn.dark{background:var(--ink);color:var(--card,#fff);box-shadow:none}
.ak-btn.dark:hover{background:var(--ink);filter:brightness(1.15)}
.ak-btn.ghost{background:var(--f);box-shadow:none}
.ak-btn.ghost:hover{background:var(--f2)}
.ak-btn.danger{background:#fef2f2;color:#b91c1c;box-shadow:none}
.ak-btn.danger:hover{background:#fee2e2}
.ak-btn.sm{height:32px;padding:0 13px;font-size:13px}
.ak-icon-btn{width:34px;height:34px;flex-shrink:0;border:none;border-radius:50%;background:transparent;color:var(--mut);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s}
.ak-icon-btn:hover{background:var(--f);color:var(--ink)}
.ak-icon-btn.danger:hover{background:#fef2f2;color:#dc2626}
.ak-label{display:block;margin:0 0 7px;font-size:13px;font-weight:650;color:var(--ink)}
.ak-hint{margin:6px 0 0;font-size:12.5px;line-height:1.5;color:var(--soft)}
.ak .ak-field,.ak .ak-select{width:100%;height:44px;padding:0 14px;border-radius:14px;border:1.5px solid transparent!important;background-color:var(--f)!important;box-shadow:none!important;outline:none;font:inherit;font-size:14.5px;color:var(--ink)!important;box-sizing:border-box;transition:background-color .15s,border-color .15s}
.ak textarea.ak-field{height:auto;min-height:92px;padding:11px 14px;line-height:1.5;resize:vertical}
.ak .ak-field:focus,.ak .ak-select:focus{background-color:var(--card,#fff)!important;border-color:var(--f2)!important}
.ak .ak-field.sm,.ak .ak-select.sm{height:36px;border-radius:11px;font-size:13.5px;padding:0 11px}
.ak .ak-select{appearance:none;-webkit-appearance:none;padding-right:34px;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:right 12px center!important;background-size:14px!important}
.ak-field::placeholder{color:var(--soft)}
.ak-list{display:flex;flex-direction:column}
.ak-row{display:flex;align-items:center;gap:12px;min-height:52px;padding:10px 12px;border-radius:14px;transition:background .15s}
.ak-row:hover{background:color-mix(in srgb,var(--f) 65%,transparent)}
.ak-row.on{background:var(--f)}
.ak-row+.ak-row{box-shadow:0 -1px 0 var(--line)}
.ak-row:hover+.ak-row,.ak-row+.ak-row:hover{box-shadow:none}
.ak-row-t{flex:1;min-width:0}
.ak-row-t b{display:block;font-size:14.5px;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ak-row-t small{display:block;margin-top:1px;font-size:12.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ak-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:var(--f);max-width:100%;overflow-x:auto;scrollbar-width:none}
.ak-seg::-webkit-scrollbar{display:none}
.ak-seg button{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 15px;border:none;border-radius:999px;background:none;font:inherit;font-size:13.5px;font-weight:600;color:var(--mut);cursor:pointer;white-space:nowrap}
.ak-seg button:hover{color:var(--ink)}
.ak-seg button.on{background:var(--card,#fff);color:var(--ink);box-shadow:0 1px 3px rgba(16,24,40,.12)}
.ak-chip{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:999px;background:var(--f);font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap}
.ak-chip:hover{background:var(--f2)}
.ak-chip.on{background:var(--ink);color:var(--card,#fff)}
.ak-chip span{font-weight:500;opacity:.6}
.ak-tag{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 9px;border-radius:999px;background:var(--f);font-size:11.5px;font-weight:650;color:var(--mut);white-space:nowrap}
.ak-tag.green{background:#dcfce7;color:#15803d}.ak-tag.red{background:#fee2e2;color:#b91c1c}.ak-tag.amber{background:#fef3c7;color:#b45309}.ak-tag.blue{background:#dbeafe;color:#1d4ed8}.ak-tag.violet{background:#ede9fe;color:#6d28d9}
.ak-note{display:flex;gap:10px;align-items:flex-start;margin:0 0 14px;padding:12px 15px;border-radius:16px;background:var(--f);font-size:13.5px;line-height:1.5;color:var(--mut)}
.ak-note b{color:var(--ink)}
.ak-note.info{background:#eff6ff;color:#1e40af}.ak-note.info b{color:#1e3a8a}
.ak-note.warn{background:#fffbeb;color:#92400e}.ak-note.warn b{color:#78350f}
.ak-note.good{background:#ecfdf3;color:#067647}.ak-note.good b{color:#05603a}
.ak-note.bad{background:#fef2f2;color:#b42318}.ak-note.bad b{color:#912018}
.ak-note a{color:inherit;font-weight:650}
.ak-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:5px;padding:40px 20px;color:var(--mut);font-size:14px}
.ak-empty b{font-size:16px;font-weight:650;color:var(--ink)}
.ak-grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.ak-grid2>.ak-panel{margin-bottom:0}
@media (max-width:760px){.ak-grid2{grid-template-columns:minmax(0,1fr)}}
.ak-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:10px;margin-bottom:14px}
.ak-tile{display:flex;flex-direction:column;gap:3px;min-width:0;padding:16px;border-radius:20px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 1px 2px rgba(16,24,40,.04)}
.ak-tile-l{font-size:13px;font-weight:600;color:var(--mut)}
.ak-tile-v{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:26px;font-weight:700;letter-spacing:-.035em;line-height:1.15;color:var(--ink);font-variant-numeric:tabular-nums;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ak-tile-s{font-size:12px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ak-switch{position:relative;width:44px;height:26px;flex-shrink:0;padding:0;border:none;border-radius:999px;background:#d4d4d8;cursor:pointer;transition:background .18s}
.ak-switch span{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.ak-switch.on{background:#22c55e}
.ak-switch.on span{transform:translateX(18px)}
.ak-switch:disabled{opacity:.5;cursor:default}
.ak table.ak-table{width:100%;border-collapse:collapse;font-size:13.5px}
.ak-table th{padding:10px 14px;text-align:left;font-size:12.5px;font-weight:600;color:var(--soft);white-space:nowrap}
.ak-table td{padding:11px 14px;color:var(--ink);box-shadow:0 -1px 0 var(--line)}
.ak-table tbody tr{transition:background .15s}
.ak-table tbody tr:hover{background:color-mix(in srgb,var(--f) 60%,transparent)}
.ak :focus-visible{outline:2px solid var(--coral);outline-offset:2px}
.ak .ak-field:focus-visible,.ak .ak-select:focus-visible,.ak input:focus-visible{outline:none}
@keyframes akIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ak-in{animation:akIn .35s cubic-bezier(.22,1,.36,1) both}
@media (prefers-reduced-motion:reduce){.ak-in{animation:none}}
`
