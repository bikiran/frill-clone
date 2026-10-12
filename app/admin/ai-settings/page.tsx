import { redirect } from 'next/navigation'

// AI settings live under Settings (next to AI Knowledge), where the settings
// tabs show where you are. Old links to /admin/ai-settings land there.
export default function AiSettingsRedirect() {
  redirect('/admin/crm-settings/ai')
}
