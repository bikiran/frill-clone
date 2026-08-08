'use client'

// SMS pricing is now a platform-wide setting managed by Colvy in the Super Admin
// console (admin.colvy.com → SMS Pricing), not something each business configures.
// This page used to let a business edit its own pricing; it's kept as an
// informational notice so any old link doesn't 404.
export default function SmsPricingSettings() {
  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>SMS pricing</h1>
      <div style={{ marginTop: 16, padding: 18, borderRadius: 14, border: '1px solid var(--border)', background: '#fff' }}>
        <p style={{ fontSize: 14, color: 'var(--ink)', margin: 0, lineHeight: 1.6 }}>
          SMS pricing is set by Colvy and applies across the platform. Your campaign
          cost estimates already use the current rates — there's nothing to configure here.
        </p>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '10px 0 0', lineHeight: 1.6 }}>
          If you have a question about SMS rates or need a custom arrangement, contact support.
        </p>
      </div>
    </div>
  )
}
