import type { ModuleKey } from '../types'

type DetailValueType = 'text' | 'number' | 'boolean' | 'date'

interface DetailColumnSpec {
  column: string
  type?: DetailValueType
}

interface DetailTableConfig {
  table: string
  columns: Record<string, DetailColumnSpec>
}

export const moduleDetailConfigs: Partial<Record<ModuleKey, DetailTableConfig>> = {
  actions: {
    table: 'action_details',
    columns: {
      sourceLocation: { column: 'action_source_location' },
      area: { column: 'action_area' },
      update: { column: 'action_update' },
    },
  },
  risks: {
    table: 'risk_details',
    columns: {
      reportedLevel: { column: 'risk_reported_level' },
      impactArea: { column: 'impact_area' },
      responseStrategy: { column: 'response_strategy' },
      budgetLow: { column: 'budget_low', type: 'number' },
      budgetHigh: { column: 'budget_high', type: 'number' },
      scheduleLowWeeks: { column: 'schedule_low_weeks', type: 'number' },
      scheduleHighWeeks: { column: 'schedule_high_weeks', type: 'number' },
      earlyWarnings: { column: 'early_warning_indicators' },
      mitigation: { column: 'mitigation' },
      contingency: { column: 'contingency_plan' },
      associatedDependencyId: { column: 'associated_dependency_id' },
    },
  },
  issues: {
    table: 'issue_details',
    columns: {
      issueType: { column: 'issue_type' },
      impactArea: { column: 'impact_area' },
      impact: { column: 'impact' },
      currentStatus: { column: 'current_status' },
      resolutionPlan: { column: 'resolution_plan' },
      supportRequired: { column: 'support_required' },
      escalationStatus: { column: 'escalation_status' },
      severityRating: { column: 'severity_rating' },
    },
  },
  dependencies: {
    table: 'dependency_details',
    columns: {
      criticality: { column: 'criticality' },
      dependencyType: { column: 'dependency_type' },
      taskSequencing: { column: 'task_sequencing' },
      fromWorkstream: { column: 'from_workstream' },
      fromOwner: { column: 'from_owner' },
      toWorkstream: { column: 'to_workstream' },
      toOwner: { column: 'to_owner' },
      baselineDate: { column: 'baseline_delivery_date', type: 'date' },
      forecastDate: { column: 'forecast_date', type: 'date' },
      agreedDate: { column: 'agreed_date', type: 'date' },
      varianceBusinessDays: { column: 'variance_business_days', type: 'number' },
      associatedRiskIssueIds: { column: 'associated_risk_issue_ids' },
    },
  },
  assumptions: {
    table: 'assumption_details',
    columns: {
      assumptionArea: { column: 'assumption_area' },
      impactHolds: { column: 'impact_if_holds' },
      impactNotMet: { column: 'impact_if_not_met' },
      controls: { column: 'controls_mitigations' },
      supportingReference: { column: 'supporting_reference' },
      riskId: { column: 'linked_risk_id' },
      dependencyId: { column: 'linked_dependency_id' },
      recordedDate: { column: 'recorded_date', type: 'date' },
      validatedDate: { column: 'validated_date', type: 'date' },
    },
  },
  decisions: {
    table: 'decision_details',
    columns: {
      decisionArea: { column: 'decision_area' },
      impactArea: { column: 'impact_area' },
      requestedBy: { column: 'requested_by' },
      supportedBy: { column: 'supported_by' },
      providedBy: { column: 'provided_by' },
      forum: { column: 'approval_forum' },
      approvalDate: { column: 'approval_date', type: 'date' },
      approvalRecord: { column: 'approval_record_location' },
    },
  },
  benefits: {
    table: 'benefit_details',
    columns: {
      currentState: { column: 'current_state' },
      description: { column: 'description' },
      specific: { column: 'specific' },
      measurable: { column: 'measurable' },
      achievable: { column: 'achievable' },
      relevant: { column: 'relevant' },
      timeBound: { column: 'time_bound' },
      targetDate: { column: 'target_date', type: 'date' },
      measurementCadence: { column: 'measurement_cadence' },
    },
  },
  lessons: {
    table: 'lesson_details',
    columns: {
      lessonGroup: { column: 'lesson_group' },
      lessonType: { column: 'lesson_type' },
      impactSize: { column: 'impact_size' },
      impactArea: { column: 'impact_area' },
      estimatedImpactWeeks: { column: 'estimated_impact_weeks', type: 'number' },
      category: { column: 'category' },
      projectPhase: { column: 'project_phase' },
      lessonImpact: { column: 'lesson_impact' },
      rootCause: { column: 'root_cause' },
      recommendation: { column: 'recommendation' },
      capturedBy: { column: 'captured_by' },
      capturedDate: { column: 'captured_date', type: 'date' },
      followUpDate: { column: 'follow_up_date', type: 'date' },
      notes: { column: 'notes' },
    },
  },
  scope_changes: {
    table: 'change_request_details',
    columns: {
      currentPhase: { column: 'current_phase' },
      confirmForSizing: { column: 'confirm_for_sizing', type: 'boolean' },
      execApproval: { column: 'exec_approval' },
      dtOwner: { column: 'dt_owner' },
      itOwner: { column: 'it_owner' },
      impactArea: { column: 'impact_area' },
      totalMd: { column: 'total_md', type: 'number' },
      budgetK: { column: 'budget_k', type: 'number' },
      comments: { column: 'comments' },
    },
  },
  financials: {
    table: 'financial_details',
    columns: {
      budget: { column: 'budget', type: 'number' },
      forecast: { column: 'forecast', type: 'number' },
      actuals: { column: 'actuals', type: 'number' },
      variance: { column: 'variance', type: 'number' },
      varianceDriver: { column: 'variance_driver' },
      assumptions: { column: 'assumptions' },
    },
  },
  schedule: {
    table: 'schedule_details',
    columns: {
      milestone: { column: 'milestone' },
      baselineDate: { column: 'baseline_date', type: 'date' },
      forecastDate: { column: 'forecast_date', type: 'date' },
      criticalPath: { column: 'critical_path', type: 'boolean' },
      scheduleSlipDays: { column: 'schedule_slip_days', type: 'number' },
    },
  },
  go_live: {
    table: 'golive_readiness_details',
    columns: {
      readinessDomain: { column: 'readiness_domain' },
      entryCriteria: { column: 'entry_criteria' },
      exitCriteria: { column: 'exit_criteria' },
      readinessOwner: { column: 'readiness_owner' },
      evidenceLocation: { column: 'evidence_location' },
    },
  },
  documents: {
    table: 'document_details',
    columns: {
      documentPurpose: { column: 'document_purpose' },
      documentLocation: { column: 'document_location' },
      documentType: { column: 'document_type' },
      savedTitle: { column: 'saved_title' },
      latestUpdateDate: { column: 'latest_update_date', type: 'date' },
      version: { column: 'latest_version' },
      audience: { column: 'intended_audience' },
    },
  },
  future_projects: {
    table: 'future_project_details',
    columns: {
      requestFrom: { column: 'request_from' },
      refersTo: { column: 'refers_to' },
      estimatedDuration: { column: 'estimated_duration' },
      estimatedCost: { column: 'estimated_cost', type: 'number' },
      comment: { column: 'comment' },
    },
  },
}

