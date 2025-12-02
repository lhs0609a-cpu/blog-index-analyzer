/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // 환경 변수
  env: {
    API_BASE_URL: process.env.API_BASE_URL || 'http://localhost:8000',
  },

  // 이미지 최적화
  images: {
    domains: ['blogpfthumb-phinf.pstatic.net', 'blog.kakaocdn.net'],
    formats: ['image/avif', 'image/webp'],
  },
}

module.exports = nextConfig
