import { ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { riskLevelRank } from '../data/riskMatrix'
import { daysBetween, formatDate, isClosedStatus, priorityRank, sortItems } from '../lib/status'
import type { GovernanceItem, ModuleKey, UserProfile } from '../types'

type Tone = 'green' | 'amber' | 'red' | 'slate'

function isOpen(item: GovernanceItem) {
  return !isClosedStatus(item.status, item.closedAt)
}

function toneForStatusWord(value?: string): Tone {
  const normalized = value?.toLowerCase() ?? ''
  if (!normalized) return 'slate'
  if (normalized.includes('off track') || normalized.includes('red') || normalized.includes('critical') || normalized.includes('overdue')) return 'red'
  if (normalized.includes('at risk') || normalized.includes('amber') || normalized.includes('slip') || normalized.includes('escalat')) return 'amber'
  if (normalized.includes('on track') || normalized.includes('green') || normalized.includes('complete') || normalized.includes('closed') || normalized.includes('approved') || normalized.includes('validated')) return 'green'
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

function detailText(item: GovernanceItem, keys: string[]) {
  for (const key of keys) {
    const raw = item.details[key]
    if (raw !== null && raw !== undefined && String(raw).trim()) return String(raw)
  }
  return ''
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

function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`rs-chip ${tone}`}>{children}</span>
}

function OpsCard({ title, caption, module, onOpen, children }: {
  title: string
  caption: string
  module: ModuleKey
  onOpen: (module: ModuleKey) => void
  children: ReactNode
}) {
  return (
    <section className="rs-card ops-card">
      <header className="ops-card-head">
        <div>
          <span className="rs-kpi-label">{title}</span>
          <p>{caption}</p>
        </div>
        <button className="rs-drill" onClick={() => onOpen(module)}>
          Open <ChevronRight size={14} />
        </button>
      </header>
      {children}
    </section>
  )
}

export default function OperationsDashboard({ items, user, onOpenRegisters }: {
  items: GovernanceItem[]
  user: UserProfile
  onOpenRegisters: (module: ModuleKey) => void
}) {
  const data = useMemo(() => {
    const byModule = new Map<ModuleKey, GovernanceItem[]>()
    for (const item of items) byModule.set(item.module, [...(byModule.get(item.module) ?? []), item])
    const pick = (key: ModuleKey) => byModule.get(key) ?? []
    const openOf = (key: ModuleKey) => sortItems(pick(key).filter(isOpen))

    const openActions = openOf('actions')
    const overdueActions = openActions.filter((item) => Number.isFinite(daysBetween(item.dueDate)) && daysBetween(item.dueDate) < 0)
    const openIssues = openOf('issues')
    const highIssues = openIssues.filter((item) => priorityRank(item.priority ?? item.ragStatus) >= 3)
    const mediumIssues = openIssues.filter((item) => priorityRank(item.priority ?? item.ragStatus) === 2)
    const lowIssues = openIssues.filter((item) => priorityRank(item.priority ?? item.ragStatus) <= 1)
    const openDeps = openOf('dependencies')
    const depsAtRisk = openDeps.filter((item) => toneForRating(item.ragStatus ?? item.priority) !== 'green')
    const openRisks = openOf('risks')
    const schedule = sortItems(pick('schedule'))
    const slipping = schedule.filter((item) => {
      const baseline = detailText(item, ['baselineDate'])
      const forecast = detailText(item, ['forecastDate'])
      return baseline && forecast && new Date(forecast) > new Date(baseline)
    })
    const openDecisions = openOf('decisions')
    const assumptions = pick('assumptions')
    const openAssumptions = assumptions.filter(isOpen)
    const lessons = sortItems(pick('lessons'))
    const financials = pick('financials')
    const goLiveDomains = (() => {
      const map = new Map<string, { total: number; done: number }>()
      for (const item of pick('go_live')) {
        const domain = detailText(item, ['readinessDomain']) || 'General readiness'
        const entry = map.get(domain) ?? { total: 0, done: 0 }
        entry.total += 1
        if (!isOpen(item)) entry.done += 1
        map.set(domain, entry)
      }
      return [...map.entries()].map(([domain, { total, done }]) => ({ domain, total, done, pct: total ? Math.round((done / total) * 100) : 0 }))
    })()

    const budget = financials.reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['budget'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)
    const actuals = financials.reduce<number | undefined>((sum, item) => {
      const value = numberFromDetails(item, ['actuals'])
      return value === undefined ? sum : (sum ?? 0) + value
    }, undefined)

    const total = items.length
    const closed = items.filter((item) => !isOpen(item)).length
    const completePct = total > 0 ? Math.round((closed / total) * 100) : undefined
    const goLiveCandidates = [...pick('go_live'), ...pick('schedule')]
      .map((item) => daysBetween(item.dueDate ?? detailText(item, ['forecastDate'])))
      .filter((days) => Number.isFinite(days) && days >= 0)
    const daysToGoLive = goLiveCandidates.length ? Math.min(...goLiveCandidates) : undefined
    const criticalRisks = openRisks.filter((item) => riskLevelRank(item.ragStatus ?? item.priority) >= 5).length
    const overallTone: Tone = criticalRisks > 0 || overdueActions.length > 5 ? 'red' : openRisks.length > 0 || slipping.length > 0 ? 'amber' : 'green'

    return {
      openActions, overdueActions, openIssues, highIssues, mediumIssues, lowIssues,
      openDeps, depsAtRisk, openRisks, schedule, slipping, openDecisions,
      assumptions, openAssumptions, lessons, goLiveDomains, budget, actuals,
      completePct, daysToGoLive, overallTone,
      overallLabel: overallTone === 'red' ? 'At risk' : overallTone === 'amber' ? 'Watch' : 'On track',
      scheduleTone: (slipping.length > 0 ? 'amber' : schedule.length ? 'green' : 'slate') as Tone,
      costTone: (budget !== undefined && actuals !== undefined ? (actuals > budget ? 'red' : 'green') : 'slate') as Tone,
    }
  }, [items])

  const periodLabel = useMemo(() => new Intl.DateTimeFormat('en', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date()), [])
  const sideDue = (item: GovernanceItem) => {
    if (!item.dueDate) return <Chip tone="slate">No date</Chip>
    const days = daysBetween(item.dueDate)
    if (!Number.isFinite(days)) return <Chip tone="slate">No date</Chip>
    if (days < 0) return <Chip tone="red">{Math.abs(days)}d overdue</Chip>
    if (days <= 7) return <Chip tone="amber">Due in {days}d</Chip>
    return <Chip tone="green">{formatDate(item.dueDate)}</Chip>
  }

  const rows = (list: GovernanceItem[], max: number, side: (item: GovernanceItem) => ReactNode) =>
    list.length === 0 ? <div className="rs-empty">Nothing open right now.</div> : (
      <div className="rs-rows">
        {list.slice(0, max).map((item) => (
          <div key={item.id} className="rs-row">
            <div className="rs-row-main">
              <span className="code">{item.itemCode}</span>
              <strong>{item.title}</strong>
              {item.ownerName && <small>{item.ownerName}{item.dueDate ? ` · need by ${formatDate(item.dueDate)}` : ''}</small>}
            </div>
            <div className="rs-row-side">{side(item)}</div>
          </div>
        ))}
      </div>
    )

  const severityRow = (label: string, tone: Tone, count: number, max: number) => (
    <div className="rs-progress-row" key={label}>
      <div className="rs-progress-top">
        <strong><span className={`rs-dot ${tone}`} />{label}</strong>
        <span>{count}</span>
      </div>
      <div className="rs-bar"><i style={{ width: `${Math.round((count / Math.max(1, max)) * 100)}%` }} /></div>
    </div>
  )

  return (
    <div className="page-stack">
      <section className="rs-hero">
        <div className="rs-hero-top">
          <div>
            <p className="eyebrow">Programme governance</p>
            <h2>NexBill Programme <em>· FY26</em></h2>
            <p className="rs-hero-sub">Daily delivery view for {user.fullName} — actions, issues, blockers</p>
          </div>
          <div className="rs-hero-meta">
            <span className="rs-meta-chip">Period · {periodLabel}</span>
            <Chip tone={data.overallTone}>Overall · {data.overallLabel}</Chip>
          </div>
        </div>
        <div className="rs-kpis">
          <div className="rs-kpi">
            <span className="rs-kpi-label">Programme complete</span>
            <span className="rs-kpi-value">{data.completePct !== undefined ? `${data.completePct}%` : '—'}</span>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Days to go-live</span>
            <span className="rs-kpi-value">{data.daysToGoLive ?? '—'}</span>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Schedule</span>
            <Chip tone={data.scheduleTone}>{data.scheduleTone === 'slate' ? 'No milestone data' : data.slipping.length > 0 ? `${data.slipping.length} slipping` : 'On track'}</Chip>
          </div>
          <div className="rs-kpi">
            <span className="rs-kpi-label">Cost</span>
            <Chip tone={data.costTone}>{data.costTone === 'slate' ? 'No financial data' : data.costTone === 'red' ? 'Over budget' : 'Within budget'}</Chip>
          </div>
        </div>
      </section>

      <section className="ops-stats">
        <button className="ops-stat" onClick={() => onOpenRegisters('actions')}>
          <span className="rs-kpi-label">Overdue actions</span>
          <strong className={data.overdueActions.length ? 'is-red' : ''}>{data.overdueActions.length}</strong>
          <small>{data.openActions.length} open total</small>
        </button>
        <button className="ops-stat" onClick={() => onOpenRegisters('issues')}>
          <span className="rs-kpi-label">High-sev issues</span>
          <strong className={data.highIssues.length ? 'is-amber' : ''}>{data.highIssues.length}</strong>
          <small>needs triage today</small>
        </button>
        <button className="ops-stat" onClick={() => onOpenRegisters('schedule')}>
          <span className="rs-kpi-label">Milestones slipping</span>
          <strong className={data.slipping.length ? 'is-amber' : ''}>{data.slipping.length}</strong>
          <small>vs baseline</small>
        </button>
        <button className="ops-stat" onClick={() => onOpenRegisters('dependencies')}>
          <span className="rs-kpi-label">Dependencies at risk</span>
          <strong className={data.depsAtRisk.length ? 'is-amber' : ''}>{data.depsAtRisk.length}</strong>
          <small>track in standup</small>
        </button>
      </section>

      <div className="rs-grid">
        <OpsCard title="Actions" caption={`${data.openActions.length} open · ${data.overdueActions.length} overdue`} module="actions" onOpen={onOpenRegisters}>
          {rows(data.overdueActions.length ? data.overdueActions : data.openActions, 5, sideDue)}
        </OpsCard>
        <OpsCard title="Issues" caption="Active by severity" module="issues" onOpen={onOpenRegisters}>
          {data.openIssues.length === 0 ? <div className="rs-empty">Nothing open right now.</div> : (
            <div>
              {severityRow('High', 'red', data.highIssues.length, data.openIssues.length)}
              {severityRow('Medium', 'amber', data.mediumIssues.length, data.openIssues.length)}
              {severityRow('Low', 'green', data.lowIssues.length, data.openIssues.length)}
            </div>
          )}
        </OpsCard>
        <OpsCard title="Dependencies" caption="Need-by dates and owners" module="dependencies" onOpen={onOpenRegisters}>
          {rows(data.openDeps, 4, (item) => <Chip tone={toneForRating(item.ragStatus ?? item.priority)}>{item.ragStatus ?? 'Unrated'}</Chip>)}
        </OpsCard>
        <OpsCard title="Top risks" caption="Highest mitigated rating first" module="risks" onOpen={onOpenRegisters}>
          {rows(data.openRisks, 4, (item) => <Chip tone={toneForRating(item.ragStatus ?? item.priority)}>{item.ragStatus ?? item.priority ?? 'Unrated'}</Chip>)}
        </OpsCard>
        <OpsCard title="Schedule" caption="Next milestones" module="schedule" onOpen={onOpenRegisters}>
          {data.schedule.length === 0 ? <div className="rs-empty">Milestone data not yet captured.</div> : rows(data.schedule, 4, (item) => {
            const baseline = detailText(item, ['baselineDate'])
            const forecast = detailText(item, ['forecastDate'])
            const slipped = baseline && forecast && new Date(forecast) > new Date(baseline)
            return <Chip tone={slipped ? 'amber' : toneForStatusWord(item.status)}>{slipped ? 'Slip' : item.status}</Chip>
          })}
        </OpsCard>
        <OpsCard title="Go-live readiness" caption="Per workstream" module="go_live" onOpen={onOpenRegisters}>
          {data.goLiveDomains.length === 0 ? <div className="rs-empty">No readiness checklist captured yet.</div> : (
            <div>
              {data.goLiveDomains.map(({ domain, total, done, pct }) => (
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
        </OpsCard>
        <OpsCard title="Decisions needed" caption="Awaiting forum" module="decisions" onOpen={onOpenRegisters}>
          {rows(data.openDecisions, 4, () => <Chip tone="amber">Awaiting</Chip>)}
        </OpsCard>
        <OpsCard title="Assumptions" caption="Pending validation" module="assumptions" onOpen={onOpenRegisters}>
          {data.assumptions.length === 0 ? <div className="rs-empty">No assumptions logged.</div> : (
            <div className="rs-tiles">
              <div className="rs-tile"><span className="rs-kpi-label">Open</span><span className="rs-tile-value">{data.openAssumptions.length}</span></div>
              <div className="rs-tile"><span className="rs-kpi-label">Validated / closed</span><span className="rs-tile-value">{data.assumptions.length - data.openAssumptions.length}</span></div>
              <div className="rs-tile"><span className="rs-kpi-label">Total</span><span className="rs-tile-value">{data.assumptions.length}</span></div>
            </div>
          )}
        </OpsCard>
        <OpsCard title="Lessons captured" caption="Latest entries" module="lessons" onOpen={onOpenRegisters}>
          {rows(data.lessons, 3, (item) => <Chip tone={detailText(item, ['lessonType']).includes('Positive') ? 'green' : 'amber'}>{detailText(item, ['lessonType']).includes('Positive') ? 'Repeat' : 'Fix'}</Chip>)}
        </OpsCard>
        <OpsCard title="Financials snapshot" caption="Spend vs plan" module="financials" onOpen={onOpenRegisters}>
          {data.budget === undefined && data.actuals === undefined ? <div className="rs-empty">Financial lines not yet captured.</div> : (
            <div>
              <div className="rs-tiles">
                <div className="rs-tile"><span className="rs-kpi-label">Spent to date</span><span className="rs-tile-value">{formatMoney(data.actuals)}</span></div>
                <div className="rs-tile"><span className="rs-kpi-label">Budget</span><span className="rs-tile-value">{formatMoney(data.budget)}</span></div>
              </div>
              {data.budget !== undefined && data.actuals !== undefined && (
                <div className="rs-progress-row">
                  <div className="rs-progress-top">
                    <strong>Spend vs budget</strong>
                    <span>{Math.round((data.actuals / Math.max(1, data.budget)) * 100)}%</span>
                  </div>
                  <div className="rs-bar"><i style={{ width: `${Math.min(100, Math.round((data.actuals / Math.max(1, data.budget)) * 100))}%` }} /></div>
                </div>
              )}
            </div>
          )}
        </OpsCard>
      </div>

      <p className="ops-source">Live from the NexBill governance registers · {items.length} records in view · refreshed {periodLabel}</p>
    </div>
  )
}
