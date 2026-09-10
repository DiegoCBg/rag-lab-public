import { z } from 'zod'

const optionSchema = z.object({
  id: z.string(),
  label: z.string(),
}).passthrough()

const providerModelSchema = z.object({
  id: z.string(),
  label: z.string(),
}).passthrough()

const providerSchema = optionSchema.extend({
  model_key: z.string().optional().nullable(),
  selected_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  supports_embeddings: z.boolean().optional().default(false),
  active: z.boolean().optional().default(false),
  unavailable_reason: z.string().optional().nullable(),
  configured: z.boolean().optional().default(true),
  can_use: z.boolean().optional().default(true),
  supports_custom_model: z.boolean().optional().default(true),
  models: z.array(providerModelSchema).optional().default([]),
}).passthrough()

const looseChunkSchema = z.object({
  text: z.string().optional().nullable(),
}).passthrough()

const tokenUsageSchema = z.object({
  prompt_tokens: z.number().nullable().optional(),
  output_tokens: z.number().nullable().optional(),
  total_tokens: z.number().nullable().optional(),
  calls: z.number().optional(),
  known: z.boolean().optional(),
  partial: z.boolean().optional(),
  breakdown: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

const documentScopeSchema = z.object({
  mode: z.enum(['all', 'selected']).optional(),
  requested_document_ids: z.array(z.string()).optional(),
  resolved_document_ids: z.array(z.string()),
  resolved_document_filenames: z.array(z.string()),
  used_document_ids: z.array(z.string()),
}).passthrough()

const ragResultSchema = z.object({
  document_scope: documentScopeSchema.optional().nullable(),
  execution_id: z.string().optional().nullable(),
  answer: z.string().optional().default(''),
  strategy: z.string().optional().default(''),
  provider: z.string().optional().default(''),
  generation_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  sources: z.array(z.string()).optional().default([]),
  chunks: z.array(looseChunkSchema).optional().default([]),
  metrics: z.record(z.string(), z.unknown()).optional().default({}),
  token_usage: tokenUsageSchema.optional().nullable(),
  evidence_ledger: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  claims: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  unsupported_claims: z.array(z.unknown()).optional().default([]),
  limitations: z.array(z.string()).optional().default([]),
  answer_grounding_status: z.string().optional().nullable(),
  retrieval_state: z.string().optional().nullable(),
  fallback_reason: z.string().optional().nullable(),
}).passthrough()

const ragRunSchema = z.object({
  document_scope: documentScopeSchema.optional().nullable(),
  provider: z.string().optional().default(''),
  generation_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  active_stage: z.string().optional().nullable(),
  events: z.array(z.object({
    stage: z.string().optional(),
    status: z.string().optional(),
  }).passthrough()).optional().default([]),
  results: z.array(ragResultSchema).optional().default([]),
}).passthrough()

const benchmarkItemSchema = z.object({
  question: z.string().optional().default(''),
}).passthrough()

const benchmarkRunSchema = z.object({
  strategy: z.string().optional().default(''),
  provider: z.string().optional().default(''),
  generation_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  items: z.array(benchmarkItemSchema).optional().default([]),
  average_keyword_score: z.number().optional().nullable(),
  evaluated_items: z.number().optional().default(0),
  total_items: z.number().optional().default(0),
  warning: z.string().optional().nullable(),
}).passthrough()

const benchmarkCompareSchema = z.object({
  primary_strategy: z.string().optional().default(''),
  secondary_strategy: z.string().optional().default(''),
  provider: z.string().optional().default(''),
  generation_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  rows: z.array(z.object({ question: z.string().optional().default('') }).passthrough()).optional().default([]),
  primary_average: z.number().optional().nullable(),
  secondary_average: z.number().optional().nullable(),
  winner: z.string().optional().default(''),
  evaluated_items: z.number().optional().default(0),
  total_items: z.number().optional().default(0),
  warning: z.string().optional().nullable(),
}).passthrough()

const experimentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  summary_json: z.string().optional().nullable(),
  primary_strategy: z.string().optional().default(''),
  secondary_strategy: z.string().optional().nullable(),
  provider: z.string().optional().default(''),
  question: z.string().optional().default(''),
  created_at: z.string().optional().nullable(),
}).passthrough()

