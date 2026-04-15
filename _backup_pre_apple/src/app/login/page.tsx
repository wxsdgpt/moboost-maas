import { redirect } from 'next/navigation'

// Phase 1: /login is deprecated — Clerk owns auth now.
// Kept as a redirect so any stale bookmarks or links still land correctly.
export default function LegacyLoginRedirect() {
  redirect('/sign-in')
}
