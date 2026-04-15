'use client'

/**
 * ReportView — Apple-inspired marketing diagnostic report.
 *
 * Design language: Apple DESIGN.md
 *   - Binary light/dark section rhythm
 *   - SF Pro typography (system-ui fallback)
 *   - Single accent: #0071e3 for interactive
 *   - Product-as-hero, generous whitespace
 *   - Diagnose → Brief → Execute closed loop
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Lock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ExternalLink,
  Users,
  MapPin,
  Film,
  FileText,
  Pencil,
  Play,
} from 'lucide-react'
import type { ReportOutput, ReportSection, AudienceGroup } from '@/lib/reportTypes'

/* ── Apple Design Tokens ── */
const C = {
  black: '#000000',
  nearBlack: '#1d1d1f',
  lightGray: '#f5f5f7',
  blue: '#0071e3',
  linkBlue: '#0066cc',
  brightBlue: '#2997ff',
  white: '#ffffff',
  text80: 'rgba(0,0,0,0.8)',
  text48: 'rgba(0,0,0,0.48)',
  darkSurface: '#272729',
  shadow: 'rgba(0,0,0,0.22) 3px 5px 30px 0px',
}

type Props = {
  report: {
    id: string
    product_id: string
    kind: string
    status: string
    output: ReportOutput
    credits_charged: number | null
    created_at: string
  }
}

/* ── Health Score ── */
function computeHealthScore(sections: ReportSection[]): number {
  const ungated = sections.filter(s => !s.gated)
  let score = 40
  for (const s of ungated) {
    if (s.content.length > 100) score += 15
    if (s.content.length > 500) score += 10
  }
  return Math.min(100, Math.max(20, score))
}

