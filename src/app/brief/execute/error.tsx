'use client'

import { useEffect, useState } from 'react'

export default function ExecuteError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [retryCount, setRetryCount] = useState(0)
  const MAX_RETRIES = 3

  useEffect(() => {}, [error])

  const handleRetry = () => {
    if (retryCount < MAX_RETRIES) {
      setRetryCount(prev => prev + 1)
      reset()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Campaign execution failed</h2>
        <p className="text-gray-500 mb-2 text-sm">
          {error.message || 'Failed to generate campaign assets. This might be a temporary issue.'}
        </p>
        {retryCount > 0 && (
          <p className="text-gray-400 text-xs mb-4">Retry attempt {retryCount} of {MAX_RETRIES}</p>
        )}
        <div className="flex gap-3 justify-center mt-6">
          {retryCount < MAX_RETRIES ? (
            <button
              onClick={handleRetry}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry ({MAX_RETRIES - retryCount} left)
            </button>
          ) : (
            <p className="text-red-500 text-sm font-medium">Max retries reached</p>
          )}
          <button
            onClick={() => window.location.href = '/brief'}
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
          >
            Back to Brief
          </button>
        </div>
      </div>
    </div>
  )
}