const userSchema = z.object({
  id: z.union([z.string(), z.number()]),
  username: z.string(),
  email: z.string().optional().nullable(),
  is_admin: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
}).passthrough()

const currentUserSchema = userSchema.partial().extend({
  id: z.union([z.string(), z.number()]),
}).passthrough()

const settingItemSchema = z.object({
  key: z.string(),
  value: z.unknown().optional().nullable(),
  is_set: z.boolean().optional(),
}).passthrough()

const settingsSchema = z.object({
  items: z.array(settingItemSchema).optional().default([]),
}).passthrough()

const ollamaModelSchema = z.object({
  name: z.string(),
  size: z.number().optional().nullable(),
}).passthrough()

const ollamaModelsSchema = z.object({
  models: z.array(ollamaModelSchema).optional().default([]),
  current: z.string().optional().nullable(),
  base_url: z.string().optional().nullable(),
}).passthrough()

const ollamaTestSchema = z.object({
  ok: z.boolean().optional().default(false),
  latency_ms: z.union([z.number(), z.string()]).optional().nullable(),
  status_code: z.union([z.number(), z.string()]).optional().nullable(),
}).passthrough()

const providerTestSchema = z.object({
  provider: z.string().optional().default(''),
  ok: z.boolean().optional().default(false),
  model: z.string().optional().nullable(),
  latency_ms: z.union([z.number(), z.string()]).optional().nullable(),
}).passthrough()

const documentSchema = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string().optional().default(''),
  content_type: z.string().optional().nullable(),
  status: z.string().optional().default('uploaded'),
  chunk_count: z.number().optional().nullable(),
  created_at: z.string().optional().nullable(),
  embedding_provider: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
}).passthrough()

const uploadedDocumentSchema = documentSchema.extend({
  filename: z.string(),
  status: z.string(),
}).passthrough()

const ingestionJobSchema = z.object({
  job_id: z.union([z.string(), z.number()]).optional().nullable(),
  stage: z.string().optional().nullable(),
  progress: z.number().optional().nullable(),
}).passthrough()

const executionSchema = z.object({
  id: z.union([z.string(), z.number()]),
  created_at: z.string().optional().nullable(),
  strategy: z.string().optional().nullable(),
  provider: z.string().optional().nullable(),
  generation_model: z.string().optional().nullable(),
  embedding_model: z.string().optional().nullable(),
  question: z.string().optional().nullable(),
  answer_preview: z.string().optional().nullable(),
  sources: z.array(z.unknown()).optional().default([]),
}).passthrough()

const comparisonChunkSchema = z.object({
  chunk_id: z.union([z.string(), z.number()]).optional().nullable(),
  document_id: z.union([z.string(), z.number()]).optional().nullable(),
  filename: z.string().optional().nullable(),
  chunk_index: z.number().optional().nullable(),
  text: z.string().optional().nullable(),
  score: z.union([z.number(), z.string()]).optional().nullable(),
  vector_score: z.union([z.number(), z.string()]).optional().nullable(),
  lexical_score: z.union([z.number(), z.string()]).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
}).passthrough()

const supportingQuoteSchema = z.preprocess(
  (value) => {
    if (typeof value === 'string') return value
    if (value && typeof value === 'object' && 'quote' in value) {
      return value.quote
    }
    return value == null ? '' : String(value)
  },
  z.string(),
)

const stringArraySchema = z.preprocess(
  (value) => (Array.isArray(value) ? value.map((item) => String(item)) : value),
  z.array(z.string()),
)

const comparisonClaimSchema = z.object({
  claim_id: z.string().optional().nullable(),
  text: z.string().optional().default(''),
  type: z.string().optional().default(''),
  grounded: z.boolean().optional().default(false),
  supporting_chunk_ids: stringArraySchema.optional().default([]),
  supporting_quotes: z.array(supportingQuoteSchema).optional().default([]),
  evidence_ids: stringArraySchema.optional().default([]),
  section_ids: stringArraySchema.optional().default([]),
  source: z.string().optional().nullable(),
}).passthrough()

