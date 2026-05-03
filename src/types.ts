export type Role =
  | 'super_admin'
  | 'program_manager'
  | 'ctm'
  | 'owner'
  | 'support'
  | 'executive'

export type ModuleKey =
  | 'actions'
  | 'risks'
  | 'issues'
  | 'dependencies'
  | 'assumptions'
  | 'decisions'
  | 'benefits'
  | 'lessons'
  | 'scope_changes'
  | 'financials'
  | 'schedule'
  | 'go_live'
  | 'documents'
  | 'future_projects'
  | 'program_site'

export type ReportType = 'team_leads' | 'stakeholders' | 'executive'

export type ViewMode = 'my' | 'all'

export interface UserProfile {
  id: string
  email: string
  fullName: string
  role: Role
  workstream?: string
}

export interface SourceRef {
  workbook?: string
  sheet?: string
  row?: number
  sourceId?: string
  note?: string
}

export interface GovernanceItem {
  id: string
  module: ModuleKey
  itemCode: string
  title: string
  summary: string
  status: string
  priority?: string
  ragStatus?: string
  workstream?: string
  phase?: string
  geo?: string
  ownerName?: string
  ownerEmail?: string
  supportName?: string
  supportEmail?: string
  dueDate?: string
  lastUpdatedAt: string
  closedAt?: string
  sourceRef?: SourceRef
  details: Record<string, string | number | boolean | null | undefined>
}

export interface ModuleField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'date' | 'number'
  required?: boolean
  options?: string[]
}

export interface ModuleConfig {
  key: ModuleKey
  label: string
  shortLabel: string
  codePrefix: string
  description: string
  sourceSheet?: string
  ownerFieldLabel?: string
  defaultStatus: string
  statusOptions: string[]
  priorityOptions?: string[]
  fields: ModuleField[]
  tableColumns: string[]
  importHeaders: string[]
}

export interface ReportDraft {
  id: string
  type: ReportType
  title: string
  summary: string
  risks: string[]
  decisions: string[]
  nextSteps: string[]
  citations: Array<{
    itemCode: string
    module: ModuleKey
    title: string
    source?: SourceRef
  }>
  createdAt: string
}

export interface PlatformMetrics {
  openItems: number
  overdueItems: number
  dueSoonItems: number
  closedItems: number
  highPriorityItems: number
  staleItems: number
  moduleCounts: Record<ModuleKey, number>
  ragCounts: Record<string, number>
}
