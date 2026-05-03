import { readSheet } from 'read-excel-file/browser'
import { moduleConfigByKey, moduleConfigs } from '../data/moduleConfig'
import type { GovernanceItem, ModuleKey } from '../types'

type ItemImportTarget =
  | 'itemCode'
  | 'title'
  | 'summary'
  | 'status'
  | 'priority'
  | 'ragStatus'
  | 'workstream'
  | 'phase'
  | 'geo'
  | 'ownerName'
  | 'supportName'
  | 'dueDate'
  | 'lastUpdatedAt'
  | 'closedAt'
  | `details.${string}`

const fieldMap: Record<ModuleKey, Record<string, ItemImportTarget>> = {
  actions: {
    'Action ID': 'itemCode',
    'Action Title': 'title',
    'Brief Description': 'summary',
    'Action Status': 'status',
    'Action Priority': 'priority',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    'Countries Impacted': 'geo',
    'Action Owner': 'ownerName',
    'Action Support': 'supportName',
    'Action Due Date': 'dueDate',
    'Latest Action Update Date': 'lastUpdatedAt',
    'Action Area': 'details.area',
    'Action Update': 'details.update',
  },
  risks: {
    'Risk ID': 'itemCode',
    'Risk Title': 'title',
    'Brief Risk Description': 'summary',
    'Risk Status': 'status',
    'Mitigated Risk Rating': 'ragStatus',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    'Countries Impacted': 'geo',
    'Risk Owner': 'ownerName',
    'Supported By': 'supportName',
    'Risk Impact Date': 'dueDate',
    'Last Reviewed Date': 'lastUpdatedAt',
    'Risk Impact Area': 'details.impactArea',
    'Risk Mitgation (how to reduce risk)': 'details.mitigation',
    'Contingency Plan (If risk materalises)': 'details.contingency',
  },
  issues: {
    'Issue ID': 'itemCode',
    'Issue Title': 'title',
    'Brief Issue Description': 'summary',
    'Issue Status': 'status',
    'Issue Priority': 'priority',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    'Countries Impacted': 'geo',
    'Issue Owner': 'ownerName',
    'Resolution due date': 'dueDate',
    'Last Reviewed Date': 'lastUpdatedAt',
    'Issue Impact Area': 'details.impactArea',
    'Issue Impact': 'details.impact',
    'Proposed resolution/Action Plan': 'details.resolutionPlan',
  },
  dependencies: {
    'Depedency ID': 'itemCode',
    'Dependency Title': 'title',
    'Executive Summary': 'summary',
    'Dependency Status': 'status',
    'RAG Status': 'ragStatus',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    'Countries Impacted': 'geo',
    'Project/Workstream dependency to (Owner)': 'ownerName',
    'Project/Workstream dependency from (Owner)': 'supportName',
    'Dependency Forecast Date': 'dueDate',
    'Last Reviewed Date': 'lastUpdatedAt',
    'Criticality of Dependency': 'details.criticality',
    'Dependency Type': 'details.dependencyType',
  },
  assumptions: {
    'Assumption ID': 'itemCode',
    'Assumption Title': 'title',
    'Brief Assumption Description': 'summary',
    'Assumption Status': 'status',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    "Geo's impacted": 'geo',
    'Assumption Owner': 'ownerName',
    'Last Reviewed Date': 'lastUpdatedAt',
    'Date of Assumption Closure': 'closedAt',
    'Assumption Area': 'details.assumptionArea',
    'Recommended controls/mitigations': 'details.controls',
  },
  decisions: {
    'Decision ID': 'itemCode',
    'Decision Title': 'title',
    'Brief Decision Description': 'summary',
    'Decision Status': 'status',
    Workstream: 'workstream',
    'Phase Impacted': 'phase',
    'Geos Impacted': 'geo',
    'Decision (To be/Has been) Provided By (First Name & Surname)': 'ownerName',
    'Decision Suppported By': 'supportName',
    'Last Reviewed Date': 'lastUpdatedAt',
    'Date of Decision Closure': 'closedAt',
    'Decision Area': 'details.decisionArea',
    'Decision Forum/Approval Provided By': 'details.forum',
  },
  benefits: {
    ID: 'itemCode',
    Title: 'title',
    Summary: 'summary',
    'Last reviewed date': 'lastUpdatedAt',
    'Business Owner': 'ownerName',
    'Target Date': 'dueDate',
    'Current State': 'details.currentState',
    Measureable: 'details.measurable',
  },
  lessons: {
    'Lesson ID': 'itemCode',
    'Lesson Title': 'title',
    'Lesson Description': 'summary',
    Workstream: 'workstream',
    'Project Phase': 'phase',
    'Action Owner': 'ownerName',
    'Follow-up-date': 'dueDate',
    'Lesson captured date': 'lastUpdatedAt',
    'Lesson Group': 'details.lessonGroup',
    'Lesson Type': 'details.lessonType',
    'Root Cause': 'details.rootCause',
    Recommendation: 'details.recommendation',
  },
  scope_changes: {
    'CR ID': 'itemCode',
    Title: 'title',
    'Comments/Next Steps': 'summary',
    'Current Phase': 'status',
    'DT Owner': 'ownerName',
    'IT Owner': 'supportName',
    'Impact Geo': 'geo',
    'Impact Area': 'details.impactArea',
    'Exec Approval': 'details.execApproval',
    'Budget($K)': 'details.budgetK',
  },
  documents: {
    'Document Title': 'title',
    'Document Purpose': 'summary',
    Workstream: 'workstream',
    'Document Owner': 'ownerName',
    'Lastest Update (Date)': 'lastUpdatedAt',
    'Document Location': 'details.documentLocation',
    'Document Type': 'details.documentType',
    'Document Saved Title': 'details.savedTitle',
    'Intended Audience': 'details.audience',
  },
  future_projects: {
    'Request From': 'ownerName',
    'Refers to': 'title',
    Comment: 'summary',
    'Estimated Duration': 'details.estimatedDuration',
    'Estimated Cost': 'details.estimatedCost',
  },
  financials: {},
  schedule: {},
  go_live: {},
  program_site: {},
}

