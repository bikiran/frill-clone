'use client'

import { useState, useCallback } from 'react'

export function useBulkOperations() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSelectAll, setIsSelectAll] = useState(false)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds(new Set(ids))
    setIsSelectAll(true)
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
    setIsSelectAll(false)
  }, [])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  const getSelectedIds = useCallback(() => Array.from(selectedIds), [selectedIds])

  const getSelectionCount = useCallback(() => selectedIds.size, [selectedIds])

  return {
    selectedIds,
    isSelectAll,
    toggleSelect,
    selectAll,
    deselectAll,
    isSelected,
    getSelectedIds,
    getSelectionCount,
    hasSelection: selectedIds.size > 0,
  }
}
