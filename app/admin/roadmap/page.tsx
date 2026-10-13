import { redirect } from 'next/navigation'

// The roadmap is the public board page at /roadmap (that's where the sidebar's
// Roadmap link goes). Links to /admin/roadmap land there.
export default function AdminRoadmapRedirect() {
  redirect('/roadmap')
}
