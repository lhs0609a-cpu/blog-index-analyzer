/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 환경 변수
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev',
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

  // TypeScript 설정 - 빌드 시 무시 (임시)
  typescript: {
    ignoreBuildErrors: true,
  },

  // ESLint 설정 - 빌드 시 무시 (임시)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Turbopack 설정
  turbopack: {
    root: process.cwd(),
  },
}

module.exports = nextConfig
// Trigger deployment 1766927029
