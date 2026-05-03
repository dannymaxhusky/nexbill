import { moduleConfigs } from '../data/moduleConfig'
import type { GovernanceItem, ModuleKey, PlatformMetrics } from '../types'
import { daysBetween, isClosedStatus, priorityRank } from './status'

export function calculateMetrics(items: GovernanceItem[]): PlatformMetrics {
  const moduleCounts = Object.fromEntries(moduleConfigs.map((module) => [module.key, 0])) as Record<ModuleKey, number>
  const ragCounts: Record<string, number> = {}

  let openItems = 0
  let overdueItems = 0
  let dueSoonItems = 0
  let closedItems = 0
  let highPriorityItems = 0
  let staleItems = 0

  for (const item of items) {
    moduleCounts[item.module] += 1
    const closed = isClosedStatus(item.status, item.closedAt)
    if (closed) {
      closedItems += 1
    } else {
      openItems += 1
    }

    const daysToDue = daysBetween(item.dueDate)
    if (!closed && daysToDue < 0) overdueItems += 1
    if (!closed && daysToDue >= 0 && daysToDue <= 14) dueSoonItems += 1
    if (priorityRank(item.priority ?? item.ragStatus) >= 3) highPriorityItems += 1

    const lastUpdatedDays = Math.abs(daysBetween(item.lastUpdatedAt))
    if (!closed && lastUpdatedDays > 14) staleItems += 1

    const rag = item.ragStatus ?? item.priority ?? 'Unrated'
    ragCounts[rag] = (ragCounts[rag] ?? 0) + 1
  }

  return {
    openItems,
    overdueItems,
    dueSoonItems,
    closedItems,
    highPriorityItems,
    staleItems,
    moduleCounts,
    ragCounts,
  }
}
