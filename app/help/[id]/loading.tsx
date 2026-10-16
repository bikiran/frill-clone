import PageSkeleton from '@/components/PageSkeleton'

// Shown the moment someone opens an article, while it renders.
export default function Loading() {
  return <PageSkeleton variant="list" />
}
