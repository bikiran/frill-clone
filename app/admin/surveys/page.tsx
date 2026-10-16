'use client'

// Surveys list: the same full-width view as Forms. Everything is in
// components/engage (shared with Polls).

import EngageListPage from '@/components/engage/EngageListPage'

export default function SurveysAdmin() {
  return <EngageListPage kind="survey" />
}
