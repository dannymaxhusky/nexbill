import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowUpDown,
  BarChart3,
  BookOpen,
  Bot,
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  Filter,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Lock,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table2,
  Trash2,
  Upload,
  UserPen,
  UserRound,
  X,
} from 'lucide-react'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { moduleConfigByKey, moduleConfigs, phaseOptions, roleLabels, workstreamOptions } from './data/moduleConfig'
import { demoItems, demoReports, demoUsers } from './data/demoData'
import { riskImpactLabels, riskLevelDefinitions, riskLevelOptions, riskLevelTone, riskMatrixRows, riskProbabilityDefinitions } from './data/riskMatrix'
import { calculateMetrics } from './lib/metrics'
import { generateLocalReport, reportTypeLabel } from './lib/reporting'
import {
  addCommentUpdate,
  createAttachmentDownloadUrl,
  fetchAiReportDrafts,
  fetchAiTriageRuns,
  fetchAttachments,
  fetchAuditEvents,
  fetchCommentUpdates,
  deleteGovernanceItem,
  fetchGovernanceItems,
  fetchManagedProfiles,
  fetchProfile,
  fetchProgramSitePages,
  fetchReportSnapshots,
  fetchTaxonomies,
  isSupabaseConfigured,
  logAuditEvent,
  mergeGovernanceItemDetails,
  replaceUserPrimaryRole,
  saveAiReportDraft,
  saveAiTriageRun,
  saveManagedProfile,
  saveReportSnapshot,
  supabase,
  uploadAttachment,
  uploadProfileAvatar,
  updateOwnProfile,
  upsertProgramSitePage,
  upsertTaxonomyEntry,
  upsertGovernanceItem,
} from './lib/supabase'
import { canDeleteItem, canEditItem, canGridEdit, daysBetween, defaultGridEditRoles, filterForView, formatDate, isClosedStatus, nextItemCode, sortItems } from './lib/status'
import { moduleImportCoverage, previewWorkbook } from './lib/workbookImport'
import type { AiReportDraftRecord, AiTriageOutput, AiTriageRun, AiTriageSeverity, AttachmentRecord, AuditEvent, ColumnSettings, CommentUpdate, GovernanceItem, ManagedProfile, ModuleConfig, ModuleKey, ProgramSitePageRecord, ReportDraft, ReportSnapshot, ReportType, Role, TaxonomyEntry, UserProfile, ViewMode } from './types'

type PageKey = 'dashboard' | 'registers' | 'reporting' | 'program_site' | 'import' | 'admin' | 'audit'
type AuthStatus = 'checking' | 'signed_out' | 'signed_in'
type PasswordPanelMode = 'account' | 'recovery' | 'invite'
type SortDirection = 'asc' | 'desc'
type TableSort = { column: string; direction: SortDirection } | null
type ColumnFilters = Record<string, string>
type RolePermissionKey =
  | 'view_all'
  | 'create_item'
  | 'edit_own'
  | 'edit_all'
  | 'grid_edit'
  | 'delete_item'
  | 'import_workbook'
  | 'manage_admin'
  | 'reporting'
  | 'audit_log'

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

const roleOptions = Object.keys(roleLabels) as Role[]
const siteAudienceOptions = ['Delivery Teams', 'Business Stakeholders', 'SMEs', 'Executive Steering Committee']
const siteContentTypeOptions = ['Announcement', 'Forum Pack', 'Guidance', 'FAQ', 'Decision Note']
const siteStatusOptions = ['Draft', 'Published', 'Open & being monitored', 'Archived']

const rolePermissionDefinitions: Array<{
  key: RolePermissionKey
  label: string
  description: string
  restrictedTo?: Role[]
}> = [
  { key: 'view_all', label: 'View all registers', description: 'Can use All View and see full register data permitted by RLS.' },
  { key: 'create_item', label: 'Create records', description: 'Can create new register items from forms.' },
  { key: 'edit_own', label: 'Edit owned / supported items', description: 'Can update items where they are owner, support, or approver.' },
  { key: 'edit_all', label: 'Edit all register items', description: 'Can update records across workstreams.', restrictedTo: ['super_admin', 'program_manager', 'ctm'] },
  { key: 'grid_edit', label: 'Grid edit', description: 'Can use inline grid editing where item edit access allows it.' },
  { key: 'delete_item', label: 'Delete records', description: 'Can permanently delete register rows.', restrictedTo: ['super_admin'] },
  { key: 'import_workbook', label: 'Workbook import', description: 'Can preview and commit workbook imports.', restrictedTo: ['super_admin', 'program_manager', 'ctm'] },
  { key: 'manage_admin', label: 'Admin configuration', description: 'Can manage role policy, users, taxonomy, and column settings.', restrictedTo: ['super_admin'] },
  { key: 'reporting', label: 'Reporting Center', description: 'Can generate and review operational or steering reports.' },
  { key: 'audit_log', label: 'Audit Log', description: 'Can view governance audit activity.', restrictedTo: ['super_admin', 'program_manager', 'ctm', 'executive'] },
]

const defaultRolePermissions: Record<Role, RolePermissionKey[]> = {
  super_admin: rolePermissionDefinitions.map((permission) => permission.key),
  program_manager: ['view_all', 'create_item', 'edit_own', 'edit_all', 'grid_edit', 'import_workbook', 'reporting', 'audit_log'],
  ctm: ['view_all', 'create_item', 'edit_own', 'edit_all', 'grid_edit', 'import_workbook', 'reporting', 'audit_log'],
  owner: ['create_item', 'edit_own', 'reporting'],
  support: ['create_item', 'edit_own'],
  executive: ['view_all', 'reporting', 'audit_log'],
}

async function timeWorkspaceStep<T>(label: string, step: () => Promise<T>) {
  const startedAt = performance.now()
  try {
    return await step()
  } finally {
    logWorkspaceTiming(label, startedAt)
  }
}

function logWorkspaceTiming(label: string, startedAt: number) {
  if (!import.meta.env.DEV) return
  console.info(`[NexBill perf] ${label}: ${Math.round(performance.now() - startedAt)}ms`)
}

function App() {
  const workspaceLoadSequence = useRef(0)
  const initialPasswordPanelMode = useMemo(() => readPasswordSetupType(), [])
  const [page, setPage] = useState<PageKey>('dashboard')
  const [items, setItems] = useState<GovernanceItem[]>(() => (isSupabaseConfigured ? [] : demoItems))
  const [user, setUser] = useState<UserProfile>(demoUsers[0])
  const [taxonomies, setTaxonomies] = useState<TaxonomyEntry[]>(() => createDefaultTaxonomies())
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (isSupabaseConfigured ? 'checking' : 'signed_in'))
  const [authNotice, setAuthNotice] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('my')
  const [showClosed, setShowClosed] = useState(false)
  const [selectedModule, setSelectedModule] = useState<ModuleKey>('actions')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredBoolean('nexbill-sidebar-collapsed'))
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [dataNotice, setDataNotice] = useState('')
  const [dataError, setDataError] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [signupPrefix, setSignupPrefix] = useState('')
  const [signupFullName, setSignupFullName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordPanelMode, setPasswordPanelMode] = useState<PasswordPanelMode>(initialPasswordPanelMode ?? 'account')
  const [passwordPanelOpen, setPasswordPanelOpen] = useState(() => Boolean(initialPasswordPanelMode))

  const hydrateGovernanceItemDetails = useCallback(async (baseItems: GovernanceItem[], loadSequence: number) => {
    if (!baseItems.length) return

    try {
      const detailedItems = await timeWorkspaceStep('detail tables', () => mergeGovernanceItemDetails(baseItems))
      if (workspaceLoadSequence.current !== loadSequence) return

      const detailsById = new Map(detailedItems.map((item) => [item.id, item.details]))
      setItems((current) => current.map((item) => ({
        ...item,
        details: {
          ...item.details,
          ...(detailsById.get(item.id) ?? {}),
        },
      })))
    } catch (error) {
      console.error(error)
      setDataError(readErrorMessage(error, 'Register details could not be fully loaded.'))
    }
  }, [])

  const loadAuthenticatedWorkspace = useCallback(async (options: { successMessage?: string; silent?: boolean; throwOnError?: boolean } = {}) => {
    if (!supabase) return []

    const loadSequence = ++workspaceLoadSequence.current
    const workspaceStartedAt = performance.now()
    if (!options.silent) setLoadingMessage('Refreshing NexBill data')
    setDataError('')
    try {
      const [profile, remoteItems, remoteTaxonomies] = await Promise.all([
        timeWorkspaceStep('profile', fetchProfile),
        timeWorkspaceStep('governance_items main table', fetchGovernanceItems),
        timeWorkspaceStep('taxonomies', () => fetchTaxonomies().catch((error) => {
          console.warn(error)
          return [] as TaxonomyEntry[]
        })),
      ])
      logWorkspaceTiming('workspace main load', workspaceStartedAt)
      if (profile) setUser(profile)
      setItems(remoteItems)
      setTaxonomies(mergeTaxonomies(createDefaultTaxonomies(), remoteTaxonomies))
      setAuthStatus('signed_in')
      setAuthNotice('')
      if (options.successMessage) setDataNotice(`${options.successMessage}: ${remoteItems.length} live records loaded from Supabase.`)
      cleanAuthUrl()
      void hydrateGovernanceItemDetails(remoteItems, loadSequence)
      return remoteItems
    } catch (error) {
      console.error(error)
      setAuthStatus('signed_in')
      setDataError(readErrorMessage(error, 'Signed in, but live governance data could not be loaded.'))
      if (options.throwOnError) throw error
      return []
    } finally {
      if (!options.silent) setLoadingMessage('')
    }
  }, [hydrateGovernanceItemDetails])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return
    const client = supabase

    async function initializeAuth() {
      setLoadingMessage('Checking session')
      try {
        const sessionStartedAt = performance.now()
        const {
          data: { session },
          error,
        } = await client.auth.getSession()
        logWorkspaceTiming('session check', sessionStartedAt)
        if (error) throw error

        if (!session) {
          setAuthStatus('signed_out')
          setItems([])
          return
        }

        setAuthStatus('signed_in')
        await loadAuthenticatedWorkspace()
      } catch (error) {
        console.error(error)
        setAuthStatus('signed_out')
        setAuthNotice(readErrorMessage(error, 'Supabase session could not be checked.'))
      } finally {
        setLoadingMessage('')
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordPanelMode('recovery')
        setPasswordPanelOpen(true)
      }
      if (!session) {
        setAuthStatus('signed_out')
        setItems([])
        return
      }

      setAuthStatus('signed_in')
      window.setTimeout(() => {
        void loadAuthenticatedWorkspace()
      }, 0)
    })

    void initializeAuth()
    return () => subscription.unsubscribe()
  }, [loadAuthenticatedWorkspace])

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
  const columnSettings = useMemo(() => buildColumnSettings(taxonomies), [taxonomies])
  const gridEditRoles = useMemo(() => buildGridEditRoles(taxonomies), [taxonomies])

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((collapsed) => {
      const nextValue = !collapsed
      writeStoredBoolean('nexbill-sidebar-collapsed', nextValue)
      return nextValue
    })
  }

  async function handleRefreshData(options: { successMessage?: string; throwOnError?: boolean } = {}) {
    setDataNotice('')
    setDataError('')

    if (!isSupabaseConfigured) {
      setItems(demoItems)
      setDataNotice(`Demo data refreshed: ${demoItems.length} records loaded.`)
      return demoItems
    }

    return loadAuthenticatedWorkspace({
      successMessage: options.successMessage ?? 'Live data refreshed',
      throwOnError: options.throwOnError,
    })
  }

  async function handleSaveItem(item: GovernanceItem) {
    const updatedItem = {
      ...item,
      lastUpdatedAt: new Date().toISOString().slice(0, 10),
    }
    const previousItems = items
    setDataNotice('')
    setDataError('')

    setItems((current) => {
      const exists = current.some((candidate) => candidate.id === updatedItem.id)
      return exists
        ? current.map((candidate) => (candidate.id === updatedItem.id ? updatedItem : candidate))
        : [updatedItem, ...current]
    })

    if (isSupabaseConfigured) {
      try {
        const savedItem = await upsertGovernanceItem(updatedItem)
        setItems((current) => mergeImportedItems(current, [savedItem]))
        setDataNotice(`${savedItem.itemCode} saved to Supabase.`)
        const existedBeforeSave = previousItems.some((candidate) => candidate.itemCode === savedItem.itemCode)
        try {
          await logAuditEvent({
            eventType: existedBeforeSave ? 'governance_item_updated' : 'governance_item_created',
            tableName: 'governance_items',
            recordId: savedItem.id,
            metadata: {
              itemCode: savedItem.itemCode,
              module: savedItem.module,
              title: savedItem.title,
              status: savedItem.status,
            },
          })
        } catch (auditError) {
          console.warn(auditError)
        }
      } catch (error) {
        console.error(error)
        setItems(previousItems)
        setDataError(`${updatedItem.itemCode} could not be saved: ${readErrorMessage(error, 'Supabase save failed.')}`)
      }
    }
  }

  async function handleDeleteItem(item: GovernanceItem) {
    const previousItems = items
    setDataNotice('')
    setDataError('')
    setItems((current) => current.filter((candidate) => candidate.id !== item.id))

    if (!isSupabaseConfigured) {
      setDataNotice(`${item.itemCode} deleted from the local demo state.`)
      return
    }

    try {
      await deleteGovernanceItem(item.id)
      setDataNotice(`${item.itemCode} deleted from Supabase.`)
      try {
        await logAuditEvent({
          eventType: 'governance_item_deleted',
          tableName: 'governance_items',
          recordId: isPersistedItemId(item.id) ? item.id : undefined,
          metadata: {
            itemCode: item.itemCode,
            module: item.module,
            title: item.title,
            status: item.status,
          },
        })
      } catch (auditError) {
        console.warn(auditError)
      }
    } catch (error) {
      console.error(error)
      setItems(previousItems)
      setDataError(`${item.itemCode} could not be deleted: ${readErrorMessage(error, 'Supabase delete failed.')}`)
      throw error
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setAuthNotice('')
    setLoadingMessage('Signing in')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
      if (error) throw error
      await loadAuthenticatedWorkspace()
    } catch (error) {
      console.error(error)
      setAuthNotice(readErrorMessage(error, 'Sign in failed.'))
    } finally {
      setLoadingMessage('')
    }
  }

  async function handleMagicLink() {
    if (!supabase) return
    if (!authEmail.trim()) {
      setAuthNotice('Enter an email address first.')
      return
    }

    setAuthNotice('')
    setLoadingMessage('Sending magic link')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin },
      })
      if (error) throw error
      setAuthNotice('Magic link sent. Check the inbox for the NexBill sign-in email.')
    } catch (error) {
      console.error(error)
      setAuthNotice(readErrorMessage(error, 'Magic link could not be sent.'))
    } finally {
      setLoadingMessage('')
    }
  }

  async function handleAccessRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    const prefix = normalizeLenovoEmailPrefix(signupPrefix)
    const fullName = signupFullName.trim()
    if (signupPrefix.includes('@') && !signupPrefix.trim().toLowerCase().endsWith('@lenovo.com')) {
      setAuthNotice('Registration is limited to @lenovo.com email addresses.')
      return
    }
    if (!prefix) {
      setAuthNotice('Enter your Lenovo email prefix.')
      return
    }
    if (!fullName) {
      setAuthNotice('Enter your full name.')
      return
    }

    const email = `${prefix}@lenovo.com`
    setAuthNotice('')
    setLoadingMessage('Sending access request link')
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}?first_access=1`,
          shouldCreateUser: true,
          data: {
            full_name: fullName,
            access_request_source: 'nexbill_governance_platform',
          },
        },
      })
      if (error) throw error
      setAuthEmail(email)
      setSignupPrefix(prefix)
      setAuthNotice(`Access link sent to ${email}. Open the email to finish registration.`)
    } catch (error) {
      console.error(error)
      setAuthNotice(readErrorMessage(error, 'Access request could not be submitted.'))
    } finally {
      setLoadingMessage('')
    }
  }

  async function handlePasswordReset() {
    if (!supabase) return
    if (!authEmail.trim()) {
      setAuthNotice('Enter an email address first.')
      return
    }

    setAuthNotice('')
    setLoadingMessage('Sending reset link')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), {
        redirectTo: `${window.location.origin}?password_reset=1`,
      })
      if (error) throw error
      setAuthNotice('Password reset link sent. Open it to set a new password.')
    } catch (error) {
      console.error(error)
      setAuthNotice(readErrorMessage(error, 'Password reset email could not be sent.'))
    } finally {
      setLoadingMessage('')
    }
  }

  async function handleUpdatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    if (newPassword.length < 8) {
      setPasswordMessage('Password must be at least 8 characters.')
      return
    }

    setPasswordMessage('')
    setLoadingMessage('Updating password')
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setPasswordPanelMode('account')
      setPasswordMessage('Password updated. Email and password sign-in is now available.')
      setAuthNotice('')
      window.setTimeout(() => {
        setPasswordPanelOpen(false)
        setPasswordMessage('')
      }, 2500)
    } catch (error) {
      console.error(error)
      setPasswordMessage(readErrorMessage(error, 'Password could not be updated.'))
    } finally {
      setLoadingMessage('')
    }
  }

  async function handleSignOut() {
    if (!supabase) return
    setLoadingMessage('Signing out')
    try {
      await supabase.auth.signOut()
    } finally {
      setUser(demoUsers[0])
      setItems([])
      setAuthStatus('signed_out')
      setLoadingMessage('')
    }
  }

  if (isSupabaseConfigured && authStatus !== 'signed_in') {
    return (
      <LoginPage
        authEmail={authEmail}
        authPassword={authPassword}
        authNotice={authNotice}
        authStatus={authStatus}
        loadingMessage={loadingMessage}
        setAuthEmail={setAuthEmail}
        setAuthPassword={setAuthPassword}
        onSignIn={handleSignIn}
        onMagicLink={handleMagicLink}
        onPasswordReset={handlePasswordReset}
        signupPrefix={signupPrefix}
        signupFullName={signupFullName}
        setSignupPrefix={setSignupPrefix}
        setSignupFullName={setSignupFullName}
        onAccessRequest={handleAccessRequest}
      />
    )
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark">Lenovo</div>
          <div>
            <strong>NexBill</strong>
            <span>Governance</span>
          </div>
          <button
            className="sidebar-collapse"
            onClick={toggleSidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav className="primary-nav">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.key} className={page === item.key ? 'is-active' : ''} onClick={() => setPage(item.key)}>
                <Icon size={18} />
                <span>{item.label}</span>
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

        <section className="user-strip">
          <button className="profile-trigger" onClick={() => setProfileDrawerOpen(true)}>
            <ProfileAvatar user={user} />
            <div>
              <strong>{user.fullName}</strong>
              <span>{roleLabels[user.role]} · {user.workstream ?? 'All workstreams'}</span>
            </div>
            <UserPen size={16} />
          </button>
          {isSupabaseConfigured ? (
            <div className="user-actions">
              <button className="button secondary" onClick={() => void handleRefreshData()} disabled={Boolean(loadingMessage)}>
                <RefreshCw size={16} />
                Refresh data
              </button>
              <button className="button secondary" onClick={() => setPasswordPanelOpen((open) => !open)}>
                <KeyRound size={16} />
                Set password
              </button>
              <button className="button secondary" onClick={handleSignOut}>
                <Lock size={16} />
                Sign out
              </button>
            </div>
          ) : (
            <select value={user.id} onChange={(event) => setUser(demoUsers.find((candidate) => candidate.id === event.target.value) ?? demoUsers[0])}>
              {demoUsers.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.fullName} · {roleLabels[candidate.role]}</option>
              ))}
            </select>
          )}
        </section>

        {profileDrawerOpen && (
          <ProfileDrawer
            user={user}
            taxonomies={taxonomies}
            onClose={() => setProfileDrawerOpen(false)}
            onSave={(updatedUser) => {
              setUser(updatedUser)
              setProfileDrawerOpen(false)
              setDataNotice('Profile updated.')
            }}
          />
        )}

        {loadingMessage && <div className="loading-line">{loadingMessage}</div>}
        {authNotice && <div className="notice-line">{authNotice}</div>}
        {dataNotice && <div className="notice-line">{dataNotice}</div>}
        {dataError && <div className="error-line">{dataError}</div>}
        {isSupabaseConfigured && passwordPanelOpen && (
          <section className={`account-panel ${passwordPanelMode === 'account' ? '' : 'is-password-recovery'}`}>
            <div className="account-panel-copy">
              <KeyRound size={18} />
              <div>
                <strong>{passwordPanelTitle(passwordPanelMode)}</strong>
                <span>{passwordPanelDescription(passwordPanelMode)}</span>
              </div>
            </div>
            <form onSubmit={handleUpdatePassword}>
              <label>
                New password
                <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" placeholder="New password" />
              </label>
              <button className="button primary" type="submit">Update password</button>
            </form>
            {passwordMessage && <span>{passwordMessage}</span>}
          </section>
        )}

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
            viewMode={viewMode}
            showClosed={showClosed}
            query={query}
            columnSettings={columnSettings}
            taxonomies={taxonomies}
            user={user}
            gridEditRoles={gridEditRoles}
            onSaveItem={handleSaveItem}
            onDeleteItem={handleDeleteItem}
            onRefreshData={() => handleRefreshData()}
            isRefreshingData={Boolean(loadingMessage)}
          />
        )}
        {page === 'reporting' && <ReportingPage items={filteredItems} user={user} />}
        {page === 'program_site' && <ProgramSitePage items={items} user={user} taxonomies={taxonomies} gridEditRoles={gridEditRoles} onSaveItem={handleSaveItem} />}
        {page === 'import' && (
          <ImportPage
            items={items}
            onImport={(records) => setItems((current) => mergeImportedItems(current, records))}
            onImportCommitted={() => handleRefreshData({ successMessage: 'Import committed and refreshed', throwOnError: true })}
          />
        )}
        {page === 'admin' && (
          <AdminPage
            user={user}
            taxonomies={taxonomies}
            columnSettings={columnSettings}
            gridEditRoles={gridEditRoles}
            onTaxonomiesChange={setTaxonomies}
          />
        )}
        {page === 'audit' && <AuditPage items={items} user={user} />}
      </main>
    </div>
  )
}

function LoginPage({
  authEmail,
  authPassword,
  authNotice,
  authStatus,
  loadingMessage,
  signupPrefix,
  signupFullName,
  setAuthEmail,
  setAuthPassword,
  setSignupPrefix,
  setSignupFullName,
  onSignIn,
  onMagicLink,
  onPasswordReset,
  onAccessRequest,
}: {
  authEmail: string
  authPassword: string
  authNotice: string
  authStatus: AuthStatus
  loadingMessage: string
  signupPrefix: string
  signupFullName: string
  setAuthEmail: (value: string) => void
  setAuthPassword: (value: string) => void
  setSignupPrefix: (value: string) => void
  setSignupFullName: (value: string) => void
  onSignIn: (event: FormEvent<HTMLFormElement>) => void
  onMagicLink: () => void
  onPasswordReset: () => void
  onAccessRequest: (event: FormEvent<HTMLFormElement>) => void
}) {
  const busy = authStatus === 'checking' || Boolean(loadingMessage)
  const normalizedSignupPrefix = normalizeLenovoEmailPrefix(signupPrefix)

  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <div className="brand-mark">Lenovo</div>
          <p className="eyebrow">NexBill Project Governance</p>
          <h1>Sign in to continue</h1>
          <p>Access is controlled by Supabase Auth and project roles.</p>
        </div>

        <form className="login-form" onSubmit={onSignIn}>
          <label>
            Email
            <input value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" type="email" />
          </label>
          <label>
            Password
            <input value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete="current-password" placeholder="Password" type="password" />
          </label>

          <button className="button primary" disabled={busy || !authEmail || !authPassword} type="submit">
            <Lock size={16} />
            Sign in
          </button>

          <div className="auth-options">
            <button className="button secondary" disabled={busy || !authEmail} onClick={onMagicLink} type="button">Magic link</button>
            <button className="button secondary" disabled={busy || !authEmail} onClick={onPasswordReset} type="button">Reset password</button>
          </div>

          {(loadingMessage || authNotice) && (
            <div className="auth-message">{loadingMessage || authNotice}</div>
          )}
        </form>

        <form className="access-request-form" onSubmit={onAccessRequest}>
          <div>
            <span className="code">Lenovo access request</span>
            <h2>Request access</h2>
            <p>Use your Lenovo email. The domain is locked to keep NexBill access inside Lenovo.</p>
          </div>
          <label>
            Full name
            <input
              value={signupFullName}
              onChange={(event) => setSignupFullName(event.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </label>
          <label>
            Lenovo email
            <div className="email-prefix-control">
              <input
                value={signupPrefix}
                onChange={(event) => setSignupPrefix(event.target.value)}
                autoComplete="username"
                placeholder="firstname.lastname"
              />
              <span>@lenovo.com</span>
            </div>
          </label>
          <button className="button secondary" disabled={busy || !normalizedSignupPrefix || !signupFullName.trim()} type="submit">
            Request magic link
          </button>
        </form>
      </section>
    </main>
  )
}

function normalizeLenovoEmailPrefix(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/@lenovo\.com$/i, '')
    .replace(/[^a-z0-9._+-]/g, '')
}

function ProfileAvatar({ user }: { user: UserProfile }) {
  const initial = (user.fullName || user.email || 'N').slice(0, 1).toUpperCase()
  if (user.avatarUrl) {
    return (
      <span className="avatar has-image">
        <img src={user.avatarUrl} alt={`${user.fullName}'s avatar`} />
      </span>
    )
  }

  return <span className="avatar">{initial}</span>
}

