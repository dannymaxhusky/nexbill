import type { GovernanceItem, Role, UserProfile, ViewMode } from '../types'
import { riskLevelRank } from '../data/riskMatrix'

export const closedStatusTerms = ['closed', 'completed', 'actioned', 'duplicate', 'not applicable', 'mitigated']
export const defaultGridEditRoles: Role[] = ['super_admin', 'program_manager', 'ctm']

// Key programme milestone — used for the days-to-go-live countdown.
export const GO_LIVE_DATE = '2026-12-31'

// A row is "blank" when it carries an ID but no real content (no title/summary
// beyond the code itself). Emma asked for these to be hidden everywhere so the
// registers and dashboards only show meaningful records.
export function isBlankItem(item: GovernanceItem) {
  const title = (item.title ?? '').trim()
  const summary = (item.summary ?? '').trim()
  const code = (item.itemCode ?? '').trim()
  const meaningfulTitle = title && title.toLowerCase() !== code.toLowerCase()
  return !meaningfulTitle && !summary
}

export function daysToGoLive(reference: string = GO_LIVE_DATE) {
  const days = daysBetween(reference)
  return Number.isFinite(days) ? days : undefined
}

export function isClosedStatus(status?: string, closedAt?: string) {
  if (closedAt) return true
  const normalized = status?.toLowerCase() ?? ''
  return closedStatusTerms.some((term) => normalized.includes(term))
}

export function isOpenStatus(status?: string, closedAt?: string) {
  return !isClosedStatus(status, closedAt)
}

export function isPrivilegedRole(role: UserProfile['role']) {
  return role === 'super_admin' || role === 'program_manager' || role === 'ctm'
}

export function canGridEdit(user: UserProfile, allowedRoles: Role[] = defaultGridEditRoles) {
  return allowedRoles.includes(user.role)
}

export function canDeleteItem(user: UserProfile) {
  return user.role === 'super_admin'
}

export function canEditItem(user: UserProfile, item: GovernanceItem) {
  if (user.role === 'executive') return false
  if (isPrivilegedRole(user.role)) return true
  const email = user.email.toLowerCase()
  return item.ownerEmail?.toLowerCase() === email || item.supportEmail?.toLowerCase() === email
}

export function matchesMyView(item: GovernanceItem, user: UserProfile) {
  if (isPrivilegedRole(user.role)) {
    return isOpenStatus(item.status, item.closedAt)
  }
  const email = user.email.toLowerCase()
  const name = user.fullName.toLowerCase()
  const approverEmail = String(item.details.approverEmail ?? item.details.approver_email ?? '').toLowerCase()
  const approverName = String(item.details.approverName ?? item.details.approver ?? '').toLowerCase()
  return (
    isOpenStatus(item.status, item.closedAt) &&
    (item.ownerEmail?.toLowerCase() === email ||
      item.supportEmail?.toLowerCase() === email ||
      item.ownerName?.toLowerCase() === name ||
      item.supportName?.toLowerCase() === name ||
      approverEmail === email ||
      approverName === name ||
      item.workstream === user.workstream)
  )
}

export function filterForView(items: GovernanceItem[], user: UserProfile, viewMode: ViewMode, showClosed: boolean) {
  return items.filter((item) => {
    if (isBlankItem(item)) return false
    if (!showClosed && isClosedStatus(item.status, item.closedAt)) return false
    if (viewMode === 'all') return true
    return matchesMyView(item, user)
  })
}

export function priorityRank(value?: string) {
  const matrixRank = riskLevelRank(value)
  if (matrixRank >= 6) return 5
  if (matrixRank >= 5) return 4
  if (matrixRank >= 4) return 3
  if (matrixRank >= 3) return 2
  if (matrixRank >= 1) return 1

  const normalized = value?.toLowerCase() ?? ''
  if (normalized.includes('critical') || normalized.includes('red') || normalized.includes('very high')) return 4
  if (normalized.includes('high') || normalized.includes('amber')) return 3
  if (normalized.includes('medium')) return 2
  if (normalized.includes('low') || normalized.includes('green')) return 1
  return 0
}

export function sortItems(items: GovernanceItem[]) {
  return [...items].sort((a, b) => {
    const priorityDelta = priorityRank(b.priority ?? b.ragStatus) - priorityRank(a.priority ?? a.ragStatus)
    if (priorityDelta !== 0) return priorityDelta
    return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime()
  })
}

export function nextItemCode(items: GovernanceItem[], codePrefix: string) {
  const matcher = new RegExp(`^(\\d{4})-NB-${codePrefix}$`)
  const max = items.reduce((highest, item) => {
    const match = item.itemCode.match(matcher)
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)
  return `${String(max + 1).padStart(4, '0')}-NB-${codePrefix}`
}

export function formatDate(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
}

export function daysBetween(dateLike?: string) {
  if (!dateLike) return Number.POSITIVE_INFINITY
  const date = new Date(dateLike)
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  date.setHours(0, 0, 0, 0)
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
