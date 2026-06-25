import { Activity, BarChart3, ChevronRight, RotateCcw, UserRound, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { riskLevelRank, riskLevelTone, riskMatrixRows } from '../data/riskMatrix'
import { GO_LIVE_DATE, daysBetween, daysToGoLive, formatDate, isClosedStatus, priorityRank, sortItems } from '../lib/status'
import type { GovernanceItem, ModuleKey, ReportType, UserProfile } from '../types'

type Tone = 'green' | 'amber' | 'red' | 'slate'

interface DrillSection {
  key: string
  title: string
  sub: string
  items: GovernanceItem[]
}

const personaMeta: Array<{ type: ReportType; icon: typeof Activity; title: string; sub: string }> = [
  { type: 'team_leads', icon: Activity, title: 'Team Lead / Operational', sub: 'Daily delivery view — actions, issues, blockers' },
  { type: 'stakeholders', icon: UserRound, title: 'Stakeholder / SME', sub: 'Domain impact, decisions you are asked to weigh in on' },
  { type: 'executive', icon: BarChart3, title: 'Executive SteerCo', sub: 'Confidence, money, decisions required this meeting' },
]

function isOpen(item: GovernanceItem) {
  return !isClosedStatus(item.status, item.closedAt)
}

function toneForStatusWord(value?: string): Tone {
  const normalized = value?.toLowerCase() ?? ''
  if (!normalized) return 'slate'
  if (normalized.includes('off track') || normalized.includes('red') || normalized.includes('critical') || normalized.includes('overdue')) return 'red'
  if (normalized.includes('at risk') || normalized.includes('amber') || normalized.includes('slip') || normalized.includes('escalat')) return 'amber'
  if (normalized.includes('on track') || normalized.includes('green') || normalized.includes('complete') || normalized.includes('closed') || normalized.includes('approved')) return 'green'
  return 'slate'
}

function toneForRating(value?: string): Tone {
  const rank = riskLevelRank(value)
  if (rank >= 5) return 'red'
  if (rank >= 3) return 'amber'
  if (rank >= 1) return 'green'
  const fallback = priorityRank(value)
  if (fallback >= 4) return 'red'
  if (fallback >= 3) return 'amber'
  if (fallback >= 1) return 'green'
  return 'slate'
}

function toneForDue(item: GovernanceItem): { tone: Tone; label: string } {
  if (!item.dueDate) return { tone: 'slate', label: 'No date' }
  const days = daysBetween(item.dueDate)
  if (!Number.isFinite(days)) return { tone: 'slate', label: 'No date' }
  if (days < 0) return { tone: 'red', label: `${Math.abs(days)}d overdue` }
  if (days <= 7) return { tone: 'amber', label: `Due in ${days}d` }
  return { tone: 'green', label: formatDate(item.dueDate) }
}

function numberFromDetails(item: GovernanceItem, keys: string[]) {
  for (const key of keys) {
    const raw = item.details[key]
    if (raw === null || raw === undefined || raw === '') continue
    const value = Number(String(raw).replace(/[^0-9.-]/g, ''))
    if (Number.isFinite(value)) return value
  }
  return undefined
}

function formatMoney(value?: number) {
  if (value === undefined) return '—'
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString('en', { maximumFractionDigits: 1 })}M`
  return `${value.toLocaleString('en', { maximumFractionDigits: 1 })}K`
}

function detailText(item: GovernanceItem, keys: string[]) {
  for (const key of keys) {
    const raw = item.details[key]
    if (raw !== null && raw !== undefined && String(raw).trim()) return String(raw)
  }
  return ''
}

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`rs-chip ${tone}`}>{children}</span>
}

function parseScore(value: string) {
  const match = value.match(/[1-5]/)
  return match ? Number(match[0]) : undefined
}

function TrendChart({ series }: { series: Array<{ label: string; open: number; overdue: number }> }) {
  const width = 320
  const height = 110
  const padX = 8
  const padY = 12
  const max = Math.max(1, ...series.map((point) => point.open))
  const x = (index: number) => padX + (index * (width - padX * 2)) / Math.max(1, series.length - 1)
  const y = (value: number) => height - padY - (value / max) * (height - padY * 2)
  const line = (key: 'open' | 'overdue') => series.map((point, index) => `${x(index)},${y(point[key])}`).join(' ')
  const area = `${padX},${height - padY} ${line('open')} ${x(series.length - 1)},${height - padY}`
  return (
    <div className="rs-trend">
      <svg viewBox={`0 0 ${width} ${height + 16}`} role="img" aria-label="Open and overdue trend">
        {[0.25, 0.5, 0.75, 1].map((step) => (
          <line key={step} x1={padX} x2={width - padX} y1={y(max * step)} y2={y(max * step)} stroke="#e2e8f0" strokeWidth="1" />
        ))}
        <polygon points={area} fill="rgba(15, 23, 42, 0.07)" />
        <polyline points={line('open')} fill="none" stroke="#0f172a" strokeWidth="2" />
        <polyline points={line('overdue')} fill="none" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 3" />
        {series.map((point, index) => (
          <text key={point.label} x={x(index)} y={height + 10} textAnchor="middle" fontSize="9" fill="#64748b">{point.label}</text>
        ))}
      </svg>
      <span className="rs-legend">
        <i><span className="rs-dot slate" style={{ background: '#0f172a' }} /> Open</i>
        <i><span className="rs-dot red" /> Overdue</i>
      </span>
    </div>
  )
}

function RiskHeatmap({ cells, onSelect }: { cells: Map<string, number>; onSelect?: (probability: number, impact: number) => void }) {
  return (
    <div className="rs-heatmap">
      <span className="axis" />
      {[1, 2, 3, 4, 5].map((impact) => <span key={impact} className="axis">I{impact}</span>)}
      {riskMatrixRows.map((row) => (
        <Fragment key={row.probability}>
          <span className="axis">P{row.probability}</span>
          {row.levels.map((level, impactIndex) => {
            const impact = impactIndex + 1
            const count = cells.get(`${row.probability}-${impact}`) ?? 0
            const toneClass = `risk-cell tone-${riskLevelTone(level) ?? 'medium'}`
            if (count && onSelect) {
              return (
                <button
                  key={`${row.probability}-${impactIndex}`}
                  type="button"
                  className={`cell ${toneClass} is-clickable`}
                  title={`${level} · ${count} risk${count === 1 ? '' : 's'} (P${row.probability} × I${impact})`}
                  onClick={() => onSelect(row.probability, impact)}
                >
                  {count}
                </button>
              )
            }
            return (
              <span key={`${row.probability}-${impactIndex}`} className={`cell ${toneClass}`} style={{ opacity: count ? 1 : 0.4 }}>
                {count || ''}
              </span>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

function FinanceBars({ bars }: { bars: Array<{ label: string; value: number; tone: string }> }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value))
  return (
    <div className="rs-finance-bars">
      {bars.map((bar) => (
        <div key={bar.label} className="rs-finance-bar">
          <i style={{ height: `${Math.max(6, Math.round((bar.value / max) * 100))}%`, background: bar.tone }} />
          <strong>{formatMoney(bar.value)}</strong>
          <span>{bar.label}</span>
        </div>
      ))}
    </div>
  )
}

function Donut({ segments, centre }: { segments: Array<{ value: number; color: string }>; centre: string }) {
  const total = Math.max(1, segments.reduce((sum, segment) => sum + segment.value, 0))
  const radius = 40
  const circumference = 2 * Math.PI * radius
  return (
    <svg viewBox="0 0 120 120" className="rs-donut" role="img" aria-label="Benefits confidence">
      <circle cx="60" cy="60" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="16" />
      {segments.map((segment, index) => {
        const offset = segments.slice(0, index).reduce((sum, prev) => sum + prev.value, 0)
        const length = (segment.value / total) * circumference
        const dash = `${length} ${circumference - length}`
        const rotation = (offset / total) * 360 - 90
        return <circle key={index} cx="60" cy="60" r={radius} fill="none" stroke={segment.color} strokeWidth="16" strokeDasharray={dash} transform={`rotate(${rotation} 60 60)`} />
      })}
      <text x="60" y="66" textAnchor="middle" fontSize="20" fontFamily="var(--font-display)" fill="#0f172a">{centre}</text>
    </svg>
  )
}

function ItemRows({ items, max, side, onOpen }: { items: GovernanceItem[]; max: number; side: (item: GovernanceItem) => ReactNode; onOpen?: (item: GovernanceItem) => void }) {
  if (items.length === 0) return <div className="rs-empty">Nothing open right now.</div>
  return (
    <div className="rs-rows">
      {items.slice(0, max).map((item) => (
        <div
          key={item.id}
          className={`rs-row${onOpen ? ' is-clickable' : ''}`}
          role={onOpen ? 'button' : undefined}
          tabIndex={onOpen ? 0 : undefined}
          onClick={onOpen ? () => onOpen(item) : undefined}
          onKeyDown={onOpen ? (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onOpen(item)
            }
          } : undefined}
        >
          <div className="rs-row-main">
            <span className="code">{item.itemCode}</span>
            <strong>{item.title}</strong>
            {item.ownerName && <small>{item.ownerName}{item.workstream ? ` · ${item.workstream}` : ''}</small>}
          </div>
          <div className="rs-row-side">{side(item)}</div>
        </div>
      ))}
    </div>
  )
}

function ReportCard({ title, sub, wide, callout, onDrill, children }: {
  title: string
  sub?: string
  wide?: boolean
  callout?: boolean
  onDrill?: () => void
  children: ReactNode
}) {
  return (
    <section className={`${callout ? 'rs-callout' : 'rs-card'}${wide ? ' is-wide' : ''}`}>
      <header className="rs-card-head">
        <div>
          <h4>{title}</h4>
          {sub && <p>{sub}</p>}
        </div>
        {onDrill && (
          <button className="rs-drill" onClick={onDrill}>
            Drill in <ChevronRight size={14} />
          </button>
        )}
      </header>
      {children}
    </section>
  )
}

export default function GovernanceReport({ items, user, persona, onPersonaChange, onOpenItem }: {
  items: GovernanceItem[]
  user: UserProfile
  persona: ReportType
  onPersonaChange: (type: ReportType) => void
  onOpenItem?: (item: GovernanceItem) => void
}) {
  const [drill, setDrill] = useState<DrillSection | null>(null)

  const modules = useMemo(() => {
    const map = new Map<ModuleKey, GovernanceItem[]>()
    for (const item of items) {
      map.set(item.module, [...(map.get(item.module) ?? []), item])
    }
    return map
  }, [items])

  const pick = (key: ModuleKey) => modules.get(key) ?? []
  const openOf = (key: ModuleKey) => sortItems(pick(key).filter(isOpen))

  const openRisks = openOf('risks')
  const openIssues = openOf('issues')
  const openActions = openOf('actions')
  const openDecisions = openOf('decisions')
  const openDependencies = openOf('dependencies')
  const openAssumptions = openOf('assumptions')
  const lessons = sortItems(pick('lessons'))
  const benefits = sortItems(pick('benefits'))
  const financials = sortItems(pick('financials'))
  const schedule = sortItems(pick('schedule'))
  const goLive = sortItems(pick('go_live'))
  const changeRequests = sortItems(pick('scope_changes'))

  // Subsets surfaced behind the operational stat tiles so a click drills into
  // exactly the records the number is counting.
  const overdueActionItems = openActions.filter((item) => {
    const days = daysBetween(item.dueDate)
    return Number.isFinite(days) && days < 0
  })
  const highSevIssueItems = openIssues.filter((item) => priorityRank(item.priority ?? item.ragStatus) >= 3)
  const depsAtRiskItems = openDependencies.filter((item) => toneForRating(item.ragStatus ?? item.priority) !== 'green')
  const keyMilestones = schedule.filter((item) => /^(y|yes|true|1)/i.test(detailText(item, ['keyMilestone']).trim()))

  const metrics = useMemo(() => {
    const total = items.length
    const closed = items.filter((item) => !isOpen(item)).length

    // Programme progress is driven by schedule milestones and go-live readiness
    // completion (Emma's feedback), falling back to the overall closed ratio.
    const progressItems = [...pick('schedule'), ...pick('go_live')]
    const progressDone = progressItems.filter((item) => !isOpen(item)).length
    const completePct = progressItems.length
      ? Math.round((progressDone / progressItems.length) * 100)
      : total > 0 ? Math.round((closed / total) * 100) : undefined

    // Countdown to the fixed go-live milestone (31 Dec 2026).
    const goLiveDays = daysToGoLive(GO_LIVE_DATE)

    const contingencyDrawdown = pick('schedule').reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['contingencyDrawdown'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)

    const criticalRisks = openRisks.filter((item) => riskLevelRank(item.ragStatus ?? item.priority) >= 5 || priorityRank(item.priority ?? item.ragStatus) >= 4).length
    const overdueActions = openActions.filter((item) => Number.isFinite(daysBetween(item.dueDate)) && daysBetween(item.dueDate) < 0).length
    const slippedMilestones = schedule.filter((item) => {
      const baseline = detailText(item, ['baselineDate'])
      const forecast = detailText(item, ['forecastDate'])
      return baseline && forecast && new Date(forecast) > new Date(baseline)
    }).length

    const scheduleTone: Tone = slippedMilestones > 0 ? 'amber' : schedule.length ? 'green' : 'slate'
    const budget = financials.reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['budget'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)
    const forecast = financials.reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['forecast'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)
    const actuals = financials.reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['actuals'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)
    const costTone: Tone = budget !== undefined && forecast !== undefined ? (forecast > budget ? 'red' : 'green') : 'slate'

    const overallTone: Tone = criticalRisks > 0 || overdueActions > 5 ? 'red' : openRisks.length > 0 || slippedMilestones > 0 ? 'amber' : 'green'
    const overallLabel = overallTone === 'red' ? 'At risk' : overallTone === 'amber' ? 'Watch' : 'On track'

    return { completePct, daysToGoLive: goLiveDays, contingencyDrawdown, criticalRisks, overdueActions, slippedMilestones, scheduleTone, budget, forecast, actuals, costTone, overallTone, overallLabel }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // Auto-generated narrative seeds. These are editable on the dashboard so the
  // team can layer in context the data does not capture (Emma's request).
  const standsAutoText = `${openActions.length} actions are in flight (${metrics.overdueActions} overdue), with ${openIssues.length} open issues and ${openRisks.length} open risks${metrics.criticalRisks > 0 ? ` — ${metrics.criticalRisks} rated very high or above` : ''}. ${openDecisions.length > 0 ? `${openDecisions.length} decisions are awaiting a forum.` : 'No decisions are currently waiting.'}${metrics.slippedMilestones > 0 ? ` ${metrics.slippedMilestones} milestones are forecasting later than baseline.` : ''}${metrics.daysToGoLive !== undefined ? ` ${metrics.daysToGoLive} days remain to the go-live milestone.` : ''}`
  const execAutoText = `Overall ${metrics.overallLabel.toLowerCase()}. ${openRisks.length} open risks (${metrics.criticalRisks} very high or above), ${openIssues.length} open issues, and ${openDecisions.length} decision${openDecisions.length === 1 ? '' : 's'} awaiting SteerCo. ${metrics.slippedMilestones > 0 ? `${metrics.slippedMilestones} milestone${metrics.slippedMilestones === 1 ? '' : 's'} forecasting later than baseline.` : 'Milestones are holding to baseline.'}${metrics.daysToGoLive !== undefined ? ` ${metrics.daysToGoLive} days to go-live.` : ''}`

  const periodLabel = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(now)
  }, [])

  const drillInto = (key: string, title: string, sub: string, list: GovernanceItem[]) => {
    setDrill({ key, title, sub, items: list })
  }

  const ratingBuckets = useMemo(() => {
    const buckets: Array<{ label: string; tone: Tone; count: number }> = [
      { label: 'Very high / Extreme', tone: 'red', count: 0 },
      { label: 'High', tone: 'amber', count: 0 },
      { label: 'Medium', tone: 'amber', count: 0 },
      { label: 'Low / Very low', tone: 'green', count: 0 },
    ]
    for (const risk of openRisks) {
      const rank = riskLevelRank(risk.ragStatus ?? risk.priority)
      if (rank >= 5) buckets[0].count += 1
      else if (rank === 4) buckets[1].count += 1
      else if (rank === 3) buckets[2].count += 1
      else buckets[3].count += 1
    }
    return buckets
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const trendSeries = useMemo(() => {
    const series: Array<{ label: string; open: number; overdue: number }> = []
    const today = new Date()
    for (let week = 5; week >= 0; week -= 1) {
      const end = new Date(today)
      end.setDate(end.getDate() - week * 7)
      const openAt = pick('actions').filter((item) => !item.closedAt || new Date(item.closedAt) > end)
      const overdueAt = openAt.filter((item) => item.dueDate && new Date(item.dueDate) < end)
      series.push({ label: week === 0 ? 'Now' : `W-${week}`, open: openAt.length, overdue: overdueAt.length })
    }
    return series
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const heatmapCells = useMemo(() => {
    const cells = new Map<string, number>()
    for (const risk of openRisks) {
      const probability = parseScore(detailText(risk, ['mitigatedProbability']))
      const impact = parseScore(detailText(risk, ['mitigatedImpact']))
      if (!probability || !impact) continue
      const key = `${probability}-${impact}`
      cells.set(key, (cells.get(key) ?? 0) + 1)
    }
    return cells
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const statTiles = useMemo(() => {
    const highIssues = openIssues.filter((item) => priorityRank(item.priority ?? item.ragStatus) >= 3).length
    const depsAtRisk = openDependencies.filter((item) => toneForRating(item.ragStatus ?? item.priority) !== 'green').length
    return { highIssues, depsAtRisk }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const benefitSegments = useMemo(() => {
    const counts = { green: 0, amber: 0, red: 0, slate: 0 }
    for (const benefit of benefits) {
      counts[toneForStatusWord(detailText(benefit, ['currentState']) || benefit.status)] += 1
    }
    return [
      { value: counts.green, color: '#10b981' },
      { value: counts.amber, color: '#f59e0b' },
      { value: counts.red, color: '#ef4444' },
      { value: counts.slate, color: '#94a3b8' },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const goLiveDomains = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>()
    for (const item of pick('go_live')) {
      const domain = detailText(item, ['readinessDomain']) || 'General readiness'
      const entry = map.get(domain) ?? { total: 0, done: 0 }
      entry.total += 1
      if (!isOpen(item)) entry.done += 1
      map.set(domain, entry)
    }
    return [...map.entries()].map(([domain, { total, done }]) => ({
      domain,
      total,
      done,
      pct: total ? Math.round((done / total) * 100) : 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  const myEmail = user.email.toLowerCase()
  const mine = (list: GovernanceItem[]) =>
    list.filter((item) =>
      item.ownerEmail?.toLowerCase() === myEmail ||
      item.supportEmail?.toLowerCase() === myEmail ||
      (user.workstream && item.workstream === user.workstream))

  const sideDue = (item: GovernanceItem) => {
    const due = toneForDue(item)
    return <Chip tone={due.tone}>{due.label}</Chip>
  }
  const sideRating = (item: GovernanceItem) => (
    <Chip tone={toneForRating(item.ragStatus ?? item.priority)}>{item.ragStatus ?? item.priority ?? 'Unrated'}</Chip>
  )
  const sideStatus = (item: GovernanceItem) => <Chip tone={toneForStatusWord(item.status)}>{item.status}</Chip>

  return (
    <div className="page-stack">
      <section className="rs-hero">
        <div className="rs-hero-top">
          <div>
            <p className="eyebrow">Programme governance</p>
            <h2>NexBill Programme <em>· FY26</em></h2>
            <p className="rs-hero-sub">Billing transformation · Sponsor view prepared for {user.fullName}</p>
          </div>
          <div className="rs-hero-meta">
            <span className="rs-meta-chip">Reporting period · {periodLabel}</span>
            <Chip tone={metrics.overallTone}>Overall · {metrics.overallLabel}</Chip>
          </div>
        </div>
        <div className="rs-kpis">
          <div className="rs-kpi">
            <span className="rs-kpi-label">Programme complete</span>
            <span className="rs-kpi-value">{metrics.completePct !== undefined ? `${metrics.completePct}%` : '—'}</span>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Days to go-live</span>
            <span className="rs-kpi-value">{metrics.daysToGoLive ?? '—'}</span>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Schedule</span>
            <Chip tone={metrics.scheduleTone}>{metrics.scheduleTone === 'slate' ? 'No milestone data' : metrics.slippedMilestones > 0 ? `${metrics.slippedMilestones} slipping` : 'On track'}</Chip>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Cost</span>
            <Chip tone={metrics.costTone}>{metrics.costTone === 'slate' ? 'No financial data' : metrics.costTone === 'red' ? 'Over budget' : 'Within budget'}</Chip>
          </div>
        </div>
      </section>

      <section className="rs-personas">
        {personaMeta.map(({ type, icon: Icon, title, sub }) => (
          <button key={type} className={`rs-persona${persona === type ? ' is-active' : ''}`} onClick={() => onPersonaChange(type)}>
            <Icon size={17} />
            <span>
              <strong>{title}</strong>
              <span>{sub}</span>
            </span>
          </button>
        ))}
      </section>

      {persona === 'team_leads' && (
        <>
          <div className="rs-view-head">
            <div>
              <h3>Team Lead / Operational view</h3>
              <p>Daily delivery view — actions, issues, blockers. Click any card to drill in.</p>
            </div>
            <span className="rs-legend">
              <i><span className="rs-dot green" /> On track</i>
              <i><span className="rs-dot amber" /> At risk</i>
              <i><span className="rs-dot red" /> Off track</i>
            </span>
          </div>
          <section className="ops-stats">
            <button className="ops-stat" onClick={() => drillInto('actions', 'Overdue actions', 'Open actions at least one day past their due date.', overdueActionItems)}>
              <span className="rs-kpi-label">Overdue actions</span>
              <strong className={metrics.overdueActions ? 'is-red' : ''}>{metrics.overdueActions}</strong>
              <small>1+ days past due · {openActions.length} open total</small>
            </button>
            <button className="ops-stat" onClick={() => drillInto('issues', 'High-severity issues', 'Open issues rated high or critical priority.', highSevIssueItems)}>
              <span className="rs-kpi-label">High-sev issues</span>
              <strong className={statTiles.highIssues ? 'is-amber' : ''}>{statTiles.highIssues}</strong>
              <small>high / critical priority · open</small>
            </button>
            <button className="ops-stat" onClick={() => drillInto('schedule', 'Milestones slipping', 'Milestones whose forecast date is later than baseline.', schedule.filter((item) => { const baseline = detailText(item, ['baselineDate']); const forecast = detailText(item, ['forecastDate']); return baseline && forecast && new Date(forecast) > new Date(baseline) }))}>
              <span className="rs-kpi-label">Milestones slipping</span>
              <strong className={metrics.slippedMilestones ? 'is-amber' : ''}>{metrics.slippedMilestones}</strong>
              <small>forecast later than baseline</small>
            </button>
            <button className="ops-stat" onClick={() => drillInto('dependencies', 'Dependencies at risk', 'Open dependencies with an amber or red RAG status.', depsAtRiskItems)}>
              <span className="rs-kpi-label">Dependencies at risk</span>
              <strong className={statTiles.depsAtRisk ? 'is-amber' : ''}>{statTiles.depsAtRisk}</strong>
              <small>RAG amber or red · open</small>
            </button>
          </section>
          <div className="rs-grid">
            <ReportCard title="Actions" sub={`Backlog & overdue trend · ${openActions.length} open, ${metrics.overdueActions} overdue`} onDrill={() => drillInto('actions', 'Actions', 'Open actions and full action log.', openActions)}>
              <TrendChart series={trendSeries} />
              <ItemRows items={openActions} max={3} side={sideDue} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Issues" sub={`${openIssues.length} open`} onDrill={() => drillInto('issues', 'Issues', 'Issues needing resolution and full issue log.', openIssues)}>
              <ItemRows items={openIssues} max={6} side={(item) => <Chip tone={toneForRating(item.priority ?? item.ragStatus)}>{item.priority ?? 'Unrated'}</Chip>} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Top risks" sub="Highest rated open risks" onDrill={() => drillInto('risks', 'Risk register', 'Open risks ordered by mitigated rating.', openRisks)}>
              <ItemRows items={openRisks} max={5} side={sideRating} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Dependencies" sub={`${openDependencies.length} open`} onDrill={() => drillInto('dependencies', 'Dependencies', 'Cross-team and external dependencies.', openDependencies)}>
              <ItemRows items={openDependencies} max={5} side={sideRating} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Decisions needed" sub={`${openDecisions.length} awaiting`} onDrill={() => drillInto('decisions', 'Decisions', 'Decisions needed and full decision log.', openDecisions)}>
              <ItemRows items={openDecisions} max={4} side={() => <Chip tone="amber">Awaiting</Chip>} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Assumptions to clarify" sub={`${openAssumptions.length} open`} onDrill={() => drillInto('assumptions', 'Assumptions', 'Assumptions awaiting validation.', openAssumptions)}>
              <ItemRows items={openAssumptions} max={4} side={sideStatus} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Go-live readiness" sub="Checklist progress by domain" onDrill={() => drillInto('go_live', 'Go-live readiness', 'Workstream readiness across all checklist categories.', goLive)}>
              {goLiveDomains.length === 0 ? <div className="rs-empty">No readiness checklist captured yet.</div> : (
                <div>
                  {goLiveDomains.map(({ domain, total, done, pct }) => (
                    <div key={domain} className="rs-progress-row">
                      <div className="rs-progress-top">
                        <strong><span className={`rs-dot ${pct >= 90 ? 'green' : pct >= 60 ? 'amber' : 'red'}`} />{domain}</strong>
                        <span>{done}/{total} · {pct}%</span>
                      </div>
                      <div className="rs-bar"><i style={{ width: `${pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
            <ReportCard title="Lessons capture" sub="Most recent lessons" onDrill={() => drillInto('lessons', 'Lessons & continuous improvement', 'Lessons captured across the programme.', lessons)}>
              <ItemRows items={lessons} max={4} side={(item) => <Chip tone={toneForStatusWord(item.status)}>{detailText(item, ['lessonType']).includes('Positive') ? 'Repeat it' : 'Fix it'}</Chip>} onOpen={onOpenItem} />
            </ReportCard>
          </div>
        </>
      )}

      {persona === 'stakeholders' && (
        <>
          <div className="rs-view-head">
            <div>
              <h3>Stakeholder / SME view</h3>
              <p>Domain impact, items where your input is requested. Click any card to drill in.</p>
            </div>
            <span className="rs-legend">
              <i><span className="rs-dot green" /> On track</i>
              <i><span className="rs-dot amber" /> At risk</i>
              <i><span className="rs-dot red" /> Off track</i>
            </span>
          </div>
          <div className="rs-grid">
            <ReportCard wide title="Where the programme stands" sub="AI-seeded from live registers · edit to add context">
              <EditableNarrative storageKey="nexbill-narrative-stakeholders" autoText={standsAutoText} />
            </ReportCard>
            <ReportCard title="Benefits realisation" sub="Targeted vs forecast benefits" onDrill={() => drillInto('benefits', 'Benefits realisation', 'Targeted vs forecast benefits and confidence.', benefits)}>
              {benefits.length > 0 && (
                <div className="rs-donut-wrap">
                  <Donut segments={benefitSegments} centre={String(benefits.length)} />
                  <span className="rs-legend">
                    <i><span className="rs-dot green" /> On track</i>
                    <i><span className="rs-dot amber" /> Watch</i>
                    <i><span className="rs-dot red" /> At risk</i>
                  </span>
                </div>
              )}
              <ItemRows items={benefits} max={5} side={(item) => <Chip tone={toneForStatusWord(detailText(item, ['currentState']) || item.status)}>{detailText(item, ['currentState']) || item.status}</Chip>} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Risk heatmap" sub="Open risks · mitigated (residual) probability × impact · click a cell" onDrill={() => drillInto('risks', 'Risk register', 'Open risks ordered by mitigated (residual) rating.', openRisks)}>
              {heatmapCells.size > 0 ? <RiskHeatmap cells={heatmapCells} onSelect={(probability, impact) => {
                const matched = openRisks.filter((item) => parseScore(detailText(item, ['mitigatedProbability'])) === probability && parseScore(detailText(item, ['mitigatedImpact'])) === impact)
                drillInto('risks', `Mitigated risks · P${probability} × I${impact}`, 'Open risks at this residual probability and impact.', matched)
              }} /> : (
                <div>
                  {ratingBuckets.map(({ label, tone, count }) => {
                    const max = Math.max(1, ...ratingBuckets.map((bucket) => bucket.count))
                    return (
                      <div key={label} className="rs-progress-row">
                        <div className="rs-progress-top">
                          <strong><span className={`rs-dot ${tone}`} />{label}</strong>
                          <span>{count}</span>
                        </div>
                        <div className="rs-bar"><i style={{ width: `${Math.round((count / max) * 100)}%` }} /></div>
                      </div>
                    )
                  })}
                  <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12.5 }}>Probability × impact scores appear after the workbook is re-imported.</p>
                </div>
              )}
            </ReportCard>
            <ReportCard title="Dependencies for you" sub={user.workstream ? `Matched to ${user.workstream}` : 'All workstreams'} onDrill={() => drillInto('dependencies', 'Dependencies', 'Cross-team and external dependencies.', openDependencies)}>
              <ItemRows items={mine(openDependencies).length ? mine(openDependencies) : openDependencies} max={5} side={sideRating} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Decisions pending" sub={`${openDecisions.length} awaiting a forum`} onDrill={() => drillInto('decisions', 'Decisions', 'Decisions needed and full decision log.', openDecisions)}>
              <ItemRows items={openDecisions} max={5} side={() => <Chip tone="amber">Awaiting</Chip>} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Open actions for you" sub="Where you are owner or support" onDrill={() => drillInto('actions', 'Actions', 'Open actions and full action log.', openActions)}>
              <ItemRows items={mine(openActions).length ? mine(openActions) : openActions} max={5} side={sideDue} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Assumptions to validate" sub={`${openAssumptions.length} open`} onDrill={() => drillInto('assumptions', 'Assumptions', 'Assumptions awaiting validation.', openAssumptions)}>
              <ItemRows items={openAssumptions} max={4} side={sideStatus} onOpen={onOpenItem} />
            </ReportCard>
          </div>
        </>
      )}

      {persona === 'executive' && (
        <>
          <div className="rs-view-head">
            <div>
              <h3>Executive SteerCo view</h3>
              <p>Confidence, money, decisions required this meeting. Click any card to drill in.</p>
            </div>
            <span className="rs-legend">
              <i><span className="rs-dot green" /> On track</i>
              <i><span className="rs-dot amber" /> At risk</i>
              <i><span className="rs-dot red" /> Off track</i>
            </span>
          </div>
          <div className="rs-grid">
            <ReportCard wide title="SteerCo summary" sub={`Prepared for SteerCo · ${periodLabel}`}>
              <EditableNarrative storageKey="nexbill-narrative-executive" autoText={execAutoText} />
              <div className="rs-summary">
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${metrics.overallTone}`} />Overall</span>
                  <p>{metrics.overallLabel} · {openRisks.length} open risks, {openIssues.length} open issues across the programme.</p>
                </div>
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${metrics.scheduleTone}`} />Schedule</span>
                  <p>{metrics.slippedMilestones > 0 ? `${metrics.slippedMilestones} milestones forecasting later than baseline.` : schedule.length ? 'Milestones holding to baseline.' : 'Milestone data not yet captured.'}</p>
                </div>
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${metrics.costTone}`} />Cost</span>
                  <p>{metrics.budget !== undefined ? `Budget ${formatMoney(metrics.budget)} · forecast ${formatMoney(metrics.forecast)}.` : 'Financial lines not yet captured.'}</p>
                </div>
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${changeRequests.filter(isOpen).length ? 'amber' : 'green'}`} />Scope</span>
                  <p>{changeRequests.length ? `${changeRequests.filter(isOpen).length} change requests in flight of ${changeRequests.length} logged.` : 'No change requests logged.'}</p>
                </div>
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${metrics.criticalRisks ? 'red' : openRisks.length ? 'amber' : 'green'}`} />Risk</span>
                  <p>{metrics.criticalRisks ? `${metrics.criticalRisks} risks rated very high or above remain top exposures.` : `${openRisks.length} open risks, none rated very high.`}</p>
                </div>
                <div className="rs-summary-cell">
                  <span className="rs-kpi-label"><span className={`rs-dot ${benefits.length ? 'green' : 'slate'}`} />Benefits</span>
                  <p>{benefits.length ? `${benefits.length} benefit measures tracked; ${benefits.filter(isOpen).length} being actively monitored.` : 'Benefit measures not yet captured.'}</p>
                </div>
              </div>
            </ReportCard>
            <ReportCard callout title="Decisions required from SteerCo" sub="Approvals requested at this meeting" onDrill={() => drillInto('decisions', 'Decisions', 'Decisions needed and full decision log.', openDecisions)}>
              <ItemRows items={openDecisions} max={4} side={() => <Chip tone="amber">Awaiting</Chip>} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Financials" sub="Budget, forecast, spend" onDrill={() => drillInto('financials', 'Financials', 'Budget, forecast, spend and variance.', financials)}>
              {metrics.budget === undefined && metrics.forecast === undefined && metrics.actuals === undefined ? (
                <div className="rs-empty">Financial lines not yet captured — WIP with Jimmy per original requirements.</div>
              ) : (
                <FinanceBars bars={[
                  { label: 'Budget', value: metrics.budget ?? 0, tone: '#0f172a' },
                  { label: 'Forecast', value: metrics.forecast ?? 0, tone: metrics.costTone === 'red' ? '#ef4444' : '#334e8c' },
                  { label: 'Spent', value: metrics.actuals ?? 0, tone: '#94a3b8' },
                ]} />
              )}
            </ReportCard>
            <ReportCard title="Benefits forecast" sub={`${benefits.length} measures tracked`} onDrill={() => drillInto('benefits', 'Benefits realisation', 'Targeted vs forecast benefits and confidence.', benefits)}>
              {benefits.length === 0 ? <div className="rs-empty">Benefit measures not yet captured.</div> : (
                <div className="rs-donut-wrap">
                  <Donut segments={benefitSegments} centre={String(benefits.length)} />
                  <span className="rs-legend">
                    <i><span className="rs-dot green" /> On track</i>
                    <i><span className="rs-dot amber" /> Watch</i>
                    <i><span className="rs-dot red" /> At risk</i>
                  </span>
                </div>
              )}
            </ReportCard>
            <ReportCard title="Financial change requests" sub={`${changeRequests.length} logged`} onDrill={() => drillInto('scope_changes', 'Scope & change requests', 'Change control and budget impact.', changeRequests)}>
              <ItemRows items={changeRequests} max={4} side={(item) => {
                const budgetK = numberFromDetails(item, ['budgetK'])
                const approval = detailText(item, ['execApproval'])
                return (
                  <>
                    {budgetK !== undefined && <span>{formatMoney(budgetK)}</span>}
                    <Chip tone={approval.toUpperCase() === 'Y' ? 'green' : 'amber'}>{approval.toUpperCase() === 'Y' ? 'Approved' : item.status}</Chip>
                  </>
                )
              }} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Schedule — key milestones" sub={keyMilestones.length ? `${keyMilestones.length} key milestones · baseline vs forecast` : 'Baseline vs forecast'} onDrill={() => drillInto('schedule', 'Schedule & milestones', 'Baseline vs forecast for key milestones.', keyMilestones.length ? keyMilestones : schedule)}>
              {schedule.length === 0 ? <div className="rs-empty">Milestone data not yet captured.</div> : (
                <>
                  <ItemRows items={keyMilestones.length ? keyMilestones : schedule} max={6} side={(item) => {
                    const baseline = detailText(item, ['baselineDate'])
                    const forecast = detailText(item, ['forecastDate'])
                    const slipped = baseline && forecast && new Date(forecast) > new Date(baseline)
                    return (
                      <>
                        {forecast && <span>{formatDate(forecast)}</span>}
                        <Chip tone={slipped ? 'amber' : toneForStatusWord(item.status)}>{slipped ? 'Slip' : item.status}</Chip>
                      </>
                    )
                  }} onOpen={onOpenItem} />
                  {metrics.contingencyDrawdown !== undefined && (
                    <p className="rs-schedule-note">Contingency drawn down: <strong>{metrics.contingencyDrawdown} day{metrics.contingencyDrawdown === 1 ? '' : 's'}</strong></p>
                  )}
                </>
              )}
            </ReportCard>
            <ReportCard title="Top risks" sub="Highest rated open risks" onDrill={() => drillInto('risks', 'Risk register', 'Open risks ordered by mitigated rating.', openRisks)}>
              <ItemRows items={openRisks} max={5} side={sideRating} onOpen={onOpenItem} />
            </ReportCard>
            <ReportCard title="Go-live readiness" sub="Checklist progress by domain" onDrill={() => drillInto('go_live', 'Go-live readiness', 'Workstream readiness across all checklist categories.', goLive)}>
              {goLiveDomains.length === 0 ? <div className="rs-empty">No readiness checklist captured yet.</div> : (
                <div>
                  {goLiveDomains.map(({ domain, total, done, pct }) => (
                    <div key={domain} className="rs-progress-row">
                      <div className="rs-progress-top">
                        <strong><span className={`rs-dot ${pct >= 90 ? 'green' : pct >= 60 ? 'amber' : 'red'}`} />{domain}</strong>
                        <span>{done}/{total} · {pct}%</span>
                      </div>
                      <div className="rs-bar"><i style={{ width: `${pct}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
            </ReportCard>
            <ReportCard title="Lessons applied" sub="What we are repeating or fixing" onDrill={() => drillInto('lessons', 'Lessons & continuous improvement', 'Lessons captured across the programme.', lessons)}>
              <ItemRows items={lessons} max={4} side={(item) => <Chip tone={detailText(item, ['lessonType']).includes('Positive') ? 'green' : 'amber'}>{detailText(item, ['lessonType']).includes('Positive') ? 'Repeat' : 'Fix'}</Chip>} onOpen={onOpenItem} />
            </ReportCard>
          </div>
        </>
      )}

      {drill && (
        <>
          <div className="rs-drawer-backdrop" onClick={() => setDrill(null)} />
          <aside className="rs-drawer" role="dialog" aria-label={drill.title}>
            <header className="rs-drawer-head">
              <div>
                <h3>{drill.title}</h3>
                <p>{drill.sub}</p>
              </div>
              <button className="icon-button" onClick={() => setDrill(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>
            <div className="rs-drawer-body">
              {drill.items.length === 0 ? <div className="rs-empty">No records in this register yet.</div> : (
                <table className="rs-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Status</th>
                      <th>Owner</th>
                      <th>Due / target</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drill.items.map((item) => (
                      <tr
                        key={item.id}
                        className={onOpenItem ? 'is-clickable' : undefined}
                        role={onOpenItem ? 'button' : undefined}
                        tabIndex={onOpenItem ? 0 : undefined}
                        onClick={onOpenItem ? () => { onOpenItem(item); setDrill(null) } : undefined}
                        onKeyDown={onOpenItem ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            onOpenItem(item)
                            setDrill(null)
                          }
                        } : undefined}
                      >
                        <td><span className="code">{item.itemCode}</span></td>
                        <td>
                          <strong>{item.title}</strong>
                          {item.summary && item.summary !== item.title && (
                            <div style={{ color: 'var(--muted)', marginTop: 3, fontSize: 12.5 }}>
                              {item.summary.length > 160 ? `${item.summary.slice(0, 160)}…` : item.summary}
                            </div>
                          )}
                        </td>
                        <td><Chip tone={toneForStatusWord(item.status)}>{item.status}</Chip></td>
                        <td>{item.ownerName ?? '—'}</td>
                        <td>{item.dueDate ? formatDate(item.dueDate) : '—'}</td>
                        <td>{formatDate(item.lastUpdatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}

function EditableNarrative({ storageKey, autoText }: { storageKey: string; autoText: string }) {
  const readStored = () => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(storageKey)
  }

  const [edited, setEdited] = useState<boolean>(() => readStored() !== null)
  const [savedText, setSavedText] = useState<string>(() => readStored() ?? '')
  const [draft, setDraft] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Once the user takes ownership we show their saved text; until then the
  // displayed narrative tracks the live auto-generated text. Deriving it here
  // (rather than syncing into state) keeps it in sync without an effect.
  const displayText = edited ? savedText : autoText

  function startEditing() {
    setDraft(displayText)
    setIsEditing(true)
  }

  function commit(next: string) {
    setSavedText(next)
    setEdited(true)
    setIsEditing(false)
    if (typeof window !== 'undefined') window.localStorage.setItem(storageKey, next)
  }

  function resetToAuto() {
    setEdited(false)
    setSavedText('')
    setIsEditing(false)
    if (typeof window !== 'undefined') window.localStorage.removeItem(storageKey)
  }

  if (isEditing) {
    return (
      <div className="rs-narrative is-editing">
        <textarea
          className="rs-narrative-input"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          rows={4}
        />
        <div className="rs-narrative-actions">
          <button type="button" className="rs-drill" onClick={() => commit(draft)}>Save</button>
          <button type="button" className="rs-narrative-reset" onClick={resetToAuto}>
            <RotateCcw size={13} /> Reset to auto
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rs-narrative">
      <p className="rs-narrative-text">{displayText}</p>
      <div className="rs-narrative-actions">
        <button type="button" className="rs-drill" onClick={startEditing}>Edit</button>
        {edited && (
          <button type="button" className="rs-narrative-reset" onClick={resetToAuto}>
            <RotateCcw size={13} /> Reset to auto
          </button>
        )}
      </div>
    </div>
  )
}
