import {
  Activity,
  Archive,
  BarChart3,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Database,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  Menu,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Upload,
  UserRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { moduleConfigByKey, moduleConfigs, phaseOptions, roleLabels, workstreamOptions } from './data/moduleConfig'
import { demoItems, demoReports, demoUsers } from './data/demoData'
import { calculateMetrics } from './lib/metrics'
import { generateLocalReport, reportTypeLabel } from './lib/reporting'
import { fetchGovernanceItems, fetchProfile, isSupabaseConfigured, supabase, upsertGovernanceItem } from './lib/supabase'
import { canEditItem, canGridEdit, filterForView, formatDate, isClosedStatus, nextItemCode, sortItems } from './lib/status'
import { moduleImportCoverage, previewWorkbook } from './lib/workbookImport'
import type { GovernanceItem, ModuleConfig, ModuleKey, ReportDraft, ReportType, UserProfile, ViewMode } from './types'

type PageKey = 'dashboard' | 'registers' | 'reporting' | 'program_site' | 'import' | 'admin' | 'audit'

const navItems: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'registers', label: 'Registers', icon: Table2 },
  { key: 'reporting', label: 'Reporting', icon: BarChart3 },
  { key: 'program_site', label: 'Program Site', icon: BookOpen },
  { key: 'import', label: 'Import', icon: Upload },
  { key: 'admin', label: 'Admin', icon: ShieldCheck },
  { key: 'audit', label: 'Audit', icon: Activity },
]

const moduleIcons: Record<ModuleKey, typeof ClipboardList> = {
  actions: ListChecks,
  risks: Gauge,
  issues: ClipboardList,
  dependencies: SlidersHorizontal,
  assumptions: KeyRound,
  decisions: CheckCircle2,
  benefits: BarChart3,
  lessons: BookOpen,
  scope_changes: Archive,
  financials: Database,
  schedule: CalendarClock,
  go_live: ShieldCheck,
  documents: FileSpreadsheet,
  future_projects: Archive,
  program_site: BookOpen,
}

