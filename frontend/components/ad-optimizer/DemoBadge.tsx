'use client'

/**
 * 데모/샘플 데이터임을 표시하는 배지 컴포넌트
 * 하드코딩된 수치 옆에 배치하여 사용자 혼란 방지
 */
export function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded ${className}`}>
      데모
    </span>
  )
}

/**
 * 데모 데이터 안내 배너
 * 페이지 상단에 배치하여 실제 데이터가 아님을 명시
 */
export function DemoBanner({ platformName }: { platformName?: string }) {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
      <span className="text-amber-500 text-lg">⚠️</span>
      <div>
        <span className="font-medium text-amber-800">데모 데이터</span>
        <span className="text-amber-700 ml-1">
          {platformName
            ? `${platformName} API가 아직 연동되지 않아 샘플 데이터가 표시됩니다.`
            : '실제 플랫폼 연동 전이므로 샘플 데이터가 표시됩니다.'}
        </span>
      </div>
    </div>
  )
}