/* ── Diagnostics Extraction ── */
function extractDiagnostics(sections: ReportSection[]) {
  const diagnostics: Array<{ type: 'issue' | 'opportunity' | 'strength'; text: string; tool?: string }> = []

  for (const s of sections) {
    if (s.gated) continue
    const content = s.content.toLowerCase()

    if (content.includes('missing') || content.includes('lack') || content.includes('no landing page'))
      diagnostics.push({ type: 'issue', text: 'Landing page needs optimization', tool: 'landing' })
    if (content.includes('creative') && (content.includes('improve') || content.includes('outdated') || content.includes('refresh')))
      diagnostics.push({ type: 'issue', text: 'Ad creatives need refresh', tool: 'assets' })
    if (content.includes('competitor') && (content.includes('ahead') || content.includes('outperform')))
      diagnostics.push({ type: 'opportunity', text: 'Competitor gap — opportunity to capture share', tool: 'assets' })
    if (content.includes('strong') || content.includes('well-positioned'))
      diagnostics.push({ type: 'strength', text: 'Strong market positioning detected' })
    if (content.includes('audience') && (content.includes('untapped') || content.includes('expand')))
      diagnostics.push({ type: 'opportunity', text: 'Untapped audience segments found', tool: 'landing' })
  }

  if (diagnostics.length === 0) {
    diagnostics.push(
      { type: 'opportunity', text: 'Personalized landing pages can boost conversion 30%+', tool: 'landing' },
      { type: 'issue', text: 'Ad creative diversity is below industry average', tool: 'assets' },
      { type: 'strength', text: 'Product has clear value proposition' },
    )
  }

  const seen = new Set<string>()
  return diagnostics.filter(d => {
    if (seen.has(d.text)) return false
    seen.add(d.text)
    return true
  }).slice(0, 5)
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */

export default function ReportView({ report }: Props) {
  const router = useRouter()
  const output = report.output
  const [unlocked, setUnlocked] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(output.sections.filter(s => !s.gated).map(s => s.id)),
  )
  const [editingBrief, setEditingBrief] = useState(false)

  const handleUnlock = () => {
    setUnlocked(true)
    setExpandedSections(prev => {
      const next = new Set(prev)
      output.sections.forEach(s => next.add(s.id))
      return next
    })
  }

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isLite = output.kind === 'lite'
  const diagnostics = extractDiagnostics(output.sections)
  const healthScore = computeHealthScore(output.sections)
  const issues = diagnostics.filter(d => d.type === 'issue')
  const opportunities = diagnostics.filter(d => d.type === 'opportunity')
  const brief = output.brief

  return (
    <div style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>

      {/* ════ HERO — Dark Section ════ */}
      <section style={{ background: C.black, color: C.white, padding: '80px 0 60px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
          {/* Breadcrumb */}
          <div style={{ fontSize: 12, color: C.text48, marginBottom: 40, letterSpacing: -0.12 }}>
            <a href="/" style={{ color: C.brightBlue, textDecoration: 'none' }}>Dashboard</a>
            <span style={{ margin: '0 8px' }}>/</span>
            <span style={{ color: 'rgba(255,255,255,0.48)' }}>Report</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 40 }}>
            <div style={{ flex: 1 }}>
              {/* Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{
                  fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
                  textTransform: 'uppercase' as const,
                  color: C.brightBlue,
                }}>
                  {output.kind} Report
                </span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)' }}>
                  {new Date(output.generatedAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  })}
                </span>
              </div>

              {/* Product Name — Apple Hero Style */}
              <h1 style={{
                fontSize: 56, fontWeight: 600, lineHeight: 1.07,
                letterSpacing: -0.28, margin: '0 0 12px',
              }}>
                {output.productName}
              </h1>

              {output.productUrl && (
                <a
                  href={output.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: C.brightBlue, fontSize: 17, fontWeight: 400,
                    lineHeight: 1.47, letterSpacing: -0.374,
                    textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {output.productUrl} <ExternalLink size={14} />
                </a>
              )}
            </div>

            {/* Health Score Circle */}
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', width: 120, height: 120 }}>
                <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={healthScore >= 70 ? '#30d158' : healthScore >= 40 ? '#ffd60a' : '#ff453a'}
                    strokeWidth="6"
                    strokeDasharray={`${healthScore * 2.64} 264`}
                    strokeLinecap="round"
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.28 }}>{healthScore}</span>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 8, letterSpacing: -0.12 }}>
                Marketing Score
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24,
            marginTop: 48, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div>
              <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.07, color: '#ff453a' }}>{issues.length}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4 }}>Issues Found</div>
            </div>
            <div>
              <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.07, color: '#ffd60a' }}>{opportunities.length}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4 }}>Opportunities</div>
            </div>
            <div>
              <div style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.07, color: '#30d158' }}>
                {output.sections.filter(s => !s.gated).length}/{output.sections.length}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.48)', marginTop: 4 }}>Sections Analyzed</div>
            </div>
          </div>
        </div>
      </section>

      {/* ════ DIAGNOSTIC SUMMARY — Light Section ════ */}
      <section style={{ background: C.lightGray, padding: '60px 0' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{
            fontSize: 40, fontWeight: 600, lineHeight: 1.10,
            color: C.nearBlack, marginBottom: 32, textAlign: 'center',
          }}>
            Diagnostic Summary
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {diagnostics.map((d, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px', borderRadius: 8,
                background: C.white,
                boxShadow: d.type === 'issue' ? 'inset 3px 0 0 #ff453a' : d.type === 'opportunity' ? 'inset 3px 0 0 #ffd60a' : 'inset 3px 0 0 #30d158',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {d.type === 'issue' ? <AlertTriangle size={18} color="#ff453a" /> :
                   d.type === 'opportunity' ? <TrendingUp size={18} color="#ffd60a" /> :
                   <CheckCircle2 size={18} color="#30d158" />}
                  <span style={{ fontSize: 17, fontWeight: 400, lineHeight: 1.47, letterSpacing: -0.374, color: C.nearBlack }}>
                    {d.text}
                  </span>
                </div>
                {d.tool && (
                  <button
                    onClick={() => {
                      if (d.tool === 'landing') router.push(`/landing?productId=${report.product_id}&reportId=${report.id}`)
                      else router.push(`/brief/new?productId=${report.product_id}`)
                    }}
                    style={{
                      background: 'none', border: `1px solid ${C.linkBlue}`,
                      color: C.linkBlue, borderRadius: 980,
                      padding: '6px 16px', fontSize: 14, fontWeight: 400,
                      cursor: 'pointer', whiteSpace: 'nowrap' as const,
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {d.tool === 'landing' ? 'Fix with Landing Page' : 'Fix with AI Assets'}
                    <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════ REPORT SECTIONS — Alternating Dark/Light ════ */}
      <section style={{ background: C.white, padding: '60px 0' }}>
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
          <h2 style={{
            fontSize: 40, fontWeight: 600, lineHeight: 1.10,
            color: C.nearBlack, marginBottom: 32, textAlign: 'center',
          }}>
            Detailed Analysis
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {output.sections.map(section => (
              <SectionCard
                key={section.id}
                section={section}
                expanded={expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
                unlocked={unlocked}
                onUnlock={handleUnlock}
                productId={report.product_id}
                reportId={report.id}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ════ UNLOCK CTA — Dark Section (lite only, not yet unlocked) ════ */}
      {isLite && !unlocked && (
        <section style={{ background: C.black, color: C.white, padding: '80px 0', textAlign: 'center' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
            <Lock size={32} color="rgba(255,255,255,0.32)" style={{ marginBottom: 16 }} />
            <h2 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.10, marginBottom: 12 }}>
              Unlock Full Analysis
            </h2>
            <p style={{
              fontSize: 17, fontWeight: 400, lineHeight: 1.47, letterSpacing: -0.374,
              color: 'rgba(255,255,255,0.48)', maxWidth: 480, margin: '0 auto 32px',
            }}>
              Get competitor deep-dives, creative analysis, audience insights, channel strategy, and a 30-day action plan.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, alignItems: 'center' }}>
              <button
                onClick={handleUnlock}
                style={{
                  background: C.blue, color: C.white, border: 'none',
                  borderRadius: 8, padding: '12px 24px',
                  fontSize: 17, fontWeight: 400, cursor: 'pointer',
                }}
              >
                Upgrade — 10 Credits
              </button>
              <a href="/pricing" style={{ color: C.brightBlue, fontSize: 14, textDecoration: 'none' }}>
                View pricing
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ════ BRIEF — The Closed Loop ════ */}
      {/* Show brief after report is fully unlocked or for full reports */}
      {brief && (unlocked || !isLite) ? (
        <>
          {/* Brief Hero — Dark Section */}
          <section style={{ background: C.black, color: C.white, padding: '80px 0' }}>
            <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px', textAlign: 'center' }}>
              <div style={{
                fontSize: 12, fontWeight: 600, letterSpacing: 0.5,
                textTransform: 'uppercase' as const, color: C.brightBlue, marginBottom: 16,
              }}>
                Campaign Brief
              </div>
              <h2 style={{ fontSize: 56, fontWeight: 600, lineHeight: 1.07, letterSpacing: -0.28, marginBottom: 16 }}>
                {brief.campaignTheme}
              </h2>
              <p style={{
                fontSize: 21, fontWeight: 400, lineHeight: 1.19, letterSpacing: 0.231,
                color: 'rgba(255,255,255,0.48)', maxWidth: 600, margin: '0 auto',
              }}>
                3 audience groups. Each with a tailored selling point, creative direction, and landing page.
                Edit or execute directly.
              </p>
            </div>
          </section>

          {/* Audience Groups — Light Section */}
          <section style={{ background: C.lightGray, padding: '60px 0' }}>
            <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                {brief.audienceGroups.map((group, i) => (
                  <AudienceCard key={group.id} group={group} index={i} editing={editingBrief} />
                ))}
              </div>
            </div>
          </section>

          {/* Brief Actions — Dark Section */}
          <section style={{ background: C.black, color: C.white, padding: '60px 0', textAlign: 'center' }}>
            <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
                <button
                  onClick={() => setEditingBrief(!editingBrief)}
                  style={{
                    background: 'none', border: `1px solid ${C.brightBlue}`,
                    color: C.brightBlue, borderRadius: 980,
                    padding: '12px 28px', fontSize: 17, fontWeight: 400,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Pencil size={16} />
                  {editingBrief ? 'Done Editing' : 'Edit Brief'}
                </button>
                <button
                  onClick={() => {
                    router.push(`/brief/execute?productId=${report.product_id}&reportId=${report.id}`)
                  }}
                  style={{
                    background: C.blue, color: C.white, border: 'none',
                    borderRadius: 8, padding: '12px 28px',
                    fontSize: 17, fontWeight: 400, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <Play size={16} />
                  Execute All — Generate 3 Sets
                </button>
              </div>
              <p style={{
                fontSize: 14, color: 'rgba(255,255,255,0.48)', marginTop: 20,
                letterSpacing: -0.224,
              }}>
                Generates 1 creative + 1 landing page per audience group (3 sets total)
              </p>
            </div>
          </section>
        </>
      ) : null}

      {/* ════ BOTTOM CTA — No brief yet or lite locked ════ */}
      {!brief && !isLite && (
        <section style={{ background: C.lightGray, padding: '60px 0', textAlign: 'center' }}>
          <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px' }}>
            <p style={{ fontSize: 17, color: C.text48, lineHeight: 1.47 }}>
              Brief generation is processing. Refresh to check status.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SECTION CARD
   ════════════════════════════════════════════════════════════ */

function SectionCard({
  section, expanded, onToggle, unlocked, onUnlock, productId, reportId,
}: {
  section: ReportSection; expanded: boolean; onToggle: () => void;
  unlocked: boolean; onUnlock: () => void; productId: string; reportId: string;
}) {
  const router = useRouter()
  const isGated = section.gated && !unlocked

  return (
    <div style={{
      background: C.white, borderRadius: 8,
      boxShadow: expanded ? C.shadow : 'none',
      transition: 'box-shadow 0.3s ease',
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', border: 'none', background: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {isGated ? <Lock size={16} color={C.text48} /> : <FileText size={16} color={C.linkBlue} />}
          <span style={{
            fontSize: 17, fontWeight: 600, lineHeight: 1.24, letterSpacing: -0.374,
            color: C.nearBlack,
          }}>
            {section.title}
          </span>
          {isGated && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const,
              color: C.blue, background: `${C.blue}15`, padding: '2px 8px', borderRadius: 980,
            }}>
              PRO
            </span>
          )}
          {section.gated && unlocked && (
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const,
              color: '#30d158', background: 'rgba(48,209,88,0.1)', padding: '2px 8px', borderRadius: 980,
            }}>
              UNLOCKED
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={18} color={C.text48} /> : <ChevronDown size={18} color={C.text48} />}
      </button>

      {/* Content */}
      {expanded && (
        <div style={{ padding: '0 24px 24px' }}>
          {isGated ? (
            <div style={{
              textAlign: 'center', padding: '48px 24px',
              background: C.lightGray, borderRadius: 8,
            }}>
              <Lock size={24} color={C.text48} style={{ marginBottom: 12 }} />
              <h4 style={{ fontSize: 17, fontWeight: 600, color: C.nearBlack, marginBottom: 8 }}>
                Premium Section
              </h4>
              <p style={{ fontSize: 14, color: C.text48, marginBottom: 20, maxWidth: 320, margin: '0 auto 20px' }}>
                Upgrade to unlock in-depth analysis.
              </p>
              <button
                onClick={onUnlock}
                style={{
                  background: C.nearBlack, color: C.white, border: 'none',
                  borderRadius: 8, padding: '10px 20px',
                  fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Unlock — 10 Credits
              </button>
            </div>
          ) : (
            <div>
              <SectionContent content={section.content} />
              {/* Contextual action */}
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                {(section.id === 'product_overview' || section.id === 'creative_analysis' || section.id === 'asset_evaluation') && (
                  <button
                    onClick={() => router.push(`/brief/new?productId=${productId}`)}
                    style={{
                      background: 'none', border: `1px solid ${C.linkBlue}`,
                      color: C.linkBlue, borderRadius: 980, padding: '6px 16px',
                      fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    Generate Better Creatives <ArrowRight size={12} />
                  </button>
                )}
                {(section.id === 'market_position' || section.id === 'audience_insights' || section.id === 'regional_strategy') && (
                  <button
                    onClick={() => router.push(`/landing?productId=${productId}&reportId=${reportId}`)}
                    style={{
                      background: 'none', border: `1px solid ${C.linkBlue}`,
                      color: C.linkBlue, borderRadius: 980, padding: '6px 16px',
                      fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    Build Landing Page <ArrowRight size={12} />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   SECTION CONTENT RENDERER
   ════════════════════════════════════════════════════════════ */

function SectionContent({ content }: { content: string }) {
  const paragraphs = content.split('\n\n').filter(p => p.trim())

  if (paragraphs.length <= 1 && content.length < 200) {
    return <p style={{ fontSize: 17, lineHeight: 1.47, letterSpacing: -0.374, color: C.text80 }}>{content}</p>
  }

  const findings: string[] = []
  const prose: string[] = []

  for (const p of paragraphs) {
    for (const line of p.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.match(/^[-*]\s/) || trimmed.match(/^\d+\.\s/)) {
        findings.push(trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
      } else if (trimmed.length > 20) {
        prose.push(trimmed)
      }
    }
  }

  // Extract bold terms
  const boldPattern = /\*\*(.+?)\*\*/g
  const keyTerms: string[] = []
  let match: RegExpExecArray | null
  for (const p of paragraphs) {
    while ((match = boldPattern.exec(p)) !== null) {
      if (match[1].length < 60) keyTerms.push(match[1])
    }
  }

  return (
    <div>
      {/* Key terms as pills */}
      {keyTerms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {keyTerms.slice(0, 6).map((term, i) => (
            <span key={i} style={{
              padding: '4px 12px', background: C.lightGray, borderRadius: 980,
              fontSize: 12, fontWeight: 600, color: C.nearBlack, letterSpacing: -0.12,
            }}>
              {term}
            </span>
          ))}
        </div>
      )}

      {/* Prose */}
      {prose.slice(0, 2).map((p, i) => (
        <p key={i} style={{
          fontSize: 17, lineHeight: 1.47, letterSpacing: -0.374,
          color: C.text80, marginBottom: 12,
        }}>
          {p.replace(/\*\*/g, '')}
        </p>
      ))}

      {/* Findings grid */}
      {findings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {findings.slice(0, 6).map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '12px 16px', background: C.lightGray, borderRadius: 8,
            }}>
              <CheckCircle2 size={14} color="#30d158" style={{ marginTop: 3, flexShrink: 0 }} />
              <span style={{ fontSize: 14, lineHeight: 1.43, letterSpacing: -0.224, color: C.nearBlack }}>
                {f.replace(/\*\*/g, '')}
              </span>
            </div>
          ))}
        </div>
      )}

      {(findings.length > 6 || prose.length > 2) && (
        <p style={{ fontSize: 12, color: C.text48, textAlign: 'center', marginTop: 12 }}>
          {findings.length > 6 ? `+${findings.length - 6} more findings` : ''}
          {prose.length > 2 ? ' | Full analysis available' : ''}
        </p>
      )}
    </div>
  )
}

/* ════════════════════════════════════════════════════════════
   AUDIENCE CARD — Brief Component
   ════════════════════════════════════════════════════════════ */

function AudienceCard({ group, index, editing }: { group: AudienceGroup; index: number; editing: boolean }) {
  const groupColors = ['#ff453a', '#ffd60a', '#30d158']
  const accent = groupColors[index] || C.blue

  return (
    <div style={{
      background: C.white, borderRadius: 12,
      boxShadow: C.shadow,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Card Header — Dark */}
      <div style={{
        background: C.black, color: C.white,
        padding: '24px 20px 20px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
            Group {index + 1}
          </span>
        </div>
        <h3 style={{
          fontSize: 21, fontWeight: 700, lineHeight: 1.19, letterSpacing: 0.231,
          margin: 0,
        }}>
          {group.audienceTag}
        </h3>
      </div>

      {/* Card Body — Light */}
      <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Region */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MapPin size={14} color={C.linkBlue} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.nearBlack, letterSpacing: -0.224 }}>
            {group.region}
          </span>
        </div>

        {/* Audience Profile */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Users size={12} color={C.text48} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text48, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
              Audience
            </span>
          </div>
          {editing ? (
            <textarea
              defaultValue={group.audienceProfile}
              style={{
                width: '100%', minHeight: 48, fontSize: 14, lineHeight: 1.43,
                color: C.nearBlack, border: `1px solid ${C.blue}`, borderRadius: 8,
                padding: 8, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.43, letterSpacing: -0.224, color: C.text80, margin: 0 }}>
              {group.audienceProfile}
            </p>
          )}
        </div>

        {/* Selling Point */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <TrendingUp size={12} color={C.text48} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text48, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
              Selling Point
            </span>
          </div>
          {editing ? (
            <textarea
              defaultValue={group.sellingPoint}
              style={{
                width: '100%', minHeight: 48, fontSize: 14, lineHeight: 1.43,
                color: C.nearBlack, border: `1px solid ${C.blue}`, borderRadius: 8,
                padding: 8, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          ) : (
            <p style={{
              fontSize: 14, lineHeight: 1.43, letterSpacing: -0.224, color: C.text80,
              margin: 0, padding: '8px 12px', background: C.lightGray, borderRadius: 8,
            }}>
              {group.sellingPoint}
            </p>
          )}
        </div>

        {/* Creative Direction */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Film size={12} color={C.text48} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text48, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
              Creative
            </span>
          </div>
          {editing ? (
            <textarea
              defaultValue={group.creativeDirection}
              style={{
                width: '100%', minHeight: 48, fontSize: 14, lineHeight: 1.43,
                color: C.nearBlack, border: `1px solid ${C.blue}`, borderRadius: 8,
                padding: 8, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.43, letterSpacing: -0.224, color: C.text80, margin: 0 }}>
              {group.creativeDirection}
            </p>
          )}
        </div>

        {/* Landing Page Brief */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <FileText size={12} color={C.text48} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text48, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>
              Landing Page
            </span>
          </div>
          {editing ? (
            <textarea
              defaultValue={group.landingPageBrief}
              style={{
                width: '100%', minHeight: 48, fontSize: 14, lineHeight: 1.43,
                color: C.nearBlack, border: `1px solid ${C.blue}`, borderRadius: 8,
                padding: 8, resize: 'vertical', fontFamily: 'inherit',
              }}
            />
          ) : (
            <p style={{ fontSize: 14, lineHeight: 1.43, letterSpacing: -0.224, color: C.text80, margin: 0 }}>
              {group.landingPageBrief}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
