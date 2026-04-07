'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react'
import ParticleFlow from '@/components/ParticleFlow'

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [anyFocused, setAnyFocused] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      if (res.ok) {
        // Keep loading state visible for the vortex collapse animation
        setTimeout(() => {
          router.push('/')
          router.refresh()
        }, 700)
      } else {
        setError('账号或密码错误，请重试')
        setLoading(false)
      }
    } catch {
      setError('网络错误，请检查连接后重试')
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#0a0a1a' }}>

      {/* Generative particle flow background (Three.js + GLSL) */}
      <ParticleFlow focused={anyFocused} loading={loading} />

      {/* Soft radial vignette to focus center (dark) */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,10,26,0) 0%, rgba(10,10,26,0.35) 55%, rgba(10,10,26,0.85) 100%)',
          zIndex: 1,
        }}
      />

      {/* Foreground content */}
      <div className="relative flex items-center justify-center min-h-screen px-4" style={{ zIndex: 2 }}>
        <div className="w-full max-w-[420px]">

          {/* Logo / Brand */}
          <div className="text-center mb-8 animate-float-in">
            <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
              style={{
                background: 'linear-gradient(135deg, #22d3ee 0%, #a855f7 55%, #d946ef 100%)',
                boxShadow: '0 10px 40px -8px rgba(168, 85, 247, 0.55), 0 0 24px rgba(34, 211, 238, 0.35)',
              }}
            >
              <Sparkles className="w-7 h-7 text-white drop-shadow-sm" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
            </div>
            <h1 className="text-[28px] font-bold tracking-tight" style={{ color: '#F5F7FB' }}>
              Moboost{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #22d3ee, #d946ef)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                AI
              </span>
            </h1>
            <p className="text-sm mt-1.5" style={{ color: 'rgba(245, 247, 251, 0.5)' }}>
              Marketing-as-a-Service Platform
            </p>
          </div>

          {/* Glass card — dark variant */}
          <div
            className="relative rounded-3xl p-8 animate-float-in-delay"
            style={{
              background: 'rgba(20, 22, 42, 0.55)',
              backdropFilter: 'blur(24px) saturate(180%)',
              WebkitBackdropFilter: 'blur(24px) saturate(180%)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow:
                '0 20px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(34, 211, 238, 0.05), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            {/* Top gradient highlight */}
            <div
              className="absolute inset-x-0 top-0 h-px rounded-t-3xl"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(34,211,238,0.5), rgba(217,70,239,0.5), transparent)' }}
            />

            <h2 className="text-lg font-semibold mb-1" style={{ color: '#F5F7FB' }}>登录你的账户</h2>
            <p className="text-xs mb-6" style={{ color: 'rgba(245, 247, 251, 0.4)' }}>
              请输入账号密码进入 MAAS 工作台
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                  style={{ color: 'rgba(245, 247, 251, 0.6)' }}
                >
                  账号
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  onFocus={() => setAnyFocused(true)}
                  onBlur={() => setAnyFocused(false)}
                  placeholder="输入账号"
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#F5F7FB',
                  }}
                  onFocusCapture={e => {
                    e.currentTarget.style.borderColor = 'rgba(34, 211, 238, 0.5)'
                    e.currentTarget.style.boxShadow = '0 0 0 4px rgba(34, 211, 238, 0.12)'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                  }}
                  onBlurCapture={e => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.boxShadow = 'none'
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  }}
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                  style={{ color: 'rgba(245, 247, 251, 0.6)' }}
                >
                  密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    onFocus={() => setAnyFocused(true)}
                    onBlur={() => setAnyFocused(false)}
                    placeholder="输入密码"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#F5F7FB',
                    }}
                    onFocusCapture={e => {
                      e.currentTarget.style.borderColor = 'rgba(217, 70, 239, 0.5)'
                      e.currentTarget.style.boxShadow = '0 0 0 4px rgba(217, 70, 239, 0.12)'
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'
                    }}
                    onBlurCapture={e => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: 'rgba(245, 247, 251, 0.5)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  className="px-4 py-2.5 rounded-xl text-sm animate-shake"
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#fca5a5',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="group relative w-full py-3 rounded-xl text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 mt-2 overflow-hidden disabled:cursor-not-allowed"
                style={{
                  background:
                    loading || !username.trim() || !password.trim()
                      ? 'rgba(255,255,255,0.06)'
                      : 'linear-gradient(90deg, #22d3ee 0%, #a855f7 50%, #d946ef 100%)',
                  boxShadow:
                    loading || !username.trim() || !password.trim()
                      ? 'none'
                      : '0 10px 30px -8px rgba(168, 85, 247, 0.5), 0 0 20px rgba(34, 211, 238, 0.25)',
                  color:
                    !username.trim() || !password.trim()
                      ? 'rgba(245, 247, 251, 0.35)'
                      : '#ffffff',
                }}
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> 登录中...</>
                ) : (
                  <span className="relative">登录</span>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs mt-6" style={{ color: 'rgba(245, 247, 251, 0.35)' }}>
            © 2026 Moboost AI · iGaming Marketing Platform
          </p>
        </div>
      </div>
    </div>
  )
}
