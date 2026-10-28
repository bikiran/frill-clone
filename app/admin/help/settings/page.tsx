'use client'

// Help Center Settings — Access Control / Translate / Customize / Preview
// Preview embeds the live help center with device (desktop/mobile) and
// light/dark toggles, so admins can use it right from the admin panel.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { refreshPublicHelp } from '@/lib/help-revalidate'
import HelpShell from '@/components/help/HelpShell'

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Dutch', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Hindi', 'Nepali', 'Arabic']

const TABS = [
  { key: 'access', label: 'Access Control' },
  { key: 'translate', label: 'Translate' },
  { key: 'customize', label: 'Customize' },
  { key: 'preview', label: 'Preview' },
]

export default function HelpSettingsPage() {
  const [tab, setTab] = useState('access')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [slug, setSlug] = useState('')
  const [helpDomain, setHelpDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Access control
  const [helpAccess, setHelpAccess] = useState<'open' | 'locked'>('open')
  // Translate
  const [primaryLanguage, setPrimaryLanguage] = useState('English')
  const [languages, setLanguages] = useState<string[]>([])
  const [showLangMenu, setShowLangMenu] = useState(false)
  // Customize
  const [helpTitle, setHelpTitle] = useState('How can we help 👋')
  const [helpSubtitle, setHelpSubtitle] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [coverBusy, setCoverBusy] = useState(false)
  const [supportEmail, setSupportEmail] = useState('')
  const [showTrending, setShowTrending] = useState(true)
  const [showCategories, setShowCategories] = useState(true)
  const [showContactCta, setShowContactCta] = useState(true)
  // Preview
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [previewKey, setPreviewKey] = useState(0)

  useEffect(() => {
    const load = async () => {
      let cid: string | null = null
      let s = ''
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          s = h.replace('.colvy.com', '')
          const { data } = await (supabase as any).from('companies').select('id, slug, help_domain').eq('slug', s).maybeSingle()
          if (data) { cid = data.id; s = data.slug; if (data.help_domain) setHelpDomain(data.help_domain) }
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data } = await (supabase as any).from('companies').select('id, slug, help_domain').eq('owner_id', session.user.id).maybeSingle()
          if (data) { cid = data.id; s = data.slug; if (data.help_domain) setHelpDomain(data.help_domain) }
        }
      }
      setCompanyId(cid)
      setSlug(s)
      if (!cid) return

      // Cover photo (on the company row, read by both help renderers) and the
      // saved help settings, loaded together.
      const [coRes, { data: rows }] = await Promise.all([
        Promise.resolve((supabase as any).from('companies').select('help_cover_url').eq('id', cid).maybeSingle()).catch(() => ({ data: null })),
        (supabase as any).from('site_settings').select('*')
          .eq('key', 'general').eq('company_id', cid)
          .order('updated_at', { ascending: false }).limit(1),
      ])
      if (coRes?.data?.help_cover_url) setCoverUrl(coRes.data.help_cover_url)

      const v = rows?.[0]?.value || {}
      if (v.helpAccess) setHelpAccess(v.helpAccess)
      if (v.helpPrimaryLanguage) setPrimaryLanguage(v.helpPrimaryLanguage)
      if (Array.isArray(v.helpLanguages)) setLanguages(v.helpLanguages)
      if (v.helpTitle) setHelpTitle(v.helpTitle)
      if (v.helpSubtitle !== undefined) setHelpSubtitle(v.helpSubtitle)
      if (v.supportEmail !== undefined) setSupportEmail(v.supportEmail)
      if (v.helpShowTrending !== undefined) setShowTrending(v.helpShowTrending)
      if (v.helpShowCategories !== undefined) setShowCategories(v.helpShowCategories)
      if (v.helpShowContactCta !== undefined) setShowContactCta(v.helpShowContactCta)
    }
    load()
  }, [])

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      // Read-merge-write the scoped settings row
      const { data: rows } = await (supabase as any).from('site_settings').select('*')
        .eq('key', 'general').eq('company_id', companyId)
        .order('updated_at', { ascending: false }).limit(1)
      const existing = rows?.[0]?.value || {}
      const merged = {
        ...existing,
        helpAccess, helpPrimaryLanguage: primaryLanguage, helpLanguages: languages,
        helpTitle, helpSubtitle, supportEmail: supportEmail.trim(), helpShowTrending: showTrending,
        helpShowCategories: showCategories, helpShowContactCta: showContactCta,
      }
      await (supabase as any).from('site_settings').upsert(
        { key: 'general', company_id: companyId, value: merged, updated_at: new Date().toISOString() },
        { onConflict: 'key,company_id' }
      )
      // The public help centre is cached briefly — refresh it before the
      // preview reloads so access changes show straight away.
      await refreshPublicHelp(companyId)
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
      setPreviewKey(k => k + 1)
    } catch { setSaveMsg('Save failed') }
    setSaving(false)
  }

  // Cover photo → storage, then persist on companies.help_cover_url (both help
  // renderers read it; falls back to the branded gradient when empty).
  const uploadCover = async (file: File) => {
    if (!companyId || !file) return
    setCoverBusy(true); setSaveMsg('')
    try {
      const ext = file.name.split('.').pop()
      const path = `help-covers/${companyId}-${Date.now()}.${ext}`
      let bucket = 'settings'
      let { data, error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true })
      if (error) { bucket = 'idea-images'; const r = await supabase.storage.from(bucket).upload(path, file, { upsert: true }); data = r.data; error = r.error }
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data!.path)
      const { error: upErr } = await (supabase as any).from('companies').update({ help_cover_url: publicUrl }).eq('id', companyId)
      if (upErr) throw upErr
      await refreshPublicHelp(companyId)
      setCoverUrl(publicUrl); setSaveMsg('Cover updated!'); setTimeout(() => setSaveMsg(''), 2500); setPreviewKey(k => k + 1)
    } catch (e: any) { setSaveMsg(/does not exist|schema cache|column/i.test(e?.message || '') ? 'Run COLVY_V315_HELP_COVER.sql, then reload.' : 'Cover upload failed') }
    setCoverBusy(false)
  }
  const removeCover = async () => {
    if (!companyId) return
    setCoverBusy(true)
    try { await (supabase as any).from('companies').update({ help_cover_url: null }).eq('id', companyId); await refreshPublicHelp(companyId); setCoverUrl(''); setPreviewKey(k => k + 1) } catch {}
    setCoverBusy(false)
  }

  const Toggle = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" onClick={() => set(!on)} style={{ width: 40, height: 22, borderRadius: 11, background: on ? 'var(--coral)' : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )

  // Prefer the configured custom help domain (e.g. help.colvy.com) so the
  // preview matches what customers actually see; fall back to the colvy subdomain.
  const helpUrl = helpDomain ? `https://${helpDomain}/help?theme=${theme}` : (slug ? `https://${slug}.colvy.com/help?theme=${theme}` : '')

  return (
    <HelpShell>
    <div className="hs-page" style={{ padding: '36px 44px 48px', maxWidth: 1040 }}>
      <style>{`
        @media (max-width: 860px) { .hs-page { padding: 20px 16px 32px !important; } }
        .hs-seg { display: inline-flex; gap: 2px; padding: 3px; margin-bottom: 28px; border-radius: 999px; background: #f4f4f5; flex-wrap: wrap; }
        .hs-seg button { height: 34px; padding: 0 16px; border: none; border-radius: 999px; background: transparent; font: inherit; font-size: 13.5px; font-weight: 600; color: #71717a; cursor: pointer; transition: background .18s, color .15s, box-shadow .18s; }
        .hs-seg button:hover { color: #18181b; }
        .hs-seg button.on { background: #fff; color: #111; box-shadow: 0 1px 2px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04); }
        .hs-label { display: block; margin: 0 0 7px; font-size: 13.5px; font-weight: 600; color: #18181b; }
        .hs-help { margin: -2px 0 8px; font-size: 12.5px; color: #8e8e93; line-height: 1.45; }
        .hs-input { width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; margin-bottom: 18px; border: 1.5px solid transparent; border-radius: 12px; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; transition: background .15s, border-color .15s, box-shadow .15s; }
        .hs-input:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .hs-input::placeholder { color: #a1a1aa; }
        .hs-opt { display: block; width: 100%; text-align: left; padding: 18px 20px; border: none; border-radius: 16px; background: #fff; box-shadow: 0 0 0 1px #ececf0; font: inherit; cursor: pointer; transition: box-shadow .15s; }
        .hs-opt:hover { box-shadow: 0 0 0 1px #d4d4d8; }
        .hs-opt.on { box-shadow: 0 0 0 2px #111; }
        .hs-icons { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: #f4f4f5; }
        .hs-icons button { width: 34px; height: 30px; border: none; border-radius: 999px; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .hs-icons button.on { background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.1); }
      `}</style>
      <h1 style={{ margin: '0 0 6px' }}>Help centre settings</h1>
      <p style={{ fontSize: 15, color: '#71717a', margin: '0 0 24px' }}>Who can see it, its languages and look, and a live preview without leaving the admin.</p>

      {/* Tabs */}
      <div className="hs-seg" role="tablist">
        {TABS.map(t => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={tab === t.key ? 'on' : ''}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'access' && (
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px 0', color: '#111' }}>Default access</h2>
          <p style={{ fontSize: 14, color: '#71717a', margin: '0 0 18px 0' }}>Whether visitors must sign in before browsing.</p>

          <button type="button" onClick={() => setHelpAccess('open')}
            className={`hs-opt${helpAccess === 'open' ? ' on' : ''}`} aria-pressed={helpAccess === 'open'} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Open</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--slate)' }}>Anyone can browse published articles. Best for public product help.</p>
          </button>

          <button type="button" onClick={() => setHelpAccess('locked')}
            className={`hs-opt${helpAccess === 'locked' ? ' on' : ''}`} aria-pressed={helpAccess === 'locked'} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Locked</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--slate)' }}>The entire help center requires sign-in. Visitors see a login page first.</p>
          </button>
        </div>
      )}

      {tab === 'translate' && (
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 14px 0', color: 'var(--ink)' }}>Primary language</h2>
          <select value={primaryLanguage} onChange={e => setPrimaryLanguage(e.target.value)} className="hs-input" style={{ marginBottom: 28, cursor: 'pointer' }}>
            {LANGUAGES.map(l => <option key={l}>{l}</option>)}
          </select>

          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>Translations <span style={{ fontWeight: 400, color: '#9ca3af' }}>({languages.length})</span></h2>
          {languages.length === 0 ? (
            <div className="hc-card" style={{ padding: '22px 24px', marginTop: 12 }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Translate your help center</h3>
              <p style={{ margin: '0 0 14px 0', fontSize: 13.5, color: 'var(--slate)' }}>Add languages to automatically translate your articles and collections.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: '#27272a', marginBottom: 18 }}>
                {['Translated by AI', 'Kept up to date when you edit', 'More than 10 languages'].map(t => (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="20 6 9 17 4 12" /></svg>{t}
                  </span>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setShowLangMenu(v => !v)} className="cv-btn cv-btn-dark" style={{ width: '100%', height: 42 }} aria-haspopup="menu" aria-expanded={showLangMenu}>
                  Add a language
                </button>
                {showLangMenu && (
                  <div className="hc-menu" style={{ top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 240, overflowY: 'auto', zIndex: 40 }}>
                    {LANGUAGES.filter(l => l !== primaryLanguage && !languages.includes(l)).map(l => (
                      <button key={l} type="button" onClick={() => { setLanguages([...languages, l]); setShowLangMenu(false) }}
                        className="hc-menu-row">
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              {languages.map(l => (
                <div key={l} className="hc-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px 12px 18px', marginBottom: 8 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{l}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="hc-tag" style={{ ['--tag' as any]: '#16a34a' }}>Translated by AI</span>
                    <button type="button" onClick={() => setLanguages(languages.filter(x => x !== l))} aria-label={`Remove ${l}`} title="Remove" style={{ width: 30, height: 30, borderRadius: 999, border: 'none', background: '#f4f4f5', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              <div style={{ position: 'relative', marginTop: 10 }}>
                <button type="button" onClick={() => setShowLangMenu(v => !v)} className="cv-btn cv-btn-dark" aria-haspopup="menu" aria-expanded={showLangMenu}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Add a language
                </button>
                {showLangMenu && (
                  <div className="hc-menu" style={{ top: 'calc(100% + 6px)', left: 0, width: 260, maxHeight: 240, overflowY: 'auto', zIndex: 40 }}>
                    {LANGUAGES.filter(l => l !== primaryLanguage && !languages.includes(l)).map(l => (
                      <button key={l} type="button" onClick={() => { setLanguages([...languages, l]); setShowLangMenu(false) }}
                        className="hc-menu-row">
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'customize' && (
        <div style={{ maxWidth: 640 }}>
          <div className="hc-card" style={{ padding: '22px 24px', marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>Header</h2>
            <label className="hs-label">Help center title</label>
            <input value={helpTitle} onChange={e => setHelpTitle(e.target.value)} className="hs-input" />
            <label className="hs-label">Subtitle (optional)</label>
            <input value={helpSubtitle} onChange={e => setHelpSubtitle(e.target.value)} placeholder="Find answers, guides, and resources" className="hs-input" />

            <label className="hs-label">Support email</label>
            <p className="hs-help">Shown on your help centre's contact options and used for "Email Support". Falls back to your account email if left blank.</p>
            <input value={supportEmail} onChange={e => setSupportEmail(e.target.value)} type="email" placeholder="support@yourcompany.com" className="hs-input" />

            <label className="hs-label">Cover photo</label>
            <p className="hs-help">Shown behind the help centre header. Recommended 1600×500. Leave empty to use the branded gradient.</p>
            <div style={{ borderRadius: 14, overflow: 'hidden', background: '#f6f6f7' }}>
              {coverUrl && <div style={{ height: 120, background: `url(${coverUrl}) center/cover no-repeat` }} />}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
                <label className="cv-btn cv-btn-primary" style={{ height: 34, fontSize: 13.5, cursor: coverBusy ? 'default' : 'pointer', opacity: coverBusy ? 0.6 : 1 }}>
                  {coverBusy ? 'Uploading…' : coverUrl ? 'Replace' : 'Upload cover'}
                  <input type="file" accept="image/*" disabled={coverBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} style={{ display: 'none' }} />
                </label>
                {coverUrl && <button type="button" onClick={removeCover} disabled={coverBusy} className="cv-btn" style={{ height: 34, fontSize: 13.5 }}>Remove</button>}
              </div>
            </div>
          </div>

          <div className="hc-card" style={{ padding: '22px 24px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>Sections</h2>
            {[
              { label: 'Trending articles', desc: 'Show the most viewed articles in a sidebar', state: showTrending, set: setShowTrending },
              { label: 'Category cards', desc: 'Display article categories as cards on the homepage', state: showCategories, set: setShowCategories },
              { label: 'Contact CTA', desc: 'Show a "Contact us" button in the header', state: showContactCta, set: setShowContactCta },
            ].map(opt => (
              <div key={opt.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: '1px solid #f0f0f2' }}>
                <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{opt.label}</p><p style={{ margin: '2px 0 0 0', fontSize: 13, color: '#71717a' }}>{opt.desc}</p></div>
                <Toggle on={opt.state} set={opt.set} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'preview' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {/* Theme toggle */}
            <div className="hs-icons">
              <button type="button" onClick={() => setTheme('light')} title="Light mode" aria-pressed={theme === 'light'} className={theme === 'light' ? 'on' : ''}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              </button>
              <button type="button" onClick={() => setTheme('dark')} title="Dark mode" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'on' : ''}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              </button>
            </div>
            {/* Device toggle */}
            <div className="hs-icons">
              <button type="button" onClick={() => setDevice('desktop')} title="Desktop" aria-pressed={device === 'desktop'} className={device === 'desktop' ? 'on' : ''}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </button>
              <button type="button" onClick={() => setDevice('mobile')} title="Mobile" aria-pressed={device === 'mobile'} className={device === 'mobile' ? 'on' : ''}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
              </button>
            </div>
            {helpUrl && (
              <a href={helpUrl} target="_blank" rel="noopener" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--coral)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                Open in new tab
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              </a>
            )}
          </div>

          {/* Browser-chrome frame */}
          <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: theme === 'dark' ? '#1c1c1e' : '#fff', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.08)', maxWidth: device === 'mobile' ? 400 : '100%', margin: device === 'mobile' ? '0 auto' : undefined, transition: 'max-width 0.3s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: `1px solid ${theme === 'dark' ? '#333' : 'var(--border)'}` }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
              <span style={{ flex: 1, textAlign: 'center', fontSize: 12, color: theme === 'dark' ? '#888' : '#9ca3af', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                {helpDomain || `${slug}.colvy.com`}/help
              </span>
            </div>
            {helpUrl ? (
              <iframe key={previewKey + device + theme} src={helpUrl} style={{ width: '100%', height: 640, border: 'none', display: 'block', background: theme === 'dark' ? '#111' : '#fff' }} title="Help center preview" />
            ) : (
              <div style={{ padding: 80, textAlign: 'center', color: '#9ca3af' }}>Company not resolved — open this page from your company subdomain.</div>
            )}
          </div>
        </div>
      )}

      {tab !== 'preview' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24, maxWidth: 640, justifyContent: 'flex-end' }}>
          {saveMsg && <span style={{ fontSize: 13, color: saveMsg.includes('fail') ? '#dc2626' : '#059669' }}>{saveMsg}</span>}
          <button type="button" onClick={save} disabled={saving} className="cv-btn cv-btn-primary" style={{ padding: '0 26px', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
    </div>
    </HelpShell>
  )
}
