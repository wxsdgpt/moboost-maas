'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function AdminLoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()

      if (data.ok) {
        router.push('/admin')
      } else {
        setError(data.error || '登录失败')
      }
    } catch {
      setError('网络错误，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div className="w-full max-w-[380px] mx-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{
              background: 'linear-gradient(135deg, #e94560 0%, #0f3460 100%)',
              boxShadow: '0 8px 32px rgba(233, 69, 96, 0.3)',
            }}
          >
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Moboost Admin</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>
            管理员控制台
          </p>
        </div>

        {/* Login Form */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Username */}
          <div className="mb-4">
            <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.07)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#e94560' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)' }}
              autoComplete="username"
              autoFocus
            />
          </div>

          {/* Password */}
          <div className="mb-5">
            <label className="block text-[11px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder:text-white/30 outline-none transition-all pr-10"
                style={{
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#e94560' }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)' }}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mb-4 px-4 py-2.5 rounded-xl text-sm"
              style={{
                background: 'rgba(233, 69, 96, 0.15)',
                color: '#e94560',
                border: '1px solid rgba(233, 69, 96, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #e94560 0%, #c23152 100%)',
              boxShadow: '0 4px 16px rgba(233, 69, 96, 0.3)',
            }}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              '登录'
            )}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-[11px] mt-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
          Moboost AI MaaS · Admin Console
        </p>
      </div>
    </div>
  )
}