function App() {
  const [page, setPage] = useState<PageKey>('dashboard')
  const [items, setItems] = useState<GovernanceItem[]>(demoItems)
  const [user, setUser] = useState<UserProfile>(demoUsers[0])
  const [viewMode, setViewMode] = useState<ViewMode>('my')
  const [showClosed, setShowClosed] = useState(false)
  const [selectedModule, setSelectedModule] = useState<ModuleKey>('actions')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')

  useEffect(() => {
    async function loadSupabaseData() {
      if (!isSupabaseConfigured) return
      setLoadingMessage('Loading NexBill data')
      try {
        const [profile, remoteItems] = await Promise.all([fetchProfile(), fetchGovernanceItems()])
        if (profile) setUser(profile)
        if (remoteItems.length > 0) setItems(remoteItems)
      } catch (error) {
        console.error(error)
      } finally {
        setLoadingMessage('')
      }
    }

    void loadSupabaseData()
  }, [])

  const filteredItems = useMemo(() => {
    const scoped = filterForView(items, user, viewMode, showClosed)
    const normalizedQuery = query.trim().toLowerCase()
    const searched = normalizedQuery
      ? scoped.filter((item) =>
          [item.itemCode, item.title, item.summary, item.status, item.ownerName, item.workstream, item.module]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : scoped
    return sortItems(searched)
  }, [items, query, showClosed, user, viewMode])

  const metrics = useMemo(() => calculateMetrics(filteredItems), [filteredItems])

  async function handleSaveItem(item: GovernanceItem) {
    const updatedItem = {
      ...item,
      lastUpdatedAt: new Date().toISOString().slice(0, 10),
    }

    setItems((current) => {
      const exists = current.some((candidate) => candidate.id === updatedItem.id)
      return exists
        ? current.map((candidate) => (candidate.id === updatedItem.id ? updatedItem : candidate))
        : [updatedItem, ...current]
    })

    if (isSupabaseConfigured) {
      try {
        await upsertGovernanceItem(updatedItem)
      } catch (error) {
        console.error(error)
      }
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setLoadingMessage('Signing in')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      if (error) throw error
      const profile = await fetchProfile()
      const remoteItems = await fetchGovernanceItems()
      if (profile) setUser(profile)
      if (remoteItems.length > 0) setItems(remoteItems)
    } catch (error) {
      console.error(error)
    } finally {
      setLoadingMessage('')
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">NB</div>
          <div>
            <strong>NexBill</strong>
            <span>Governance</span>
          </div>
        </div>

        <nav className="primary-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.key} className={page === item.key ? 'is-active' : ''} onClick={() => setPage(item.key)}>
                <Icon size={18} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="sidebar-section">
          <span className="nav-label">Modules</span>
          <div className="module-rail">
            {moduleConfigs.map((module) => {
              const Icon = moduleIcons[module.key]
              return (
                <button
                  key={module.key}
                  className={selectedModule === module.key ? 'is-active' : ''}
                  title={module.label}
                  onClick={() => {
                    setSelectedModule(module.key)
                    setPage('registers')
                  }}
                >
                  <Icon size={16} />
                  <span>{module.shortLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen((open) => !open)} aria-label="Menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">NexBill Project Governance</p>
            <h1>{pageTitle(page)}</h1>
          </div>
          <div className="topbar-actions">
            <div className="search-box">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" />
            </div>
            <SegmentedView viewMode={viewMode} setViewMode={setViewMode} />
            <label className="toggle">
              <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />
              Closed
            </label>
          </div>
        </header>

        {!isSupabaseConfigured && (
          <div className="config-banner">
            <Database size={18} />
            <span>Demo mode is active. Add Supabase environment variables to use live Auth, RLS, and Postgres data.</span>
          </div>
        )}

        {isSupabaseConfigured && (
          <section className="auth-strip">
            <form onSubmit={handleSignIn}>
              <UserRound size={16} />
              <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email" />
              <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" type="password" />
              <button className="button secondary" type="submit">Sign in</button>
            </form>
          </section>
        )}

        <section className="user-strip">
          <div>
            <span className="avatar">{user.fullName.slice(0, 1)}</span>
            <div>
              <strong>{user.fullName}</strong>
              <span>{roleLabels[user.role]} · {user.workstream ?? 'All workstreams'}</span>
            </div>
          </div>
          <select value={user.id} onChange={(event) => setUser(demoUsers.find((candidate) => candidate.id === event.target.value) ?? demoUsers[0])}>
            {demoUsers.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.fullName} · {roleLabels[candidate.role]}</option>
            ))}
          </select>
        </section>

        {loadingMessage && <div className="loading-line">{loadingMessage}</div>}

        {page === 'dashboard' && (
          <Dashboard metrics={metrics} items={filteredItems} user={user} onOpenRegisters={(moduleKey) => {
            setSelectedModule(moduleKey)
            setPage('registers')
          }} />
        )}
        {page === 'registers' && (
          <RegistersPage
            items={filteredItems}
            allItems={items}
            selectedModule={selectedModule}
            setSelectedModule={setSelectedModule}
            user={user}
            onSaveItem={handleSaveItem}
          />
        )}
        {page === 'reporting' && <ReportingPage items={filteredItems} user={user} />}
        {page === 'program_site' && <ProgramSitePage items={items} reports={demoReports} />}
        {page === 'import' && <ImportPage items={items} onImport={(records) => setItems((current) => [...records, ...current])} />}
        {page === 'admin' && <AdminPage user={user} />}
        {page === 'audit' && <AuditPage items={items} user={user} />}
      </main>
    </div>
  )
}

function pageTitle(page: PageKey) {
  const item = navItems.find((nav) => nav.key === page)
  return item?.label ?? 'Dashboard'
}

function SegmentedView({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (mode: ViewMode) => void }) {
  return (
    <div className="segmented">
      <button className={viewMode === 'my' ? 'is-active' : ''} onClick={() => setViewMode('my')}>My View</button>
      <button className={viewMode === 'all' ? 'is-active' : ''} onClick={() => setViewMode('all')}>All View</button>
    </div>
  )
}

function Dashboard({
  metrics,
  items,
  user,
  onOpenRegisters,
}: {
  metrics: ReturnType<typeof calculateMetrics>
  items: GovernanceItem[]
  user: UserProfile
  onOpenRegisters: (module: ModuleKey) => void
}) {
  const topItems = items.slice(0, 7)
  const executiveWatch = items.filter((item) => item.ragStatus?.includes('Red') || item.ragStatus?.includes('Amber') || item.priority?.includes('High')).slice(0, 6)

  return (
    <div className="page-stack">
      <section className="metric-grid">
        <MetricCard label="Open" value={metrics.openItems} tone="blue" icon={ClipboardList} />
        <MetricCard label="Overdue" value={metrics.overdueItems} tone="red" icon={CalendarClock} />
        <MetricCard label="Due soon" value={metrics.dueSoonItems} tone="amber" icon={Gauge} />
        <MetricCard label="High priority" value={metrics.highPriorityItems} tone="purple" icon={Sparkles} />
        <MetricCard label="Stale" value={metrics.staleItems} tone="slate" icon={Activity} />
      </section>

      <section className="dashboard-grid">
        <div className="panel wide">
          <PanelHeader title={`${user.fullName.split(' ')[0]}'s active queue`} icon={UserRound} />
          <CompactItemList items={topItems} />
        </div>

        <div className="panel">
          <PanelHeader title="Executive watch" icon={ShieldCheck} />
          <CompactItemList items={executiveWatch} compact />
        </div>

        <div className="panel wide">
          <PanelHeader title="Module coverage" icon={Table2} />
          <div className="module-health-grid">
            {moduleConfigs.map((module) => {
              const Icon = moduleIcons[module.key]
              const count = metrics.moduleCounts[module.key]
              return (
                <button key={module.key} onClick={() => onOpenRegisters(module.key)}>
                  <Icon size={16} />
                  <span>{module.shortLabel}</span>
                  <strong>{count}</strong>
                </button>
              )
            })}
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="RAG and priority" icon={Gauge} />
          <div className="rag-list">
            {Object.entries(metrics.ragCounts).slice(0, 8).map(([key, value]) => (
              <div key={key}>
                <span>{key}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, tone, icon: Icon }: { label: string; value: number; tone: string; icon: typeof Gauge }) {
  return (
    <div className={`metric-card tone-${tone}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PanelHeader({ title, icon: Icon }: { title: string; icon: typeof Gauge }) {
  return (
    <div className="panel-header">
      <Icon size={18} />
      <h2>{title}</h2>
    </div>
  )
}

function CompactItemList({ items, compact = false }: { items: GovernanceItem[]; compact?: boolean }) {
  if (items.length === 0) {
    return <div className="empty-state">No records in this view.</div>
  }

  return (
    <div className={`compact-list ${compact ? 'is-compact' : ''}`}>
      {items.map((item) => (
        <article key={item.id}>
          <div>
            <span className="code">{item.itemCode}</span>
            <strong>{item.title}</strong>
            {!compact && <p>{item.summary}</p>}
          </div>
          <div className="item-meta">
            <StatusPill item={item} />
            <span>{item.ownerName ?? 'Unassigned'}</span>
            <span>{formatDate(item.dueDate)}</span>
          </div>
        </article>
      ))}
    </div>
  )
}

function RegistersPage({
  items,
  allItems,
  selectedModule,
  setSelectedModule,
  user,
  onSaveItem,
}: {
  items: GovernanceItem[]
  allItems: GovernanceItem[]
  selectedModule: ModuleKey
  setSelectedModule: (module: ModuleKey) => void
  user: UserProfile
  onSaveItem: (item: GovernanceItem) => void
}) {
  const config = moduleConfigByKey[selectedModule]
  const moduleItems = items.filter((item) => item.module === selectedModule)
  const [editingItem, setEditingItem] = useState<GovernanceItem | null>(null)
  const [gridMode, setGridMode] = useState(false)

  function createItem() {
    const code = nextItemCode(allItems.filter((item) => item.module === selectedModule), config.codePrefix)
    setEditingItem({
      id: `${selectedModule}-${crypto.randomUUID()}`,
      module: selectedModule,
      itemCode: code,
      title: '',
      summary: '',
      status: config.defaultStatus,
      workstream: user.workstream,
      ownerName: user.fullName,
      ownerEmail: user.email,
      lastUpdatedAt: new Date().toISOString().slice(0, 10),
      details: {},
    })
  }

  return (
    <div className="page-stack">
      <div className="register-toolbar">
        <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value as ModuleKey)}>
          {moduleConfigs.map((module) => (
            <option key={module.key} value={module.key}>{module.label}</option>
          ))}
        </select>
        <div>
          {canGridEdit(user) && (
            <button className={`button secondary ${gridMode ? 'is-active' : ''}`} onClick={() => setGridMode((enabled) => !enabled)}>
              <Pencil size={16} />
              Grid edit
            </button>
          )}
          <button className="button primary" onClick={createItem}>
            <Plus size={16} />
            New item
          </button>
        </div>
      </div>

      <section className="module-intro">
        <div>
          <span className="module-kicker">{config.sourceSheet ?? 'Manual module'}</span>
          <h2>{config.label}</h2>
          <p>{config.description}</p>
        </div>
        <div className="module-stats">
          <strong>{moduleItems.length}</strong>
          <span>records</span>
        </div>
      </section>

      <ItemTable items={moduleItems} config={config} user={user} gridMode={gridMode} onEdit={setEditingItem} onSave={onSaveItem} />

      {editingItem && (
        <ItemDrawer
          item={editingItem}
          config={config}
          user={user}
          onClose={() => setEditingItem(null)}
          onSave={(item) => {
            onSaveItem(item)
            setEditingItem(null)
          }}
        />
      )}
    </div>
  )
}

function ItemTable({
  items,
  config,
  user,
  gridMode,
  onEdit,
  onSave,
}: {
  items: GovernanceItem[]
  config: ModuleConfig
  user: UserProfile
  gridMode: boolean
  onEdit: (item: GovernanceItem) => void
  onSave: (item: GovernanceItem) => void
}) {
  if (items.length === 0) return <div className="empty-state">No records in this register.</div>

  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {config.tableColumns.map((column) => (
              <th key={column}>{columnLabel(column)}</th>
            ))}
            <th>Source</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={isClosedStatus(item.status, item.closedAt) ? 'is-closed' : ''}>
              {config.tableColumns.map((column) => (
                <td key={column}>
                  {gridMode && canEditItem(user, item) && editableColumn(column) ? (
                    <input
                      value={String(readItemColumn(item, column) ?? '')}
                      onChange={(event) => onSave(writeItemColumn(item, column, event.target.value))}
                    />
                  ) : column === 'status' ? (
                    <StatusPill item={item} />
                  ) : column === 'itemCode' ? (
                    <span className="code">{item.itemCode}</span>
                  ) : (
                    <span>{formatCellValue(readItemColumn(item, column))}</span>
                  )}
                </td>
              ))}
              <td>
                <span className="source-chip">{item.sourceRef?.sheet ?? 'Manual'}</span>
              </td>
              <td>
                <button className="icon-button" onClick={() => onEdit(item)} aria-label={`Edit ${item.itemCode}`}>
                  <Pencil size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function editableColumn(column: string) {
  return ['title', 'status', 'priority', 'ragStatus', 'ownerName', 'supportName', 'dueDate'].includes(column)
}

function readItemColumn(item: GovernanceItem, column: string) {
  if (column === 'lastUpdatedAt' || column === 'dueDate') return formatDate(item[column])
  return item[column as keyof GovernanceItem] ?? item.details[column]
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function writeItemColumn(item: GovernanceItem, column: string, value: string): GovernanceItem {
  if (column in item) {
    return { ...item, [column]: value }
  }
  return { ...item, details: { ...item.details, [column]: value } }
}

function columnLabel(column: string) {
  const labels: Record<string, string> = {
    itemCode: 'ID',
    ragStatus: 'RAG',
    ownerName: 'Owner',
    supportName: 'Support',
    dueDate: 'Due',
    lastUpdatedAt: 'Updated',
  }
  return labels[column] ?? column.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase())
}

function StatusPill({ item }: { item: GovernanceItem }) {
  const closed = isClosedStatus(item.status, item.closedAt)
  const tone = closed ? 'closed' : item.ragStatus?.includes('Red') ? 'red' : item.ragStatus?.includes('Amber') ? 'amber' : item.priority?.includes('High') ? 'amber' : 'green'
  return <span className={`status-pill tone-${tone}`}>{item.status}</span>
}

function ItemDrawer({
  item,
  config,
  user,
  onClose,
  onSave,
}: {
  item: GovernanceItem
  config: ModuleConfig
  user: UserProfile
  onClose: () => void
  onSave: (item: GovernanceItem) => void
}) {
  const [draft, setDraft] = useState<GovernanceItem>(item)
  const editable = canEditItem(user, item)

  function updateField(key: string, value: string) {
    if (key in draft) {
      setDraft((current) => ({ ...current, [key]: value }))
    } else {
      setDraft((current) => ({ ...current, details: { ...current.details, [key]: value } }))
    }
  }

  return (
    <div className="drawer-backdrop">
      <aside className="drawer">
        <div className="drawer-header">
          <div>
            <span className="code">{draft.itemCode}</span>
            <h2>{draft.title || `New ${config.shortLabel} item`}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label className="full">
            Title
            <input disabled={!editable} value={draft.title} onChange={(event) => updateField('title', event.target.value)} />
          </label>
          <label>
            Status
            <select disabled={!editable} value={draft.status} onChange={(event) => updateField('status', event.target.value)}>
              {config.statusOptions.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Workstream
            <select disabled={!editable} value={draft.workstream ?? ''} onChange={(event) => updateField('workstream', event.target.value)}>
              <option value="">Not set</option>
              {workstreamOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Phase
            <select disabled={!editable} value={draft.phase ?? ''} onChange={(event) => updateField('phase', event.target.value)}>
              <option value="">Not set</option>
              {phaseOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Owner
            <input disabled={!editable} value={draft.ownerName ?? ''} onChange={(event) => updateField('ownerName', event.target.value)} />
          </label>
          <label>
            Support
            <input disabled={!editable} value={draft.supportName ?? ''} onChange={(event) => updateField('supportName', event.target.value)} />
          </label>
          <label>
            Due date
            <input disabled={!editable} type="date" value={draft.dueDate ?? ''} onChange={(event) => updateField('dueDate', event.target.value)} />
          </label>
          <label className="full">
            Summary
            <textarea disabled={!editable} value={draft.summary} onChange={(event) => updateField('summary', event.target.value)} />
          </label>

          {config.fields
            .filter((field) => !['workstream', 'phase', 'geo', 'ownerName', 'supportName', 'dueDate', 'summary'].includes(field.key))
            .map((field) => (
              <label key={field.key} className={field.type === 'textarea' ? 'full' : ''}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea disabled={!editable} value={String(draft.details[field.key] ?? '')} onChange={(event) => updateField(field.key, event.target.value)} />
                ) : field.type === 'select' ? (
                  <select disabled={!editable} value={String(draft.details[field.key] ?? draft[field.key as keyof GovernanceItem] ?? '')} onChange={(event) => updateField(field.key, event.target.value)}>
                    <option value="">Not set</option>
                    {field.options?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input disabled={!editable} type={field.type} value={String(draft.details[field.key] ?? '')} onChange={(event) => updateField(field.key, event.target.value)} />
                )}
              </label>
            ))}
        </div>

        <div className="source-box">
          <Lock size={16} />
          <span>{draft.sourceRef?.workbook ?? 'Manual entry'} · {draft.sourceRef?.sheet ?? 'No source sheet'} {draft.sourceRef?.row ? `· row ${draft.sourceRef.row}` : ''}</span>
        </div>

        <div className="drawer-actions">
          <button className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={!editable || !draft.title || !draft.summary} onClick={() => onSave(draft)}>Save</button>
        </div>
      </aside>
    </div>
  )
}

function ReportingPage({ items, user }: { items: GovernanceItem[]; user: UserProfile }) {
  const [reportType, setReportType] = useState<ReportType>('executive')
  const [draft, setDraft] = useState<ReportDraft>(() => generateLocalReport(items, 'executive'))
  const [isGenerating, setIsGenerating] = useState(false)

  async function generateReport() {
    setIsGenerating(true)
    try {
      const response = await fetch('/.netlify/functions/ai-report-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, items, user }),
      })
      if (!response.ok) throw new Error('AI function unavailable')
      const data = (await response.json()) as ReportDraft
      setDraft(data)
    } catch {
      setDraft(generateLocalReport(items, reportType))
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="report-controls">
        <div className="segmented large">
          {(['team_leads', 'stakeholders', 'executive'] as ReportType[]).map((type) => (
            <button key={type} className={reportType === type ? 'is-active' : ''} onClick={() => setReportType(type)}>
              {reportTypeLabel(type)}
            </button>
          ))}
        </div>
        <button className="button primary" onClick={generateReport} disabled={isGenerating}>
          <Bot size={16} />
          {isGenerating ? 'Generating' : 'Generate draft'}
        </button>
      </section>

      <section className="report-layout">
        <article className="report-document">
          <p className="eyebrow">{reportTypeLabel(draft.type)}</p>
          <h2>{draft.title}</h2>
          <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} />
          <ReportBlock title="Risks and Issues" items={draft.risks} onChange={(risks) => setDraft((current) => ({ ...current, risks }))} />
          <ReportBlock title="Decisions" items={draft.decisions} onChange={(decisions) => setDraft((current) => ({ ...current, decisions }))} />
          <ReportBlock title="Next Steps" items={draft.nextSteps} onChange={(nextSteps) => setDraft((current) => ({ ...current, nextSteps }))} />
        </article>

        <aside className="panel citation-panel">
          <PanelHeader title="Sources" icon={FileSpreadsheet} />
          <div className="citation-list">
            {draft.citations.map((citation) => (
              <div key={`${citation.itemCode}-${citation.title}`}>
                <span className="code">{citation.itemCode}</span>
                <strong>{citation.title}</strong>
                <p>{citation.source?.workbook ?? 'Manual'} · {citation.source?.sheet ?? citation.module}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  )
}

function ReportBlock({ title, items, onChange }: { title: string; items: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      {items.map((item, index) => (
        <input
          key={`${title}-${index}`}
          value={item}
          onChange={(event) => onChange(items.map((current, currentIndex) => (currentIndex === index ? event.target.value : current)))}
        />
      ))}
    </div>
  )
}

function ProgramSitePage({ items, reports }: { items: GovernanceItem[]; reports: ReportDraft[] }) {
  const siteItems = items.filter((item) => item.module === 'program_site' || item.module === 'documents')
  const groups = [
    { label: 'Delivery Teams', filter: 'Delivery' },
    { label: 'Business Stakeholders', filter: 'Stakeholder' },
    { label: 'SMEs', filter: 'SME' },
    { label: 'Executive Steering Committee', filter: 'Executive' },
  ]

  return (
    <div className="page-stack">
      <section className="program-site-grid">
        {groups.map((group) => (
          <article key={group.label} className="panel">
            <PanelHeader title={group.label} icon={BookOpen} />
            <CompactItemList
              items={siteItems.filter((item) => String(item.details.audience ?? '').includes(group.filter) || item.summary.includes(group.filter)).slice(0, 3)}
              compact
            />
          </article>
        ))}
      </section>
      <section className="panel">
        <PanelHeader title="Published reports" icon={BarChart3} />
        <div className="compact-list">
          {reports.map((report) => (
            <article key={report.id}>
              <div>
                <span className="code">{reportTypeLabel(report.type)}</span>
                <strong>{report.title}</strong>
                <p>{report.summary}</p>
              </div>
              <div className="item-meta">
                <span>{formatDate(report.createdAt)}</span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function ImportPage({ items, onImport }: { items: GovernanceItem[]; onImport: (records: GovernanceItem[]) => void }) {
  const [previews, setPreviews] = useState<Awaited<ReturnType<typeof previewWorkbook>>>([])
  const [status, setStatus] = useState('')

  async function handleFile(file?: File) {
    if (!file) return
    setStatus('Reading workbook')
    try {
      const preview = await previewWorkbook(file)
      setPreviews(preview)
      setStatus(`${preview.reduce((sum, item) => sum + item.mappedRecords.length, 0)} records mapped`)
    } catch (error) {
      console.error(error)
      setStatus('Workbook preview failed')
    }
  }

  async function commitPreview() {
    const records = previews.flatMap((preview) => preview.mappedRecords)
    const existingCodes = new Set(items.map((item) => item.itemCode))
    const newRecords = records.filter((record) => !existingCodes.has(record.itemCode))
    onImport(newRecords)
    setStatus(`${newRecords.length} new records added locally`)

    try {
      await fetch('/.netlify/functions/workbook-import-commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: newRecords }),
      })
    } catch {
      // Local commit still keeps the preview useful without Netlify dev.
    }
  }

  return (
    <div className="page-stack">
      <section className="import-drop">
        <FileSpreadsheet size={28} />
        <div>
          <h2>Workbook import</h2>
          <p>{status || 'Select the NexBill governance workbook.'}</p>
        </div>
        <input type="file" accept=".xlsx,.xls" onChange={(event) => void handleFile(event.target.files?.[0])} />
        <button className="button primary" disabled={previews.length === 0} onClick={commitPreview}>Commit preview</button>
      </section>

      <section className="panel">
        <PanelHeader title="Import coverage" icon={Database} />
        <div className="coverage-grid">
          {moduleImportCoverage().map((coverage) => (
            <div key={coverage.module}>
              <strong>{coverage.label}</strong>
              <span>{coverage.sourceSheet}</span>
              <em>{coverage.mappedHeaders}/{coverage.totalHeaders || coverage.mappedHeaders} mapped</em>
            </div>
          ))}
        </div>
      </section>

      {previews.length > 0 && (
        <section className="panel">
          <PanelHeader title="Preview" icon={Table2} />
          <div className="preview-grid">
            {previews.map((preview) => (
              <article key={preview.module}>
                <span className="code">{moduleConfigByKey[preview.module].shortLabel}</span>
                <strong>{preview.rowsFound} rows</strong>
                <p>{preview.mappedRecords.length} mapped records · {preview.missingHeaders.length} missing headers</p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function AdminPage({ user }: { user: UserProfile }) {
  return (
    <div className="page-stack">
      <section className="admin-grid">
        <article className="panel">
          <PanelHeader title="Role matrix" icon={ShieldCheck} />
          <div className="role-matrix">
            {Object.entries(roleLabels).map(([role, label]) => (
              <div key={role}>
                <strong>{label}</strong>
                <span>{role === 'executive' ? 'Read only' : role === 'super_admin' ? 'Full control' : 'Scoped edit'}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelHeader title="Column control" icon={SlidersHorizontal} />
          <div className="field-list">
            {moduleConfigs.slice(0, 8).map((module) => (
              <div key={module.key}>
                <strong>{module.shortLabel}</strong>
                <span>{module.tableColumns.length} visible columns · {module.fields.length} form fields</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelHeader title="Environment" icon={Database} />
          <div className="env-list">
            <div><strong>Supabase</strong><span>{isSupabaseConfigured ? 'Configured' : 'Demo mode'}</span></div>
            <div><strong>Current role</strong><span>{roleLabels[user.role]}</span></div>
            <div><strong>Grid edit</strong><span>{canGridEdit(user) ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        </article>
      </section>
    </div>
  )
}

function AuditPage({ items, user }: { items: GovernanceItem[]; user: UserProfile }) {
  return (
    <div className="panel">
      <PanelHeader title="Audit events" icon={Activity} />
      <div className="audit-list">
        {items.slice(0, 20).map((item, index) => (
          <div key={`${item.id}-audit`}>
            <span>{formatDate(item.lastUpdatedAt)}</span>
            <strong>{item.itemCode}</strong>
            <p>{user.fullName} viewed or updated {item.title}</p>
            <em>{index % 3 === 0 ? 'update' : index % 3 === 1 ? 'view' : 'report-source'}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
