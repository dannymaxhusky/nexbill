import { moduleConfigByKey } from '../data/moduleConfig'
import type { GovernanceItem, ReportDraft, ReportType } from '../types'
import { daysBetween, priorityRank, sortItems } from './status'

export function reportTypeLabel(type: ReportType) {
  if (type === 'team_leads') return 'Team Leads Operational View'
  if (type === 'stakeholders') return 'Stakeholder / SME View'
  return 'Executive SteerCo View'
}

export function generateLocalReport(items: GovernanceItem[], type: ReportType): ReportDraft {
  const sorted = sortItems(items)
  const overdue = sorted.filter((item) => daysBetween(item.dueDate) < 0)
  const critical = sorted.filter((item) => priorityRank(item.priority ?? item.ragStatus) >= 3)
  const decisions = sorted.filter((item) => item.module === 'decisions' || item.module === 'scope_changes')
  const risks = sorted.filter((item) => item.module === 'risks' || item.module === 'issues' || item.ragStatus?.includes('Red') || item.ragStatus?.includes('Amber'))

  const summaryByType: Record<ReportType, string> = {
    team_leads: `There are ${items.length} active governance records in the current view, with ${overdue.length} overdue items and ${critical.length} high-priority records requiring owner follow-up.`,
    stakeholders: `NexBill governance is tracking ${items.length} records across delivery, readiness, benefits, and dependencies. Stakeholder attention should focus on open decisions, dependency movement, and readiness blockers.`,
    executive: `NexBill has ${critical.length} material governance items to watch. Executive attention is needed where risk exposure, financial consolidation, schedule movement, or scope approval could affect delivery confidence.`,
  }

  return {
    id: `draft-${Date.now()}`,
    type,
    title: `${reportTypeLabel(type)} - AI draft`,
    summary: summaryByType[type],
    risks: risks.slice(0, 4).map((item) => `${item.itemCode}: ${item.title}`),
    decisions: decisions.slice(0, 4).map((item) => `${item.itemCode}: ${item.title}`),
    nextSteps: sorted.slice(0, 5).map((item) => `Update ${moduleConfigByKey[item.module].shortLabel.toLowerCase()} item ${item.itemCode} owned by ${item.ownerName ?? 'unassigned'}.`),
    citations: sorted.slice(0, 8).map((item) => ({
      itemCode: item.itemCode,
      module: item.module,
      title: item.title,
      source: item.sourceRef,
    })),
    createdAt: new Date().toISOString(),
  }
}
