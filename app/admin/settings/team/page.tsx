import { redirect } from 'next/navigation'

// This was an older, simpler copy of the Team page (invite + role only, no
// per-person access). Team members are managed in one place: /admin/team.
export default function SettingsTeamRedirect() {
  redirect('/admin/team')
}