function ProfileDrawer({
  user,
  taxonomies,
  onClose,
  onSave,
}: {
  user: UserProfile
  taxonomies: TaxonomyEntry[]
  onClose: () => void
  onSave: (user: UserProfile) => void
}) {
  const [fullName, setFullName] = useState(user.fullName)
  const [department, setDepartment] = useState(user.department ?? '')
  const [workstream, setWorkstream] = useState(user.workstream ?? '')
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  async function handleAvatarUpload(file?: File) {
    if (!file) return

    setMessage('')
    setError('')
    setIsUploadingAvatar(true)
    try {
      const nextAvatarUrl = isSupabaseConfigured
        ? await uploadProfileAvatar(file)
        : await readLocalFileDataUrl(file)
      setAvatarUrl(nextAvatarUrl)
      setMessage('Avatar uploaded. Save the profile to finish.')
    } catch (uploadError) {
      console.error(uploadError)
      setError(readErrorMessage(uploadError, 'Avatar could not be uploaded.'))
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!fullName.trim()) return

    setIsSaving(true)
    setMessage('')
    setError('')
    try {
      let updatedUser: UserProfile
      if (isSupabaseConfigured) {
        const savedProfile = await updateOwnProfile({
          fullName: fullName.trim(),
          department: department.trim() || undefined,
          workstream: workstream.trim() || undefined,
        })
        updatedUser = { ...savedProfile, avatarUrl: avatarUrl || savedProfile.avatarUrl }
        await logAuditEvent({
          eventType: 'profile_updated',
          tableName: 'profiles',
          recordId: user.id,
          metadata: {
            fullName: updatedUser.fullName,
            department: updatedUser.department,
            workstream: updatedUser.workstream,
            avatarUpdated: Boolean(avatarUrl && avatarUrl !== user.avatarUrl),
          },
        }).catch((auditError) => console.warn(auditError))
      } else {
        updatedUser = {
          ...user,
          fullName: fullName.trim(),
          department: department.trim() || undefined,
          workstream: workstream.trim() || undefined,
          avatarUrl: avatarUrl || undefined,
        }
      }
      onSave(updatedUser)
    } catch (saveError) {
      console.error(saveError)
      setError(readErrorMessage(saveError, 'Profile could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="drawer-backdrop">
      <aside className="drawer profile-drawer">
        <div className="drawer-header">
          <div>
            <span className="code">My profile</span>
            <h2>Edit profile</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-avatar-editor">
            <span className={`avatar profile-avatar-preview ${avatarUrl ? 'has-image' : ''}`}>
              {avatarUrl ? <img src={avatarUrl} alt={`${fullName}'s avatar preview`} /> : fullName.slice(0, 1).toUpperCase()}
            </span>
            <label className="button secondary">
              <Upload size={16} />
              {isUploadingAvatar ? 'Uploading' : 'Upload avatar'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                disabled={isUploadingAvatar}
                onChange={(event) => void handleAvatarUpload(event.target.files?.[0])}
              />
            </label>
            <span>PNG, JPG, WebP or GIF. Keep it under 2 MB.</span>
          </div>

          <label>
            Full name
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </label>
          <label>
            Email
            <input value={user.email} disabled />
          </label>
          <label>
            Department
            <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="e.g. PMO, Technology, Tax" />
          </label>
          <label>
            Default workstream
            <select value={workstream} onChange={(event) => setWorkstream(event.target.value)}>
              <option value="">All workstreams</option>
              {activeTaxonomyValues(taxonomies, 'workstream', workstreamOptions).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>

          {message && <div className="notice-line compact">{message}</div>}
          {error && <div className="error-line compact">{error}</div>}

          <div className="drawer-actions">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button primary" disabled={isSaving || !fullName.trim()} type="submit">
              {isSaving ? 'Saving' : 'Save profile'}
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}

function pageTitle(page: PageKey) {
  const item = navItems.find((nav) => nav.key === page)
  return item?.label ?? 'Dashboard'
}

function readPasswordSetupType(): PasswordPanelMode | null {
  if (typeof window === 'undefined') return null
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const searchParams = new URLSearchParams(window.location.search)
  const type = hashParams.get('type') ?? searchParams.get('type')
  if (type === 'recovery' || searchParams.get('password_reset') === '1') return 'recovery'
  if (type === 'invite' || searchParams.get('first_access') === '1') return 'invite'
  return null
}

function passwordPanelTitle(mode: PasswordPanelMode) {
  if (mode === 'recovery') return 'Set a new password'
  if (mode === 'invite') return 'Finish account setup'
  return 'Account password'
}

function passwordPanelDescription(mode: PasswordPanelMode) {
  if (mode === 'recovery') return 'You opened a password reset link. Choose a new password before continuing.'
  if (mode === 'invite') return 'Create a password so future sign-ins can use email and password instead of a magic link.'
  return 'Create or update your password for email and password sign-in.'
}

function readStoredBoolean(key: string) {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(key) === 'true'
}

function writeStoredBoolean(key: string, value: boolean) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(key, String(value))
}

function readLocalFileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')))
    reader.addEventListener('error', () => reject(new Error('Avatar preview could not be read.')))
    reader.readAsDataURL(file)
  })
}

function cleanAuthUrl() {
  if (typeof window === 'undefined') return

  const params = new URLSearchParams(window.location.search)
  const authParamNames = ['code', 'error', 'error_code', 'error_description', 'first_access', 'password_reset', 'type']
  const removedSearchParam = authParamNames.some((name) => {
    const hasParam = params.has(name)
    params.delete(name)
    return hasParam
  })
  const hasAuthHash = window.location.hash.includes('access_token') || window.location.hash.includes('type=')
  if (!removedSearchParam && !hasAuthHash) return

  const nextSearch = params.toString()
  window.history.replaceState(null, document.title, `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}`)
}

function readErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function mergeImportedItems(current: GovernanceItem[], records: GovernanceItem[]) {
  const importedCodes = new Set(records.map((record) => record.itemCode))
  return [...records, ...current.filter((item) => !importedCodes.has(item.itemCode))]
}

function createDemoManagedProfile(user: UserProfile): ManagedProfile {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    department: user.department,
    workstream: user.workstream,
    roles: [{
      id: `local-role-${user.id}`,
      userId: user.id,
      role: user.role,
      workstream: user.workstream,
      createdAt: new Date(0).toISOString(),
    }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function primaryRoleDraft(profile: ManagedProfile) {
  const primaryRole = profile.roles[0]
  return {
    role: primaryRole?.role ?? ('owner' as Role),
    workstream: primaryRole?.workstream ?? profile.workstream ?? '',
  }
}

function createRoleDrafts(profiles: ManagedProfile[]) {
  return Object.fromEntries(profiles.map((profile) => [profile.id, primaryRoleDraft(profile)]))
}

function createDefaultTaxonomies(): TaxonomyEntry[] {
  const entries: TaxonomyEntry[] = []
  const pushValues = (groupKey: string, values: string[]) => {
    values.forEach((value, index) => {
      entries.push(createLocalTaxonomyEntry(groupKey, value, value, index))
    })
  }

  pushValues('workstream', workstreamOptions)
  pushValues('phase', phaseOptions)
  pushValues('priority', uniqueValues(moduleConfigs.flatMap((module) => module.priorityOptions ?? [])))
  pushValues('rag', ['1. Green', '2. Amber', '3. Red'])
  pushValues('risk_level', riskLevelOptions)

  moduleConfigs.forEach((module) => {
    module.tableColumns.forEach((column, index) => {
      entries.push(createLocalTaxonomyEntry('module_column', columnTaxonomyValue(module.key, column), columnLabel(column), index))
    })
  })

  roleOptions.forEach((role, index) => {
    entries.push({
      ...createLocalTaxonomyEntry('grid_edit_role', role, roleLabels[role], index),
      active: defaultGridEditRoles.includes(role),
    })
    rolePermissionDefinitions.forEach((permission, permissionIndex) => {
      entries.push({
        ...createLocalTaxonomyEntry(
          'role_permission',
          rolePermissionTaxonomyValue(role, permission.key),
          `${roleLabels[role]} · ${permission.label}`,
          index * 100 + permissionIndex,
        ),
        active: defaultRolePermissions[role].includes(permission.key),
      })
    })
  })

  return entries
}

function createLocalTaxonomyEntry(groupKey: string, value: string, label: string, sortOrder: number): TaxonomyEntry {
  return {
    id: `local-${groupKey}-${value}`,
    groupKey,
    value,
    label,
    sortOrder,
    active: true,
    createdAt: new Date(0).toISOString(),
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function mergeTaxonomies(baseEntries: TaxonomyEntry[], remoteEntries: TaxonomyEntry[]) {
  const merged = new Map(baseEntries.map((entry) => [taxonomyKey(entry.groupKey, entry.value), entry]))
  remoteEntries.forEach((entry) => merged.set(taxonomyKey(entry.groupKey, entry.value), entry))
  return [...merged.values()].sort((a, b) => a.groupKey.localeCompare(b.groupKey) || a.sortOrder - b.sortOrder || taxonomyDisplayLabel(a).localeCompare(taxonomyDisplayLabel(b)))
}

function replaceTaxonomyEntry(entries: TaxonomyEntry[], updatedEntry: TaxonomyEntry) {
  return mergeTaxonomies(entries, [updatedEntry])
}

function taxonomyKey(groupKey: string, value: string) {
  return `${groupKey}::${value}`
}

function taxonomyDisplayLabel(entry: TaxonomyEntry) {
  return entry.label?.trim() || entry.value
}

function rolePermissionTaxonomyValue(role: Role, permission: RolePermissionKey) {
  return `${role}:${permission}`
}

function getRolePermissions(role: Role, taxonomies: TaxonomyEntry[], gridEditRoles: Role[]) {
  return rolePermissionDefinitions
    .filter((permission) => {
      const entry = taxonomies.find((candidate) => (
        candidate.groupKey === 'role_permission' &&
        candidate.value === rolePermissionTaxonomyValue(role, permission.key)
      ))
      if (entry) return entry.active
      if (permission.key === 'grid_edit') return gridEditRoles.includes(role)
      return defaultRolePermissions[role].includes(permission.key)
    })
    .map((permission) => permission.key)
}

function rolePermissionSummary(role: Role, permissions: RolePermissionKey[]) {
  if (role === 'super_admin') return 'Full control'
  if (role === 'executive') return 'Read only reporting'
  if (permissions.includes('grid_edit')) return 'Grid edit enabled'
  if (permissions.includes('edit_all')) return 'Edit all register items'
  if (permissions.includes('edit_own')) return 'Scoped item access'
  return 'Read limited'
}

function isRolePermissionLocked(role: Role, permission: RolePermissionKey) {
  if (role === 'super_admin') return true
  const definition = rolePermissionDefinitions.find((candidate) => candidate.key === permission)
  if (definition?.restrictedTo && !definition.restrictedTo.includes(role)) return true
  if (role === 'executive' && ['create_item', 'edit_own', 'edit_all', 'grid_edit', 'delete_item', 'import_workbook', 'manage_admin'].includes(permission)) return true
  return false
}

function canRunAiTriage(user: UserProfile) {
  return user.role === 'super_admin' || user.role === 'program_manager' || user.role === 'ctm'
}

function rolePermissionLockReason(role: Role, permission: RolePermissionKey) {
  if (role === 'super_admin') return 'Super Admin is always fully enabled.'
  const definition = rolePermissionDefinitions.find((candidate) => candidate.key === permission)
  if (definition?.restrictedTo && !definition.restrictedTo.includes(role)) return 'Protected by current Supabase RLS policy.'
  if (role === 'executive') return 'Executive is read only by policy.'
  return ''
}

function columnTaxonomyValue(module: ModuleKey, column: string) {
  return `${module}:${column}`
}

function parseColumnTaxonomyValue(value: string) {
  const [module, ...rest] = value.split(':')
  return {
    module: module as ModuleKey,
    column: rest.join(':'),
  }
}

function buildColumnSettings(taxonomies: TaxonomyEntry[]): ColumnSettings {
  const settings: ColumnSettings = {}
  taxonomies
    .filter((entry) => entry.groupKey === 'module_column' && entry.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || taxonomyDisplayLabel(a).localeCompare(taxonomyDisplayLabel(b)))
    .forEach((entry) => {
      const parsed = parseColumnTaxonomyValue(entry.value)
      if (!moduleConfigByKey[parsed.module] || !parsed.column) return
      settings[parsed.module] = [...(settings[parsed.module] ?? []), parsed.column]
    })
  return settings
}

function buildGridEditRoles(taxonomies: TaxonomyEntry[]): Role[] {
  const entries = taxonomies.filter((entry) => entry.groupKey === 'grid_edit_role')
  if (entries.length === 0) return defaultGridEditRoles

  const roles = entries
    .filter((entry) => entry.active && isRole(entry.value))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry) => entry.value as Role)

  return roles.includes('super_admin') ? roles : ['super_admin', ...roles]
}

function isRole(value: string): value is Role {
  return roleOptions.includes(value as Role)
}

function resolveModuleColumns(config: ModuleConfig, columnSettings: ColumnSettings) {
  const configuredColumns = columnSettings[config.key]?.filter((column) => config.tableColumns.includes(column)) ?? []
  return configuredColumns.length ? configuredColumns : config.tableColumns
}

function activeTaxonomyValues(taxonomies: TaxonomyEntry[], groupKey: string, fallback: string[]) {
  const values = taxonomies
    .filter((entry) => entry.groupKey === groupKey && entry.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || taxonomyDisplayLabel(a).localeCompare(taxonomyDisplayLabel(b)))
    .map((entry) => entry.value)
  return values.length ? values : fallback
}

function fieldOptions(field: ModuleConfig['fields'][number], taxonomies: TaxonomyEntry[]) {
  if (field.key === 'workstream') return activeTaxonomyValues(taxonomies, 'workstream', workstreamOptions)
  if (field.key === 'phase') return activeTaxonomyValues(taxonomies, 'phase', phaseOptions)
  if (field.key === 'priority') return activeTaxonomyValues(taxonomies, 'priority', field.options ?? [])
  if (field.key === 'ragStatus' && field.options?.some((option) => Boolean(riskLevelTone(option)))) return activeTaxonomyValues(taxonomies, 'risk_level', field.options)
  if (field.key === 'ragStatus') return activeTaxonomyValues(taxonomies, 'rag', field.options ?? [])
  return field.options ?? []
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
  const overdueItems = items.filter((item) => daysBetween(item.dueDate) < 0).slice(0, 5)
  const dueSoonItems = items.filter((item) => {
    const days = daysBetween(item.dueDate)
    return days >= 0 && days <= 14
  }).slice(0, 5)

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

        <div className="panel">
          <PanelHeader title="Due attention" icon={CalendarClock} />
          <div className="attention-groups">
            <div>
              <h3>Overdue</h3>
              <CompactItemList items={overdueItems} compact />
            </div>
            <div>
              <h3>Due in 14 days</h3>
              <CompactItemList items={dueSoonItems} compact />
            </div>
          </div>
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
  viewMode,
  showClosed,
  query,
  columnSettings,
  taxonomies,
  user,
  gridEditRoles,
  onSaveItem,
  onDeleteItem,
  onRefreshData,
  isRefreshingData,
}: {
  items: GovernanceItem[]
  allItems: GovernanceItem[]
  selectedModule: ModuleKey
  setSelectedModule: (module: ModuleKey) => void
  viewMode: ViewMode
  showClosed: boolean
  query: string
  columnSettings: ColumnSettings
  taxonomies: TaxonomyEntry[]
  user: UserProfile
  gridEditRoles: Role[]
  onSaveItem: (item: GovernanceItem) => void
  onDeleteItem: (item: GovernanceItem) => Promise<void>
  onRefreshData: () => Promise<GovernanceItem[]>
  isRefreshingData: boolean
}) {
  const config = moduleConfigByKey[selectedModule]
  const tableColumns = resolveModuleColumns(config, columnSettings)
  const moduleItems = items.filter((item) => item.module === selectedModule)
  const [tableSort, setTableSort] = useState<TableSort>(null)
  const [tableFilters, setTableFilters] = useState<ColumnFilters>({})
  const [activeColumnMenu, setActiveColumnMenu] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<GovernanceItem | null>(null)
  const [gridMode, setGridMode] = useState(false)
  const [triageOutput, setTriageOutput] = useState<AiTriageOutput | null>(null)
  const [triageInputCount, setTriageInputCount] = useState(0)
  const [triageRuns, setTriageRuns] = useState<AiTriageRun[]>([])
  const [triageDrawerOpen, setTriageDrawerOpen] = useState(false)
  const [isTriageRunning, setIsTriageRunning] = useState(false)
  const [isTriageHistoryLoading, setIsTriageHistoryLoading] = useState(false)
  const [triageMessage, setTriageMessage] = useState('')
  const [triageError, setTriageError] = useState('')
  const canUseGridEdit = canGridEdit(user, gridEditRoles)
  const canCreateItem = user.role !== 'executive'
  const canUseAiTriage = canRunAiTriage(user)
  const displayedModuleItems = useMemo(() => sortTableItems(filterTableItems(moduleItems, tableFilters), tableSort), [moduleItems, tableFilters, tableSort])
  const triageItems = useMemo(() => displayedModuleItems.filter((item) => !isClosedStatus(item.status, item.closedAt)).slice(0, 100), [displayedModuleItems])
  const triageFilters = useMemo(() => ({
    scope: 'current_register_view',
    module: selectedModule,
    moduleLabel: config.label,
    viewMode,
    showClosed,
    query: query.trim() || undefined,
    columnFilters: tableFilters,
    sort: tableSort,
    visibleRecordCount: displayedModuleItems.length,
    triageRecordCount: triageItems.length,
  }), [config.label, displayedModuleItems.length, query, selectedModule, showClosed, tableFilters, tableSort, triageItems.length, viewMode])

  const loadTriageHistory = useCallback(async () => {
    if (!isSupabaseConfigured || !canUseAiTriage) {
      setTriageRuns([])
      return
    }

    setIsTriageHistoryLoading(true)
    setTriageError('')
    try {
      const runs = await fetchAiTriageRuns(10)
      setTriageRuns(runs)
    } catch (error) {
      console.error(error)
      setTriageError(readErrorMessage(error, 'AI triage history could not be loaded.'))
    } finally {
      setIsTriageHistoryLoading(false)
    }
  }, [canUseAiTriage])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadTriageHistory()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadTriageHistory])

  function handleModuleChange(module: ModuleKey) {
    setSelectedModule(module)
    setTableSort(null)
    setTableFilters({})
    setActiveColumnMenu(null)
  }

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

  async function runAiTriage() {
    if (!canUseAiTriage) return
    if (!triageItems.length) {
      setTriageError('No open or in-progress records are visible in the current register view.')
      return
    }

    setIsTriageRunning(true)
    setTriageMessage('')
    setTriageError('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
      }

      const response = await fetch('/.netlify/functions/ai-governance-triage', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          scope: 'current_register_view',
          filters: triageFilters,
          items: triageItems,
          user,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as AiTriageOutput & { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'AI governance triage unavailable.')

      setTriageOutput(body)
      setTriageInputCount(triageItems.length)
      setTriageDrawerOpen(true)

      if (isSupabaseConfigured) {
        try {
          const savedRun = await saveAiTriageRun({
            scope: 'current_register_view',
            filters: triageFilters,
            inputItems: triageItems,
            output: body,
          })
          setTriageRuns((current) => [savedRun, ...current].slice(0, 10))
          setTriageMessage('AI quality check completed and saved to triage history.')
          await logAuditEvent({
            eventType: 'ai_triage_run_created',
            tableName: 'ai_triage_runs',
            recordId: savedRun.id,
            metadata: {
              scope: savedRun.scope,
              module: selectedModule,
              sourceRecordCount: triageItems.length,
              findingCount: body.findings.length,
            },
          })
        } catch (saveError) {
          console.error(saveError)
          setTriageError(`AI quality check completed, but history save failed: ${readErrorMessage(saveError, 'Unable to save AI triage run.')}`)
        }
      } else {
        setTriageMessage('AI quality check completed in demo mode.')
      }
    } catch (error) {
      console.error(error)
      setTriageError(readErrorMessage(error, 'AI governance triage could not be generated.'))
    } finally {
      setIsTriageRunning(false)
    }
  }

  function loadTriageRun(run: AiTriageRun) {
    setTriageOutput(run.output)
    setTriageInputCount(run.inputItemIds.length || Number(run.filters.triageRecordCount ?? 0))
    setTriageDrawerOpen(true)
    setTriageMessage(`Loaded AI quality check from ${formatTimestamp(run.createdAt)}.`)
  }

  function openTriageItem(itemCode: string) {
    const item = allItems.find((candidate) => candidate.itemCode === itemCode)
    if (!item) return
    setSelectedModule(item.module)
    setEditingItem(item)
    setTriageDrawerOpen(false)
  }

  return (
    <div className="page-stack">
      <div className="register-toolbar">
        <select value={selectedModule} onChange={(event) => handleModuleChange(event.target.value as ModuleKey)}>
          {moduleConfigs.map((module) => (
            <option key={module.key} value={module.key}>{module.label}</option>
          ))}
        </select>
        <div>
          {canUseAiTriage && (
            <button className="button secondary" onClick={() => void runAiTriage()} disabled={isTriageRunning || triageItems.length === 0}>
              <ListChecks size={16} />
              {isTriageRunning ? 'Checking' : 'AI quality check'}
            </button>
          )}
          <button className="button secondary" onClick={() => void onRefreshData()} disabled={isRefreshingData}>
            <RefreshCw size={16} />
            Refresh data
          </button>
          {canUseGridEdit && (
            <button className={`button secondary ${gridMode ? 'is-active' : ''}`} onClick={() => setGridMode((enabled) => !enabled)}>
              <Pencil size={16} />
              Grid edit
            </button>
          )}
          <button className="button primary" onClick={createItem} disabled={!canCreateItem}>
            <Plus size={16} />
            New item
          </button>
        </div>
      </div>

      {triageMessage && <div className="notice-line">{triageMessage}</div>}
      {triageError && <div className="error-line">{triageError}</div>}

      {!canCreateItem && (
        <div className="permission-line">
          <Lock size={16} />
          Executive access is read only. Use comments from delivery roles to request register changes.
        </div>
      )}

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

      {canUseAiTriage && (
        <section className="panel ai-triage-history-panel">
          <div className="admin-section-header">
            <PanelHeader title="AI triage history" icon={Bot} />
            <button className="button secondary" onClick={() => void loadTriageHistory()} disabled={isTriageHistoryLoading}>
              <RefreshCw size={16} />
              {isTriageHistoryLoading ? 'Loading' : 'History'}
            </button>
          </div>
          <div className="history-list horizontal">
            {triageRuns.length === 0 ? (
              <div className="empty-state">No saved AI quality checks yet.</div>
            ) : (
              triageRuns.map((run) => (
                <button key={run.id} onClick={() => loadTriageRun(run)}>
                  <span>{String(run.filters.moduleLabel ?? run.filters.module ?? run.scope)}</span>
                  <strong>{run.output.findings.length} findings</strong>
                  <em>{formatTimestamp(run.createdAt)}</em>
                </button>
              ))
            )}
          </div>
        </section>
      )}

      <ItemTable
        key={`${selectedModule}-${tableColumns.join('|')}`}
        items={moduleItems}
        displayedItems={displayedModuleItems}
        columns={tableColumns}
        user={user}
        gridMode={gridMode}
        sort={tableSort}
        filters={tableFilters}
        activeColumnMenu={activeColumnMenu}
        onSetSort={setTableSort}
        onSetFilters={setTableFilters}
        onSetActiveColumnMenu={setActiveColumnMenu}
        onEdit={setEditingItem}
        onSave={onSaveItem}
        onDelete={onDeleteItem}
      />

      {editingItem && (
        <ItemDrawer
          item={editingItem}
          config={config}
          taxonomies={taxonomies}
          user={user}
          onClose={() => setEditingItem(null)}
          onSave={(item) => {
            onSaveItem(item)
            setEditingItem(null)
          }}
        />
      )}

      {triageDrawerOpen && triageOutput && (
        <AiTriageDrawer
          output={triageOutput}
          inputCount={triageInputCount}
          onClose={() => setTriageDrawerOpen(false)}
          onOpenItem={openTriageItem}
        />
      )}
    </div>
  )
}

function ItemTable({
  items,
  displayedItems,
  columns,
  user,
  gridMode,
  sort,
  filters,
  activeColumnMenu,
  onSetSort,
  onSetFilters,
  onSetActiveColumnMenu,
  onEdit,
  onSave,
  onDelete,
}: {
  items: GovernanceItem[]
  displayedItems: GovernanceItem[]
  columns: string[]
  user: UserProfile
  gridMode: boolean
  sort: TableSort
  filters: ColumnFilters
  activeColumnMenu: string | null
  onSetSort: Dispatch<SetStateAction<TableSort>>
  onSetFilters: Dispatch<SetStateAction<ColumnFilters>>
  onSetActiveColumnMenu: Dispatch<SetStateAction<string | null>>
  onEdit: (item: GovernanceItem) => void
  onSave: (item: GovernanceItem) => void
  onDelete: (item: GovernanceItem) => Promise<void>
}) {
  const tableColumns = useMemo(() => [...columns, 'source'], [columns])
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [pendingDeleteItem, setPendingDeleteItem] = useState<GovernanceItem | null>(null)
  const activeFilterCount = Object.values(filters).filter((value) => value.trim()).length

  if (items.length === 0) return <div className="empty-state">No records in this register.</div>

  return (
    <div className="table-shell">
      {(sort || activeFilterCount > 0) && (
        <div className="table-control-strip">
          <span>
            {displayedItems.length}/{items.length} visible
            {sort ? ` · sorted by ${columnLabel(sort.column)} ${sort.direction === 'asc' ? 'ascending' : 'descending'}` : ''}
          </span>
          <button
            className="button secondary"
            onClick={() => {
              onSetSort(null)
              onSetFilters({})
              onSetActiveColumnMenu(null)
            }}
          >
            Clear table controls
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            {tableColumns.map((column) => (
              <th key={column}>
                <ColumnHeader
                  column={column}
                  sort={sort}
                  filterValue={filters[column] ?? ''}
                  menuOpen={activeColumnMenu === column}
                  onToggleMenu={() => onSetActiveColumnMenu((current) => (current === column ? null : column))}
                  onSetSort={(direction) => {
                    onSetSort({ column, direction })
                    onSetActiveColumnMenu(null)
                  }}
                  onClearSort={() => {
                    onSetSort((current) => (current?.column === column ? null : current))
                    onSetActiveColumnMenu(null)
                  }}
                  onFilterChange={(value) => onSetFilters((current) => ({ ...current, [column]: value }))}
                  onClearFilter={() => onSetFilters((current) => {
                    const nextFilters = { ...current }
                    delete nextFilters[column]
                    return nextFilters
                  })}
                />
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {displayedItems.length === 0 ? (
            <tr>
              <td colSpan={tableColumns.length + 1}>
                <div className="empty-state">No records match the active table filters.</div>
              </td>
            </tr>
          ) : (
            displayedItems.map((item) => {
              const expanded = expandedItemId === item.id
              return (
                <Fragment key={item.id}>
                  <tr
                    key={`${item.id}-row`}
                    className={`${isClosedStatus(item.status, item.closedAt) ? 'is-closed' : ''} ${expanded ? 'is-expanded' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded}
                    onClick={() => {
                      onSetActiveColumnMenu(null)
                      setExpandedItemId((current) => (current === item.id ? null : item.id))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setExpandedItemId((current) => (current === item.id ? null : item.id))
                      }
                    }}
                  >
                    {columns.map((column) => (
                      <td key={column}>
                        {gridMode && canEditItem(user, item) && editableColumn(column) ? (
                          <input
                            value={String(readItemColumn(item, column) ?? '')}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) => onSave(writeItemColumn(item, column, event.target.value))}
                          />
                        ) : column === 'status' ? (
                          <StatusPill item={item} />
                        ) : column === 'itemCode' ? (
                          <span className="code">{item.itemCode}</span>
                        ) : column === 'ragStatus' || column === 'priority' ? (
                          <RiskLevelBadge value={readItemColumn(item, column)} />
                        ) : (
                          <span>{formatCellValue(readItemColumn(item, column))}</span>
                        )}
                      </td>
                    ))}
                    <td>
                      <span className="source-chip">{item.sourceRef?.sheet ?? 'Manual'}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          onClick={(event) => {
                            event.stopPropagation()
                            onEdit(item)
                          }}
                          aria-label={`Edit ${item.itemCode}`}
                        >
                          <Pencil size={16} />
                        </button>
                        {canDeleteItem(user) && (
                          <button
                            className="icon-button danger"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDeleteItem(item)
                            }}
                            aria-label={`Delete ${item.itemCode}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  <tr key={`${item.id}-detail`} className={`detail-row ${expanded ? 'is-open' : ''}`}>
                    <td colSpan={tableColumns.length + 1}>
                      <div className="row-expander" aria-hidden={!expanded}>
                        <div className="row-expander-inner">
                          <ItemInlineDetails item={item} />
                        </div>
                      </div>
                    </td>
                  </tr>
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
      {pendingDeleteItem && (
        <DeleteItemDialog
          item={pendingDeleteItem}
          onClose={() => setPendingDeleteItem(null)}
          onDelete={async () => {
            await onDelete(pendingDeleteItem)
            setPendingDeleteItem(null)
            setExpandedItemId((current) => (current === pendingDeleteItem.id ? null : current))
          }}
        />
      )}
    </div>
  )
}

function DeleteItemDialog({
  item,
  onClose,
  onDelete,
}: {
  item: GovernanceItem
  onClose: () => void
  onDelete: () => Promise<void>
}) {
  const [confirmation, setConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState('')
  const confirmed = confirmation.trim() === item.itemCode

  async function handleDelete() {
    if (!confirmed) return
    setIsDeleting(true)
    setError('')
    try {
      await onDelete()
    } catch (deleteError) {
      console.error(deleteError)
      setError(readErrorMessage(deleteError, 'Record could not be deleted.'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="drawer-backdrop confirm-backdrop">
      <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-item-title">
        <div className="confirm-icon">
          <AlertTriangle size={24} />
        </div>
        <div>
          <span className="code">Delete record</span>
          <h2 id="delete-item-title">Delete {item.itemCode}?</h2>
          <p>
            This removes the register row and cascades its module details, comments, updates, and attachment records from Supabase. Storage files may still need separate clean-up.
          </p>
        </div>
        <div className="delete-target">
          <strong>{item.title}</strong>
          <span>{moduleConfigByKey[item.module].label} · {item.status}</span>
        </div>
        <label>
          Type the record ID to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={item.itemCode}
            autoFocus
          />
        </label>
        {error && <div className="error-line compact">{error}</div>}
        <div className="confirm-actions">
          <button className="button secondary" onClick={onClose} disabled={isDeleting}>Cancel</button>
          <button className="button danger" onClick={() => void handleDelete()} disabled={!confirmed || isDeleting}>
            <Trash2 size={16} />
            {isDeleting ? 'Deleting' : 'Delete record'}
          </button>
        </div>
      </section>
    </div>
  )
}

function AiTriageDrawer({
  output,
  inputCount,
  onClose,
  onOpenItem,
}: {
  output: AiTriageOutput
  inputCount: number
  onClose: () => void
  onOpenItem: (itemCode: string) => void
}) {
  const severityOrder: AiTriageSeverity[] = ['critical', 'high', 'medium', 'low']
  const score = calculateTriageQualityScore(output, inputCount)
  const findingsBySeverity = severityOrder.map((severity) => ({
    severity,
    findings: output.findings.filter((finding) => finding.severity === severity),
  })).filter((group) => group.findings.length > 0)

  return (
    <div className="drawer-backdrop">
      <aside className="drawer ai-triage-drawer">
        <div className="drawer-header">
          <div>
            <span className="code">AI quality check</span>
            <h2>Governance triage</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <section className="ai-triage-score">
          <div>
            <span>Quality score</span>
            <strong>{score}</strong>
          </div>
          <p>{output.summary}</p>
          <em>{inputCount} records checked · {output.findings.length} findings · {formatTimestamp(output.createdAt)}</em>
        </section>

        <section className="panel">
          <PanelHeader title="Recommended fixes" icon={CheckCircle2} />
          <div className="fix-list">
            {output.recommendedFixes.length === 0 ? (
              <div className="empty-state">No recommended fixes returned.</div>
            ) : (
              output.recommendedFixes.map((fix) => <p key={fix}>{fix}</p>)
            )}
          </div>
        </section>

        <section className="panel">
          <PanelHeader title="Findings" icon={ListChecks} />
          {findingsBySeverity.length === 0 ? (
            <div className="empty-state">No quality findings in this view.</div>
          ) : (
            <div className="triage-finding-groups">
              {findingsBySeverity.map((group) => (
                <section key={group.severity}>
                  <h3>{severityLabel(group.severity)} · {group.findings.length}</h3>
                  <div className="triage-finding-list">
                    {group.findings.map((finding) => (
                      <article key={`${finding.itemCode}-${finding.category}-${finding.finding}`} className={`tone-${finding.severity}`}>
                        <div className="triage-finding-head">
                          <span className="code">{finding.itemCode}</span>
                          <span className={`severity-chip tone-${finding.severity}`}>{severityLabel(finding.severity)}</span>
                        </div>
                        <strong>{finding.category}</strong>
                        <p>{finding.finding}</p>
                        <dl>
                          <div>
                            <dt>Why it matters</dt>
                            <dd>{finding.whyItMatters}</dd>
                          </div>
                          <div>
                            <dt>Suggested fix</dt>
                            <dd>{finding.suggestedFix}</dd>
                          </div>
                          <div>
                            <dt>Source</dt>
                            <dd>{formatSourceRef(finding.sourceRef)}</dd>
                          </div>
                        </dl>
                        <button className="button secondary" onClick={() => onOpenItem(finding.itemCode)}>Open record</button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <PanelHeader title="Confidence notes" icon={Bot} />
          <p className="admin-note">{output.confidenceNotes}</p>
          <p className="admin-note">AI suggestions are draft-only. They do not update registers, create actions, or write comments.</p>
        </section>
      </aside>
    </div>
  )
}

function ColumnHeader({
  column,
  sort,
  filterValue,
  menuOpen,
  onToggleMenu,
  onSetSort,
  onClearSort,
  onFilterChange,
  onClearFilter,
}: {
  column: string
  sort: TableSort
  filterValue: string
  menuOpen: boolean
  onToggleMenu: () => void
  onSetSort: (direction: SortDirection) => void
  onClearSort: () => void
  onFilterChange: (value: string) => void
  onClearFilter: () => void
}) {
  const isSorted = sort?.column === column
  return (
    <div className="column-header">
      <button className={menuOpen || isSorted || filterValue ? 'is-active' : ''} onClick={(event) => {
        event.stopPropagation()
        onToggleMenu()
      }}>
        <span>{columnLabel(column)}</span>
        {filterValue ? <Filter size={14} /> : <ArrowUpDown size={14} />}
        {isSorted && <em>{sort.direction === 'asc' ? 'Asc' : 'Desc'}</em>}
      </button>
      {menuOpen && (
        <div className="column-menu" onClick={(event) => event.stopPropagation()}>
          <button onClick={() => onSetSort('asc')}>Sort ascending</button>
          <button onClick={() => onSetSort('desc')}>Sort descending</button>
          <button onClick={onClearSort} disabled={!isSorted}>Clear sort</button>
          <label>
            Filter {columnLabel(column)}
            <input
              value={filterValue}
              onChange={(event) => onFilterChange(event.target.value)}
              placeholder={`Contains ${columnLabel(column).toLowerCase()}`}
            />
          </label>
          <button onClick={onClearFilter} disabled={!filterValue}>Clear filter</button>
        </div>
      )}
    </div>
  )
}

function ItemInlineDetails({ item }: { item: GovernanceItem }) {
  const coreRows: Array<[string, unknown]> = [
    ['ID', item.itemCode],
    ['Title', item.title],
    ['Summary', item.summary],
    ['Status', item.status],
    ['Priority', item.priority],
    ['RAG', item.ragStatus],
    ['Workstream', item.workstream],
    ['Phase', item.phase],
    ['Geo / Country', item.geo],
    ['Owner', joinDetailParts([item.ownerName, item.ownerEmail])],
    ['Support', joinDetailParts([item.supportName, item.supportEmail])],
    ['Due date', formatDate(item.dueDate)],
    ['Last updated', formatDate(item.lastUpdatedAt)],
    ['Closed', item.closedAt ? formatDate(item.closedAt) : undefined],
  ]
  const detailRows: Array<[string, unknown]> = Object.entries(item.details ?? {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => [columnLabel(key), formatCellValue(value)])
  const sourceRows: Array<[string, unknown]> = [
    ['Workbook', item.sourceRef?.workbook],
    ['Source sheet', item.sourceRef?.sheet],
    ['Source row', item.sourceRef?.row],
    ['Source ID', item.sourceRef?.sourceId],
    ['Source note', item.sourceRef?.note],
  ]

  return (
    <div className="row-detail-panel">
      <div className="row-detail-heading">
        <div>
          <span className="code">{item.itemCode}</span>
          <h3>{item.title}</h3>
        </div>
        <StatusPill item={item} />
      </div>
      <DetailSection title="Core fields" rows={coreRows} />
      <DetailSection title="Module details" rows={detailRows.length ? detailRows : [['Details', 'No module-specific details captured.']]} />
      <DetailSection title="Source reference" rows={sourceRows} />
    </div>
  )
}

function DetailSection({ title, rows }: { title: string; rows: Array<[string, unknown]> }) {
  return (
    <section className="detail-section">
      <h4>{title}</h4>
      <div className="detail-grid">
        {rows
          .filter(([, value]) => value !== null && value !== undefined && value !== '')
          .map(([label, value]) => (
            <div key={`${title}-${label}`}>
              <span>{label}</span>
              <strong>{formatCellValue(value)}</strong>
            </div>
          ))}
      </div>
    </section>
  )
}

function filterTableItems(items: GovernanceItem[], filters: ColumnFilters) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim())
  if (activeFilters.length === 0) return items
  return items.filter((item) => activeFilters.every(([column, value]) => (
    tableSearchText(readTableColumn(item, column)).includes(value.trim().toLowerCase())
  )))
}

function sortTableItems(items: GovernanceItem[], sort: TableSort) {
  if (!sort) return items
  return [...items].sort((a, b) => {
    const left = sortableValue(readTableColumn(a, sort.column, true))
    const right = sortableValue(readTableColumn(b, sort.column, true))
    const result = compareSortableValues(left, right)
    return sort.direction === 'asc' ? result : -result
  })
}

function readTableColumn(item: GovernanceItem, column: string, raw = false) {
  if (column === 'source') return item.sourceRef?.sheet ?? 'Manual'
  if (raw && (column === 'lastUpdatedAt' || column === 'dueDate')) return item[column]
  return readItemColumn(item, column)
}

function tableSearchText(value: unknown) {
  return formatCellValue(value).toLowerCase()
}

function sortableValue(value: unknown) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  const text = String(value)
  const dateValue = Date.parse(text)
  if (/^\d{4}-\d{2}-\d{2}/.test(text) && !Number.isNaN(dateValue)) return dateValue
  return text.toLowerCase()
}

function compareSortableValues(left: string | number, right: string | number) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' })
}

function joinDetailParts(parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(' · ')
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

function isPersistedItemId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function formatTimestamp(value?: string) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function updateTypeLabel(value: string) {
  const labels: Record<string, string> = {
    comment: 'comment',
    status_update: 'status update',
    decision_note: 'decision note',
  }
  return labels[value] ?? value.replaceAll('_', ' ')
}

function calculateTriageQualityScore(output: AiTriageOutput, inputCount: number) {
  if (inputCount <= 0) return 100
  const penalty = output.findings.reduce((total, finding) => {
    const weights: Record<AiTriageSeverity, number> = { critical: 12, high: 8, medium: 4, low: 2 }
    return total + weights[finding.severity]
  }, 0)
  return Math.max(0, Math.min(100, Math.round(100 - penalty / Math.max(1, inputCount / 8))))
}

function severityLabel(severity: AiTriageSeverity) {
  const labels: Record<AiTriageSeverity, string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  }
  return labels[severity]
}

function formatSourceRef(sourceRef?: AiTriageOutput['findings'][number]['sourceRef']) {
  if (!sourceRef) return 'No source reference'
  const parts = [
    sourceRef.workbook,
    sourceRef.sheet,
    sourceRef.row ? `row ${sourceRef.row}` : undefined,
    sourceRef.sourceId,
    sourceRef.note,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'No source reference'
}

function isExternalAiDraft(draft: ReportDraft) {
  const confidenceNotes = draft.confidenceNotes?.toLowerCase() ?? ''
  return draft.id.startsWith('ai-') && !confidenceNotes.includes('without external ai') && !confidenceNotes.includes('deterministic fallback')
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
  const riskTone = riskLevelTone(item.ragStatus ?? item.priority)
  const tone = closed ? 'closed' : riskTone ?? 'green'
  return <span className={`status-pill tone-${tone}`}>{item.status}</span>
}

function RiskLevelBadge({ value }: { value: unknown }) {
  const label = formatCellValue(value)
  if (!label || label === 'Not set') return <span>{label}</span>
  const tone = riskLevelTone(label)
  return tone ? <span className={`risk-level-badge tone-${tone}`}>{label}</span> : <span>{label}</span>
}

function ItemDrawer({
  item,
  config,
  taxonomies,
  user,
  onClose,
  onSave,
}: {
  item: GovernanceItem
  config: ModuleConfig
  taxonomies: TaxonomyEntry[]
  user: UserProfile
  onClose: () => void
  onSave: (item: GovernanceItem) => void
}) {
  const [draft, setDraft] = useState<GovernanceItem>(item)
  const [updates, setUpdates] = useState<CommentUpdate[]>([])
  const [updateBody, setUpdateBody] = useState('')
  const [updateType, setUpdateType] = useState('comment')
  const [updatesMessage, setUpdatesMessage] = useState('')
  const [updatesError, setUpdatesError] = useState('')
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([])
  const [attachmentMessage, setAttachmentMessage] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [attachmentsLoading, setAttachmentsLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const editable = canEditItem(user, item)

  useEffect(() => {
    async function loadUpdates() {
      if (!isSupabaseConfigured || !isPersistedItemId(item.id)) {
        setUpdates([])
        return
      }

      setUpdatesLoading(true)
      setUpdatesError('')
      try {
        const itemUpdates = await fetchCommentUpdates(item.id)
        setUpdates(itemUpdates)
      } catch (error) {
        console.error(error)
        setUpdatesError(readErrorMessage(error, 'Updates could not be loaded.'))
      } finally {
        setUpdatesLoading(false)
      }
    }

    void loadUpdates()
  }, [item.id])

  useEffect(() => {
    async function loadAttachments() {
      if (!isSupabaseConfigured || !isPersistedItemId(item.id)) {
        setAttachments([])
        return
      }

      setAttachmentsLoading(true)
      setAttachmentError('')
      try {
        const itemAttachments = await fetchAttachments(item.id)
        setAttachments(itemAttachments)
      } catch (error) {
        console.error(error)
        setAttachmentError(readErrorMessage(error, 'Attachments could not be loaded.'))
      } finally {
        setAttachmentsLoading(false)
      }
    }

    void loadAttachments()
  }, [item.id])

  function updateField(key: string, value: string) {
    if (key in draft) {
      setDraft((current) => ({ ...current, [key]: value }))
    } else {
      setDraft((current) => ({ ...current, details: { ...current.details, [key]: value } }))
    }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!updateBody.trim() || !isPersistedItemId(item.id)) return

    setUpdatesMessage('')
    setUpdatesError('')
    setUpdatesLoading(true)
    try {
      const createdUpdate = await addCommentUpdate(item.id, updateBody.trim(), updateType)
      setUpdates((current) => [createdUpdate, ...current])
      setUpdateBody('')
      setUpdatesMessage(`${updateType === 'comment' ? 'Comment' : 'Update'} added.`)
      try {
        await logAuditEvent({
          eventType: updateType === 'comment' ? 'comment_added' : 'status_update_added',
          tableName: 'comments_updates',
          recordId: createdUpdate.id,
          metadata: {
            itemId: item.id,
            itemCode: item.itemCode,
            module: item.module,
            updateType,
          },
        })
      } catch (auditError) {
        console.warn(auditError)
      }
    } catch (error) {
      console.error(error)
      setUpdatesError(readErrorMessage(error, 'Update could not be added.'))
    } finally {
      setUpdatesLoading(false)
    }
  }

  async function handleAttachmentUpload(file?: File) {
    if (!file || !isPersistedItemId(item.id)) return

    setAttachmentMessage('')
    setAttachmentError('')
    setUploadingAttachment(true)
    try {
      const attachment = await uploadAttachment(item.id, file)
      setAttachments((current) => [attachment, ...current])
      setAttachmentMessage(`${attachment.fileName} uploaded.`)
    } catch (error) {
      console.error(error)
      setAttachmentError(readErrorMessage(error, 'Attachment could not be uploaded.'))
    } finally {
      setUploadingAttachment(false)
    }
  }

  async function downloadAttachment(attachment: AttachmentRecord) {
    setAttachmentMessage('')
    setAttachmentError('')
    try {
      const url = await createAttachmentDownloadUrl(attachment.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (error) {
      console.error(error)
      setAttachmentError(readErrorMessage(error, 'Attachment download link could not be created.'))
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
              {activeTaxonomyValues(taxonomies, 'workstream', workstreamOptions).map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Phase
            <select disabled={!editable} value={draft.phase ?? ''} onChange={(event) => updateField('phase', event.target.value)}>
              <option value="">Not set</option>
              {activeTaxonomyValues(taxonomies, 'phase', phaseOptions).map((option) => (
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
                    {fieldOptions(field, taxonomies).map((option) => (
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

        <section className="updates-panel">
          <PanelHeader title="Comments and updates" icon={Activity} />
          {!isPersistedItemId(item.id) ? (
            <div className="empty-state">Save this item before adding comments or updates.</div>
          ) : (
            <>
              {editable && (
                <form className="update-form" onSubmit={submitUpdate}>
                  <select value={updateType} onChange={(event) => setUpdateType(event.target.value)}>
                    <option value="comment">Comment</option>
                    <option value="status_update">Status update</option>
                    <option value="decision_note">Decision note</option>
                  </select>
                  <textarea value={updateBody} onChange={(event) => setUpdateBody(event.target.value)} placeholder="Add a concise update for the governance history" />
                  <button className="button primary" disabled={updatesLoading || !updateBody.trim()} type="submit">Add update</button>
                </form>
              )}
              {updatesMessage && <div className="notice-line compact">{updatesMessage}</div>}
              {updatesError && <div className="error-line compact">{updatesError}</div>}
              {updatesLoading && <div className="loading-line compact">Loading updates</div>}
              <div className="updates-list">
                {updates.length === 0 && !updatesLoading ? (
                  <div className="empty-state">No comments or updates yet.</div>
                ) : (
                  updates.map((update) => (
                    <article key={update.id}>
                      <div>
                        <strong>{update.authorName ?? update.authorEmail ?? 'NexBill user'}</strong>
                        <span>{formatTimestamp(update.createdAt)}</span>
                      </div>
                      <p>{update.body}</p>
                      <em>{updateTypeLabel(update.updateType)}</em>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </section>

        <section className="attachments-panel">
          <PanelHeader title="Evidence and attachments" icon={FileSpreadsheet} />
          {!isPersistedItemId(item.id) ? (
            <div className="empty-state">Save this item before uploading evidence.</div>
          ) : (
            <>
              {editable && (
                <div className="attachment-upload">
                  <Upload size={18} />
                  <input
                    type="file"
                    disabled={uploadingAttachment}
                    onChange={(event) => void handleAttachmentUpload(event.target.files?.[0])}
                  />
                </div>
              )}
              {attachmentMessage && <div className="notice-line compact">{attachmentMessage}</div>}
              {attachmentError && <div className="error-line compact">{attachmentError}</div>}
              {attachmentsLoading && <div className="loading-line compact">Loading attachments</div>}
              <div className="attachment-list">
                {attachments.length === 0 && !attachmentsLoading ? (
                  <div className="empty-state">No evidence attached yet.</div>
                ) : (
                  attachments.map((attachment) => (
                    <article key={attachment.id}>
                      <div>
                        <strong>{attachment.fileName}</strong>
                        <span>{attachment.uploadedByName ?? attachment.uploadedByEmail ?? 'NexBill user'} · {formatTimestamp(attachment.createdAt)}</span>
                      </div>
                      <button className="button secondary" onClick={() => void downloadAttachment(attachment)}>
                        <Download size={16} />
                        Download
                      </button>
                    </article>
                  ))
                )}
              </div>
            </>
          )}
        </section>

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
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>(() => (isSupabaseConfigured ? [] : createDemoReportSnapshots(demoReports)))
  const [aiDrafts, setAiDrafts] = useState<AiReportDraftRecord[]>([])
  const [reportMessage, setReportMessage] = useState('')
  const [reportError, setReportError] = useState('')

  const sourceFilters = useMemo(() => ({
    reportType,
    recordCount: items.length,
    modules: [...new Set(items.map((item) => item.module))],
    generatedForRole: user.role,
    generatedForWorkstream: user.workstream ?? 'All workstreams',
  }), [items, reportType, user.role, user.workstream])

  const loadReportHistory = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSnapshots(createDemoReportSnapshots(demoReports))
      setAiDrafts([])
      return
    }

    setHistoryLoading(true)
    setReportError('')
    try {
      const [remoteSnapshots, remoteDrafts] = await Promise.all([
        fetchReportSnapshots(20),
        fetchAiReportDrafts(20),
      ])
      setSnapshots(remoteSnapshots)
      setAiDrafts(remoteDrafts)
    } catch (error) {
      console.error(error)
      setReportError(readErrorMessage(error, 'Report history could not be loaded.'))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadReportHistory()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadReportHistory])

  async function generateReport() {
    setIsGenerating(true)
    setReportMessage('')
    setReportError('')
    try {
      const response = await fetch('/.netlify/functions/ai-report-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, items, user }),
      })
      if (!response.ok) throw new Error('AI function unavailable')
      const data = (await response.json()) as ReportDraft
      const usedExternalAi = isExternalAiDraft(data)
      setDraft(data)
      if (isSupabaseConfigured) {
        try {
          const savedDraft = await saveAiReportDraft(data, items, {
            reportType,
            sourceFilters,
            sourceRecordCount: items.length,
          })
          setAiDrafts((current) => [savedDraft, ...current])
          setReportMessage(usedExternalAi ? 'AI draft generated and saved to draft history.' : 'Deterministic draft generated and saved because AI environment was not available to the function.')
          await logAuditEvent({
            eventType: usedExternalAi ? 'ai_report_draft_generated' : 'deterministic_report_draft_generated',
            tableName: 'ai_report_drafts',
            recordId: savedDraft.id,
            metadata: {
              reportType,
              title: data.title,
              sourceRecordCount: items.length,
              usedExternalAi,
              confidenceNotes: data.confidenceNotes,
            },
          })
        } catch (saveError) {
          console.error(saveError)
          setReportError(`Draft generated, but history save failed: ${readErrorMessage(saveError, 'Unable to save AI draft.')}`)
        }
      } else {
        setReportMessage(usedExternalAi ? 'AI draft generated in demo mode.' : 'Deterministic draft generated in demo mode.')
      }
    } catch (error) {
      console.error(error)
      const fallbackDraft = generateLocalReport(items, reportType)
      setDraft(fallbackDraft)
      setReportError('AI function unavailable. A deterministic draft was generated locally.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function saveSnapshot() {
    setIsSavingSnapshot(true)
    setReportMessage('')
    setReportError('')
    try {
      if (!isSupabaseConfigured) {
        const demoSnapshot = createLocalReportSnapshot(draft, sourceFilters)
        setSnapshots((current) => [demoSnapshot, ...current])
        setReportMessage('Snapshot saved locally in demo mode.')
        return
      }

      const snapshot = await saveReportSnapshot(draft, sourceFilters)
      setSnapshots((current) => [snapshot, ...current])
      setReportMessage('Report snapshot saved.')
      await logAuditEvent({
        eventType: 'report_snapshot_saved',
        tableName: 'report_snapshots',
        recordId: snapshot.id,
        metadata: {
          reportType: snapshot.reportType,
          title: snapshot.title,
          sourceRecordCount: items.length,
        },
      })
    } catch (error) {
      console.error(error)
      setReportError(readErrorMessage(error, 'Report snapshot could not be saved.'))
    } finally {
      setIsSavingSnapshot(false)
    }
  }

  function loadSnapshot(snapshot: ReportSnapshot) {
    setDraft(snapshot.body)
    setReportType(snapshot.reportType)
    setReportMessage(`Loaded snapshot from ${formatTimestamp(snapshot.createdAt)}.`)
  }

  function loadAiDraft(record: AiReportDraftRecord) {
    setDraft(record.output)
    setReportType(record.reportType)
    setReportMessage(`Loaded AI draft from ${formatTimestamp(record.createdAt)}.`)
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
        <div className="report-actions">
          <button className="button primary" onClick={generateReport} disabled={isGenerating}>
            <Bot size={16} />
            {isGenerating ? 'Generating' : 'Generate draft'}
          </button>
          <button className="button secondary" onClick={saveSnapshot} disabled={isSavingSnapshot}>
            <Archive size={16} />
            {isSavingSnapshot ? 'Saving' : 'Save snapshot'}
          </button>
          <button className="button secondary" onClick={() => void loadReportHistory()} disabled={historyLoading}>
            <RefreshCw size={16} />
            History
          </button>
        </div>
      </section>
      {reportMessage && <div className="notice-line">{reportMessage}</div>}
      {reportError && <div className="error-line">{reportError}</div>}

      <section className="report-layout">
        <article className="report-document">
          <p className="eyebrow">{reportTypeLabel(draft.type)}</p>
          <h2>{draft.title}</h2>
          <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} />
          <ReportBlock title="Risks and Issues" items={draft.risks} onChange={(risks) => setDraft((current) => ({ ...current, risks }))} />
          <ReportBlock title="Decisions" items={draft.decisions} onChange={(decisions) => setDraft((current) => ({ ...current, decisions }))} />
          <ReportBlock title="Next Steps" items={draft.nextSteps} onChange={(nextSteps) => setDraft((current) => ({ ...current, nextSteps }))} />
          {draft.confidenceNotes && (
            <div className="confidence-note">
              <Bot size={16} />
              <span>{draft.confidenceNotes}</span>
            </div>
          )}
        </article>

        <aside className="panel citation-panel">
          <PanelHeader title="Sources" icon={FileSpreadsheet} />
          <div className="citation-list">
            {draft.citations.map((citation) => (
              <div key={`${citation.itemCode}-${citation.title}`}>
                <span className="code">{citation.itemCode}</span>
                <strong>{citation.title}</strong>
                <p>{citation.source?.workbook ?? 'Manual'} · {citation.source?.sheet ?? citation.module}{citation.source?.row ? ` · row ${citation.source.row}` : ''}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="report-history-grid">
        <article className="panel">
          <PanelHeader title="Saved snapshots" icon={Archive} />
          <div className="history-list">
            {snapshots.length === 0 ? (
              <div className="empty-state">No report snapshots saved yet.</div>
            ) : (
              snapshots.map((snapshot) => (
                <button key={snapshot.id} onClick={() => loadSnapshot(snapshot)}>
                  <span>{reportTypeLabel(snapshot.reportType)}</span>
                  <strong>{snapshot.title}</strong>
                  <em>{formatTimestamp(snapshot.createdAt)}</em>
                </button>
              ))
            )}
          </div>
        </article>
        <article className="panel">
          <PanelHeader title="AI draft history" icon={Bot} />
          <div className="history-list">
            {aiDrafts.length === 0 ? (
              <div className="empty-state">No saved AI drafts yet.</div>
            ) : (
              aiDrafts.map((record) => (
                <button key={record.id} onClick={() => loadAiDraft(record)}>
                  <span>{reportTypeLabel(record.reportType)}</span>
                  <strong>{record.output.title}</strong>
                  <em>{formatTimestamp(record.createdAt)}</em>
                </button>
              ))
            )}
          </div>
        </article>
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

function createLocalReportSnapshot(draft: ReportDraft, sourceFilters: Record<string, unknown>): ReportSnapshot {
  return {
    id: `local-snapshot-${crypto.randomUUID()}`,
    reportType: draft.type,
    title: draft.title,
    body: draft,
    sourceFilters,
    createdAt: new Date().toISOString(),
  }
}

function createDemoReportSnapshots(reports: ReportDraft[]): ReportSnapshot[] {
  return reports.map((report) => createLocalReportSnapshot(report, {
    demo: true,
    source: 'demoReports',
  }))
}

function createDemoProgramSitePages(items: GovernanceItem[]): ProgramSitePageRecord[] {
  const seededPages = items
    .filter((item) => item.module === 'program_site')
    .slice(0, 8)
    .map((item) => ({
      id: `local-page-${item.itemCode}`,
      title: item.title,
      audience: String(item.details.audience ?? 'Delivery Teams'),
      contentType: String(item.details.contentType ?? 'Announcement'),
      body: item.summary,
      sourceUrl: readOptionalString(item.details.url),
      ownerId: undefined,
      status: isClosedStatus(item.status, item.closedAt) ? 'Archived' : 'Published',
      createdAt: item.lastUpdatedAt,
      updatedAt: item.lastUpdatedAt,
    }))

  if (seededPages.length) return seededPages

  return siteAudienceOptions.map((audience, index) => ({
    id: `local-page-${index}`,
    title: `${audience} landing update`,
    audience,
    contentType: index === 3 ? 'Forum Pack' : 'Announcement',
    body: 'Demo content generated from local sample data. Replace this with live Program Site copy after Supabase is connected.',
    sourceUrl: undefined,
    ownerId: undefined,
    status: index === 0 ? 'Published' : 'Draft',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }))
}

function mergeProgramSitePages(current: ProgramSitePageRecord[], records: ProgramSitePageRecord[]) {
  const incomingIds = new Set(records.map((record) => record.id))
  return [...records, ...current.filter((record) => !incomingIds.has(record.id))]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function ProgramSitePage({
  items,
  user,
  taxonomies,
  gridEditRoles,
  onSaveItem,
}: {
  items: GovernanceItem[]
  user: UserProfile
  taxonomies: TaxonomyEntry[]
  gridEditRoles: Role[]
  onSaveItem: (item: GovernanceItem) => void
}) {
  const siteItems = useMemo(() => items.filter((item) => item.module === 'program_site' || item.module === 'documents'), [items])
  const [editingItem, setEditingItem] = useState<GovernanceItem | null>(null)
  const [editingPage, setEditingPage] = useState<ProgramSitePageRecord | null>(null)
  const [pages, setPages] = useState<ProgramSitePageRecord[]>(() => (isSupabaseConfigured ? [] : createDemoProgramSitePages(siteItems)))
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>(() => (isSupabaseConfigured ? [] : createDemoReportSnapshots(demoReports).slice(0, 6)))
  const [isLoadingReports, setIsLoadingReports] = useState(false)
  const [isLoadingPages, setIsLoadingPages] = useState(false)
  const [isSavingPage, setIsSavingPage] = useState(false)
  const [siteMessage, setSiteMessage] = useState('')
  const [siteError, setSiteError] = useState('')
  const editable = canGridEdit(user, gridEditRoles)

  const loadSnapshots = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSnapshots(createDemoReportSnapshots(demoReports).slice(0, 6))
      return
    }

    setIsLoadingReports(true)
    setSiteError('')
    try {
      const remoteSnapshots = await fetchReportSnapshots(8)
      setSnapshots(remoteSnapshots)
    } catch (error) {
      console.error(error)
      setSiteError(readErrorMessage(error, 'Published report snapshots could not be loaded.'))
    } finally {
      setIsLoadingReports(false)
    }
  }, [])

  const loadPages = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setPages(createDemoProgramSitePages(siteItems))
      return
    }

    setIsLoadingPages(true)
    setSiteError('')
    try {
      const remotePages = await fetchProgramSitePages()
      setPages(remotePages)
    } catch (error) {
      console.error(error)
      setSiteError(readErrorMessage(error, 'Program site pages could not be loaded.'))
    } finally {
      setIsLoadingPages(false)
    }
  }, [siteItems])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSnapshots()
      void loadPages()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadPages, loadSnapshots])

  function createSiteContent(audience = 'Delivery Teams') {
    setEditingPage({
      id: `local-site-page-${crypto.randomUUID()}`,
      title: '',
      audience,
      contentType: 'Announcement',
      body: '',
      sourceUrl: '',
      ownerId: user.id,
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }

  async function saveProgramSitePage(page: ProgramSitePageRecord) {
    if (!editable || !page.title.trim()) return

    setIsSavingPage(true)
    setSiteMessage('')
    setSiteError('')
    try {
      const savedPage = isSupabaseConfigured
        ? await upsertProgramSitePage(page)
        : { ...page, updatedAt: new Date().toISOString() }
      setPages((current) => mergeProgramSitePages(current, [savedPage]))
      setEditingPage(null)
      setSiteMessage(`${savedPage.title} saved to Program Site.`)
      try {
        await logAuditEvent({
          eventType: 'program_site_page_saved',
          tableName: 'program_site_pages',
          recordId: isPersistedItemId(savedPage.id) ? savedPage.id : undefined,
          metadata: {
            title: savedPage.title,
            audience: savedPage.audience,
            status: savedPage.status,
          },
        })
      } catch (auditError) {
        console.warn(auditError)
      }
    } catch (error) {
      console.error(error)
      setSiteError(readErrorMessage(error, 'Program site page could not be saved.'))
    } finally {
      setIsSavingPage(false)
    }
  }

  return (
    <div className="page-stack">
      <section className="site-command">
        <div>
          <p className="eyebrow">Program Site</p>
          <h2>Audience-ready content hub</h2>
          <p>Maintain page content, source links, audience status, and published governance reports from controlled records.</p>
        </div>
        <div>
          <button className="button secondary" onClick={() => void loadPages()} disabled={isLoadingPages}>
            <RefreshCw size={16} />
            Refresh pages
          </button>
          <button className="button secondary" onClick={() => void loadSnapshots()} disabled={isLoadingReports}>
            <RefreshCw size={16} />
            Refresh reports
          </button>
          {editable && (
            <button className="button primary" onClick={() => createSiteContent()}>
              <Plus size={16} />
              New site content
            </button>
          )}
        </div>
      </section>
      {!editable && (
        <div className="permission-line">
          <Lock size={16} />
          Your role can read Program Site content. Editing is limited to configured grid edit roles.
        </div>
      )}
      {siteMessage && <div className="notice-line">{siteMessage}</div>}
      {siteError && <div className="error-line">{siteError}</div>}

      <section className="program-site-grid">
        {siteAudienceOptions.map((audience) => (
          <article key={audience} className="panel">
            <div className="site-group-header">
              <PanelHeader title={audience} icon={BookOpen} />
              {editable && (
                <button className="icon-button" onClick={() => createSiteContent(audience)} aria-label={`New ${audience} page`}>
                  <Plus size={16} />
                </button>
              )}
            </div>
            {isLoadingPages ? <div className="loading-line compact">Loading pages</div> : null}
            <ProgramSitePageList
              pages={pages.filter((page) => page.audience === audience).slice(0, 6)}
              editable={editable}
              onEdit={setEditingPage}
            />
          </article>
        ))}
      </section>

      <section className="panel">
        <PanelHeader title="Register-sourced site content" icon={BookOpen} />
        <SiteContentList
          items={siteItems.slice(0, 8)}
          user={user}
          onEdit={setEditingItem}
        />
      </section>

      <section className="panel">
        <PanelHeader title="Key documents and source links" icon={FileSpreadsheet} />
        <SiteContentList
          items={items.filter((item) => item.module === 'documents').slice(0, 8)}
          user={user}
          onEdit={setEditingItem}
        />
      </section>

      <section className="panel">
        <PanelHeader title="Published reports" icon={BarChart3} />
        {isLoadingReports && <div className="loading-line compact">Loading report snapshots</div>}
        <div className="published-report-list">
          {snapshots.length === 0 && !isLoadingReports ? (
            <div className="empty-state">No saved report snapshots are available yet.</div>
          ) : (
            snapshots.map((snapshot) => (
              <article key={snapshot.id}>
                <div>
                  <span className="code">{reportTypeLabel(snapshot.reportType)}</span>
                  <strong>{snapshot.title}</strong>
                  <p>{snapshot.body.summary}</p>
                </div>
                <div className="item-meta">
                  <span>{formatTimestamp(snapshot.createdAt)}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <RiskMatrixReference />

      {editingItem && (
        <ItemDrawer
          item={editingItem}
          config={moduleConfigByKey[editingItem.module]}
          taxonomies={taxonomies}
          user={user}
          onClose={() => setEditingItem(null)}
          onSave={(item) => {
            onSaveItem(item)
            setEditingItem(null)
            setSiteMessage(`${item.itemCode} saved. Refresh data after Supabase confirms if the register view is already open.`)
          }}
        />
      )}

      {editingPage && (
        <ProgramSitePageDrawer
          page={editingPage}
          canEdit={editable}
          isSaving={isSavingPage}
          onClose={() => setEditingPage(null)}
          onSave={(page) => void saveProgramSitePage(page)}
        />
      )}
    </div>
  )
}

function RiskMatrixReference() {
  const probabilitiesByScore = new Map(riskProbabilityDefinitions.map((definition) => [definition.score, definition]))

  return (
    <section className="panel risk-matrix-reference">
      <PanelHeader title="Reference Project Risk Matrix" icon={Gauge} />
      <p className="risk-matrix-intro">
        The following definitions help assess risk severity and guide mitigation decisions based on potential consequences. Source: Reference Project Risk Matrix.
      </p>

      <div className="risk-matrix-layout">
        <div className="risk-matrix-table-wrap">
          <table className="risk-matrix-table" aria-label="Project risk matrix">
            <thead>
              <tr>
                <th>Probability</th>
                {riskImpactLabels.map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {riskMatrixRows.map((row) => {
                const probability = probabilitiesByScore.get(row.probability)
                return (
                  <tr key={row.probability}>
                    <th>
                      <strong>{row.probability}. {probability?.label}</strong>
                    </th>
                    {row.levels.map((level, index) => (
                      <td key={`${row.probability}-${index}`} className={`risk-cell tone-${riskLevelTone(level) ?? 'medium'}`}>
                        {level}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="risk-definition-panel">
          <h3>Priority response standard</h3>
          <div className="risk-definition-list">
            {riskLevelDefinitions.map((definition) => (
              <article key={definition.level}>
                <span className={`risk-level-badge tone-${definition.tone}`}>{definition.rank}. {definition.level}</span>
                <p>{definition.guidance}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="risk-probability-list">
        {riskProbabilityDefinitions.map((definition) => (
          <article key={definition.score}>
            <strong>{definition.score}. {definition.label}</strong>
            <span>{definition.definition}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

function ProgramSitePageList({
  pages,
  editable,
  onEdit,
}: {
  pages: ProgramSitePageRecord[]
  editable: boolean
  onEdit: (page: ProgramSitePageRecord) => void
}) {
  if (pages.length === 0) return <div className="empty-state">No pages for this audience yet.</div>

  return (
    <div className="site-content-list">
      {pages.map((page) => (
        <article key={page.id}>
          <div>
            <span className="code">{page.status}</span>
            <strong>{page.title}</strong>
            <p>{page.body || 'No body content has been added yet.'}</p>
            <div className="site-tags">
              <span>{page.audience}</span>
              <span>{page.contentType}</span>
              <span>Updated {formatTimestamp(page.updatedAt)}</span>
            </div>
            {page.sourceUrl && <a href={page.sourceUrl} target="_blank" rel="noreferrer">{page.sourceUrl}</a>}
          </div>
          <div className="site-content-actions">
            <span className={`status-pill tone-${page.status === 'Published' ? 'green' : page.status === 'Archived' ? 'closed' : 'amber'}`}>{page.status}</span>
            <button className="icon-button" onClick={() => onEdit(page)} aria-label={`Edit ${page.title}`} disabled={!editable}>
              <Pencil size={16} />
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function ProgramSitePageDrawer({
  page,
  canEdit,
  isSaving,
  onClose,
  onSave,
}: {
  page: ProgramSitePageRecord
  canEdit: boolean
  isSaving: boolean
  onClose: () => void
  onSave: (page: ProgramSitePageRecord) => void
}) {
  const [draft, setDraft] = useState<ProgramSitePageRecord>(page)

  function updateDraft<K extends keyof ProgramSitePageRecord>(key: K, value: ProgramSitePageRecord[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <div className="drawer-backdrop">
      <aside className="drawer">
        <div className="drawer-header">
          <div>
            <span className="code">Program Site</span>
            <h2>{draft.title || 'New page'}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!canEdit && (
          <div className="permission-line compact">
            <Lock size={16} />
            This page is read only for your current role.
          </div>
        )}

        <div className="form-grid">
          <label className="full">
            Page title
            <input disabled={!canEdit} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} />
          </label>
          <label>
            Audience
            <select disabled={!canEdit} value={draft.audience} onChange={(event) => updateDraft('audience', event.target.value)}>
              {siteAudienceOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Content type
            <select disabled={!canEdit} value={draft.contentType} onChange={(event) => updateDraft('contentType', event.target.value)}>
              {siteContentTypeOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            Publish status
            <select disabled={!canEdit} value={draft.status} onChange={(event) => updateDraft('status', event.target.value)}>
              {siteStatusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="full">
            Source URL
            <input disabled={!canEdit} value={draft.sourceUrl ?? ''} onChange={(event) => updateDraft('sourceUrl', event.target.value)} placeholder="https://..." />
          </label>
          <label className="full">
            Body
            <textarea disabled={!canEdit} value={draft.body ?? ''} onChange={(event) => updateDraft('body', event.target.value)} />
          </label>
        </div>

        <div className="source-box">
          <Activity size={16} />
          <span>Version marker: last updated {formatTimestamp(draft.updatedAt)}. Detailed change history is captured in Audit Log.</span>
        </div>

        <div className="drawer-actions">
          <button className="button secondary" onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={!canEdit || isSaving || !draft.title.trim()} onClick={() => onSave(draft)}>
            {isSaving ? 'Saving' : 'Save page'}
          </button>
        </div>
      </aside>
    </div>
  )
}

function SiteContentList({
  items,
  user,
  onEdit,
}: {
  items: GovernanceItem[]
  user: UserProfile
  onEdit: (item: GovernanceItem) => void
}) {
  if (items.length === 0) return <div className="empty-state">No content in this view yet.</div>

  return (
    <div className="site-content-list">
      {items.map((item) => {
        const sourceUrl = String(item.details.url ?? item.details.documentLocation ?? '')
        return (
          <article key={item.id}>
            <div>
              <span className="code">{item.itemCode}</span>
              <strong>{item.title}</strong>
              <p>{item.summary}</p>
              <div className="site-tags">
                <span>{String(item.details.audience ?? item.details.documentType ?? 'General')}</span>
                <span>{String(item.details.contentType ?? item.workstream ?? 'Reference')}</span>
              </div>
              {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a>}
            </div>
            <div className="site-content-actions">
              <StatusPill item={item} />
              <button className="icon-button" onClick={() => onEdit(item)} aria-label={`Edit ${item.itemCode}`} disabled={!canEditItem(user, item)}>
                <Pencil size={16} />
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ImportPage({
  items,
  onImport,
  onImportCommitted,
}: {
  items: GovernanceItem[]
  onImport: (records: GovernanceItem[]) => void
  onImportCommitted: () => Promise<GovernanceItem[]>
}) {
  const [previews, setPreviews] = useState<Awaited<ReturnType<typeof previewWorkbook>>>([])
  const [status, setStatus] = useState('')
  const [commitResult, setCommitResult] = useState<{
    inserted: number
    updated: number
    skipped: number
    requested?: number
    verified?: number
    totalItems?: number | null
    visibleAfterRefresh?: number
    missingAfterRefresh?: string[]
    missingItemCodes?: string[]
    message?: string
  } | null>(null)
  const [commitError, setCommitError] = useState('')
  const [isCommitting, setIsCommitting] = useState(false)

  const importPlan = useMemo(() => {
    const records = previews.flatMap((preview) => preview.mappedRecords)
    const existingCodes = new Set(items.map((item) => item.itemCode))
    const existingRecords = records.filter((record) => existingCodes.has(record.itemCode))
    const newRecords = records.filter((record) => !existingCodes.has(record.itemCode))
    const missingHeaders = previews.reduce((sum, preview) => sum + preview.missingHeaders.length, 0)

    return {
      records,
      existingRecords,
      newRecords,
      missingHeaders,
      moduleCount: new Set(records.map((record) => record.module)).size,
    }
  }, [items, previews])

  async function handleFile(file?: File) {
    if (!file) return
    setStatus('Reading workbook')
    setCommitResult(null)
    setCommitError('')
    try {
      const preview = await previewWorkbook(file)
      setPreviews(preview)
      const mappedCount = preview.reduce((sum, item) => sum + item.mappedRecords.length, 0)
      setStatus(`${mappedCount} records mapped. Review the preview, then confirm import.`)
    } catch (error) {
      console.error(error)
      setPreviews([])
      setStatus('Workbook preview failed')
    }
  }

  async function commitPreview() {
    if (importPlan.records.length === 0) return
    setIsCommitting(true)
    setCommitResult(null)
    setCommitError('')
    setStatus('Committing import')
    try {
      if (isSupabaseConfigured) {
        const {
          data: { session },
        } = await supabase!.auth.getSession()
        if (!session?.access_token) throw new Error('Sign in again before importing.')

        const controller = new AbortController()
        const timeout = window.setTimeout(() => controller.abort(), 60000)
        const response = await fetch('/.netlify/functions/workbook-import-commit', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ records: importPlan.records }),
          signal: controller.signal,
        }).finally(() => window.clearTimeout(timeout))
        const result = (await response.json().catch(() => ({}))) as {
          inserted?: number
          updated?: number
          skipped?: number
          requested?: number
          verified?: number
          totalItems?: number | null
          missingItemCodes?: string[]
          message?: string
          error?: string
        }
        if (!response.ok) throw new Error(result.error ?? result.message ?? 'Import commit failed')

        const baseCommitResult = {
          inserted: result.inserted ?? importPlan.newRecords.length,
          updated: result.updated ?? importPlan.existingRecords.length,
          skipped: result.skipped ?? 0,
          requested: result.requested ?? importPlan.records.length,
          verified: result.verified,
          totalItems: result.totalItems,
          missingItemCodes: result.missingItemCodes,
          message: result.message,
        }

        let refreshedItems: GovernanceItem[]
        try {
          refreshedItems = await onImportCommitted()
        } catch (refreshError) {
          setCommitResult(baseCommitResult)
          setCommitError(`Import committed, but live refresh failed: ${readErrorMessage(refreshError, 'Could not reload Supabase records.')}`)
          setStatus('Import committed, refresh failed')
          return
        }

        const refreshedCodes = new Set(refreshedItems.map((item) => item.itemCode))
        const allMissingAfterRefresh = importPlan.records
          .map((record) => record.itemCode)
          .filter((code) => !refreshedCodes.has(code))
        setCommitResult({
          ...baseCommitResult,
          visibleAfterRefresh: importPlan.records.length - allMissingAfterRefresh.length,
          missingAfterRefresh: allMissingAfterRefresh.slice(0, 20),
        })
        setStatus(`Import confirmed and refreshed: ${refreshedItems.length} live records loaded.`)
      } else {
        onImport(importPlan.newRecords)
        setCommitResult({
          inserted: importPlan.newRecords.length,
          updated: 0,
          skipped: importPlan.existingRecords.length,
          message: 'Demo mode import only updates the browser state.',
        })
        setStatus(`${importPlan.newRecords.length} new records added locally.`)
      }
    } catch (error) {
      console.error(error)
      const message = readErrorMessage(error, 'Import commit failed.')
      setCommitError(message === 'The operation was aborted.' ? 'Import commit timed out after 60 seconds. Try again or reduce the workbook size.' : message)
      setStatus('Import commit failed')
    } finally {
      setIsCommitting(false)
    }
  }

  function clearPreview() {
    setPreviews([])
    setCommitResult(null)
    setCommitError('')
    setStatus('')
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
        <button className="button secondary" disabled={previews.length === 0 || isCommitting} onClick={clearPreview}>Clear preview</button>
      </section>

      {previews.length > 0 && (
        <section className="panel import-review">
          <div>
            <PanelHeader title="Import review" icon={CheckCircle2} />
            <p>
              Confirming import will upsert records by Item ID, preserve source sheet references, and update the live Supabase register.
            </p>
          </div>
          <div className="import-stats">
            <div>
              <strong>{importPlan.records.length}</strong>
              <span>mapped</span>
            </div>
            <div>
              <strong>{importPlan.newRecords.length}</strong>
              <span>new</span>
            </div>
            <div>
              <strong>{importPlan.existingRecords.length}</strong>
              <span>existing IDs</span>
            </div>
            <div>
              <strong>{importPlan.moduleCount}</strong>
              <span>modules</span>
            </div>
          </div>
          <div className="preview-actions">
            <span>{importPlan.missingHeaders} missing headers across mapped modules</span>
            <button className="button primary" disabled={isCommitting || importPlan.records.length === 0} onClick={commitPreview}>
              {isCommitting ? 'Importing' : 'Confirm import'}
            </button>
          </div>
          {commitResult && (
            <div className="import-result">
              <strong>Import complete</strong>
              <span>{commitResult.inserted} inserted · {commitResult.updated} updated · {commitResult.skipped} skipped</span>
              {typeof commitResult.verified === 'number' && (
                <span>{commitResult.verified}/{commitResult.requested ?? importPlan.records.length} records verified on Supabase.</span>
              )}
              {typeof commitResult.visibleAfterRefresh === 'number' && (
                <span>{commitResult.visibleAfterRefresh}/{importPlan.records.length} imported records visible after live refresh.</span>
              )}
              {typeof commitResult.totalItems === 'number' && <span>{commitResult.totalItems} total live records after commit.</span>}
              {commitResult.message && <p>{commitResult.message}</p>}
              {commitResult.missingItemCodes?.length ? <p>Missing on server: {commitResult.missingItemCodes.join(', ')}</p> : null}
              {commitResult.missingAfterRefresh?.length ? <p>Not visible after refresh: {commitResult.missingAfterRefresh.join(', ')}</p> : null}
            </div>
          )}
          {commitError && (
            <div className="import-result import-error">
              <strong>Import failed</strong>
              <span>{commitError}</span>
            </div>
          )}
        </section>
      )}

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

function AdminPage({
  user,
  taxonomies,
  columnSettings,
  gridEditRoles,
  onTaxonomiesChange,
}: {
  user: UserProfile
  taxonomies: TaxonomyEntry[]
  columnSettings: ColumnSettings
  gridEditRoles: Role[]
  onTaxonomiesChange: Dispatch<SetStateAction<TaxonomyEntry[]>>
}) {
  const taxonomyGroups = [
    { key: 'workstream', label: 'Workstreams' },
    { key: 'phase', label: 'Phases' },
    { key: 'priority', label: 'Priorities' },
    { key: 'rag', label: 'RAG ratings' },
    { key: 'risk_level', label: 'Risk matrix levels' },
  ]
  const [selectedGroup, setSelectedGroup] = useState(taxonomyGroups[0].key)
  const [selectedModule, setSelectedModule] = useState<ModuleKey>('actions')
  const [editingEntry, setEditingEntry] = useState<TaxonomyEntry | null>(null)
  const [taxonomyValue, setTaxonomyValue] = useState('')
  const [taxonomyLabel, setTaxonomyLabel] = useState('')
  const [taxonomySortOrder, setTaxonomySortOrder] = useState('0')
  const [adminMessage, setAdminMessage] = useState('')
  const [adminError, setAdminError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [managedProfiles, setManagedProfiles] = useState<ManagedProfile[]>(() => (isSupabaseConfigured ? [] : demoUsers.map(createDemoManagedProfile)))
  const [roleDrafts, setRoleDrafts] = useState<Record<string, { role: Role; workstream: string }>>({})
  const [selectedPermissionRole, setSelectedPermissionRole] = useState<Role | null>(null)
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false)
  const canManageTaxonomies = canGridEdit(user, gridEditRoles)
  const canManageRoles = user.role === 'super_admin'
  const selectedConfig = moduleConfigByKey[selectedModule]
  const currentEntries = taxonomies
    .filter((entry) => entry.groupKey === selectedGroup)
    .sort((a, b) => a.sortOrder - b.sortOrder || taxonomyDisplayLabel(a).localeCompare(taxonomyDisplayLabel(b)))
  const selectedColumns = resolveModuleColumns(selectedConfig, columnSettings)

  const loadManagedProfileList = useCallback(async () => {
    if (!isSupabaseConfigured) {
      const demoProfiles = demoUsers.map(createDemoManagedProfile)
      setManagedProfiles(demoProfiles)
      setRoleDrafts(createRoleDrafts(demoProfiles))
      return
    }

    setIsLoadingProfiles(true)
    setAdminError('')
    try {
      const profiles = await fetchManagedProfiles()
      setManagedProfiles(profiles)
      setRoleDrafts(createRoleDrafts(profiles))
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Profiles and roles could not be loaded.'))
    } finally {
      setIsLoadingProfiles(false)
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadManagedProfileList()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadManagedProfileList])

  function beginEditTaxonomy(entry: TaxonomyEntry) {
    setEditingEntry(entry)
    setTaxonomyValue(entry.value)
    setTaxonomyLabel(taxonomyDisplayLabel(entry))
    setTaxonomySortOrder(String(entry.sortOrder))
  }

  function resetTaxonomyForm() {
    setEditingEntry(null)
    setTaxonomyValue('')
    setTaxonomyLabel('')
    setTaxonomySortOrder('0')
  }

  async function persistTaxonomy(entry: {
    groupKey: string
    value: string
    label?: string
    sortOrder?: number
    active?: boolean
  }) {
    if (isSupabaseConfigured) {
      const savedEntry = await upsertTaxonomyEntry(entry)
      onTaxonomiesChange((current) => replaceTaxonomyEntry(current, savedEntry))
      return savedEntry
    }

    const savedEntry = {
      ...createLocalTaxonomyEntry(entry.groupKey, entry.value, entry.label ?? entry.value, entry.sortOrder ?? 0),
      active: entry.active ?? true,
    }
    onTaxonomiesChange((current) => replaceTaxonomyEntry(current, savedEntry))
    return savedEntry
  }

  async function saveTaxonomy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!taxonomyValue.trim()) return

    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntry = await persistTaxonomy({
        groupKey: selectedGroup,
        value: taxonomyValue.trim(),
        label: taxonomyLabel.trim() || taxonomyValue.trim(),
        sortOrder: Number(taxonomySortOrder) || 0,
        active: editingEntry?.active ?? true,
      })
      setAdminMessage(`${taxonomyDisplayLabel(savedEntry)} saved.`)
      resetTaxonomyForm()
      try {
        await logAuditEvent({
          eventType: 'taxonomy_saved',
          tableName: 'taxonomies',
          recordId: isPersistedItemId(savedEntry.id) ? savedEntry.id : undefined,
          metadata: {
            groupKey: savedEntry.groupKey,
            value: savedEntry.value,
            label: taxonomyDisplayLabel(savedEntry),
          },
        })
      } catch (auditError) {
        console.warn(auditError)
      }
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Taxonomy could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleTaxonomy(entry: TaxonomyEntry) {
    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntry = await persistTaxonomy({
        groupKey: entry.groupKey,
        value: entry.value,
        label: taxonomyDisplayLabel(entry),
        sortOrder: entry.sortOrder,
        active: !entry.active,
      })
      setAdminMessage(`${taxonomyDisplayLabel(savedEntry)} ${savedEntry.active ? 'enabled' : 'disabled'}.`)
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Taxonomy status could not be changed.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleColumn(column: string) {
    const existingEntry = taxonomies.find((entry) => entry.groupKey === 'module_column' && entry.value === columnTaxonomyValue(selectedModule, column))
    const nextActive = !(existingEntry?.active ?? selectedColumns.includes(column))

    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntry = await persistTaxonomy({
        groupKey: 'module_column',
        value: columnTaxonomyValue(selectedModule, column),
        label: columnLabel(column),
        sortOrder: selectedConfig.tableColumns.indexOf(column),
        active: nextActive,
      })
      setAdminMessage(`${selectedConfig.shortLabel} column ${taxonomyDisplayLabel(savedEntry)} ${savedEntry.active ? 'shown' : 'hidden'}.`)
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Column setting could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveAllColumnSettings() {
    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntries = await Promise.all(selectedConfig.tableColumns.map((column, index) => {
        const existingEntry = taxonomies.find((entry) => entry.groupKey === 'module_column' && entry.value === columnTaxonomyValue(selectedModule, column))
        return persistTaxonomy({
          groupKey: 'module_column',
          value: columnTaxonomyValue(selectedModule, column),
          label: columnLabel(column),
          sortOrder: index,
          active: existingEntry?.active ?? selectedColumns.includes(column),
        })
      }))
      setAdminMessage(`${savedEntries.length} ${selectedConfig.shortLabel} column settings saved.`)
      try {
        await logAuditEvent({
          eventType: 'column_settings_saved',
          tableName: 'taxonomies',
          metadata: {
            module: selectedModule,
            columns: selectedColumns,
          },
        })
      } catch (auditError) {
        console.warn(auditError)
      }
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Column settings could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  function updateRoleDraft(profileId: string, patch: Partial<{ role: Role; workstream: string }>) {
    setRoleDrafts((current) => ({
      ...current,
      [profileId]: {
        role: current[profileId]?.role ?? 'owner',
        workstream: current[profileId]?.workstream ?? '',
        ...patch,
      },
    }))
  }

  async function saveRole(profile: ManagedProfile) {
    const draft = roleDrafts[profile.id] ?? primaryRoleDraft(profile)
    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      if (isSupabaseConfigured) {
        const savedRole = await replaceUserPrimaryRole(profile.id, draft.role, draft.workstream || undefined)
        const savedProfile = await saveManagedProfile({
          id: profile.id,
          email: profile.email,
          fullName: profile.fullName,
          department: profile.department,
          workstream: draft.workstream || undefined,
        }).catch(() => profile)
        setManagedProfiles((current) => current.map((candidate) => (
          candidate.id === profile.id
            ? { ...candidate, ...savedProfile, roles: [savedRole], workstream: draft.workstream || undefined }
            : candidate
        )))
        await logAuditEvent({
          eventType: 'user_role_saved',
          tableName: 'user_roles',
          recordId: savedRole.id,
          metadata: {
            userId: profile.id,
            email: profile.email,
            role: savedRole.role,
            workstream: savedRole.workstream,
          },
        }).catch((auditError) => console.warn(auditError))
      } else {
        setManagedProfiles((current) => current.map((candidate) => (
          candidate.id === profile.id
            ? {
                ...candidate,
                workstream: draft.workstream || undefined,
                roles: [{
                  id: `local-role-${profile.id}`,
                  userId: profile.id,
                  role: draft.role,
                  workstream: draft.workstream || undefined,
                }],
              }
            : candidate
        )))
      }
      setAdminMessage(`${profile.email} role saved as ${roleLabels[draft.role]}.`)
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'User role could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleGridEditRole(role: Role) {
    if (role === 'super_admin') return
    const nextActive = !gridEditRoles.includes(role)

    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntry = await persistTaxonomy({
        groupKey: 'grid_edit_role',
        value: role,
        label: roleLabels[role],
        sortOrder: roleOptions.indexOf(role),
        active: nextActive,
      })
      await persistTaxonomy({
        groupKey: 'role_permission',
        value: rolePermissionTaxonomyValue(role, 'grid_edit'),
        label: `${roleLabels[role]} · Grid edit`,
        sortOrder: roleOptions.indexOf(role) * 100 + rolePermissionDefinitions.findIndex((permission) => permission.key === 'grid_edit'),
        active: nextActive,
      })
      setAdminMessage(`${roleLabels[role]} grid edit ${savedEntry.active ? 'enabled' : 'disabled'}.`)
      await logAuditEvent({
        eventType: 'grid_edit_policy_saved',
        tableName: 'taxonomies',
        recordId: isPersistedItemId(savedEntry.id) ? savedEntry.id : undefined,
        metadata: {
          role,
          active: savedEntry.active,
        },
      }).catch((auditError) => console.warn(auditError))
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Grid edit policy could not be saved.'))
    } finally {
      setIsSaving(false)
    }
  }

  async function saveRolePermissions(role: Role, permissions: RolePermissionKey[]) {
    const normalizedPermissions = role === 'super_admin'
      ? defaultRolePermissions.super_admin
      : permissions.filter((permission) => !isRolePermissionLocked(role, permission))

    setIsSaving(true)
    setAdminMessage('')
    setAdminError('')
    try {
      const savedEntries = await Promise.all(rolePermissionDefinitions.map((permission, index) => persistTaxonomy({
        groupKey: 'role_permission',
        value: rolePermissionTaxonomyValue(role, permission.key),
        label: `${roleLabels[role]} · ${permission.label}`,
        sortOrder: roleOptions.indexOf(role) * 100 + index,
        active: role === 'super_admin' || normalizedPermissions.includes(permission.key),
      })))

      const gridEditActive = role === 'super_admin' || normalizedPermissions.includes('grid_edit')
      const savedGridEditEntry = await persistTaxonomy({
        groupKey: 'grid_edit_role',
        value: role,
        label: roleLabels[role],
        sortOrder: roleOptions.indexOf(role),
        active: gridEditActive,
      })

      setAdminMessage(`${roleLabels[role]} permissions saved.`)
      await logAuditEvent({
        eventType: 'role_permission_policy_saved',
        tableName: 'taxonomies',
        recordId: isPersistedItemId(savedGridEditEntry.id) ? savedGridEditEntry.id : undefined,
        metadata: {
          role,
          permissions: savedEntries.filter((entry) => entry.active).map((entry) => entry.value),
        },
      }).catch((auditError) => console.warn(auditError))
    } catch (error) {
      console.error(error)
      setAdminError(readErrorMessage(error, 'Role permissions could not be saved.'))
      throw error
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="page-stack">
      {adminMessage && <div className="notice-line">{adminMessage}</div>}
      {adminError && <div className="error-line">{adminError}</div>}
      <section className="admin-grid">
        <article className="panel">
          <PanelHeader title="Role matrix" icon={ShieldCheck} />
          <div className="role-matrix">
            {roleOptions.map((role) => {
              const permissions = getRolePermissions(role, taxonomies, gridEditRoles)
              return (
                <button
                  key={role}
                  className="role-card"
                  onClick={() => setSelectedPermissionRole(role)}
                  aria-label={`Configure ${roleLabels[role]} permissions`}
                >
                  <span>
                    <strong>{roleLabels[role]}</strong>
                    <em>{permissions.length} permissions</em>
                  </span>
                  <span>{rolePermissionSummary(role, permissions)}</span>
                </button>
              )
            })}
          </div>
        </article>
        <article className="panel">
          <PanelHeader title="Grid edit policy" icon={Pencil} />
          <div className="grid-policy-list">
            {roleOptions.map((role) => (
              <label key={role} className={gridEditRoles.includes(role) ? 'is-active' : ''}>
                <input
                  type="checkbox"
                  checked={gridEditRoles.includes(role)}
                  disabled={!canManageRoles || isSaving || role === 'super_admin'}
                  onChange={() => void toggleGridEditRole(role)}
                />
                <span>{roleLabels[role]}</span>
              </label>
            ))}
          </div>
          <p className="admin-note">Super Admin always keeps grid edit. Other roles can be enabled or disabled here.</p>
        </article>
        <article className="panel">
          <PanelHeader title="Column control" icon={SlidersHorizontal} />
          <div className="column-control">
            <select value={selectedModule} onChange={(event) => setSelectedModule(event.target.value as ModuleKey)}>
              {moduleConfigs.map((module) => (
                <option key={module.key} value={module.key}>{module.label}</option>
              ))}
            </select>
            <div className="column-toggle-list">
              {selectedConfig.tableColumns.map((column) => {
                const active = selectedColumns.includes(column)
                return (
                  <label key={column} className={active ? 'is-active' : ''}>
                    <input
                      type="checkbox"
                      checked={active}
                      disabled={!canManageTaxonomies || isSaving}
                      onChange={() => void toggleColumn(column)}
                    />
                    <span>{columnLabel(column)}</span>
                  </label>
                )
              })}
            </div>
            <button className="button secondary" disabled={!canManageTaxonomies || isSaving} onClick={() => void saveAllColumnSettings()}>
              Save column config
            </button>
            <p>{selectedColumns.length}/{selectedConfig.tableColumns.length} columns visible in this register.</p>
          </div>
        </article>
        <article className="panel">
          <PanelHeader title="Environment" icon={Database} />
          <div className="env-list">
            <div><strong>Supabase</strong><span>{isSupabaseConfigured ? 'Configured' : 'Demo mode'}</span></div>
            <div><strong>Current role</strong><span>{roleLabels[user.role]}</span></div>
            <div><strong>Grid edit</strong><span>{canGridEdit(user, gridEditRoles) ? 'Enabled' : 'Disabled'}</span></div>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="admin-section-header">
          <PanelHeader title="User role management" icon={UserRound} />
          <button className="button secondary" onClick={() => void loadManagedProfileList()} disabled={isLoadingProfiles}>
            <RefreshCw size={16} />
            Refresh users
          </button>
        </div>
        {!canManageRoles && (
          <div className="permission-line compact">
            <Lock size={16} />
            Only Super Admin can change user roles.
          </div>
        )}
        {isLoadingProfiles && <div className="loading-line compact">Loading users and roles</div>}
        <div className="role-admin-list">
          {managedProfiles.length === 0 && !isLoadingProfiles ? (
            <div className="empty-state">No profiles are visible to this role.</div>
          ) : (
            managedProfiles.map((profile) => {
              const draft = roleDrafts[profile.id] ?? primaryRoleDraft(profile)
              return (
                <article key={profile.id}>
                  <div className="profile-summary">
                    <span className="avatar">{profile.fullName.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{profile.fullName}</strong>
                      <span>{profile.email}</span>
                      <em>{profile.department ?? 'No department'} · {profile.workstream ?? 'All workstreams'}</em>
                    </div>
                  </div>
                  <label>
                    Primary role
                    <select
                      value={draft.role}
                      disabled={!canManageRoles || isSaving}
                      onChange={(event) => updateRoleDraft(profile.id, { role: event.target.value as Role })}
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{roleLabels[role]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Role workstream
                    <select
                      value={draft.workstream}
                      disabled={!canManageRoles || isSaving}
                      onChange={(event) => updateRoleDraft(profile.id, { workstream: event.target.value })}
                    >
                      <option value="">All workstreams</option>
                      {activeTaxonomyValues(taxonomies, 'workstream', workstreamOptions).map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <button className="button primary" disabled={!canManageRoles || isSaving} onClick={() => void saveRole(profile)}>
                    Save role
                  </button>
                </article>
              )
            })
          )}
        </div>
      </section>

      <section className="admin-management-grid">
        <article className="panel">
          <PanelHeader title="Taxonomy manager" icon={SlidersHorizontal} />
          <div className="taxonomy-tabs">
            {taxonomyGroups.map((group) => (
              <button
                key={group.key}
                className={selectedGroup === group.key ? 'is-active' : ''}
                onClick={() => {
                  setSelectedGroup(group.key)
                  resetTaxonomyForm()
                }}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div className="taxonomy-list">
            {currentEntries.map((entry) => (
              <article key={taxonomyKey(entry.groupKey, entry.value)} className={!entry.active ? 'is-disabled' : ''}>
                <div>
                  <strong>{taxonomyDisplayLabel(entry)}</strong>
                  <span>{entry.value} · order {entry.sortOrder}</span>
                </div>
                <div>
                  <button className="button secondary" disabled={!canManageTaxonomies || isSaving} onClick={() => beginEditTaxonomy(entry)}>Edit</button>
                  <button className="button secondary" disabled={!canManageTaxonomies || isSaving} onClick={() => void toggleTaxonomy(entry)}>
                    {entry.active ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="panel">
          <PanelHeader title={editingEntry ? 'Edit taxonomy value' : 'New taxonomy value'} icon={Plus} />
          <form className="taxonomy-form" onSubmit={saveTaxonomy}>
            <label>
              Value
              <input disabled={!canManageTaxonomies || Boolean(editingEntry)} value={taxonomyValue} onChange={(event) => setTaxonomyValue(event.target.value)} placeholder="Stored value" />
            </label>
            <label>
              Display label
              <input disabled={!canManageTaxonomies} value={taxonomyLabel} onChange={(event) => setTaxonomyLabel(event.target.value)} placeholder="Visible label" />
            </label>
            <label>
              Sort order
              <input disabled={!canManageTaxonomies} type="number" value={taxonomySortOrder} onChange={(event) => setTaxonomySortOrder(event.target.value)} />
            </label>
            <div className="taxonomy-form-actions">
              <button className="button secondary" type="button" onClick={resetTaxonomyForm}>Clear</button>
              <button className="button primary" disabled={!canManageTaxonomies || isSaving || !taxonomyValue.trim()} type="submit">
                {isSaving ? 'Saving' : 'Save taxonomy'}
              </button>
            </div>
          </form>
          {!canManageTaxonomies && <p className="admin-note">This role can view administration settings but cannot change taxonomies or column configuration.</p>}
        </article>
      </section>

      {selectedPermissionRole && (
        <RolePermissionDialog
          key={selectedPermissionRole}
          role={selectedPermissionRole}
          permissions={getRolePermissions(selectedPermissionRole, taxonomies, gridEditRoles)}
          canManage={canManageRoles}
          isSaving={isSaving}
          onClose={() => setSelectedPermissionRole(null)}
          onSave={async (role, permissions) => {
            await saveRolePermissions(role, permissions)
            setSelectedPermissionRole(null)
          }}
        />
      )}
    </div>
  )
}

function RolePermissionDialog({
  role,
  permissions,
  canManage,
  isSaving,
  onClose,
  onSave,
}: {
  role: Role
  permissions: RolePermissionKey[]
  canManage: boolean
  isSaving: boolean
  onClose: () => void
  onSave: (role: Role, permissions: RolePermissionKey[]) => Promise<void>
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<RolePermissionKey[]>(permissions)
  const [error, setError] = useState('')

  function togglePermission(permission: RolePermissionKey) {
    if (!canManage || isRolePermissionLocked(role, permission)) return
    setSelectedPermissions((current) => (
      current.includes(permission)
        ? current.filter((candidate) => candidate !== permission)
        : [...current, permission]
    ))
  }

  async function handleSave() {
    setError('')
    try {
      await onSave(role, selectedPermissions)
    } catch (saveError) {
      console.error(saveError)
      setError(readErrorMessage(saveError, 'Permissions could not be saved.'))
    }
  }

  return (
    <div className="drawer-backdrop confirm-backdrop">
      <section className="confirm-dialog role-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="role-permission-title">
        <div className="drawer-header compact">
          <div>
            <span className="code">Role permissions</span>
            <h2 id="role-permission-title">{roleLabels[role]}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {!canManage && (
          <div className="permission-line compact">
            <Lock size={16} />
            Only Super Admin can change role permissions.
          </div>
        )}

        <div className="permission-toggle-list">
          {rolePermissionDefinitions.map((permission) => {
            const checked = selectedPermissions.includes(permission.key)
            const locked = isRolePermissionLocked(role, permission.key)
            const disabled = !canManage || isSaving || locked
            return (
              <button
                key={permission.key}
                type="button"
                className={`permission-toggle ${checked ? 'is-active' : ''}`}
                disabled={disabled}
                onClick={() => togglePermission(permission.key)}
              >
                <span className="checkbox-proxy" aria-hidden="true">{checked ? <CheckCircle2 size={14} /> : null}</span>
                <span>
                  <strong>{permission.label}</strong>
                  <em>{locked ? rolePermissionLockReason(role, permission.key) : permission.description}</em>
                </span>
              </button>
            )
          })}
        </div>

        <p className="admin-note">
          These settings control the NexBill UI experience and stay aligned with the current Supabase RLS boundaries.
        </p>
        {error && <div className="error-line compact">{error}</div>}
        <div className="confirm-actions">
          <button className="button secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button className="button primary" onClick={() => void handleSave()} disabled={!canManage || isSaving}>
            {isSaving ? 'Saving' : 'Save permissions'}
          </button>
        </div>
      </section>
    </div>
  )
}

function AuditPage({ items, user }: { items: GovernanceItem[]; user: UserProfile }) {
  const [events, setEvents] = useState<AuditEvent[]>(() => (isSupabaseConfigured ? [] : createDemoAuditEvents(items, user)))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadEvents = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setEvents(createDemoAuditEvents(items, user))
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const remoteEvents = await fetchAuditEvents(120)
      setEvents(remoteEvents)
    } catch (auditError) {
      console.error(auditError)
      setError(readErrorMessage(auditError, 'Audit events could not be loaded.'))
    } finally {
      setIsLoading(false)
    }
  }, [items, user])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadEvents()
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [loadEvents])

  return (
    <div className="panel">
      <div className="audit-header">
        <PanelHeader title="Audit events" icon={Activity} />
        <button className="button secondary" onClick={() => void loadEvents()} disabled={isLoading}>
          <RefreshCw size={16} />
          Refresh audit
        </button>
      </div>
      {error && <div className="error-line compact">{error}</div>}
      {isLoading && <div className="loading-line compact">Loading audit events</div>}
      <div className="audit-list">
        {events.length === 0 && !isLoading ? (
          <div className="empty-state">No audit events are available yet.</div>
        ) : (
          events.map((event) => (
            <div key={event.id}>
              <span>{formatTimestamp(event.createdAt)}</span>
              <strong>{eventTypeLabel(event.eventType)}</strong>
              <p>{auditSummary(event)}</p>
              <em>{event.tableName}</em>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function createDemoAuditEvents(items: GovernanceItem[], user: UserProfile): AuditEvent[] {
  return items.slice(0, 20).map((item, index) => ({
    id: `${item.id}-audit`,
    actorId: user.id,
    actorName: user.fullName,
    actorEmail: user.email,
    eventType: index % 3 === 0 ? 'governance_item_updated' : index % 3 === 1 ? 'comment_added' : 'report_source_used',
    tableName: 'governance_items',
    recordId: item.id,
    metadata: {
      itemCode: item.itemCode,
      title: item.title,
      module: item.module,
      status: item.status,
    },
    createdAt: item.lastUpdatedAt,
  }))
}

function eventTypeLabel(value: string) {
  return value.replaceAll('_', ' ')
}

function auditSummary(event: AuditEvent) {
  const actor = event.actorName ?? event.actorEmail ?? 'NexBill user'
  const itemCode = readMetadataText(event.metadata, 'itemCode')
  const title = readMetadataText(event.metadata, 'title')
  const module = readMetadataText(event.metadata, 'module')
  const counts = ['inserted', 'updated', 'skipped', 'verified']
    .map((key) => {
      const value = event.metadata[key]
      return typeof value === 'number' ? `${key}: ${value}` : ''
    })
    .filter(Boolean)
    .join(' · ')

  if (itemCode || title) return `${actor} ${eventTypeLabel(event.eventType)} ${itemCode ? `${itemCode} ` : ''}${title ?? ''}`.trim()
  if (counts) return `${actor} ${eventTypeLabel(event.eventType)} (${counts})`
  if (module) return `${actor} ${eventTypeLabel(event.eventType)} in ${module}`
  return `${actor} ${eventTypeLabel(event.eventType)}`
}

function readMetadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export default App
