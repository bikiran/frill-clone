import RoadmapBoard from '@/components/board/RoadmapBoard'

// The roadmap inside the admin, so Feedback → Roadmap keeps the sidebar like
// every other admin page. The public one is still at /roadmap.
export default function AdminRoadmapPage() {
  return <RoadmapBoard embedded />
}