export interface ImportPreview {
  module: ModuleKey
  sheet: string
  rowsFound: number
  mappedRecords: GovernanceItem[]
  missingHeaders: string[]
}

function excelDateToIso(value: unknown) {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    if (value > 20000 && value < 60000) {
      const epoch = new Date(Date.UTC(1899, 11, 30))
      epoch.setUTCDate(epoch.getUTCDate() + value)
      return epoch.toISOString().slice(0, 10)
    }
    return String(value)
  }
  return String(value)
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

export async function previewWorkbook(file: File): Promise<ImportPreview[]> {
  const previews: ImportPreview[] = []

  for (const module of moduleConfigs.filter((candidate) => candidate.sourceSheet)) {
    try {
      const rawRows = await readSheet(file, module.sourceSheet!)
      const rows = rowsToObjects(rawRows, module.importHeaders)
      const mappedRecords = rows
        .filter((row) => Object.values(row).some(Boolean))
        .slice(0, 200)
        .map((row, index) => {
          const item: GovernanceItem = {
            id: `${module.key}-${index}`,
            module: module.key,
            itemCode: '',
            title: '',
            summary: '',
            status: module.defaultStatus,
            lastUpdatedAt: new Date().toISOString().slice(0, 10),
            sourceRef: {
              workbook: file.name,
              sheet: module.sourceSheet,
              row: index + 2,
            },
            details: {},
          }

          for (const [header, target] of Object.entries(fieldMap[module.key])) {
            const value = row[header]
            if (target.startsWith('details.')) {
              item.details[target.replace('details.', '')] = normalizeValue(value)
            } else if (target === 'dueDate') {
              item.dueDate = excelDateToIso(value)
            } else if (target === 'lastUpdatedAt') {
              item.lastUpdatedAt = excelDateToIso(value) ?? item.lastUpdatedAt
            } else if (target === 'closedAt') {
              item.closedAt = excelDateToIso(value)
            } else {
              assignImportField(item, target as Exclude<ItemImportTarget, `details.${string}` | 'dueDate' | 'lastUpdatedAt' | 'closedAt'>, normalizeValue(value))
            }
          }

          item.itemCode = item.itemCode || `${String(index + 1).padStart(4, '0')}-NB-${module.codePrefix}`
          item.title = item.title || `${module.shortLabel} item ${index + 1}`
          item.summary = item.summary || item.title
          item.sourceRef!.sourceId = item.itemCode
          return item
        })

      const availableHeaders = Object.keys(rows[0] ?? {})
      const missingHeaders = module.importHeaders.filter((header) => !availableHeaders.includes(header))

      previews.push({
        module: module.key,
        sheet: module.sourceSheet!,
        rowsFound: rows.length,
        mappedRecords,
        missingHeaders,
      })
    } catch {
      // Missing sheets are expected because some modules are manual/API first.
    }
  }

  return previews
}

function assignImportField(item: GovernanceItem, target: Exclude<ItemImportTarget, `details.${string}` | 'dueDate' | 'lastUpdatedAt' | 'closedAt'>, value: string) {
  item[target] = value
}

function rowsToObjects(rows: unknown[][], expectedHeaders: string[]) {
  const headerIndex = rows.findIndex((row) => {
    const values = row.map((cell) => normalizeValue(cell))
    const matches = expectedHeaders.filter((header) => values.includes(header)).length
    return matches >= Math.min(3, expectedHeaders.length || 3)
  })

  if (headerIndex < 0) return []

  const headers = rows[headerIndex].map((cell) => normalizeValue(cell))
  return rows.slice(headerIndex + 1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']).filter(([header]) => header)),
  ) as Array<Record<string, unknown>>
}

export function moduleImportCoverage() {
  return moduleConfigs.map((module) => ({
    module: module.key,
    label: module.label,
    sourceSheet: module.sourceSheet ?? 'Manual / API',
    mappedHeaders: Object.keys(fieldMap[module.key]).length,
    totalHeaders: module.importHeaders.length,
    config: moduleConfigByKey[module.key],
  }))
}
