'use client'

/**
 * /reset — Global data management (no auth required)
 *
 * Shows all users, all table counts, and provides full data wipe
 * including Clerk account deletion.
 *
 * Root layout detects /reset via x-pathname header and skips
 * Clerk/Sidebar/UserScopeGuard to prevent auto user re-creation.
 */

import { useState, useEffect } from 'react'
import {
  Trash2, Database, HardDrive, RefreshCw,
  AlertTriangle, CheckCircle2, Loader2, User,
  FileText, CreditCard, Package, BarChart3,
  Users, Globe, Layers,
} from 'lucide-react'

const C = {
  black: '#000000',
  nearBlack: '#1d1d1f',
  lightGray: '#f5f5f7',
  blue: '#0071e3',
  brightBlue: '#2997ff',
  white: '#ffffff',
  red: '#ff453a',
  green: '#30d158',
  text80: 'rgba(0,0,0,0.8)',
  text48: 'rgba(0,0,0,0.48)',
}

type ResetScope = 'all' | 'supabase' | 'files' | 'clerk'
type UserInfo = { id: string; clerkId: string; email: string; createdAt: string; onboarded: boolean }
type Counts = Record<string, number>

export default function ResetPage() {
  const [status, setStatus] = useState<'idle' | 'confirming' | 'resetting' | 'done' | 'error'>('idle')
  const [pendingScope, setPendingScope] = useState<ResetScope>('all')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState('')
  const [counts, setCounts] = useState<Counts | null>(null)
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loadingCounts, setLoadingCounts] = useState(true)

  const loadCounts = async () => {
    setLoadingCounts(true)
    try {
      const res = await fetch(`/api/admin/counts?t=${Date.now()}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      if (res.ok) { const d = await res.json(); setCounts(d.counts); setUsers(d.users || []) }
    } catch {}
    setLoadingCounts(false)
  }

  useEffect(() => { loadCounts() }, [])

  const handleReset = async (scope: ResetScope) => {
    if (status === 'idle') { setPendingScope(scope); setStatus('confirming'); return }
    if (status === 'confirming' && scope === pendingScope) {
      setStatus('resetting'); setError(''); setResult(null)
      try {
        const res = await fetch('/api/admin/reset', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Reset failed')
        setResult(data); setStatus('done'); loadCounts()
      } catch (err) { setError((err as Error).message); setStatus('error') }
    }
  }

  const resetActions: { scope: ResetScope; icon: React.ReactNode; label: string; desc: string; color: string }[] = [
    { scope: 'all', icon: <Trash2 size={20} />, label: '清除全部数据（含注销账号）', desc: '删除所有 Clerk 用户账号 + Supabase 全部表数据 + 项目文件 + 搜索缓存。用户将被彻底注销，需要重新注册。', color: C.red },
    { scope: 'clerk', icon: <Users size={20} />, label: '仅注销 Clerk 用户账号', desc: '删除 Clerk 中所有已注册的用户账号。用户将无法登录，需要重新注册。', color: '#bf5af2' },
    { scope: 'supabase', icon: <Database size={20} />, label: '仅清除数据库', desc: '清空所有表：users, products, reports, credits, landing_pages, subscriptions, events, market_intel。', color: '#ff9f0a' },
    { scope: 'files', icon: <HardDrive size={20} />, label: '仅清除文件', desc: '删除磁盘上的项目 JSON 文件和搜索缓存目录。', color: C.brightBlue },
  ]

  return (
    <div style={{ fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif', minHeight: '100vh', background: C.lightGray }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      <section style={{ background: C.black, color: C.white, padding: '48px 0' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 24px' }}>
          <h1 style={{ fontSize: 40, fontWeight: 600, lineHeight: 1.10, letterSpacing: -0.2, marginBottom: 8 }}>Admin Tools</h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.48)' }}>全局数据管理 · 独立页面（无 Clerk/Sidebar） · 清除所有用户数据用于测试</p>
        </div>
      </section>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
        {/* Users List */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 21, fontWeight: 600, color: C.nearBlack, display: 'flex', alignItems: 'center', gap: 8 }}><Users size={20} /> 注册用户 ({users.length})</h2>
            <button onClick={loadCounts} disabled={loadingCounts} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 14 }}>
              <RefreshCw size={14} style={loadingCounts ? { animation: 'spin 1s linear infinite' } : undefined} /> 刷新
            </button>
          </div>
          {loadingCounts ? (
            <div style={{ textAlign: 'center', padding: 32, color: C.text48 }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /></div>
          ) : users.length === 0 ? (
            <div style={{ background: C.white, borderRadius: 12, padding: '32px 24px', textAlign: 'center', boxShadow: 'rgba(0,0,0,0.04) 0 2px 8px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: C.nearBlack, marginBottom: 4 }}>暂无用户</div>
              <div style={{ fontSize: 14, color: C.text48 }}>数据库和 Clerk 中均无注册用户</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {users.map((u, i) => (
                <div key={u.id} style={{ background: C.white, borderRadius: 12, padding: '16px 20px', boxShadow: 'rgba(0,0,0,0.04) 0 2px 8px', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: ['#ff453a', '#ff9f0a', '#30d158', '#0071e3', '#bf5af2'][i % 5], display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.white, fontSize: 14, fontWeight: 600 }}>
                    {(u.email || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: C.nearBlack }}>{u.email || 'No email'}</div>
                    <div style={{ fontSize: 11, color: C.text48, marginTop: 2 }}>ID: {u.id.slice(0, 8)}… · Clerk: {u.clerkId.slice(0, 12)}… · {new Date(u.createdAt).toLocaleDateString('zh-CN')}</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 4, background: u.onboarded ? 'rgba(48,209,88,0.1)' : 'rgba(255,69,58,0.1)', color: u.onboarded ? C.green : C.red }}>
                    {u.onboarded ? '已引导' : '未引导'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Data Overview */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 21, fontWeight: 600, color: C.nearBlack, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Layers size={20} /> 数据总览</h2>
          {counts ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { icon: <Users size={16} />, label: '用户', count: counts.users, color: '#0071e3' },
                { icon: <Package size={16} />, label: '产品', count: counts.products, color: '#ff9f0a' },
                { icon: <FileText size={16} />, label: '报告', count: counts.reports, color: '#30d158' },
                { icon: <Globe size={16} />, label: '落地页', count: counts.landing_pages, color: '#bf5af2' },
                { icon: <CreditCard size={16} />, label: '积分记录', count: counts.credit_ledger, color: '#ff453a' },
                { icon: <User size={16} />, label: '订阅', count: counts.subscriptions, color: '#ffd60a' },
                { icon: <BarChart3 size={16} />, label: '事件日志', count: counts.events, color: '#64d2ff' },
                { icon: <Database size={16} />, label: '市场情报', count: counts.market_intel, color: '#ff6482' },
              ].map(item => (
                <div key={item.label} style={{ background: C.white, borderRadius: 12, padding: '16px 12px', textAlign: 'center', boxShadow: 'rgba(0,0,0,0.04) 0 2px 8px' }}>
                  <div style={{ color: item.color, marginBottom: 8 }}>{item.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 600, color: C.nearBlack, marginBottom: 2 }}>{item.count}</div>
                  <div style={{ fontSize: 11, color: C.text48, fontWeight: 500 }}>{item.label}</div>
                </div>
              ))}
            </div>
          ) : <div style={{ textAlign: 'center', padding: 24, color: C.text48, fontSize: 14 }}>无法加载数据统计</div>}
        </div>

        {/* Reset Actions */}
        <div>
          <h2 style={{ fontSize: 21, fontWeight: 600, color: C.nearBlack, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Trash2 size={20} /> 数据清除</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {resetActions.map(action => {
              const isConfirming = status === 'confirming' && pendingScope === action.scope
              const isResetting = status === 'resetting' && pendingScope === action.scope
              return (
                <div key={action.scope} style={{ background: C.white, borderRadius: 12, padding: '20px 24px', boxShadow: 'rgba(0,0,0,0.04) 0 2px 8px', border: isConfirming ? `2px solid ${action.color}` : '2px solid transparent', transition: 'border-color 0.2s' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ color: action.color, marginTop: 2 }}>{action.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 17, fontWeight: 600, color: C.nearBlack, marginBottom: 4 }}>{action.label}</div>
                      <div style={{ fontSize: 14, color: C.text48, lineHeight: 1.43 }}>{action.desc}</div>
                      {isConfirming && (
                        <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,69,58,0.06)', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <AlertTriangle size={14} color={C.red} />
                          <span style={{ fontSize: 13, color: C.red, fontWeight: 500 }}>此操作不可逆！将删除所有用户的全部数据。再次点击确认。</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleReset(action.scope)} disabled={isResetting} style={{
                      background: isConfirming ? action.color : 'none', color: isConfirming ? C.white : action.color,
                      border: isConfirming ? 'none' : `1px solid ${action.color}`, borderRadius: 8, padding: '8px 20px',
                      fontSize: 14, fontWeight: 500, cursor: isResetting ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6, opacity: isResetting ? 0.6 : 1,
                      whiteSpace: 'nowrap', transition: 'all 0.2s',
                    }}>
                      {isResetting ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> 清除中...</> : isConfirming ? '确认清除' : '清除'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {status === 'confirming' && <button onClick={() => setStatus('idle')} style={{ marginTop: 12, background: 'none', border: 'none', color: C.text48, cursor: 'pointer', fontSize: 14, padding: '8px 0' }}>取消</button>}
        </div>

        {/* Result */}
        {status === 'done' && result && (
          <div style={{ marginTop: 24, background: C.white, borderRadius: 12, padding: '20px 24px', boxShadow: 'rgba(0,0,0,0.04) 0 2px 8px', border: `2px solid ${C.green}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <CheckCircle2 size={18} color={C.green} />
              <span style={{ fontSize: 17, fontWeight: 600, color: C.nearBlack }}>{String((result as Record<string, unknown>).message || '')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {Object.entries((result as Record<string, unknown>).results as Record<string, unknown> || {}).map(([key, val]) => (
                <div key={key} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, background: String(val).includes('cleared') || String(val).includes('deleted') ? 'rgba(48,209,88,0.08)' : C.lightGray, color: String(val).includes('cleared') || String(val).includes('deleted') ? C.green : C.text48 }}>
                  <span style={{ fontWeight: 600 }}>{key}</span>: {String(val)}
                </div>
              ))}
            </div>
            <button onClick={() => { setStatus('idle'); setResult(null) }} style={{ marginTop: 16, background: C.blue, color: C.white, border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, cursor: 'pointer' }}>完成</button>
          </div>
        )}

        {status === 'error' && (
          <div style={{ marginTop: 24, background: C.white, borderRadius: 12, padding: '20px 24px', border: `2px solid ${C.red}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><AlertTriangle size={18} color={C.red} /><span style={{ fontSize: 17, fontWeight: 600, color: C.red }}>清除失败</span></div>
            <p style={{ fontSize: 14, color: C.text48 }}>{error}</p>
            <button onClick={() => { setStatus('idle'); setError('') }} style={{ marginTop: 12, background: 'none', border: `1px solid ${C.red}`, color: C.red, borderRadius: 8, padding: '8px 20px', fontSize: 14, cursor: 'pointer' }}>重试</button>
          </div>
        )}
      </div>
    </div>
  )
}
