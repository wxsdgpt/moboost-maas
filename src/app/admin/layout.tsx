import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { isAdminAuthenticated } from '@/lib/adminAuth'
import AdminSidebar from '@/components/AdminSidebar'
import AdminMutationBanner from '@/components/AdminMutationBanner'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const pathname = headersList.get('x-pathname') || ''

  // Skip auth check on login page
  const isLoginPage = pathname === '/admin/login'

  if (!isLoginPage) {
    const authed = await isAdminAuthenticated()
    if (!authed) {
      redirect('/admin/login')
    }
  }

  // Login page gets bare layout (no sidebar)
  if (isLoginPage) {
    return <>{children}</>
  }

  // Authenticated admin pages get admin sidebar + dark background
  return (
    <div
      className="min-h-screen"
      style={{
        background: '#0f0f14',
        fontFamily: '-apple-system, "SF Pro Display", "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <AdminSidebar />
      <main className="ml-[240px] min-h-screen">
        <div className="px-8 pt-6">
          <AdminMutationBanner />
        </div>
        {children}
      </main>
    </div>
  )
}
