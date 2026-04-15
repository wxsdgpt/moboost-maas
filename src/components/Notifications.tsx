'use client'

import { useState, useEffect, useSyncExternalStore } from 'react'
import { Bell, CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { store, Notification } from '@/lib/store'

function useStore<T>(selector: () => T): T {
  return useSyncExternalStore(store.subscribe, selector, selector)
}

// Shared icon map — must be at module level so both components can use it
const iconMap: Record<string, React.ReactNode> = {
  success: <CheckCircle2 className="w-4 h-4 text-[#0071e3]" />,
  error: <AlertCircle className="w-4 h-4 text-red-500" />,
  info: <Info className="w-4 h-4 text-[#0071e3]" />,
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
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      {toasts.map(toast => (
        <div
          key={toast.id}
          className="pointer-events-auto animate-slide-up bg-white rounded-lg px-4 py-3 max-w-[340px] flex items-start gap-3"
          style={{ boxShadow: 'rgba(0,0,0,0.22) 0 3px 5px 30px' }}
        >
          <div className="mt-0.5">{iconMap[toast.type]}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-black">{toast.title}</div>
            <div className="text-xs text-[#6f6f77] mt-0.5 truncate">{toast.message}</div>
          </div>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-1 rounded-lg text-[#d5d5d7] hover:text-black hover:bg-[#f5f5f7] transition-colors"
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
    <div className="relative" style={{ fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif' }}>
      <button
        onClick={() => {
          setShowPanel(!showPanel)
          if (!showPanel) store.markAllRead()
        }}
        className="relative p-2 rounded-lg text-[#6f6f77] hover:text-black hover:bg-[#f5f5f7] transition-colors"
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
          <div className="absolute bottom-full left-0 mb-2 w-[300px] bg-white rounded-lg shadow-xl z-50 overflow-hidden" style={{ boxShadow: 'rgba(0,0,0,0.22) 0 3px 5px 30px' }}>
            <div className="px-4 py-3 border-b border-[#d5d5d7]">
              <span className="text-sm font-semibold text-black">Notifications</span>
            </div>
            <div className="max-h-[300px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-[#6f6f77]">No notifications yet</div>
              ) : (
                notifications.slice(0, 10).map(n => (
                  <div key={n.id} className="px-4 py-3 border-b border-[#d5d5d7] last:border-0 hover:bg-[#f5f5f7]">
                    <div className="flex items-start gap-2">
                      {iconMap[n.type]}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-black">{n.title}</div>
                        <div className="text-[11px] text-[#6f6f77] mt-0.5 truncate">{n.message}</div>
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
