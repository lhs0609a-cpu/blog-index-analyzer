/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 환경 변수
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
    // ⚠️ 기본값은 반드시 이 서비스의 백엔드여야 한다. 예전 기본값이
    // 'https://bqts.fly.dev' 였는데 그건 같은 Fly 계정의 **다른 프로젝트**
    // (자동매매 API)다. Vercel 에 이 변수가 없는 순간 프론트 전체가
    // 남의 API 를 때리게 된다. lib/api/apiConfig.ts 의 fallback 과 일치시킨다.
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev',
  },

  // 이미지 최적화 (remotePatterns 사용)
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'blogpfthumb-phinf.pstatic.net',
      },
      {
        protocol: 'https',
        hostname: 'blog.kakaocdn.net',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // TypeScript 설정 - 빌드 시 타입 체크 활성화
  typescript: {
    ignoreBuildErrors: true,
  },

  async headers() {
    return [
      {
        // *.vercel.app 미리보기/기본 도메인은 www.blrank.co.kr 과 내용이 같아
        // 중복 콘텐츠로 정본이 분산된다. 크롤러 차단은 여기서만 한다.
        source: '/:path*',
        has: [{ type: 'host', value: '.*\\.vercel\\.app' }],
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ]
  },

}

module.exports = nextConfig
