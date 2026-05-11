/**
 * Typed client for the ad-localization API.
 *
 * All calls go through the Next.js proxy at /api/localization/v1/*
 * so cookies (Clerk session) are forwarded automatically.
 *
 * Response shapes match the FastAPI backend's Pydantic models directly.
 */

// ---------------------------------------------------------------------------
// Types — aligned with backend schemas
// ---------------------------------------------------------------------------

export type JobStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'partial'

export interface LocalizationJob {
  id: string
  source_asset_id: string
  requested_by: string | null
  target_markets: string[]
  status: JobStatus
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  estimated_cost_usd: string | null
  actual_cost_usd: string | null
}

export interface SourceAsset {
  id: string
  brand_id: string
  project_id: string
  original_filename: string
  storage_key: string
  file_hash: string | null
  source_type: string
  file_size_bytes: number
  parse_status: string
  tags: string[]
  metadata: Record<string, unknown>
  created_at: string
}

export interface SourceAssetListItem {
  id: string
  original_filename: string
  source_type: string
  file_size_bytes: number
  parse_status: string
  tags: string[]
  created_at: string
}

export interface Market {
  code: string
  name: string
  language: string
  region: string
  sub_market_handler: string
  complexity: string
}

export interface LocalizedAssetSummary {
  id: string
  localization_job_id: string
  source_asset_id: string
  target_market: string
  target_sub_market: string | null
  status: string
  output_storage_key: string | null
  compliance_overlay_applied: boolean
  platform_metadata: Record<string, unknown>
  compliance_report_id: string | null
  confirmation_id: string | null
  created_at: string
}

export interface LocalizedAssetDetail extends LocalizedAssetSummary {
  unit_outputs: Record<string, unknown>[]
}

export interface ComplianceReport {
  id: string
  localized_asset_id: string
  market: string
  sub_market: string | null
  overall_status: string
  findings: { severity: string; message: string; code?: string }[]
  created_at: string | null
}

export interface MatrixCell {
  strategy: string
  user_instructions: string | null
  user_provided_content: string | null
}

export interface MatrixRow {
  lu_id: string
  lu_type: string
  semantic_role: string
  preview: string | null
  cells: Record<string, MatrixCell>
}

export interface MatrixView {
  job_id: string
  targets: string[]
  rows: MatrixRow[]
}

export interface Project {
  id: string
  brand_id: string
  name: string
  description: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE = '/api/localization/v1'

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.detail ?? body.error ?? res.statusText), {
      status: res.status,
      body,
    })
  }

  return res.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

/** List all jobs for the current user. */
export function getJobs(limit = 50, offset = 0) {
  return request<LocalizationJob[]>(`/jobs?limit=${limit}&offset=${offset}`)
}

/** Get a single job by ID. */
export function getJob(id: string) {
  return request<LocalizationJob>(`/jobs/${id}`)
}