const stringListSchema = z.preprocess(
  (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
  z.array(z.unknown()),
)

const executionAnalysisSchema = z.object({
  main_topic: z.string().optional().default(''),
  claims: z.array(comparisonClaimSchema).optional().default([]),
  subtopics: stringListSchema.optional().default([]),
  conclusions: stringListSchema.optional().default([]),
  information_omitted_from_answer: stringListSchema.optional().default([]),
  unsupported_claims: stringListSchema.optional().default([]),
  evidence_ledger: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  token_usage: tokenUsageSchema.optional().nullable(),
}).passthrough()

const semanticComparisonSchema = z.object({
  shared_main_topic: z.string().optional().default(''),
  consensus_claims: z.array(z.unknown()).optional().default([]),
  equivalent_claims: z.array(z.unknown()).optional().default([]),
  unique_claims_by_strategy: z.record(
    z.string(),
    z.preprocess(
      (value) => (Array.isArray(value) ? value : value == null ? [] : [value]),
      z.array(z.unknown()),
    ),
  ).optional().default({}),
  contradictions: z.array(z.unknown()).optional().default([]),
  coverage_gaps: z.array(z.unknown()).optional().default([]),
  unsupported_claims: z.array(z.unknown()).optional().default([]),
  synthesis_status: z.enum(['valid', 'partial', 'invalid']).optional().default('invalid'),
  synthesis_reason: z.string().optional().default(''),
  combined_synthesis: z.string().optional().default(''),
  retrieval_quality: z.array(z.unknown()).optional().default([]),
  token_usage: tokenUsageSchema.optional().nullable(),
}).passthrough()

const comparisonExecutionSchema = z.object({
  execution_id: z.string(),
  strategy: z.string(),
  provider: z.string().optional().default(''),
  embedding_model: z.string().optional().nullable(),
  generation_model: z.string().optional().nullable(),
  token_usage: tokenUsageSchema.optional().nullable(),
  top_k: z.number().optional().nullable(),
  filters: z.record(z.string(), z.unknown()).optional().default({}),
  raw_answer: z.string().optional().nullable(),
  status: z.string(),
  error: z.string().optional().nullable(),
  chunks: z.array(comparisonChunkSchema).optional().default([]),
  analysis: executionAnalysisSchema.optional().nullable(),
}).passthrough()

const comparisonGroupSchema = z.object({
  comparison_group_id: z.string().optional().nullable(),
  question: z.string().optional().default(''),
  status: z.string().optional().nullable(),
  synthesis_status: z.string().optional().nullable(),
  strategies: z.array(z.string()).optional().default([]),
  comparison: semanticComparisonSchema.optional().nullable(),
  executions: z.array(comparisonExecutionSchema).optional().default([]),
  documents: z.array(z.string()).optional().default([]),
  created_at: z.string().optional().nullable(),
}).passthrough()

const comparisonRunSchema = z.object({
  comparison_group_id: z.string(),
}).passthrough()

const loginResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
}).passthrough()

const resetPasswordSchema = z.object({
  new_password: z.string().min(1),
}).passthrough()

const systemStatusUnitSchema = z.object({
  status: z.string().optional().nullable(),
  latency_ms: z.union([z.number(), z.string()]).optional().nullable(),
  model: z.string().optional().nullable(),
  vector_count: z.union([z.number(), z.string()]).optional().nullable(),
}).passthrough()

const systemStatusSchema = z.object({
  fastapi: systemStatusUnitSchema.optional(),
  ollama: systemStatusUnitSchema.optional(),
  chroma: systemStatusUnitSchema.optional(),
  documents: z.object({
    indexed: z.union([z.number(), z.string()]).optional().nullable(),
    total: z.union([z.number(), z.string()]).optional().nullable(),
    active_provider: z.string().optional().nullable(),
    active_model: z.string().optional().nullable(),
    active_embedding_model: z.string().optional().nullable(),
    reindex_required: z.union([z.number(), z.string()]).optional().nullable(),
  }).passthrough().optional(),
}).passthrough()

