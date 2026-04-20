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
  if (!v.ok) return 'bg-rose-900/30 border-rose-700 text-rose-400'
  if (v.warnings > 0) return 'bg-amber-900/30 border-amber-700 text-amber-400'
  return 'bg-[rgba(192,228,99,0.08)] border-[rgba(192,228,99,0.2)] text-[var(--brand)]'
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
            className="text-[11px] text-[var(--brand)] hover:text-[#a8d44a] underline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? 'Collapse' : `+${validations.length - 4} more`}
          </button>
        )}
      </div>
      {/* Show the top hint sentence below the chips for the most useful spec */}
      <div className="text-[11px] text-[var(--text-3)] leading-snug">
        {validations[0].summary}
      </div>
    </div>
  )
}
