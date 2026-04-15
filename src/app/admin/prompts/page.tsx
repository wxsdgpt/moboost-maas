'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronUp, AlertCircle, Clock, Cpu, Filter } from 'lucide-react'

type PromptLog = {
  id: string
  user_id: string | null
  project_id: string | null
  caller: string
  action: string | null
  model: string
  system_prompt: string | null
  user_prompt: string
  admin_context: string | null
  response_text: string | null
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  latency_ms: number | null
  cost_usd: number | null
  status: string
  error_message: string | null
  created_at: string
}

export default function AdminPromptsPage() {
  const [logs, setLogs] = useState<PromptLog[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const limit = 30

  // Filters
  const [callerFilter, setCallerFilter] = useState('')
  const [modelFilter, setModelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const loadLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
      if (callerFilter) params.set('caller', callerFilter)
      if (modelFilter) params.set('model', modelFilter)
      if (statusFilter) params.set('status', statusFilter)

      const res = await fetch(`/api/admin/prompts?${params}`)
      const data = await res.json()
      if (data.ok) {
        setLogs(data.logs)
        setTotal(data.total)
      }
    } catch (e) {
      console.error('Failed to load logs:', e)
    } finally {
      setLoading(false)
    }
  }, [offset, callerFilter, modelFilter, statusFilter])

  useEffect(() => { loadLogs() }, [loadLogs])

  const statusColor = (s: string) => {
    if (s === 'success') return '#34a853'
    if (s === 'error') return '#d32f2f'
    if (s === 'timeout') return '#f57c00'
    return '#555'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Cpu className="w-6 h-6" style={{ color: '#0071e3' }} />
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: '#000' }}>
            Prompt Logs
          </h1>
          <p className="text-[14px]" style={{ color: '#555' }}>
            Monitor all LLM API calls — prompts, responses, and metrics
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <Filter className="w-4 h-4" style={{ color: '#999' }} />
        <input
          type="text"
          value={callerFilter}
          onChange={e => { setCallerFilter(e.target.value); setOffset(0) }}
          placeholder="Filter by caller..."
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] focus:outline-none focus:border-blue-400"
          style={{ background: '#fafafa', color: '#000', width: '160px' }}
        />
        <input
          type="text"
          value={modelFilter}
          onChange={e => { setModelFilter(e.target.value); setOffset(0) }}
          placeholder="Filter by model..."
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] focus:outline-none focus:border-blue-400"
          style={{ background: '#fafafa', color: '#000', width: '200px' }}
        />
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setOffset(0) }}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] focus:outline-none focus:border-blue-400"
          style={{ background: '#fafafa', color: '#000' }}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
          <option value="timeout">Timeout</option>
        </select>
        <span className="text-[12px]" style={{ color: '#999' }}>
          {total} total logs
        </span>
      </div>

      {/* Logs list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#0071e3' }} />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-[14px]" style={{ color: '#999' }}>
          No prompt logs found
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div
              key={log.id}
              className="rounded-xl border border-gray-200 overflow-hidden transition-all"
              style={{ background: '#ffffff' }}
            >
              {/* Summary row */}
              <button
                type="button"
                onClick={() => setExpandedId(prev => prev === log.id ? null : log.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                      style={{ background: statusColor(log.status) }}
                    />
                    <span className="text-[13px] font-medium truncate" style={{ color: '#000' }}>
                      {log.caller}
                      {log.action ? ` → ${log.action}` : ''}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: '#f0f0f3', color: '#555' }}>
                      {log.model?.split('/').pop()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0 text-[12px]" style={{ color: '#999' }}>
                  {log.total_tokens && (
                    <span>{log.total_tokens.toLocaleString()} tok</span>
                  )}
                  {log.latency_ms && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(log.latency_ms / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span>{new Date(log.created_at).toLocaleTimeString()}</span>
                  {expandedId === log.id ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </button>

              {/* Expanded detail */}
              {expandedId === log.id && (
                <div className="border-t border-gray-100 px-4 py-4 space-y-4">
                  {log.error_message && (
                    <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-[13px]" style={{ background: '#ffe5e5', color: '#d32f2f' }}>
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{log.error_message}</span>
                    </div>
                  )}

                  {log.admin_context && (
                    <DetailBlock label="Admin Context (injected)" content={log.admin_context} />
                  )}
                  {log.system_prompt && (
                    <DetailBlock label="System Prompt" content={log.system_prompt} />
                  )}
                  <DetailBlock label="User Prompt" content={log.user_prompt} />
                  {log.response_text && (
                    <DetailBlock label="Response" content={log.response_text} />
                  )}

                  <div className="flex flex-wrap gap-4 text-[12px]" style={{ color: '#999' }}>
                    <span>Input: {log.input_tokens?.toLocaleString() ?? '—'} tokens</span>
                    <span>Output: {log.output_tokens?.toLocaleString() ?? '—'} tokens</span>
                    <span>Latency: {log.latency_ms ? `${(log.latency_ms / 1000).toFixed(2)}s` : '—'}</span>
                    <span>Model: {log.model}</span>
                    <span>ID: {log.id.slice(0, 8)}…</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button
            onClick={() => setOffset(prev => Math.max(0, prev - limit))}
            disabled={offset === 0}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-30"
            style={{ background: '#f5f5f7', color: '#000', border: '1px solid #e5e5e5' }}
          >
            Previous
          </button>
          <span className="text-[13px]" style={{ color: '#555' }}>
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(prev => prev + limit)}
            disabled={offset + limit >= total}
            className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-30"
            style={{ background: '#f5f5f7', color: '#000', border: '1px solid #e5e5e5' }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

function DetailBlock({ label, content }: { label: string; content: string }) {
  return (
    <div>
      <div className="text-[12px] font-medium mb-1" style={{ color: '#999' }}>
        {label}
      </div>
      <pre
        className="rounded-lg px-3 py-2 text-[13px] overflow-x-auto whitespace-pre-wrap"
        style={{ background: '#fafafa', color: '#000', maxHeight: '200px', overflowY: 'auto' }}
      >
        {content}
      </pre>
    </div>
  )
}
