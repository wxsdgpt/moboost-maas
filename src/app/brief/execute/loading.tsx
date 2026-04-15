export default function ExecuteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-200 rounded-full" />
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0" />
        </div>
        <div className="text-center">
          <p className="text-gray-900 font-medium">Preparing campaign execution</p>
          <p className="text-gray-400 text-sm mt-1">Loading audience data and assets...</p>
        </div>
      </div>
    </div>
  )
}
