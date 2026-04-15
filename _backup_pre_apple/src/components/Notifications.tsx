'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { Bell, CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { store, Notification } from '@/lib/store'

function useStore<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

// Shared icon map — must be at module level so both components can use it
const iconMap: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  error: <AlertCircle className="w-4 h-4 text-red-500" />,
  info: <Info className="w-4 h-4 text-blue-500" />,
}

export default function Notifications() {
  const notifications = useStore(store.getNotifications)
  const [toasts, setToasts] = useState<Notification[]>([])

  useEffect(() => {
    const latest = notifications[0]
    if (latest && !latest.read) {
      setToasts(prev => {
        if (prev.find(t => t.id === latest.id)) return prev
        return [latest, ...prev].slice(0, 3)
      })
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== latest.id))
      }, 6000)
    }
  }, [notifications])

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    store.markRead(id)
  }

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-slide-up bg-white border border-[var(--border)] rounded-xl shadow-lg px-4 py-3 max-w-[340px] flex items-start gap-3"
        >
          <div className="mt-0.5">{iconMap[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900">{toast.title}</div>
            <div className="text-xs text-gray-500 mt-0.5 truncate">{toast.message}</div>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

export function NotificationBell() {
  const unreadCount = useStore(store.getUnreadCount)
  const notifications = useStore(store.getNotifications)
  const [showPanel, setShowPanel] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => {
          setShowPanel(!showPanel)
          if (!showPanel) store.markAllRead()
        }}
        className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {showPanel && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
          <div className="absolute bottom-full left-0 mb-2 w-[300px] bg-white border border-[var(--border)] rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-light)]">
              <span className="text-sm font-semibold text-gray-900">Notifications</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-gray-400">No notifications yet</div>
              ) : (
                notifications.slice(0, 10).map(n => (
                  <div key={n.id} className="px-4 py-3 border-b border-[var(--border-light)] last:border-0 hover:bg-gray-50">
                    <div className="flex items-start gap-2">
                      {iconMap[n.type]}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800">{n.title}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5 truncate">{n.message}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
