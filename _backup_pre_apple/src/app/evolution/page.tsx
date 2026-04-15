'use client'

import { useState } from 'react'
import { Dna, User, TrendingUp, MessageSquare, FileText, Clock, Brain, Sparkles } from 'lucide-react'

// Mock .md content — in production these come from local files
const MOCK_PROFILE = `# User Profile

## Preferences
- **Industry focus:** iGaming — Sports Betting
- **Color palette:** Dark premium + Green accent (#10B981)
- **Preferred dimensions:** 1200x628 (Facebook), 1080x1080 (Instagram), 1920x1080 (Display)
- **Tone:** Professional, high-energy, action-oriented
- **Language:** English (primary), simplified Chinese (secondary)

## Style Patterns Detected
- Prefers dark backgrounds with neon accent colors
- Favors bold typography with short headlines (< 6 words)
- CTAs always use contrasting bright colors
- Consistently uses sports action imagery over static logos

## Generation Stats
- Total generations: 47
- Approval rate: 78%
- Most common rejection reason: "Not eye-catching enough" (D3 score < 7)
- Average D1-D4 scores: 8.2 / 7.5 / 6.8 / 7.1

_Last updated: 2026-04-04T12:30:00Z_`

const MOCK_EVOLUTION = `# Preference Evolution

### 2026-04-04 11:22:00
User rejected 3 consecutive sports banners with blue-dominant color scheme. Adjusted preference: **dark backgrounds strongly preferred over blue**. D3 score improved from 5.8 → 7.4 after this change.

### 2026-04-03 16:45:00
User approved a banner with animated gradient border effect. Added to preference: **subtle animation effects** increase approval probability by ~30%.

### 2026-04-03 09:10:00
User uploaded 5 reference images from DraftKings campaigns. Pattern extracted: **bold numeric odds display + player action shots** is the preferred hero layout.

### 2026-04-02 14:30:00
First generation session. User provided initial brief for BetKing Q2 campaign. Baseline preferences established: sports, dark theme, green accent.`

const MOCK_FEEDBACK = `# Feedback Loop Summary

## Positive Patterns (from approved assets)
- Dark gradient backgrounds → 92% approval
- Sports action photography → 88% approval
- Bold CTA with "$" value → 85% approval
- Compact text (< 15 words total) → 80% approval

## Negative Patterns (from rejected assets)
- Light/white backgrounds → 15% approval (almost always rejected)
- Generic stock imagery → 22% approval
- Dense text blocks → 30% approval
- Small CTA buttons → 35% approval

## Optimization Direction
Next generation batch should:
1. Maintain dark theme with emerald/green accent
2. Use real sports action shots or dynamic illustrations
3. Keep headline under 5 words, subtext under 10
4. Make CTA button at least 20% of visual width
5. Include numeric value proposition ("$500", "5x", "100%")`

const MOCK_RECENT_LOGS = [
  { id: 'g047', time: '12:30', model: 'NanoBanana Pro', scores: [9, 8, 7, 8], status: 'approved' },
  { id: 'g046', time: '12:28', model: 'NanoBanana Pro', scores: [8, 7, 5, 6], status: 'rejected' },
  { id: 'g045', time: '11:55', model: 'NanoBanana Pro', scores: [9, 8, 8, 7], status: 'approved' },
  { id: 'g044', time: '11:52', model: 'VEO3', scores: [8, 7, 7, 7], status: 'approved' },
  { id: 'g043', time: '10:30', model: 'NanoBanana Pro', scores: [9, 6, 5, 5], status: 'rejected' },
]

