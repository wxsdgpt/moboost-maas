/**
 * Admin route group layout — nested inside root layout.
 * The root layout conditionally skips Clerk/Sidebar when x-pathname = /admin.
 * This layout just passes children through.
 */
export default function AdminGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
