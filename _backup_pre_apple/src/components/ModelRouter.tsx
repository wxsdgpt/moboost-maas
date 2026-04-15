'use client'

import { useState, useEffect } from 'react'
import { Cpu, CheckCircle2, Sparkles } from 'lucide-react'
import { ModelCandidate } from '@/types'

interface Props {
  taskType: 'image' | 'video'
  onComplete: (model: ModelCandidate) => void
}

const IMAGE_CANDIDATES: ModelCandidate[] = [
  { id: 'google/gemini-3-pro-image-preview', name: 'NanoBanana Pro', type: 'image', matchScore: 96, speed: '~8s', quality: 'Ultra (2K/4K)', cost: '$0.04/img' },
  { id: 'midjourney/v6', name: 'Midjourney V6', type: 'image', matchScore: 88, speed: '~15s', quality: 'High', cost: '$0.08/img' },
  { id: 'stability/sdxl-turbo', name: 'Stable Diffusion XL', type: 'image', matchScore: 72, speed: '~3s', quality: 'Medium-High', cost: '$0.01/img' },
  { id: 'openai/dall-e-3', name: 'DALL-E 3', type: 'image', matchScore: 78, speed: '~12s', quality: 'High', cost: '$0.06/img' },
]

const VIDEO_CANDIDATES: ModelCandidate[] = [
  { id: 'google/veo-3.1', name: 'VEO 3.1', type: 'video', matchScore: 94, speed: '~45s', quality: 'Ultra', cost: '$0.12/clip' },
  { id: 'openai/sora', name: 'Sora', type: 'video', matchScore: 89, speed: '~60s', quality: 'High', cost: '$0.15/clip' },
  { id: 'runway/gen3', name: 'Runway Gen-3', type: 'video', matchScore: 74, speed: '~30s', quality: 'Medium-High', cost: '$0.10/clip' },
]

export default function ModelRouter({ taskType, onComplete }: Props) {
  const candidates = taskType === 'image' ? IMAGE_CANDIDATES : VIDEO_CANDIDATES
  const [phase, setPhase] = useState<'analyzing' | 'scoring' | 'selected'>('analyzing')
  const [visibleCount, setVisibleCount] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState(-1)

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase('scoring')
      candidates.forEach((_, i) => {
        setTimeout(() => setVisibleCount(i + 1), i * 400)
      })
    }, 1200)

    const t2 = setTimeout(() => {
      setSelectedIdx(0)
      setPhase('selected')
      setTimeout(() => onComplete(candidates[0]), 800)
    }, 1200 + candidates.length * 400 + 600)

    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  return (
    <div className="bg-white rounded-xl border border-[var(--border)] p-5 shadow-sm animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-emerald-600" />
        <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Model Router</span>
        {phase === 'analyzing' && (
          <span className="ml-auto text-xs text-gray-400 flex items-center gap-1.5">
            Analyzing task requirements
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-emerald-400 thinking-dot" />
              <span className="w-1 h-1 rounded-full bg-emerald-400 thinking-dot" />
              <span className="w-1 h-1 rounded-full bg-emerald-400 thinking-dot" />
            </span>
          </span>
        )}
        {phase === 'selected' && (
          <span className="ml-auto text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Best model selected
          </span>
        )}
      </div>

      <div className="space-y-2">
        {candidates.map((c, i) => (
          <div
            key={c.id}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-500
              ${i >= visibleCount ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}
              ${selectedIdx === i
                ? 'bg-emerald-50 border border-emerald-200'
                : 'bg-[var(--bg-secondary)] border border-transparent'
              }
            `}
          >
            <div className="flex-1 flex items-center gap-3">
              <span className="text-[13px] font-semibold text-gray-900">{c.name}</span>
              <span className="text-[11px] text-gray-400">{c.speed}</span>
              <span className="text-[11px] text-gray-400">{c.quality}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className="h-full rounded-full score-fill"
                  style={{
                    width: i < visibleCount ? `${c.matchScore}%` : '0%',
                    background: c.matchScore >= 90 ? '#10B981' : c.matchScore >= 80 ? '#F59E0B' : '#D1D5DB',
                  }}
                />
              </div>
              <span className={`text-xs font-bold min-w-[32px] text-right ${
                selectedIdx === i ? 'text-emerald-600' : 'text-gray-500'
              }`}>
                {c.matchScore}%
              </span>
              {selectedIdx === i && <Sparkles className="w-3.5 h-3.5 text-emerald-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
