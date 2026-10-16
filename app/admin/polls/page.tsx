'use client'

// Polls list: the same full-width view as Forms. Everything is in
// components/engage (shared with Surveys).

import EngageListPage from '@/components/engage/EngageListPage'

export default function PollsAdmin() {
  return <EngageListPage kind="poll" />
}