const parsePayload = <T>(schema: z.ZodType<T>, payload: unknown, label: string): T => {
  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(`Invalid ${label} response`)
  }
  return parsed.data
}

export const parseStrategies = (payload: unknown) => parsePayload(z.array(optionSchema), payload, 'strategies')
export const parseProviders = (payload: unknown) => parsePayload(z.array(providerSchema), payload, 'providers')
export const parseRagRun = (payload: unknown) => parsePayload(ragRunSchema, payload, 'RAG run')
export const parseRagQuery = (payload: unknown) => parsePayload(ragResultSchema, payload, 'RAG query')
export const parseBenchmarkRun = (payload: unknown) => parsePayload(benchmarkRunSchema, payload, 'benchmark run')
export const parseBenchmarkCompare = (payload: unknown) => parsePayload(benchmarkCompareSchema, payload, 'benchmark compare')
export const parseExperiments = (payload: unknown) => parsePayload(z.array(experimentSchema), payload, 'experiments')
export const parseUsers = (payload: unknown) => parsePayload(z.array(userSchema), payload, 'users')
export const parseCurrentUser = (payload: unknown) => parsePayload(currentUserSchema, payload, 'current user')
export const parseSettings = (payload: unknown) => parsePayload(settingsSchema, payload, 'settings')
export const parseOllamaModels = (payload: unknown) => parsePayload(ollamaModelsSchema, payload, 'ollama models')
export const parseOllamaTest = (payload: unknown) => parsePayload(ollamaTestSchema, payload, 'ollama test')
export const parseProviderTest = (payload: unknown) => parsePayload(providerTestSchema, payload, 'provider test')
export const parseDocuments = (payload: unknown) => parsePayload(z.array(documentSchema), payload, 'documents')
export const parseUploadedDocument = (payload: unknown) => parsePayload(uploadedDocumentSchema, payload, 'uploaded document')
export const parseIngestionJob = (payload: unknown) => parsePayload(ingestionJobSchema, payload, 'ingestion job')
export const parseExecutions = (payload: unknown) => parsePayload(z.array(executionSchema), payload, 'executions')
export const parseComparisonGroups = (payload: unknown) => parsePayload(z.array(comparisonGroupSchema), payload, 'comparison groups')
export const parseComparisonGroup = (payload: unknown) => parsePayload(comparisonGroupSchema, payload, 'comparison group')
export const parseComparisonRun = (payload: unknown) => parsePayload(comparisonRunSchema, payload, 'comparison run')
export const parseLoginResponse = (payload: unknown) => parsePayload(loginResponseSchema, payload, 'login')
export const parseResetPassword = (payload: unknown) => parsePayload(resetPasswordSchema, payload, 'reset password')
export const parseSystemStatus = (payload: unknown) => parsePayload(systemStatusSchema, payload, 'system status')

export type StrategyOption = z.infer<typeof optionSchema>
export type ProviderOption = z.infer<typeof providerSchema>
export type RagQuery = z.infer<typeof ragResultSchema>
export type RagRun = z.infer<typeof ragRunSchema>
export type BenchmarkRun = z.infer<typeof benchmarkRunSchema>
export type BenchmarkCompare = z.infer<typeof benchmarkCompareSchema>
export type Experiment = z.infer<typeof experimentSchema>
export type UserAccount = z.infer<typeof userSchema>
export type SettingsResponse = z.infer<typeof settingsSchema>
export type OllamaModelsResponse = z.infer<typeof ollamaModelsSchema>
export type ProviderTestResponse = z.infer<typeof providerTestSchema>
export type DocumentItem = z.infer<typeof documentSchema>
export type UploadedDocument = z.infer<typeof uploadedDocumentSchema>
export type IngestionJob = z.infer<typeof ingestionJobSchema>
export type ExecutionItem = z.infer<typeof executionSchema>
export type ComparisonGroup = z.infer<typeof comparisonGroupSchema>
export type ComparisonRun = z.infer<typeof comparisonRunSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type ResetPasswordResponse = z.infer<typeof resetPasswordSchema>
export type SystemStatus = z.infer<typeof systemStatusSchema>
