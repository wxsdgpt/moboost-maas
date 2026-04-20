'use client'

import { useState, useEffect } from 'react'
import { Brain, Check, Loader2, ChevronRight } from 'lucide-react'
import { ThinkingStep } from '@/lib/store'

interface Props {
  steps: ThinkingStep[]
  isActive: boolean
}

export default function ThinkingPanel({ steps, isActive }: Props) {
  const [animatedSteps, setAnimatedSteps] = useState<ThinkingStep[]>(steps)

  // Animate steps one by one
  useEffect(() => {
    if (!isActive || steps.length === 0) return

    setAnimatedSteps(steps.map(s => ({ ...s, status: 'pending' })))

    let currentIdx = 0
    const interval = setInterval(() => {
      if (currentIdx >= steps.length) {
        clearInterval(interval)
        return
      }

      setAnimatedSteps(prev => prev.map((s, i) => {
        if (i < currentIdx) return { ...s, status: 'done' }
        if (i === currentIdx) return { ...s, status: 'active' }
        return { ...s, status: 'pending' }
      }))

      currentIdx++
    }, 2200) // Each step takes ~2.2s

    return () => clearInterval(interval)
  }, [isActive, steps])

  if (!isActive && animatedSteps.every(s => s.status === 'pending')) return null

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-3)', borderLeft: '1px solid var(--border)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      {/* Header */}
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-[var(--brand)]" />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-1)' }}>Thinking Process</span>
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <div className="space-y-1">
          {animatedSteps.map((step, i) => (
            <div
              key={step.id}
              className={`
                flex items-start gap-3 px-3 py-2.5 rounded-lg transition-all duration-500
                ${step.status === 'done' ? 'opacity-60' : ''}
                ${step.status === 'pending' ? 'opacity-30' : ''}
              `}
              style={step.status === 'active' ? { background: 'var(--brand-light)' } : undefined}
            >
              {/* Status indicator */}
              <div className="mt-0.5 flex-shrink-0">
                {step.status === 'done' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
                    <Check className="w-3 h-3 text-[var(--brand)]" />
                  </div>
                )}
                {step.status === 'active' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--brand-light)' }}>
                    <Loader2 className="w-3 h-3 text-[var(--brand)] animate-spin" />
                  </div>
                )}
                {step.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-3)' }}>
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--border)' }} />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold" style={{ color: 'var(--text-1)' }}>
                  {step.label}
                </div>
                <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: 'var(--text-3)' }}>
                  {step.detail}
                </div>
              </div>

              {/* Step number */}
              <span className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--border)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        {isActive ? (
          <div className="flex items-center gap-2 text-xs text-[var(--brand)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-3)' }}>
            <Check className="w-3 h-3" />
            <span>{animatedSteps.filter(s => s.status === 'done').length}/{animatedSteps.length} steps completed</span>
          </div>
        )}
      </div>
    </div>
  )
}
