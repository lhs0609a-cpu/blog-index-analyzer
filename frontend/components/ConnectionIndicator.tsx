'use client'

import { useApiStatus } from '@/lib/hooks/useApiStatus'
import { useState } from 'react'
import { usePathname } from 'next/navigation'

export function ConnectionIndicator() {
  const pathname = usePathname()
  const { services, overallStatus, refresh } = useApiStatus()
  const [isExpanded, setIsExpanded] = useState(false)

  // 관리자 페이지에서만 표시
  const isAdminPage = pathname?.startsWith('/admin')
  if (!isAdminPage) {
    return null
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'checking':
        return 'bg-yellow-500 animate-pulse'
      case 'disconnected':
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return '연결됨'
      case 'checking':
        return '확인 중...'
      case 'disconnected':
        return '연결 끊김'
      case 'error':
        return '오류'
      default:
        return '알 수 없음'
    }
  }

  const getOverallStatusColor = () => {
    switch (overallStatus) {
      case 'connected':
        return 'bg-green-500'
      case 'partial':
        return 'bg-yellow-500'
      case 'disconnected':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <div className="bg-white/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200/50 overflow-hidden opacity-60 hover:opacity-100 transition-opacity">
        {/* 접힌 상태 - 작은 표시등 */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 px-3 py-2 w-full hover:bg-gray-50/50 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getOverallStatusColor()}`}></div>
            <span className="text-xs text-gray-500">
              {overallStatus === 'connected' ? '연결됨' :
               overallStatus === 'partial' ? '일부 오류' :
               '연결 끊김'}
            </span>
          </div>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 15l7-7 7 7"
            />
          </svg>
        </button>

        {/* 펼친 상태 - 상세 정보 */}
        {isExpanded && (
          <div className="border-t border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-600 uppercase">연결 상태</h3>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  refresh()
                }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                새로고침
              </button>
            </div>

            {services.map((service, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-lg p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(service.status)}`}></div>
                    <span className="text-sm font-medium text-gray-800">{service.name}</span>
                  </div>
                  <span className={`text-xs font-semibold ${
                    service.status === 'connected' ? 'text-green-600' :
                    service.status === 'checking' ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {getStatusText(service.status)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {service.latency !== undefined ? `응답시간: ${service.latency}ms` : '측정 중...'}
                  </span>
                  {service.lastCheck && (
                    <span>
                      {new Date(service.lastCheck).toLocaleTimeString('ko-KR', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  )}
                </div>

                {service.error && (
                  <div className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                    {service.error}
                  </div>
                )}
              </div>
            ))}

            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                10초마다 자동 갱신됩니다
              </p>
            </div>

            {/* 서버 연결 오류 안내 */}
            {overallStatus === 'disconnected' && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800 font-medium mb-1">
                  서버에 연결할 수 없습니다
                </p>
                <p className="text-xs text-yellow-700">
                  잠시 후 다시 시도해주세요. 문제가 지속되면 새로고침 버튼을 눌러주세요.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
