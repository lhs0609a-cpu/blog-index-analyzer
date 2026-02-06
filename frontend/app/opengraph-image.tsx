import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export const alt = '블랭크 - AI 블로그 분석 플랫폼'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)',
          position: 'relative',
        }}
      >
        {/* Background decorations */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 100, 255, 0.3) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -100,
            left: -100,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '40px',
          }}
        >
          {/* Logo/Icon */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 120,
              height: 120,
              borderRadius: 30,
              background: 'linear-gradient(135deg, #0064FF 0%, #3182F6 100%)',
              marginBottom: 40,
              boxShadow: '0 20px 60px rgba(0, 100, 255, 0.4)',
            }}
          >
            <span style={{ fontSize: 60, color: 'white' }}>B</span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: 72,
              fontWeight: 800,
              background: 'linear-gradient(90deg, #ffffff 0%, #0064FF 50%, #3182F6 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              margin: 0,
              marginBottom: 20,
              textAlign: 'center',
            }}
          >
            블랭크
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 36,
              color: 'rgba(255, 255, 255, 0.8)',
              margin: 0,
              marginBottom: 30,
              textAlign: 'center',
            }}
          >
            AI 블로그 분석 플랫폼
          </p>

          {/* Features */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 20,
            }}
          >
            {['블로그 지수 분석', '키워드 분석', 'AI 글쓰기'].map((feature) => (
              <div
                key={feature}
                style={{
                  padding: '12px 24px',
                  borderRadius: 50,
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: 'rgba(255, 255, 255, 0.9)',
                  fontSize: 20,
                }}
              >
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* URL at bottom */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'rgba(255, 255, 255, 0.5)',
            fontSize: 20,
          }}
        >
          www.blrank.co.kr
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}
