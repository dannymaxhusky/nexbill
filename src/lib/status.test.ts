import { describe, expect, it } from 'vitest'
import { demoItems, demoUsers } from '../data/demoData'
import { calculateMetrics } from './metrics'
import { filterForView, isClosedStatus, nextItemCode } from './status'

describe('governance status rules', () => {
  it('treats closed variants as closed', () => {
    expect(isClosedStatus('Closed - Duplicate')).toBe(true)
    expect(isClosedStatus('Completed')).toBe(true)
    expect(isClosedStatus('In Progress')).toBe(false)
  })

  it('defaults My View to active records only', () => {
    const user = demoUsers.find((candidate) => candidate.fullName === 'Danny Hu')!
    const myItems = filterForView(demoItems, user, 'my', false)

    expect(myItems.length).toBeGreaterThan(0)
    expect(myItems.every((item) => !isClosedStatus(item.status, item.closedAt))).toBe(true)
  })

  it('calculates dashboard metrics from scoped items', () => {
    const metrics = calculateMetrics(demoItems)

    expect(metrics.openItems).toBeGreaterThan(0)
    expect(metrics.moduleCounts.actions).toBe(1)
    expect(metrics.highPriorityItems).toBeGreaterThan(0)
  })

  it('generates module-specific IDs', () => {
    expect(nextItemCode(demoItems, 'ACTION')).toBe('0002-NB-ACTION')
    expect(nextItemCode(demoItems, 'RISK')).toBe('0027-NB-RISK')
  })
})
