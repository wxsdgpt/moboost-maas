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
    <div className="rounded-lg p-5 animate-fade-in" style={{ background: 'var(--surface-3)', boxShadow: 'var(--shadow-md)', fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <div className="flex items-center gap-2 mb-4">
        <Cpu className="w-4 h-4 text-[var(--brand)]" />
        <span className="text-xs font-semibold text-[var(--brand)] uppercase tracking-wider">Model Router</span>
        {phase === 'analyzing' && (
          <span className="ml-auto text-xs text-[var(--text-3)] flex items-center gap-1.5">
            Analyzing task requirements
            <span className="flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-[var(--brand)] thinking-dot" />
              <span className="w-1 h-1 rounded-full bg-[var(--brand)] thinking-dot" />
              <span className="w-1 h-1 rounded-full bg-[var(--brand)] thinking-dot" />
            </span>
          </span>
        )}
        {phase === 'selected' && (
          <span className="ml-auto text-xs text-[var(--brand)] flex items-center gap-1">
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
            `}
            style={{ background: selectedIdx === i ? 'var(--brand-light)' : 'var(--surface-3)' }}
          >
            <div className="flex-1 flex items-center gap-3">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text-1)' }}>{c.name}</span>
              <span className="text-[11px] text-[var(--text-3)]">{c.speed}</span>
              <span className="text-[11px] text-[var(--text-3)]">{c.quality}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div
                  className="h-full rounded-full score-fill"
                  style={{
                    width: i < visibleCount ? `${c.matchScore}%` : '0%',
                    background: c.matchScore >= 90 ? 'var(--brand)' : c.matchScore >= 80 ? '#F59E0B' : 'var(--border)',
                  }}
                />
              </div>
              <span className={`text-xs font-bold min-w-[32px] text-right ${
                selectedIdx === i ? 'text-[var(--brand)]' : 'text-[var(--text-3)]'
              }`}>
                {c.matchScore}%
              </span>
              {selectedIdx === i && <Sparkles className="w-3.5 h-3.5 text-[var(--brand)]" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
