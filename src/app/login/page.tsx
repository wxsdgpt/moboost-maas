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
        router.push('/')
        router.refresh()
      } else {
        setError('账号或密码错误，请重试')
      }
    } catch {
      setError('网络错误，请检查连接后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#F8FAFB]">

      {/* Generative particle flow background */}
      <ParticleFlow />

      {/* Soft radial vignette to focus center */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(248,250,251,0) 0%, rgba(248,250,251,0.25) 55%, rgba(248,250,251,0.75) 100%)',
          zIndex: 1,
        }}
      />

      {/* Foreground content */}
      <div className="relative flex items-center justify-center min-h-screen px-4" style={{ zIndex: 2 }}>
        <div className="w-full max-w-[420px]">

          {/* Logo / Brand */}
          <div className="text-center mb-8 animate-float-in">
            <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-xl shadow-emerald-300/40 mb-4">
              <Sparkles className="w-7 h-7 text-white drop-shadow-sm" />
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
            </div>
            <h1 className="text-[28px] font-bold text-gray-900 tracking-tight">
              Moboost <span className="text-emerald-600">AI</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1.5">Marketing-as-a-Service Platform</p>
          </div>

          {/* Glass card */}
          <div
            className="relative rounded-3xl p-8 border border-white/60 shadow-2xl shadow-emerald-900/5 animate-float-in-delay"
            style={{
              background: 'rgba(255, 255, 255, 0.72)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
            }}
          >
            {/* Subtle top gradient highlight */}
            <div
              className="absolute inset-x-0 top-0 h-px rounded-t-3xl"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.35), transparent)' }}
            />

            <h2 className="text-lg font-semibold text-gray-900 mb-1">登录你的账户</h2>
            <p className="text-xs text-gray-400 mb-6">请输入账号密码进入 MAAS 工作台</p>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Username */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
                  账号
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => { setUsername(e.target.value); setError('') }}
                  placeholder="输入账号"
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-xl bg-white/70 border border-[#E2E6EB] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100/60 focus:bg-white transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wider">
                  密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError('') }}
                    placeholder="输入密码"
                    autoComplete="current-password"
                    className="w-full px-4 py-3 pr-11 rounded-xl bg-white/70 border border-[#E2E6EB] text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100/60 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="px-4 py-2.5 rounded-xl bg-red-50/90 border border-red-100 text-sm text-red-600 animate-shake">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="group relative w-full py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-gray-200 disabled:to-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all shadow-lg shadow-emerald-300/40 disabled:shadow-none flex items-center justify-center gap-2 mt-2 overflow-hidden"
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

          <p className="text-center text-xs text-gray-400 mt-6">
            © 2026 Moboost AI · iGaming Marketing Platform
          </p>
        </div>
      </div>
    </div>
  )
}
