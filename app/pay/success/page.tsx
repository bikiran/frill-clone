'use client'

import { Suspense } from 'react'
import { StatusMark } from '@/components/StatusMark'

function SuccessInner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: 'var(--canvas)', padding: 24 }}>
      <style>{`.ps-card{animation:psIn .6s cubic-bezier(.22,1,.36,1) backwards}.ps-rise{animation:psRise .5s cubic-bezier(.22,1,.36,1) backwards}
        @keyframes psIn{from{opacity:0;transform:translate3d(0,18px,0) scale(.98)}to{opacity:1;transform:none}}
        @keyframes psRise{from{opacity:0;transform:translate3d(0,10px,0)}to{opacity:1;transform:none}}
        @media (prefers-reduced-motion: reduce){.ps-card,.ps-rise{animation:none}}`}</style>
      <div className="ps-card" style={{ width: '100%', maxWidth: 420, textAlign: 'center', background: '#fff', borderRadius: 22, padding: '40px 28px', boxShadow: '0 24px 60px -28px rgba(0,0,0,0.25)' }}>
        <div style={{ marginBottom: 20 }}><StatusMark kind="success" size={88} celebrate /></div>
        <h1 className="ps-rise" style={{ animationDelay: '.6s', fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: '0 0 8px' }}>Thank you — payment received</h1>
        <p className="ps-rise" style={{ animationDelay: '.7s', fontSize: 14, color: 'var(--slate)', margin: '0 0 8px', lineHeight: 1.5 }}>Your payment has gone through and a receipt has been emailed to you by Stripe.</p>
        <p className="ps-rise" style={{ animationDelay: '.8s', fontSize: 13.5, color: 'var(--ink)', fontWeight: 600, margin: 0 }}>You can now close this window.</p>
      </div>
    </div>
  )
}

export default function PaySuccess() {
  return <Suspense fallback={null}><SuccessInner /></Suspense>
}
