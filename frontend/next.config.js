/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 환경 변수
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr',
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
    ignoreBuildErrors: false,
  },

  // Turbopack 설정 - Google Drive 한글 경로 호환성을 위해 절대 경로 사용
  turbopack: {
    root: __dirname,
  },
}

module.exports = nextConfig