function MarkdownBlock({ content, className = '' }: { content: string; className?: string }) {
  return (
    <div className={`prose-sm text-gray-500 leading-relaxed ${className}`}>
      {content.split('\n').map((line, i) => {
        if (line.startsWith('# ')) return <h2 key={i} className="text-lg font-bold text-gray-900 mt-4 mb-2">{line.slice(2)}</h2>
        if (line.startsWith('## ')) return <h3 key={i} className="text-sm font-semibold text-gray-800 mt-3 mb-1.5">{line.slice(3)}</h3>
        if (line.startsWith('### ')) return <h4 key={i} className="text-xs font-semibold text-emerald-600 mt-3 mb-1">{line.slice(4)}</h4>
        if (line.startsWith('- **')) {
          const match = line.match(/- \*\*(.+?)\*\*(.*)/)
          if (match) return <div key={i} className="flex gap-1 text-xs py-0.5"><span className="font-semibold text-gray-900">{match[1]}</span><span className="text-gray-500">{match[2]}</span></div>
        }
        if (line.startsWith('- ')) return <div key={i} className="text-xs py-0.5 pl-3 text-gray-400">• {line.slice(2)}</div>
        if (line.startsWith('_')) return <div key={i} className="text-[10px] text-gray-400 mt-2 italic">{line.replace(/_/g, '')}</div>
        if (line.trim() === '') return <div key={i} className="h-1" />
        if (line.match(/^\d+\./)) return <div key={i} className="text-xs py-0.5 pl-3 text-gray-500">{line}</div>
        return <p key={i} className="text-xs text-gray-500">{line}</p>
      })}
    </div>
  )
}

export default function EvolutionPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'evolution' | 'feedback' | 'logs'>('profile')

  const tabs = [
    { key: 'profile' as const, icon: User, label: 'User Profile' },
    { key: 'evolution' as const, icon: TrendingUp, label: 'Preference Evolution' },
    { key: 'feedback' as const, icon: MessageSquare, label: 'Feedback Loop' },
    { key: 'logs' as const, icon: FileText, label: 'Recent Generations' },
  ]

  const contentMap = {
    profile: MOCK_PROFILE,
    evolution: MOCK_EVOLUTION,
    feedback: MOCK_FEEDBACK,
    logs: '',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100">
          <Dna className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Agent Evolution</h1>
          <p className="text-sm text-gray-400">
            AI learns from your behavior — all data stored locally as .md files
          </p>
        </div>
      </div>

      {/* Key stats */}
      <div className="grid grid-cols-4 gap-3 mt-6 mb-6">
        {[
          { label: 'Total Generations', value: '47', icon: Sparkles },
          { label: 'Approval Rate', value: '78%', icon: TrendingUp },
          { label: 'Avg Quality', value: '7.4', icon: Brain },
          { label: 'Days Active', value: '3', icon: Clock },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[var(--border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <s.icon className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{s.label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-light)] w-fit">
        {tabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === key
                ? 'bg-white text-gray-900 shadow-sm border border-[var(--border)]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white border border-[var(--border)] rounded-xl p-6">
        {/* File path indicator */}
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[var(--border-light)]">
          <FileText className="w-3.5 h-3.5 text-gray-400" />
          <code className="text-[11px] text-gray-400 font-mono">
            data/users/default/
            {activeTab === 'profile' && 'profile.md'}
            {activeTab === 'evolution' && 'preference_evolution.md'}
            {activeTab === 'feedback' && 'feedback_loop.md'}
            {activeTab === 'logs' && 'generation_log/'}
          </code>
        </div>

        {activeTab !== 'logs' ? (
          <MarkdownBlock content={contentMap[activeTab]} />
        ) : (
          /* Generation logs table */
          <div>
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-gray-400 uppercase tracking-wider">
                  <th className="text-left py-2 font-medium">ID</th>
                  <th className="text-left py-2 font-medium">Time</th>
                  <th className="text-left py-2 font-medium">Model</th>
                  <th className="text-center py-2 font-medium">D1</th>
                  <th className="text-center py-2 font-medium">D2</th>
                  <th className="text-center py-2 font-medium">D3</th>
                  <th className="text-center py-2 font-medium">D4</th>
                  <th className="text-right py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {MOCK_RECENT_LOGS.map(log => (
                  <tr key={log.id} className="border-t border-[var(--border-light)] text-xs">
                    <td className="py-3 font-mono text-gray-400">{log.id}</td>
                    <td className="py-3 text-gray-500">{log.time}</td>
                    <td className="py-3 text-gray-900 font-medium">{log.model}</td>
                    {log.scores.map((s, i) => (
                      <td key={i} className="py-3 text-center">
                        <span className={`font-semibold ${s >= 8 ? 'text-emerald-600' : s >= 6 ? 'text-amber-500' : 'text-red-500'}`}>
                          {s}
                        </span>
                      </td>
                    ))}
                    <td className="py-3 text-right">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        log.status === 'approved'
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-red-50 text-red-500 border border-red-100'
                      }`}>
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
