import { redirect } from 'next/navigation'

// Automatic replies live under Settings → Inbox & channels. Old links to
// /admin/auto-replies land there.
export default function AutoRepliesRedirect() {
  redirect('/admin/crm-settings/auto-replies')
}
