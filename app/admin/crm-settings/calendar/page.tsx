import { redirect } from 'next/navigation'

// This used to show the whole team calendar a second time inside Settings. The
// calendar (with its reminder and event-type options) has one home:
// /admin/calendar, in the sidebar under Inbox & CRM.
export default function CalendarSettingsRedirect() {
  redirect('/admin/calendar')
}
