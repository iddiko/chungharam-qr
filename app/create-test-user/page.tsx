"use client"

import { useState } from 'react'

export default function CreateTestUserPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleCreateTestUsers = async () => {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch('/api/create-test-user', {
        method: 'POST',
      })

      const data = await response.json()

      if (response.ok) {
        setMessage(JSON.stringify(data, null, 2))
      } else {
        setMessage(`오류: ${data.error}`)
      }
    } catch (error) {
      setMessage(`오류: ${error}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">테스트 사용자 생성</h1>

          <button
            onClick={handleCreateTestUsers}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-blue-300 mb-6"
          >
            {loading ? '생성 중...' : '테스트 사용자 생성'}
          </button>

          {message && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap">{message}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
