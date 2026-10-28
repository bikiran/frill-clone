'use client'

// A panel that opens and closes smoothly: its height eases open on a long,
// soft curve while the content fades and slides in just after; closing is a
// little quicker. Always rendered, so it can animate both ways; while closed
// it's hidden from screen readers and can't be tabbed into. Styles: .sc in
// app/globals.css.
export default function Collapse({ open, children, className }: { open: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`sc${open ? ' open' : ''}${className ? ' ' + className : ''}`} aria-hidden={!open}>
      <div className="sc-in" inert={!open}>
        <div className="sc-body">{children}</div>
      </div>
    </div>
  )
}
