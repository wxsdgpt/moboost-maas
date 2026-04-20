'use client'

import { useState } from 'react'
import {
  Brain,
  Database,
  Cpu,
  Layout,
  PenTool,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Code2,
  FileText,
  Layers,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────

type TabKey = 'agent' | 'data' | 'engine' | 'frontend'

interface OrchestratorResult {
  ok: boolean
  plan?: {
    steps: Array<{ agent: string; description: string; status: string }>
    newFiles: string[]
    modifiedFiles: string[]
    migrations: string[]
    envVars: string[]
    estimatedEffort: string
  }
  results?: Record<string, unknown>
  error?: string
}

// ─── Component ────────────────────────────────────────────────────────

export default function AdminMetaPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('agent')
  const [prompt, setPrompt] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<OrchestratorResult | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(null)

  const tabs: Array<{ key: TabKey; icon: React.ElementType; label: string; description: string; color: string }> = [
    { key: 'agent', icon: PenTool, label: 'Agent定义', description: '从自然语言创建新Agent', color: '#e94560' },
    { key: 'data', icon: Database, label: '数据架构师', description: '设计数据库schema和迁移', color: 'var(--brand)' },
    { key: 'engine', icon: Cpu, label: '引擎架构师', description: '模型路由和管道设计', color: '#5e5ce6' },
    { key: 'frontend', icon: Layout, label: '前端架构师', description: '生成UI组件和页面', color: '#ff9500' },
  ]

  const activeTabInfo = tabs.find((t) => t.key === activeTab)!

  const placeholders: Record<TabKey, string> = {
    agent: '描述你想创建的Agent，例如："创建一个专门做A/B测试分析的Agent，能够对比不同素材版本的表现数据，给出统计显著性判断和优化建议"',
    data: '描述数据需求，例如："我需要存储广告素材的A/B测试数据，包括各版本的曝光量、点击率、转化率，以及统计显著性结果"',
    engine: '描述引擎需求，例如："需要一个文案生成管道，先用Gemini做初稿，再用Claude做风格优化，最后做合规检查"',
    frontend: '描述页面需求，例如："创建A/B测试仪表盘页面，左侧展示测试列表，右侧展示选中测试的详细对比数据和图表"',
  }

  const scopeMap: Record<TabKey, string> = {
    agent: 'agent',
    data: 'feature',
    engine: 'feature',
    frontend: 'feature',
  }

  const handleRun = async () => {
    if (!prompt.trim()) return
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request: prompt,
          scope: scopeMap[activeTab],
          focus: activeTab === 'agent' ? undefined : activeTab,
        }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ ok: false, error: '请求失败，请重试' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
          <Brain className="w-6 h-6" style={{ color: '#e94560' }} />
          Meta-Agent 工厂
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-2)' }}>
          用自然语言驱动平台建设 · Agent定义Agent → 数据 → 引擎 → 前端
        </p>
      </div>

      {/* Tab Selector */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {tabs.map(({ key, icon: Icon, label, description, color }) => (
          <button
            key={key}
            onClick={() => { setActiveTab(key); setResult(null) }}
            className="rounded-xl p-4 text-left transition-all"
            style={{
              background: activeTab === key ? `${color}15` : 'var(--surface-3)',
              border: `1px solid ${activeTab === key ? `${color}40` : 'var(--border)'}`,
            }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className="w-4 h-4" style={{ color: activeTab === key ? color : 'var(--text-3)' }} />
              <span className="text-sm font-semibold" style={{ color: activeTab === key ? 'var(--text-1)' : 'var(--text-2)' }}>
                {label}
              </span>
            </div>
            <p className="text-[11px]" style={{ color: 'var(--text-3)' }}>{description}</p>
          </button>
        ))}
      </div>

      {/* Input Area */}
      <div
        className="rounded-xl p-6 mb-6"
        style={{
          background: 'var(--surface-3)',
          border: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4" style={{ color: activeTabInfo.color }} />
          <span className="text-sm font-semibold text-white">{activeTabInfo.label}</span>
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={placeholders[activeTab]}
          rows={4}
          className="w-full rounded-xl px-4 py-3 text-sm text-white resize-none outline-none transition-all"
          style={{
            background: 'var(--surface-3)',
            border: '1px solid var(--border-strong)',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = activeTabInfo.color }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
        />
        <div className="flex items-center justify-between mt-3">
          <div className="text-[11px]" style={{ color: 'var(--text-3)' }}>
            {activeTab === 'agent'
              ? 'Agent定义 → 自动分析基础设施需求 → 编排Data/Engine/Frontend Architect'
              : `将调用 ${activeTabInfo.label} 进行分析和代码生成`
            }
          </div>
          <button
            onClick={handleRun}
            disabled={running || !prompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: `linear-gradient(135deg, ${activeTabInfo.color} 0%, ${activeTabInfo.color}cc 100%)`,
              boxShadow: `0 4px 16px ${activeTabInfo.color}40`,
            }}
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? '生成中...' : '开始生成'}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Status */}
          <div
            className="rounded-xl p-4 flex items-center gap-3"
            style={{
              background: result.ok ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
              border: `1px solid ${result.ok ? 'rgba(52, 199, 89, 0.2)' : 'rgba(255, 59, 48, 0.2)'}`,
            }}
          >
            {result.ok
              ? <CheckCircle2 className="w-5 h-5" style={{ color: '#34c759' }} />
              : <XCircle className="w-5 h-5" style={{ color: '#ff3b30' }} />
            }
            <span className="text-sm font-medium text-white">
              {result.ok ? '生成完成' : `生成失败: ${result.error}`}
            </span>
          </div>

          {/* Implementation Plan */}
          {result.ok && result.plan && (
            <>
              {/* Steps */}
              <div
                className="rounded-xl p-6"
                style={{
                  background: 'var(--surface-3)',
                  border: '1px solid var(--border)',
                }}
              >
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4" style={{ color: '#e94560' }} />
                  实施计划
                  <span className="text-[10px] font-normal" style={{ color: 'var(--text-3)' }}>
                    预估工作量: {result.plan.estimatedEffort}
                  </span>
                </h3>
                <div className="space-y-2">
                  {result.plan.steps.map((step: { agent: string; description: string; status: string }, i: number) => (
                    <button
                      key={i}
                      onClick={() => setExpandedStep(expandedStep === i ? null : i)}
                      className="w-full text-left rounded-lg p-3 transition-all"
                      style={{ background: 'var(--surface-3)', border: '1px solid var(--surface-3)' }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                          style={{ background: 'rgba(233,69,96,0.2)', color: '#e94560' }}
                        >
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <span className="text-xs font-medium text-white">{step.agent}</span>
                          <span className="text-[10px] ml-2" style={{ color: 'var(--text-3)' }}>{step.status}</span>
                        </div>
                        {expandedStep === i
                          ? <ChevronDown className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                          : <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-3)' }} />
                        }
                      </div>
                      {expandedStep === i && (
                        <p className="text-xs mt-2 ml-9 leading-relaxed" style={{ color: 'var(--text-2)' }}>
                          {step.description}
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Files Overview */}
              <div className="grid grid-cols-2 gap-4">
                {result.plan.newFiles.length > 0 && (
                  <div
                    className="rounded-xl p-5"
                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
                  >
                    <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5" style={{ color: '#34c759' }} />
                      新文件 ({result.plan.newFiles.length})
                    </h4>
                    <div className="space-y-1">
                      {result.plan.newFiles.map((f: string, i: number) => (
                        <div key={i} className="text-[11px] font-mono" style={{ color: 'var(--text-2)' }}>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {result.plan.modifiedFiles.length > 0 && (
                  <div
                    className="rounded-xl p-5"
                    style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
                  >
                    <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                      <Code2 className="w-3.5 h-3.5" style={{ color: '#ff9500' }} />
                      修改文件 ({result.plan.modifiedFiles.length})
                    </h4>
                    <div className="space-y-1">
                      {result.plan.modifiedFiles.map((f: string, i: number) => (
                        <div key={i} className="text-[11px] font-mono" style={{ color: 'var(--text-2)' }}>
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Migrations & Env Vars */}
              {(result.plan.migrations.length > 0 || result.plan.envVars.length > 0) && (
                <div className="grid grid-cols-2 gap-4">
                  {result.plan.migrations.length > 0 && (
                    <div
                      className="rounded-xl p-5"
                      style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
                    >
                      <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                        <Database className="w-3.5 h-3.5" style={{ color: '#5e5ce6' }} />
                        数据库迁移 ({result.plan.migrations.length})
                      </h4>
                      <div className="space-y-1">
                        {result.plan.migrations.map((m: string, i: number) => (
                          <div key={i} className="text-[11px] font-mono" style={{ color: 'var(--text-2)' }}>
                            {m}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {result.plan.envVars.length > 0 && (
                    <div
                      className="rounded-xl p-5"
                      style={{ background: 'var(--surface-3)', border: '1px solid var(--border)' }}
                    >
                      <h4 className="text-xs font-semibold text-white mb-3 flex items-center gap-2">
                        <Cpu className="w-3.5 h-3.5" style={{ color: '#ff9500' }} />
                        环境变量
                      </h4>
                      <div className="space-y-1">
                        {result.plan.envVars.map((v: string, i: number) => (
                          <div key={i} className="text-[11px] font-mono" style={{ color: 'var(--text-2)' }}>
                            {v}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
