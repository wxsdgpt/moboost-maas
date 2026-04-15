'use client'

import { useState, useEffect } from 'react'
import { Loader2, Save, Check, AlertCircle, Settings } from 'lucide-react'

type ConfigEntry = {
  key: string
  value: unknown
  description: string | null
  updated_by: string | null
  updated_at: string
}

export default function AdminConfigPage() {
  const [configs, setConfigs] = useState<ConfigEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  useEffect(() => {
    loadConfigs()
  }, [])

  async function loadConfigs() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/config')
      const data = await res.json()
      if (data.ok) {
        setConfigs(data.configs)
        const vals: Record<string, string> = {}
        for (const c of data.configs) {
          vals[c.key] = typeof c.value === 'string' ? c.value : JSON.stringify(c.value, null, 2)
        }
        setEditValues(vals)
      }
    } catch (e) {
      console.error('Failed to load configs:', e)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig(key: string) {
    setSaving(prev => ({ ...prev, [key]: true }))
    setSaved(prev => ({ ...prev, [key]: false }))
    setErrors(prev => ({ ...prev, [key]: '' }))

    try {
      let value: unknown = editValues[key]
      // Try to parse as JSON
      try { value = JSON.parse(editValues[key]) } catch { /* keep as string */ }

      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      const data = await res.json()
      if (data.ok) {
        setSaved(prev => ({ ...prev, [key]: true }))
        setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 2000)
      } else {
        setErrors(prev => ({ ...prev, [key]: data.error || 'Save failed' }))
      }
    } catch (e) {
      setErrors(prev => ({ ...prev, [key]: (e as Error).message }))
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  // Determine input type based on key
  function getInputType(key: string): 'textarea' | 'select' | 'input' {
    if (key === 'system_context' || key === 'intent_detection_prompt') return 'textarea'
    if (key === 'onboarding_variant') return 'select'
    return 'input'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#0071e3' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="w-6 h-6" style={{ color: '#0071e3' }} />
        <div>
          <h1 className="text-[24px] font-bold tracking-tight" style={{ color: '#000' }}>
            System Configuration
          </h1>
          <p className="text-[14px]" style={{ color: '#555' }}>
            Configure LLM prompts, models, and A/B test variants
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {configs.map(config => {
          const inputType = getInputType(config.key)
          return (
            <div
              key={config.key}
              className="rounded-xl border border-gray-200 p-6"
              style={{ background: '#ffffff' }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-[15px] font-semibold" style={{ color: '#000' }}>
                    {config.key}
                  </h3>
                  {config.description && (
                    <p className="text-[13px] mt-1" style={{ color: '#555' }}>
                      {config.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => saveConfig(config.key)}
                  disabled={saving[config.key]}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium text-white transition-all disabled:opacity-50"
                  style={{ background: saved[config.key] ? '#34a853' : '#0071e3' }}
                >
                  {saving[config.key] ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : saved[config.key] ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {saved[config.key] ? 'Saved' : 'Save'}
                </button>
              </div>

              {inputType === 'textarea' ? (
                <textarea
                  value={editValues[config.key] || ''}
                  onChange={(e) => setEditValues(prev => ({ ...prev, [config.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] font-mono focus:outline-none focus:border-blue-400"
                  style={{ background: '#fafafa', color: '#000', minHeight: '120px', resize: 'vertical' }}
                />
              ) : inputType === 'select' ? (
                <select
                  value={editValues[config.key] || ''}
                  onChange={(e) => setEditValues(prev => ({ ...prev, [config.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] focus:outline-none focus:border-blue-400"
                  style={{ background: '#fafafa', color: '#000' }}
                >
                  <option value="form">form</option>
                  <option value="chat">chat</option>
                  <option value="hybrid">hybrid</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={editValues[config.key] || ''}
                  onChange={(e) => setEditValues(prev => ({ ...prev, [config.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-[14px] focus:outline-none focus:border-blue-400"
                  style={{ background: '#fafafa', color: '#000' }}
                />
              )}

              {errors[config.key] && (
                <div className="flex items-center gap-1.5 mt-2 text-[12px]" style={{ color: '#d32f2f' }}>
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors[config.key]}
                </div>
              )}

              {config.updated_at && (
                <p className="text-[11px] mt-2" style={{ color: '#999' }}>
                  Last updated: {new Date(config.updated_at).toLocaleString()}
                  {config.updated_by ? ` by ${config.updated_by}` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
