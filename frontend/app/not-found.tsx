import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      {/* Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-20 -left-40 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative text-center max-w-md">
        {/* 404 Number */}
        <div className="mb-8">
          <span className="text-[150px] font-bold leading-none bg-gradient-to-br from-purple-400 via-pink-400 to-indigo-400 bg-clip-text text-transparent">
            404
          </span>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-white mb-4">
          페이지를 찾을 수 없습니다
        </h1>

        {/* Description */}
        <p className="text-white/60 mb-8 leading-relaxed">
          요청하신 페이지가 존재하지 않거나
          <br />
          이동되었을 수 있습니다.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            홈으로 돌아가기
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 border border-white/20 text-white/80 rounded-xl font-medium hover:bg-white/10 transition-colors"
          >
            대시보드로 이동
          </Link>
        </div>

        {/* Popular pages */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-sm text-white/40 mb-4">인기 페이지</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {[
              { href: '/analyze', label: '블로그 분석' },
              { href: '/keyword-search', label: '키워드 분석' },
              { href: '/tools', label: '블로그 도구' },
              { href: '/pricing', label: '요금제' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* P3: Pro 안내 */}
        <div className="mt-8 p-4 bg-gradient-to-r from-purple-600/20 to-indigo-600/20 border border-purple-500/30 rounded-xl">
          <p className="text-sm text-white/70 mb-2">
            Pro 플랜으로 1위 가능 키워드를 매일 받아보세요
          </p>
          <Link
            href="/pricing"
            className="text-purple-400 hover:text-purple-300 text-sm font-medium"
          >
            7일 무료 체험 시작 →
          </Link>
        </div>
      </div>
    </div>
  )
}
