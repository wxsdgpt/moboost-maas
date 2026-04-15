/**
 * SpecValidationBadge — visual rendering of `UploadedAssetValidation`s.
 *
 * Designed to drop into the Stage 1 intake card list. Compact by default,
 * expandable to show every Violation with its fix suggestion.
 *
 * Color logic (Tailwind tokens — no external palette):
 *   ok        → emerald
 *   warning   → amber
 *   blocker   → rose
 *
 * Why a separate file?
 *   - reusable across /brief/new (picker mode), /brief/chat (agent mode), and
 *     a future Stage 4 "delivery report" page
 *   - keeps validation rendering logic out of page-level components, which
 *     ADL says should stay thin (stability > novelty)
 */
'use client'

import { useState } from 'react'
import type { UploadedAssetValidation } from '@/lib/briefTypes'

interface Props {
  validations: UploadedAssetValidation[]
  /** When true, render only the top fit as a single chip (compact mode) */
  compact?: boolean
}

function chipColor(v: UploadedAssetValidation): string {
  if (!v.ok) return 'bg-rose-50 border-rose-200 text-rose-600'
  if (v.warnings > 0) return 'bg-amber-50 border-amber-200 text-amber-600'
  return 'bg-blue-50 border-blue-200 text-[#0071e3]'
}

function chipIcon(v: UploadedAssetValidation): string {
  if (!v.ok) return '✗'
  if (v.warnings > 0) return '△'
  return '✓'
}

export default function SpecValidationBadge({ validations, compact = false }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (!validations || validations.length === 0) return null

  if (compact) {
    const top = validations[0]
    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 border ${chipColor(top)}`}
        title={top.summary}
        style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}
      >
        {chipIcon(top)} {top.specId} {top.score}
      </span>
    )
  }

  return (
    <div className="mt-2 space-y-1" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <div className="flex flex-wrap gap-1.5">
        {validations.slice(0, expanded ? validations.length : 4).map((v) => (
          <span
            key={v.specId}
            className={`inline-flex items-center gap-1 text-[11px] rounded px-2 py-0.5 border ${chipColor(v)}`}
            title={v.summary}
          >
            {chipIcon(v)} {v.specId}
            <span className="opacity-70">{v.score}</span>
          </span>
        ))}
        {validations.length > 4 && (
          <button
            type="button"
            className="text-[11px] text-[#0071e3] hover:text-[#0066cc] underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? '收起' : `+${validations.length - 4} 更多`}
          </button>
        )}
      </div>
      {/* Show the top hint sentence below the chips for the most useful spec */}
      <div className="text-[11px] text-[#6f6f77] leading-snug">
        {validations[0].summary}
      </div>
    </div>
  )
}