/** Create a new localization job. */
export function createJob(data: {
  source_asset_id: string
  targets: { market: string; sub_market?: string | null }[]
  modes?: { text?: boolean; visual?: boolean; audio?: boolean }
}) {
  return request<LocalizationJob>('/jobs', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Get the strategy matrix for a job. */
export function getJobMatrix(jobId: string) {
  return request<MatrixView>(`/jobs/${jobId}/matrix`)
}

/** Update a single cell in the strategy matrix. */
export function updateMatrixCell(jobId: string, data: {
  lu_id: string
  target: string
  strategy: string
  user_instructions?: string | null
  user_provided_content?: string | null
}) {
  return request<MatrixView>(`/jobs/${jobId}/matrix/cell`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

/** Get localized outputs for a job. */
export function getJobLocalized(jobId: string) {
  return request<LocalizedAssetSummary[]>(`/jobs/${jobId}/localized`)
}

/** Submit a job for processing. */
export function submitJob(jobId: string) {
  return request<LocalizationJob>(`/jobs/${jobId}/submit`, {
    method: 'POST',
  })
}

/** Get a single localized asset by ID. */
export function getLocalizedAsset(id: string) {
  return request<LocalizedAssetDetail>(`/jobs/localized/${id}`)
}

/** Get the download URL for a localized asset's output file. */
export function getLocalizedDownloadUrl(id: string) {
  return `${BASE}/jobs/localized/${id}/download`
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

/** List assets for a project. */
export function getAssets(projectId: string, limit = 50, offset = 0) {
  return request<SourceAssetListItem[]>(
    `/assets?project_id=${projectId}&limit=${limit}&offset=${offset}`
  )
}

/** Get a single asset by ID. */
export function getAsset(assetId: string) {
  return request<SourceAsset>(`/assets/${assetId}`)
}

/** Upload a file as a source asset. */
export async function uploadAsset(
  file: File,
  projectId: string,
  tags?: string[],
) {
  const form = new FormData()
  form.append('file', file)
  form.append('project_id', projectId)
  if (tags?.length) form.append('tags', tags.join(','))

  const res = await fetch(`${BASE}/assets/upload`, {
    method: 'POST',
    body: form, // browser sets multipart content-type automatically
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.detail ?? body.error ?? res.statusText), {
      status: res.status,
      body,
    })
  }

  return res.json() as Promise<SourceAsset>
}

/** Upload text content as a source asset. */
export function uploadText(data: {
  project_id: string
  content: string
  filename?: string
  format?: 'txt' | 'md' | 'csv'
  tags?: string[]
}) {
  return request<SourceAsset>('/assets/upload-text', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Ingest an asset from a URL (e.g. from moboost storage). */
export function ingestFromUrl(data: {
  url: string
  project_id: string
  filename?: string
  tags?: string[]
}) {
  return request<SourceAsset>('/assets/from-url', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

/** Get the list of 8 supported markets. */
export function getMarkets() {
  return request<{ markets: Market[] }>('/markets').then(r => r.markets)
}

// ---------------------------------------------------------------------------
// Compliance
// ---------------------------------------------------------------------------

/** Get compliance rules (optionally filtered by market). */
export function getComplianceRules(market?: string) {
  const qs = market ? `?market=${market}` : ''
  return request<{ severity: string; code: string; title: string; message: string }[]>(
    `/compliance/rules${qs}`
  )
}

/** Run a compliance check on a localized asset. */
export function runComplianceCheck(localizedAssetId: string) {
  return request<{
    market: string
    sub_market: string | null
    overall_status: string
    findings: { severity: string; message: string }[]
    effective_rule_count: number
    disabled_rule_count: number
  }>(`/compliance/check/${localizedAssetId}`, {
    method: 'POST',
  })
}

/** Confirm a localized asset for distribution. */
export function confirmAsset(localizedAssetId: string, data: {
  acknowledgments: { finding_id: string; acknowledged: boolean }[]
  comments?: string[]
}) {
  return request<Record<string, unknown>>(`/compliance/confirm/${localizedAssetId}`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Get compliance reports for all assets in a job. */
export function getJobCompliance(jobId: string) {
  return request<{ reports: ComplianceReport[] }>(`/jobs/${jobId}/compliance`)
    .then(r => r.reports)
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

/** List projects (brand-scoped — brand_id is required by the backend). */
export function getProjects(brandId: string) {
  return request<Project[]>(`/projects?brand_id=${brandId}`)
}

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

export function getBrands() {
  return request<{ id: string; name: string; slug: string }[]>('/brands')
}

/** Create a new brand. */
export function createBrand(data: {
  name: string
  slug: string
  display_name_by_market?: Record<string, string>
  restrictions?: Record<string, unknown>
  voice?: Record<string, unknown>
}) {
  return request<{ id: string; name: string; slug: string }>('/brands', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Create a new project under a brand. */
export function createProject(data: {
  brand_id: string
  name: string
  description?: string
}) {
  return request<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
