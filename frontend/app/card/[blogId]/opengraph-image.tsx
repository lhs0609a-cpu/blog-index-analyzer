import { ImageResponse } from 'next/og'
import { SITE_NAME } from '@/lib/seo'
import {
  CARD_HONESTY_NOTE,
  fetchBlogCard,
  formatMeasuredDate,
  gradeColors,
  gradeLabel,
  isValidBlogId,
} from '@/lib/blogCard'

// 루트 opengraph-image.tsx 와 같은 방식 — edge 런타임, 폰트는 next/og 가
// 한글 글리프를 만나면 Noto Sans KR 을 동적으로 불러온다.
export const runtime = 'edge'
export const revalidate = 600

export const alt = `${SITE_NAME} 블로그 등급 카드`
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: { blogId: string } }) {
  let blogId = params.blogId
  try {
    blogId = decodeURIComponent(blogId)
  } catch {
    /* 그대로 쓴다 */
  }
  // 형식에 안 맞는 아이디는 이미지에 그대로 찍지 않는다 (임의 문구 주입 방지).
  if (!isValidBlogId(blogId)) blogId = ''
  const card = await fetchBlogCard(blogId)
  const colors = gradeColors(card.level)
  const measured = formatMeasuredDate(card.measured_at)
  const name = (card.blog_name || blogId).slice(0, 30)

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)',
          padding: '56px 72px',
          color: 'white',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 460,
            height: 460,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0, 100, 255, 0.35) 0%, transparent 70%)',
          }}
        />

        {/* 상단: 브랜드 */}
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: 'rgba(255,255,255,0.75)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #0064FF 0%, #3182F6 100%)',
              color: 'white',
              fontSize: 26,
              marginRight: 16,
            }}
          >
            B
          </div>
          {SITE_NAME} 블로그 등급 카드
        </div>

        {card.available ? (
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', marginTop: 24 }}>
            {/* 등급 배지 */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: 320,
                height: 320,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
                boxShadow: '0 20px 60px rgba(0, 100, 255, 0.35)',
                marginRight: 64,
              }}
            >
              <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, lineHeight: 1.1 }}>
                {gradeLabel(card)}
              </div>
              {card.estimated && (
                <div
                  style={{
                    display: 'flex',
                    marginTop: 12,
                    padding: '6px 20px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.25)',
                    fontSize: 30,
                  }}
                >
                  추정
                </div>
              )}
            </div>

            {/* 블로그 정보 */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, lineHeight: 1.2 }}>{name}</div>
              <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
                @{blogId}
              </div>
              <div style={{ display: 'flex', marginTop: 40 }}>
                <div style={{ display: 'flex', flexDirection: 'column', marginRight: 56 }}>
                  <div style={{ display: 'flex', fontSize: 52, fontWeight: 700 }}>Lv.{card.level}</div>
                  <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>레벨</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', fontSize: 52, fontWeight: 700 }}>
                    {card.total_score != null ? card.total_score.toFixed(1) : '-'}
                  </div>
                  <div style={{ display: 'flex', fontSize: 24, color: 'rgba(255,255,255,0.6)' }}>
                    운영 건강도 / 100
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', fontSize: 26, color: 'rgba(255,255,255,0.75)', marginTop: 36 }}>
                {`측정일 ${measured ?? '알 수 없음'}${card.estimated ? ' · 추정 등급' : ''}`}
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {blogId && (
              <div style={{ display: 'flex', fontSize: 44, color: 'rgba(255,255,255,0.7)' }}>@{blogId}</div>
            )}
            <div style={{ display: 'flex', fontSize: 60, fontWeight: 700, marginTop: 24 }}>
              아직 분석 기록이 없습니다
            </div>
            <div style={{ display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.6)', marginTop: 20 }}>
              내 블로그 등급, 무료로 확인하기
            </div>
          </div>
        )}

        {/* 하단: 출처·정직성 표시 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 22,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          <div style={{ display: 'flex' }}>{CARD_HONESTY_NOTE}</div>
          <div style={{ display: 'flex' }}>www.blrank.co.kr</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
