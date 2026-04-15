/**
 * /report/[id] — Report detail page.
 *
 * Server-side: loads the report from DB.
 * Client-side: renders sections with gating + upgrade CTA.
 *
 * For lite reports, the first LITE_FREE_SECTIONS are shown in full;
 * remaining sections show a teaser + blur overlay + unlock button.
 */
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { supabaseService } from '@/lib/db'
import ReportView from './ReportView'

export const dynamic = 'force-dynamic'

type Props = { params: { id: string } }

export default async function ReportPage({ params }: Props) {
  const { userId: clerkId } = await auth()
  if (!clerkId) redirect('/sign-in')

  const db = supabaseService()

  // Resolve internal user id from Clerk id
  const { data: userRow } = await db
    .from('users')
    .select('id')
    .eq('clerk_user_id', clerkId)
    .maybeSingle()

  if (!userRow) redirect('/onboarding')

  // Load report
  const { data: report, error } = await db
    .from('reports')
    .select('id, product_id, kind, status, output, credits_charged, created_at')
    .eq('id', params.id)
    .eq('user_id', userRow.id)
    .maybeSingle()

  if (error || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Report not found</h1>
          <p className="text-gray-500">This report doesn&apos;t exist or you don&apos;t have access.</p>
          <a href="/" className="mt-4 inline-block text-emerald-600 hover:underline">
            ← Back to dashboard
          </a>
        </div>
      </div>
    )
  }

  if (report.status === 'running') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold">Generating your report...</h1>
          <p className="text-gray-500 mt-2">This usually takes 30-60 seconds.</p>
        </div>
      </div>
    )
  }

  if (report.status === 'failed') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2 text-red-600">Report generation failed</h1>
          <p className="text-gray-500">Please try again or contact support.</p>
          <a href="/" className="mt-4 inline-block text-emerald-600 hover:underline">
            ← Back to dashboard
          </a>
        </div>
      </div>
    )
  }

  return <ReportView report={report} />
}
