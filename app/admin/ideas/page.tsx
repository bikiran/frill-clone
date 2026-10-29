import IdeasBoard from '@/components/board/IdeasBoard'

// The ideas board inside the admin, so Feedback → Ideas keeps the sidebar like
// every other admin page. The public board is still at /?view=ideas.
export default function AdminIdeasPage() {
  return <IdeasBoard embedded />
}