export function detailConfigForModule(module: ModuleKey) {
  return moduleDetailConfigs[module]
}

export function detailPayloadFromDetails(
  itemId: string,
  module: ModuleKey,
  details: Record<string, unknown> | null | undefined,
) {
  const config = detailConfigForModule(module)
  if (!config) return null

  const sourceDetails = details ?? {}
  const consumedKeys = new Set(Object.keys(config.columns))
  const payload: Record<string, unknown> = {
    item_id: itemId,
    details: Object.fromEntries(
      Object.entries(sourceDetails).filter(([key]) => !consumedKeys.has(key)),
    ),
  }

  Object.entries(config.columns).forEach(([detailKey, spec]) => {
    payload[spec.column] = normalizeDetailValue(sourceDetails[detailKey], spec.type)
  })

  return payload
}

export function detailsFromDetailRow(module: ModuleKey, row: Record<string, unknown>) {
  const config = detailConfigForModule(module)
  if (!config) return {}

  const detailJson = row.details
  const details: Record<string, unknown> =
    detailJson && typeof detailJson === 'object' && !Array.isArray(detailJson)
      ? { ...(detailJson as Record<string, unknown>) }
      : {}

  Object.entries(config.columns).forEach(([detailKey, spec]) => {
    const value = row[spec.column]
    if (value !== null && value !== undefined && value !== '') details[detailKey] = value
  })

  return details
}

function normalizeDetailValue(value: unknown, type: DetailValueType = 'text') {
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', 'yes', 'y', '1'].includes(normalized)) return true
      if (['false', 'no', 'n', '0', ''].includes(normalized)) return false
    }
    return Boolean(value)
  }

  if (value === null || value === undefined || value === '') return null

  if (type === 'number') {
    const numberValue = typeof value === 'number' ? value : Number(String(value).replace(/,/g, '').trim())
    return Number.isFinite(numberValue) ? numberValue : null
  }

  if (type === 'date') {
    const text = String(value).trim()
    if (!text) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
    const parsed = new Date(text)
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
  }

  const text = String(value).trim()
  return text || null
}
