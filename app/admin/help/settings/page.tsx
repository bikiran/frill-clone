'use client'

// Help Center Settings — Access Control / Translate / Customize / Preview
// Preview embeds the live help center with device (desktop/mobile) and
// light/dark toggles, so admins can use it right from the admin panel.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
          const { data } = await (supabase as any).from('companies').select('id, slug').eq('slug', s).maybeSingle()
          if (data) { cid = data.id; s = data.slug }
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data } = await (supabase as any).from('companies').select('id, slug').eq('owner_id', session.user.id).maybeSingle()
          if (data) { cid = data.id; s = data.slug }
        }
      }
      setCompanyId(cid)
      setSlug(s)
      if (!cid) return

      // Load saved help settings
      const { data: rows } = await (supabase as any).from('site_settings').select('*')
        .eq('key', 'general').eq('company_id', cid)
        .order('updated_at', { ascending: false }).limit(1)
      const v = rows?.[0]?.value || {}
      if (v.helpAccess) setHelpAccess(v.helpAccess)
      if (v.helpPrimaryLanguage) setPrimaryLanguage(v.helpPrimaryLanguage)
      if (Array.isArray(v.helpLanguages)) setLanguages(v.helpLanguages)
      if (v.helpTitle) setHelpTitle(v.helpTitle)
      if (v.helpSubtitle !== undefined) setHelpSubtitle(v.helpSubtitle)
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
        helpTitle, helpSubtitle, helpShowTrending: showTrending,
        helpShowCategories: showCategories, helpShowContactCta: showContactCta,
      }
      await (supabase as any).from('site_settings').upsert(
        { key: 'general', company_id: companyId, value: merged, updated_at: new Date().toISOString() },
        { onConflict: 'key,company_id' }
      )
      setSaveMsg('Saved!')
      setTimeout(() => setSaveMsg(''), 2500)
      setPreviewKey(k => k + 1)
    } catch { setSaveMsg('Save failed') }
    setSaving(false)
  }

  const Toggle = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <button type="button" onClick={() => set(!on)} style={{ width: 40, height: 22, borderRadius: 11, background: on ? 'var(--coral)' : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  )

  const helpUrl = slug ? `https://${slug}.colvy.com/help?theme=${theme}` : ''

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 32px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>Help Center Settings</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 24px 0' }}>Control access, languages, appearance — and preview the live help center without leaving the admin.</p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: 'var(--canvas)', border: '1px solid var(--border)', width: 'fit-content', marginBottom: 28 }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? '#fff' : 'transparent', color: tab === t.key ? 'var(--coral)' : 'var(--slate)', boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'access' && (
        <div style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--ink)' }}>Default access</h2>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 18px 0' }}>Control whether visitors must sign in before browsing.</p>

          <button type="button" onClick={() => setHelpAccess('open')}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: `2px solid ${helpAccess === 'open' ? 'var(--ink)' : 'var(--border)'}`, background: '#fff', cursor: 'pointer', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Open</span>
            </div>
            <p style={{ margin: 0, fontSize: 13.5, color: 'var(--slate)' }}>Anyone can browse published articles. Best for public product help.</p>
          </button>

          <button type="button" onClick={() => setHelpAccess('locked')}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '18px 20px', borderRadius: 14, border: `2px solid ${helpAccess === 'locked' ? 'var(--ink)' : 'var(--border)'}`, background: '#fff', cursor: 'pointer', marginBottom: 24 }}>
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
          <select value={primaryLanguage} onChange={e => setPrimaryLanguage(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 14.5, outline: 'none', marginBottom: 28, background: '#fff' }}>
            {LANGUAGES.map(l => <option key={l}>{l}</option>)}
          </select>

          <h2 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>Translations <span style={{ fontWeight: 400, color: '#9ca3af' }}>({languages.length})</span></h2>
          {languages.length === 0 ? (
            <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: '#fff', padding: '22px 24px', marginTop: 12 }}>
              <h3 style={{ margin: '0 0 6px 0', fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Translate your help center</h3>
              <p style={{ margin: '0 0 14px 0', fontSize: 13.5, color: 'var(--slate)' }}>Add languages to automatically translate your articles and collections.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13.5, color: 'var(--ink)', marginBottom: 18 }}>
                <span>✨ AI-powered translations</span>
                <span>🕒 Updates when you edit content</span>
                <span>🌐 10+ languages</span>
              </div>
              <div style={{ position: 'relative' }}>
                <button type="button" onClick={() => setShowLangMenu(v => !v)}
                  style={{ width: '100%', padding: '12px 0', borderRadius: 12, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                  Add a language
                </button>
                {showLangMenu && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 40 }}>
                    {LANGUAGES.filter(l => l !== primaryLanguage && !languages.includes(l)).map(l => (
                      <button key={l} type="button" onClick={() => { setLanguages([...languages, l]); setShowLangMenu(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, border: 'none', background: '#fff', cursor: 'pointer' }}>
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
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 18px', borderRadius: 12, border: '1px solid var(--border)', background: '#fff', marginBottom: 8 }}>
                  <span style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{l}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 12, color: '#059669', background: '#dcfce7', padding: '3px 10px', borderRadius: 20, fontWeight: 600 }}>AI-translated</span>
                    <button type="button" onClick={() => setLanguages(languages.filter(x => x !== l))} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontSize: 17 }}>×</button>
                  </div>
                </div>
              ))}
              <div style={{ position: 'relative', marginTop: 10 }}>
                <button type="button" onClick={() => setShowLangMenu(v => !v)}
                  style={{ padding: '9px 18px', borderRadius: 10, background: 'var(--ink)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  + Add a language
                </button>
                {showLangMenu && (
                  <div style={{ position: 'absolute', top: '110%', left: 0, width: 260, maxHeight: 220, overflowY: 'auto', background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', zIndex: 40 }}>
                    {LANGUAGES.filter(l => l !== primaryLanguage && !languages.includes(l)).map(l => (
                      <button key={l} type="button" onClick={() => { setLanguages([...languages, l]); setShowLangMenu(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: 14, border: 'none', background: '#fff', cursor: 'pointer' }}>
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
          <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: '#fff', padding: '20px 22px', marginBottom: 18 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', color: 'var(--ink)' }}>Header</h2>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Help center title</label>
            <input value={helpTitle} onChange={e => setHelpTitle(e.target.value)}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none', marginBottom: 16 }} />
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--slate)', marginBottom: 6 }}>Subtitle (optional)</label>
            <input value={helpSubtitle} onChange={e => setHelpSubtitle(e.target.value)} placeholder="Find answers, guides, and resources"
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, outline: 'none' }} />
          </div>

          <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: '#fff', padding: '20px 22px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--ink)' }}>Sections</h2>
            {[
              { label: 'Trending articles', desc: 'Show the most viewed articles in a sidebar', state: showTrending, set: setShowTrending },
              { label: 'Category cards', desc: 'Display article categories as cards on the homepage', state: showCategories, set: setShowCategories },
              { label: 'Contact CTA', desc: 'Show a "Contact us" button in the header', state: showContactCta, set: setShowContactCta },
            ].map(opt => (
              <div key={opt.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                <div><p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{opt.label}</p><p style={{ margin: '2px 0 0 0', fontSize: 12.5, color: 'var(--slate)' }}>{opt.desc}</p></div>
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
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setTheme('light')} title="Light mode"
                style={{ width: 34, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: theme === 'light' ? '#fff' : 'transparent', boxShadow: theme === 'light' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              </button>
              <button type="button" onClick={() => setTheme('dark')} title="Dark mode"
                style={{ width: 34, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: theme === 'dark' ? '#fff' : 'transparent', boxShadow: theme === 'dark' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              </button>
            </div>
            {/* Device toggle */}
            <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: 'var(--canvas)', border: '1px solid var(--border)' }}>
              <button type="button" onClick={() => setDevice('desktop')} title="Desktop"
                style={{ width: 34, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: device === 'desktop' ? '#fff' : 'transparent', boxShadow: device === 'desktop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              </button>
              <button type="button" onClick={() => setDevice('mobile')} title="Mobile"
                style={{ width: 34, height: 30, borderRadius: 8, border: 'none', cursor: 'pointer', background: device === 'mobile' ? '#fff' : 'transparent', boxShadow: device === 'mobile' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                {slug}.colvy.com/help
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
          <button type="button" onClick={save} disabled={saving}
            style={{ padding: '10px 26px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  )
}
