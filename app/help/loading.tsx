import PageSkeleton from '@/components/PageSkeleton'

// Shown the moment someone switches to this tab, while the page renders.
export default function Loading() {
  return <PageSkeleton variant="hero" />
}
