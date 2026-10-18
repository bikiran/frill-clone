'use client'

// Starter templates, each shown as a small live preview in the business's
// branding, plus "Start from blank".

import { useMemo } from 'react'
import { fillTemplate, renderEmail, sampleVars } from './render'
import { STARTER_TEMPLATES, type StarterTemplate } from './templates'
import type { EmailBrand } from './types'
import { DIcon } from './icons'

function Thumb({ t, brand }: { t: StarterTemplate; brand: EmailBrand }) {
  const html = useMemo(() => fillTemplate(renderEmail(t.design(), brand, { subject: t.subject, previewText: t.previewText, preview: true }).html, sampleVars(brand), { html: true }), [t, brand])
  return (
    <div className="tp-thumb" aria-hidden="true">
      <iframe title={t.name} srcDoc={html} sandbox="" tabIndex={-1} scrolling="no" />
    </div>
  )
}

export default function TemplatePicker({ brand, onPick, onBlank }: { brand: EmailBrand; onPick: (t: StarterTemplate) => void; onBlank: () => void }) {
  return (
    <div className="tp">
      <style>{`
        .tp{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
        .tp-card{display:flex;flex-direction:column;border:1px solid var(--border);border-radius:14px;background:#fff;overflow:hidden;cursor:pointer;text-align:left;padding:0;font-family:inherit;min-width:0}
        .tp-card:hover{border-color:var(--coral)}
        .tp-thumb{height:260px;overflow:hidden;background:var(--canvas,#f4f4f5);border-bottom:1px solid var(--border);position:relative;pointer-events:none}
        .tp-thumb iframe{width:640px;height:1000px;border:0;transform:scale(.4);transform-origin:0 0;position:absolute;left:50%;margin-left:-128px}
        .tp-body{padding:12px 14px 14px}
        .tp-body b{display:block;font-size:14.5px;color:var(--ink);margin-bottom:3px}
        .tp-body span{font-size:12.5px;color:var(--slate);line-height:1.45}
        .tp-blank{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;height:260px;color:var(--slate);border-bottom:1px solid var(--border);background:#fff}
      `}</style>
      <button type="button" className="tp-card" onClick={onBlank}>
        <div className="tp-blank"><DIcon name="plus" size={26} /><span>Blank email</span></div>
        <div className="tp-body"><b>Start from blank</b><span>Your logo, a heading, some text and the footer.</span></div>
      </button>
      {STARTER_TEMPLATES.map(t => (
        <button key={t.id} type="button" className="tp-card" onClick={() => onPick(t)}>
          <Thumb t={t} brand={brand} />
          <div className="tp-body"><b>{t.name}</b><span>{t.description}</span></div>
        </button>
      ))}
    </div>
  )
}
