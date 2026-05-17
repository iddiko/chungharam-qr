"use client"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ko">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' }}>
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#111827', marginBottom: '0.5rem' }}>오류가 발생했습니다</h2>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>{error.message || "예상치 못한 오류가 발생했습니다."}</p>
            <button
              onClick={reset}
              style={{ padding: '0.5rem 1rem', background: '#2563eb', color: 'white', border: 'none', borderRadius: '0.5rem', cursor: 'pointer' }}
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
