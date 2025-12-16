/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // 환경 변수
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://naverpay-delivery-tracker.fly.dev',
  },

  // 이미지 최적화
  images: {
    domains: ['blogpfthumb-phinf.pstatic.net', 'blog.kakaocdn.net'],
    formats: ['image/avif', 'image/webp'],
  },

  // ESLint 설정 - 빌드 시 무시 (임시)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // TypeScript 설정 - 빌드 시 무시 (임시)
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
