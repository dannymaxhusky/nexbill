export type RiskLevelTone = 'very-low' | 'low' | 'medium' | 'high' | 'very-high' | 'extreme'

export interface RiskLevelDefinition {
  level: string
  rank: number
  tone: RiskLevelTone
  guidance: string
}

export interface RiskProbabilityDefinition {
  score: number
  label: string
  definition: string
}

export const riskLevelDefinitions: RiskLevelDefinition[] = [
  {
    level: 'Very Low',
    rank: 1,
    tone: 'very-low',
    guidance: 'Document and review periodically to ensure conditions remain unchanged; manage within the workstream risk register.',
  },
  {
    level: 'Low',
    rank: 2,
    tone: 'low',
    guidance: 'Monitor regularly and address if circumstances change; manage within the workstream risk register.',
  },
  {
    level: 'Medium',
    rank: 3,
    tone: 'medium',
    guidance: 'Actively manage and track; develop a response or action plan if required; manage within workstream working groups.',
  },
  {
    level: 'High',
    rank: 4,
    tone: 'high',
    guidance: 'Prioritise for actioning, assign responsibility, and ensure progress is reviewed regularly; include in governance reporting.',
  },
  {
    level: 'Very High',
    rank: 5,
    tone: 'very-high',
    guidance: 'Immediate mitigation required; provide regular visibility and action update to leadership; include in governance reporting.',
  },
  {
    level: 'Extreme',
    rank: 6,
    tone: 'extreme',
    guidance: 'Immediate and high-priority action; escalate to sponsor and senior stakeholders; include in governance reporting.',
  },
]

export const riskLevelOptions = riskLevelDefinitions.map((definition) => `${definition.rank}. ${definition.level}`)

export const riskProbabilityDefinitions: RiskProbabilityDefinition[] = [
  {
    score: 1,
    label: 'Rare',
    definition: 'Unlikely to happen and/or have minor or negligible consequences.',
  },
  {
    score: 2,
    label: 'Unlikely',
    definition: 'Low probability to happen and/or to have moderate consequences.',
  },
  {
    score: 3,
    label: 'Possible',
    definition: 'Could occur and have serious consequences.',
  },
  {
    score: 4,
    label: 'Likely',
    definition: 'Almost sure to happen and/or to have major consequences.',
  },
  {
    score: 5,
    label: 'Almost certain',
    definition: 'Sure to happen and/or have major consequences.',
  },
]

export const riskImpactLabels = ['Impact 1', 'Impact 2', 'Impact 3', 'Impact 4', 'Impact 5']

export const riskMatrixRows = [
  { probability: 5, levels: ['Medium', 'High', 'Very High', 'Extreme', 'Extreme'] },
  { probability: 4, levels: ['Medium', 'Medium', 'High', 'Very High', 'Extreme'] },
  { probability: 3, levels: ['Low', 'Medium', 'Medium', 'High', 'Very High'] },
  { probability: 2, levels: ['Very Low', 'Low', 'Medium', 'Medium', 'High'] },
  { probability: 1, levels: ['Very Low', 'Very Low', 'Low', 'Medium', 'Medium'] },
]

export function normalizeRiskLevel(value?: string) {
  const normalized = value?.toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
  if (!normalized) return undefined
  if (normalized.includes('extreme')) return 'Extreme'
  if (normalized.includes('very high')) return 'Very High'
  if (normalized.includes('critical') || normalized.includes('red')) return 'Very High'
  if (normalized.includes('high') || normalized.includes('amber')) return 'High'
  if (normalized.includes('medium')) return 'Medium'
  if (normalized.includes('very low')) return 'Very Low'
  if (normalized.includes('low') || normalized.includes('green')) return 'Low'
  return undefined
}

export function riskLevelTone(value?: string): RiskLevelTone | undefined {
  const level = normalizeRiskLevel(value)
  return riskLevelDefinitions.find((definition) => definition.level === level)?.tone
}

export function riskLevelRank(value?: string) {
  const level = normalizeRiskLevel(value)
  return riskLevelDefinitions.find((definition) => definition.level === level)?.rank ?? 0
}
