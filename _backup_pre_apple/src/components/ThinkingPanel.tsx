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
    <div className="h-full flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border)]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border-light)]">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Thinking Process</span>
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
                ${step.status === 'active' ? 'bg-white border border-emerald-100 shadow-sm' : ''}
                ${step.status === 'done' ? 'opacity-60' : ''}
                ${step.status === 'pending' ? 'opacity-30' : ''}
              `}
            >
              {/* Status indicator */}
              <div className="mt-0.5 flex-shrink-0">
                {step.status === 'done' && (
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Check className="w-3 h-3 text-emerald-600" />
                  </div>
                )}
                {step.status === 'active' && (
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center">
                    <Loader2 className="w-3 h-3 text-emerald-600 animate-spin" />
                  </div>
                )}
                {step.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className={`text-xs font-semibold ${
                  step.status === 'active' ? 'text-gray-900' : 'text-gray-600'
                }`}>
                  {step.label}
                </div>
                <div className={`text-[11px] mt-0.5 leading-relaxed ${
                  step.status === 'active' ? 'text-gray-500' : 'text-gray-400'
                }`}>
                  {step.detail}
                </div>
              </div>

              {/* Step number */}
              <span className="text-[10px] text-gray-300 font-mono mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Footer status */}
      <div className="px-4 py-3 border-t border-[var(--border-light)]">
        {isActive ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Processing...</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Check className="w-3 h-3" />
            <span>{animatedSteps.filter(s => s.status === 'done').length}/{animatedSteps.length} steps completed</span>
          </div>
        )}
      </div>
    </div>
  )
}
