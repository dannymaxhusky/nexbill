import type { Handler } from '@netlify/functions'
import { readSheet } from 'read-excel-file/node'

const sheetMap = [
  { module: 'actions', sheet: '1. Actions Register', id: 'Action ID', title: 'Action Title', summary: 'Brief Description', status: 'Action Status', owner: 'Action Owner' },
  { module: 'issues', sheet: '2. Issue Register', id: 'Issue ID', title: 'Issue Title', summary: 'Brief Issue Description', status: 'Issue Status', owner: 'Issue Owner' },
  { module: 'risks', sheet: '3. Risk Register', id: 'Risk ID', title: 'Risk Title', summary: 'Brief Risk Description', status: 'Risk Status', owner: 'Risk Owner' },
  { module: 'dependencies', sheet: '4. Dependency Register', id: 'Depedency ID', title: 'Dependency Title', summary: 'Executive Summary', status: 'Dependency Status', owner: 'Project/Workstream dependency to (Owner)' },
  { module: 'assumptions', sheet: '5. Assumptions Register', id: 'Assumption ID', title: 'Assumption Title', summary: 'Brief Assumption Description', status: 'Assumption Status', owner: 'Assumption Owner' },
  { module: 'decisions', sheet: '6. Decisions Register', id: 'Decision ID', title: 'Decision Title', summary: 'Brief Decision Description', status: 'Decision Status', owner: 'Decision (To be/Has been) Provided By (First Name & Surname)' },
  { module: 'scope_changes', sheet: '7. Change Request Log', id: 'CR ID', title: 'Title', summary: 'Comments/Next Steps', status: 'Current Phase', owner: 'DT Owner' },
  { module: 'benefits', sheet: '8. Success Measures', id: 'ID', title: 'Title', summary: 'Summary', status: 'Status', owner: 'Business Owner' },
  { module: 'lessons', sheet: '9. Lessons Capture', id: 'Lesson ID', title: 'Lesson Title', summary: 'Lesson Description', status: 'Status', owner: 'Action Owner' },
  { module: 'documents', sheet: '11. Key Documents Ref', id: 'Document Saved Title', title: 'Document Title', summary: 'Document Purpose', status: 'Status', owner: 'Document Owner' },
  { module: 'future_projects', sheet: '12. Future Projects', id: 'Refers to', title: 'Refers to', summary: 'Comment', status: 'Status', owner: 'Request From' },
]

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const payload = JSON.parse(event.body ?? '{}') as { workbookBase64?: string; fileName?: string }
    if (!payload.workbookBase64) return json({ error: 'workbookBase64 is required' }, 400)

    const buffer = Buffer.from(payload.workbookBase64, 'base64')
    const preview = []

    for (const mapping of sheetMap) {
      try {
        const rawRows = await readSheet(buffer, mapping.sheet)
        const rows = rowsToObjects(rawRows, [mapping.id, mapping.title, mapping.summary, mapping.status, mapping.owner])
        const records = rows
          .filter((row) => Object.values(row).some(Boolean))
          .slice(0, 20)
          .map((row, index) => ({
            module: mapping.module,
            itemCode: String(row[mapping.id] || `${String(index + 1).padStart(4, '0')}-NB-${mapping.module.toUpperCase()}`),
            title: String(row[mapping.title] || `${mapping.module} item ${index + 1}`),
            summary: String(row[mapping.summary] || row[mapping.title] || ''),
            status: String(row[mapping.status] || 'Open & being monitored'),
            ownerName: String(row[mapping.owner] || ''),
            sourceRef: {
              workbook: payload.fileName,
              sheet: mapping.sheet,
              row: index + 2,
            },
          }))

        preview.push({
          module: mapping.module,
          sheet: mapping.sheet,
          rowsFound: rows.length,
          sample: records,
        })
      } catch {
        // Missing workbook sheets are skipped.
      }
    }

    return json({ preview })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Preview failed' }, 500)
  }
}

function json(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function rowsToObjects(rows: unknown[][], expectedHeaders: string[]) {
  const headerIndex = rows.findIndex((row) => {
    const values = row.map((cell) => normalizeValue(cell))
    const matches = expectedHeaders.filter((header) => values.includes(header)).length
    return matches >= Math.min(2, expectedHeaders.length)
  })

  if (headerIndex < 0) return []

  const headers = rows[headerIndex].map((cell) => normalizeValue(cell))
  return rows.slice(headerIndex + 1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']).filter(([header]) => header)),
  ) as Array<Record<string, unknown>>
}

function normalizeValue(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).trim()
}
