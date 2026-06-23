'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight, ChevronDown, ExternalLink, Copy, Check,
  AlertCircle, Info, Zap, Shield, Clock, ArrowLeft
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

// 플랫폼별 세팅 가이드 데이터
const PLATFORM_GUIDES = {
  naver_searchad: {
    id: 'naver_searchad',
    name: '네이버 검색광고',
    icon: '🟢',
    color: 'from-green-500 to-green-600',
    difficulty: '쉬움',
    timeRequired: '5-10분',
    description: '네이버 검색광고 API를 연동하여 키워드 입찰가 최적화, 성과 분석을 자동화합니다.',
    prerequisites: [
      '네이버 검색광고 계정 (광고주 또는 대행사)',
      'API 라이선스 신청 완료',
      '마스터 계정 권한'
    ],
    steps: [
      {
        title: '1. 네이버 광고 관리 시스템 접속',
        content: `네이버 검색광고 관리 시스템(https://searchad.naver.com)에 로그인합니다.`,
        image: null,
        tips: ['크롬 브라우저 사용 권장', '마스터 계정으로 로그인해야 API 접근 가능']
      },
      {
        title: '2. API 라이선스 발급 신청',
        content: `상단 메뉴 > 도구 > API 사용 관리로 이동합니다.

처음 사용하는 경우:
- "API 라이선스 발급 신청" 클릭
- 사용 목적 선택 (광고 관리 자동화)
- 이용약관 동의 후 신청
- 승인까지 1-2일 소요 (보통 당일 승인)`,
        tips: ['API 사용 목적을 명확히 작성하면 승인이 빠름', '대행사 계정은 별도 절차 필요']
      },
      {
        title: '3. API 키 확인',
        content: `승인 완료 후 "API 사용 관리" 페이지에서 다음 정보를 확인합니다:

- **API 라이선스**: 영문+숫자 조합 (예: 0100000000abcd1234...)
- **시크릿 키**: Base64 인코딩된 문자열
- **고객 ID**: 숫자 6~10자리 (예: 1234567, 계정에 따라 6자리일 수 있음)`,
        tips: ['시크릿 키는 한 번만 표시되므로 반드시 저장', 'API 라이선스와 시크릿 키 모두 필요']
      },
      {
        title: '4. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "네이버 검색광고" 연동하기 클릭 후:

1. 고객 ID 입력
2. API 라이선스 입력
3. 시크릿 키 입력
4. "연동하기" 클릭`,
        tips: ['복사-붙여넣기 시 앞뒤 공백 주의', '연동 성공 시 바로 데이터 동기화 시작']
      }
    ],
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', placeholder: '1234567', helpText: '광고 계정의 고객 ID (숫자 6~10자리)' },
      { name: 'api_license', label: 'API 라이선스', placeholder: '0100000000...', helpText: 'API 사용 관리에서 확인' },
      { name: 'secret_key', label: '시크릿 키', placeholder: 'AQAAAAA...', helpText: '최초 발급 시에만 확인 가능' }
    ],
    troubleshooting: [
      { q: 'API 라이선스가 표시되지 않아요', a: 'API 라이선스 신청 후 승인 완료되어야 표시됩니다. 1-2일 후 다시 확인해주세요.' },
      { q: '연동했는데 데이터가 안 나와요', a: '캠페인이 활성화 상태인지 확인하세요. 일시정지된 캠페인은 데이터가 제한됩니다.' },
      { q: '"권한 없음" 오류가 발생해요', a: '마스터 계정으로 로그인했는지 확인하세요. 하위 계정은 API 접근 권한이 없습니다.' }
    ]
  },

  google_ads: {
    id: 'google_ads',
    name: 'Google Ads',
    icon: '🔵',
    color: 'from-blue-500 to-blue-600',
    difficulty: '보통',
    timeRequired: '15-20분',
    description: 'Google Ads API를 연동하여 검색, 디스플레이, 유튜브 광고를 통합 관리합니다.',
    prerequisites: [
      'Google Ads 계정 (MCC 또는 개별 계정)',
      'Google Cloud Console 프로젝트',
      '개발자 토큰 승인'
    ],
    steps: [
      {
        title: '1. Google Cloud Console 프로젝트 생성',
        content: `Google Cloud Console(https://console.cloud.google.com)에서:

1. 새 프로젝트 생성 또는 기존 프로젝트 선택
2. 좌측 메뉴 > API 및 서비스 > 라이브러리
3. "Google Ads API" 검색 후 사용 설정`,
        tips: ['프로젝트 이름은 나중에 변경 가능', '결제 계정 연결 필수']
      },
      {
        title: '2. OAuth 2.0 클라이언트 ID 생성',
        content: `API 및 서비스 > 사용자 인증 정보에서:

1. "사용자 인증 정보 만들기" > "OAuth 클라이언트 ID"
2. 애플리케이션 유형: "웹 애플리케이션"
3. 승인된 리디렉션 URI 추가:
   https://blog-index-analyzer.vercel.app/api/google/callback
4. 클라이언트 ID와 클라이언트 시크릿 저장`,
        tips: ['리디렉션 URI 정확히 입력', 'OAuth 동의 화면 먼저 구성 필요']
      },
      {
        title: '3. 개발자 토큰 발급',
        content: `Google Ads 계정(https://ads.google.com)에서:

1. 도구 및 설정 > 설정 > API 센터
2. "개발자 토큰 신청"
3. 테스트 계정용 토큰 즉시 발급 (실계정은 심사 필요)
4. 토큰 승인까지 24-48시간 소요`,
        tips: ['테스트 토큰으로 먼저 연동 테스트', '프로덕션 토큰은 기본 액세스로 충분']
      },
      {
        title: '4. Refresh Token 획득',
        content: `OAuth 인증 플로우를 통해 Refresh Token을 획득합니다:

1. Google OAuth 동의 화면에서 권한 승인
2. 콜백으로 전달된 인증 코드로 토큰 교환
3. Refresh Token 안전하게 저장

또는 google-ads-api-tester 도구 사용:
https://developers.google.com/google-ads/api/docs/oauth/playground`,
        tips: ['Refresh Token은 무기한 유효 (재설정 전까지)', 'access_type=offline 파라미터 필수']
      },
      {
        title: '5. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "Google Ads" 연동하기 클릭 후:

1. 고객 ID 입력 (xxx-xxx-xxxx 형식)
2. 개발자 토큰 입력
3. OAuth 클라이언트 ID/시크릿 입력
4. Refresh Token 입력
5. "연동하기" 클릭`,
        tips: ['고객 ID는 하이픈(-) 없이 입력해도 됨', 'MCC 계정 연동 시 하위 계정 자동 포함']
      }
    ],
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', placeholder: '1234567890', helpText: 'Google Ads 계정 ID (하이픈 제외)' },
      { name: 'developer_token', label: '개발자 토큰', placeholder: 'ABcdEfGhIjK...', helpText: 'API 센터에서 발급' },
      { name: 'client_id', label: 'OAuth 클라이언트 ID', placeholder: '123...apps.googleusercontent.com', helpText: 'Cloud Console에서 생성' },
      { name: 'client_secret', label: 'OAuth 클라이언트 시크릿', placeholder: 'GOCSPX-...', helpText: 'Cloud Console에서 확인' },
      { name: 'refresh_token', label: 'Refresh Token', placeholder: '1//0g...', helpText: 'OAuth 인증 후 획득' }
    ],
    troubleshooting: [
      { q: '개발자 토큰 승인이 안 돼요', a: 'Google Ads 계정에 활성 캠페인과 결제 정보가 있어야 합니다.' },
      { q: '"INVALID_GRANT" 오류', a: 'Refresh Token이 만료되었습니다. OAuth 인증을 다시 진행해주세요.' },
      { q: 'MCC 하위 계정이 안 보여요', a: '고객 ID에 MCC ID를 입력했는지 확인하세요. login_customer_id 설정이 필요합니다.' }
    ]
  },

  meta_ads: {
    id: 'meta_ads',
    name: 'Meta 광고 (Facebook/Instagram)',
    icon: '🔷',
    color: 'from-indigo-500 to-indigo-600',
    difficulty: '쉬움',
    timeRequired: '10-15분',
    description: 'Meta Business Suite를 통해 Facebook, Instagram 광고를 통합 관리합니다.',
    prerequisites: [
      'Meta Business Suite 계정',
      '광고 계정 관리자 권한',
      'Meta for Developers 앱 (선택)'
    ],
    steps: [
      {
        title: '1. Meta Business Suite 접속',
        content: `Meta Business Suite(https://business.facebook.com)에 로그인합니다.

광고 계정이 없다면:
1. 비즈니스 설정 > 계정 > 광고 계정
2. "추가" > "새 광고 계정 만들기"
3. 계정 정보 입력 후 생성`,
        tips: ['개인 Facebook 계정과 비즈니스 계정은 별개', '광고 계정당 하나의 결제 수단 필요']
      },
      {
        title: '2. 액세스 토큰 발급 (간단한 방법)',
        content: `Graph API Explorer를 사용한 빠른 발급:

1. https://developers.facebook.com/tools/explorer/ 접속
2. 우측 상단 앱 선택 (없으면 "Meta App" 선택)
3. 권한 추가:
   - ads_read
   - ads_management
   - business_management
4. "Generate Access Token" 클릭
5. Facebook 로그인 후 권한 승인`,
        tips: ['테스트용 단기 토큰은 1-2시간 유효', '장기 토큰 변환 필요']
      },
      {
        title: '3. 장기 액세스 토큰 변환',
        content: `단기 토큰을 60일 유효 토큰으로 변환:

Graph API Explorer에서:
GET /oauth/access_token
  ?grant_type=fb_exchange_token
  &client_id={앱_ID}
  &client_secret={앱_시크릿}
  &fb_exchange_token={단기_토큰}

또는 Access Token Debugger 사용:
https://developers.facebook.com/tools/debug/accesstoken/`,
        tips: ['장기 토큰도 60일 후 만료', '시스템 사용자 토큰은 영구 유효']
      },
      {
        title: '4. 광고 계정 ID 확인',
        content: `비즈니스 설정 > 계정 > 광고 계정에서:

1. 해당 광고 계정 클릭
2. "광고 계정 ID" 확인 (act_로 시작하는 숫자)
3. 복사하여 저장

또는 광고 관리자 URL에서 확인:
https://www.facebook.com/adsmanager/manage/campaigns?act=123456789`,
        tips: ['act_ 접두어 포함/미포함 모두 사용 가능', '여러 광고 계정이 있다면 각각 ID가 다름']
      },
      {
        title: '5. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "Meta 광고" 연동하기 클릭 후:

1. 광고 계정 ID 입력 (act_123456789)
2. 액세스 토큰 입력
3. "연동하기" 클릭`,
        tips: ['Instagram 광고도 같은 액세스 토큰으로 관리', 'Conversions API 설정은 별도 필요']
      }
    ],
    requiredFields: [
      { name: 'ad_account_id', label: '광고 계정 ID', placeholder: 'act_123456789', helpText: '비즈니스 설정에서 확인' },
      { name: 'access_token', label: '액세스 토큰', placeholder: 'EAABs...', helpText: 'Graph API Explorer에서 발급' }
    ],
    troubleshooting: [
      { q: '토큰이 자꾸 만료돼요', a: '시스템 사용자 토큰을 발급받으면 영구 유효합니다. 비즈니스 설정 > 사용자 > 시스템 사용자에서 생성하세요.' },
      { q: '"Error validating access token"', a: '토큰이 만료되었거나 권한이 부족합니다. 새 토큰을 발급받아주세요.' },
      { q: '광고 계정 ID를 모르겠어요', a: '광고 관리자 URL에서 act= 뒤의 숫자가 계정 ID입니다.' }
    ]
  },

  kakao_moment: {
    id: 'kakao_moment',
    name: '카카오모먼트',
    icon: '💛',
    color: 'from-yellow-400 to-yellow-500',
    difficulty: '보통',
    timeRequired: '10-15분',
    description: '카카오모먼트 API를 연동하여 카카오톡, 다음 광고를 관리합니다.',
    prerequisites: [
      '카카오모먼트 광고 계정',
      'Kakao Developers 앱',
      '비즈니스 인증 완료'
    ],
    steps: [
      {
        title: '1. 카카오모먼트 광고 계정 생성',
        content: `카카오모먼트(https://moment.kakao.com)에서:

1. 카카오 계정으로 로그인
2. 광고 계정 생성 (비즈니스 정보 입력)
3. 세금계산서 발행 정보 등록`,
        tips: ['사업자등록번호 필수', '개인사업자도 가입 가능']
      },
      {
        title: '2. Kakao Developers 앱 생성',
        content: `Kakao Developers(https://developers.kakao.com)에서:

1. "내 애플리케이션" > "애플리케이션 추가하기"
2. 앱 이름 입력 (예: 블랭크 광고 관리)
3. 앱 생성 후 "앱 키" 확인:
   - REST API 키 (필수)
   - JavaScript 키 (선택)`,
        tips: ['앱 도메인 등록 필요', '카카오 로그인 활성화']
      },
      {
        title: '3. 카카오 로그인 설정',
        content: `앱 설정 > 카카오 로그인에서:

1. 활성화 설정 ON
2. Redirect URI 등록:
   https://blog-index-analyzer.vercel.app/api/kakao/callback
3. 동의 항목 설정:
   - 닉네임 (필수)
   - 이메일 (선택)`,
        tips: ['Redirect URI는 정확히 일치해야 함', '비즈니스 앱 전환 시 추가 심사']
      },
      {
        title: '4. 광고 계정 연동 및 토큰 발급',
        content: `카카오 로그인을 통해 액세스 토큰 발급:

1. 블랭크에서 "카카오 로그인" 클릭
2. 카카오 계정 로그인
3. 광고 계정 연동 권한 승인
4. 자동으로 토큰 발급 완료

광고 계정 ID 확인:
- 카카오모먼트 > 설정 > 광고 계정 정보`,
        tips: ['토큰은 자동 갱신됨', '여러 광고 계정 연동 가능']
      },
      {
        title: '5. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "카카오모먼트" 연동하기 클릭 후:

1. 앱 ID 입력 (Kakao Developers 앱 ID)
2. 광고 계정 ID 입력
3. 액세스 토큰 입력
4. "연동하기" 클릭`,
        tips: ['카카오톡 채널 광고 포함', '메시지 광고는 별도 설정']
      }
    ],
    requiredFields: [
      { name: 'app_id', label: 'Kakao 앱 ID', placeholder: '123456', helpText: 'Kakao Developers 앱 ID' },
      { name: 'ad_account_id', label: '광고 계정 ID', placeholder: '100001', helpText: '카카오모먼트 설정에서 확인' },
      { name: 'access_token', label: '액세스 토큰', placeholder: 'q7GQGJ...', helpText: '카카오 로그인 후 자동 발급' }
    ],
    troubleshooting: [
      { q: '광고 계정 ID를 못 찾겠어요', a: '카카오모먼트 > 우측 상단 설정 > 광고 계정 정보에서 확인하세요.' },
      { q: '토큰 갱신이 안 돼요', a: '카카오 로그인 세션이 만료되었습니다. 다시 로그인해주세요.' },
      { q: '권한 부족 오류', a: 'Kakao Developers에서 "카카오 로그인" 동의 항목을 확인하세요.' }
    ]
  },

  tiktok_ads: {
    id: 'tiktok_ads',
    name: 'TikTok Ads',
    icon: '🎵',
    color: 'from-pink-500 to-pink-600',
    difficulty: '보통',
    timeRequired: '15-20분',
    description: 'TikTok for Business API를 연동하여 틱톡 광고를 관리합니다.',
    prerequisites: [
      'TikTok for Business 계정',
      'TikTok Marketing API 앱 승인',
      '광고 계정 관리자 권한'
    ],
    steps: [
      {
        title: '1. TikTok for Business 계정 생성',
        content: `TikTok Ads Manager(https://ads.tiktok.com)에서:

1. 비즈니스 계정 생성
2. 광고 계정 설정 (국가, 통화, 시간대)
3. 결제 수단 등록`,
        tips: ['한국 광고 계정은 원화(KRW) 설정', '사업자 인증 시 추가 기능 활성화']
      },
      {
        title: '2. TikTok Developers 앱 생성',
        content: `TikTok for Developers(https://developers.tiktok.com)에서:

1. "My apps" > "Create app"
2. 앱 유형: "Business" 선택
3. 앱 이름 및 설명 입력
4. Marketing API 접근 권한 요청`,
        tips: ['Marketing API는 별도 승인 필요', '승인까지 2-5일 소요']
      },
      {
        title: '3. Marketing API 권한 신청',
        content: `앱 상세 페이지에서:

1. "Marketing API" 탭 클릭
2. "Request access" 클릭
3. 사용 목적 및 사용 사례 작성:
   - 광고 성과 조회 및 분석
   - 광고 예산 및 입찰 최적화
4. 신청 후 승인 대기`,
        tips: ['영어로 작성 권장', '사업자 인증 완료 시 승인 빠름']
      },
      {
        title: '4. Access Token 발급',
        content: `승인 완료 후 액세스 토큰 발급:

1. 앱 설정 > "Generate Access Token"
2. 연동할 광고 계정 선택
3. 권한 범위 선택:
   - Ads Management (광고 관리)
   - Reporting (리포트)
4. 토큰 생성 및 저장`,
        tips: ['토큰은 1년 유효', 'Advertiser ID도 함께 확인']
      },
      {
        title: '5. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "TikTok Ads" 연동하기 클릭 후:

1. 앱 ID 입력
2. 시크릿 입력
3. Advertiser ID 입력
4. 액세스 토큰 입력
5. "연동하기" 클릭`,
        tips: ['Advertiser ID는 숫자로만 구성', '여러 광고 계정 연동 가능']
      }
    ],
    requiredFields: [
      { name: 'app_id', label: 'TikTok 앱 ID', placeholder: '123456789', helpText: 'TikTok Developers 앱 ID' },
      { name: 'secret', label: '앱 시크릿', placeholder: 'abc123...', helpText: '앱 설정에서 확인' },
      { name: 'advertiser_id', label: 'Advertiser ID', placeholder: '700123456789', helpText: 'Ads Manager에서 확인' },
      { name: 'access_token', label: '액세스 토큰', placeholder: 'abc123...', helpText: '토큰 생성기에서 발급' }
    ],
    troubleshooting: [
      { q: 'Marketing API 승인이 안 돼요', a: '사업자 인증을 먼저 완료하세요. 인증 없이는 테스트 접근만 가능합니다.' },
      { q: 'Advertiser ID를 모르겠어요', a: 'Ads Manager URL에서 aadvid= 뒤의 숫자를 확인하세요.' },
      { q: '"Unauthorized" 오류', a: '토큰 만료 또는 권한 부족입니다. 새 토큰을 발급받아주세요.' }
    ]
  },

  coupang_ads: {
    id: 'coupang_ads',
    name: '쿠팡 광고',
    icon: '🛒',
    color: 'from-orange-500 to-orange-600',
    difficulty: '쉬움',
    timeRequired: '5-10분',
    description: '쿠팡 광고 API를 연동하여 쿠팡 내 상품 광고를 관리합니다.',
    prerequisites: [
      '쿠팡 판매자 계정 (마켓플레이스)',
      '광고 센터 가입',
      'Open API 신청 승인'
    ],
    steps: [
      {
        title: '1. 쿠팡 판매자 계정 확인',
        content: `쿠팡 윙(https://wing.coupang.com)에 로그인:

1. 판매자 계정으로 로그인
2. 광고 센터 > 광고 관리 접속
3. 광고 캠페인이 있는지 확인`,
        tips: ['판매 중인 상품이 있어야 광고 가능', '신규 판매자는 일정 기간 후 광고 가능']
      },
      {
        title: '2. Open API 신청',
        content: `쿠팡 개발자 포털(https://developers.coupang.com)에서:

1. 회원가입 또는 로그인
2. "API 신청" > "광고 API" 선택
3. 사용 목적 입력:
   - 광고 성과 분석 및 최적화
   - 자동 입찰 관리
4. 신청 완료 (보통 1-2일 내 승인)`,
        tips: ['판매자 계정과 연결된 이메일로 가입', 'API 사용량 제한 확인']
      },
      {
        title: '3. API 키 발급',
        content: `승인 완료 후:

1. 개발자 포털 > 내 애플리케이션
2. "키 발급" 클릭
3. Access Key와 Secret Key 확인
4. Vendor ID 확인 (판매자 ID)`,
        tips: ['Secret Key는 한 번만 표시', '키 재발급 시 기존 키 무효화']
      },
      {
        title: '4. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "쿠팡 광고" 연동하기 클릭 후:

1. Vendor ID 입력
2. Access Key 입력
3. Secret Key 입력
4. "연동하기" 클릭`,
        tips: ['Vendor ID는 숫자', '키 입력 시 공백 주의']
      }
    ],
    requiredFields: [
      { name: 'vendor_id', label: 'Vendor ID', placeholder: 'A00123456', helpText: '쿠팡 윙 > 계정 정보에서 확인' },
      { name: 'access_key', label: 'Access Key', placeholder: 'abc123-...', helpText: '개발자 포털에서 발급' },
      { name: 'secret_key', label: 'Secret Key', placeholder: 'xyz789...', helpText: '최초 발급 시에만 확인 가능' }
    ],
    troubleshooting: [
      { q: 'API 신청이 거부됐어요', a: '판매자 계정 상태를 확인하세요. 정상 판매 중인 상품이 있어야 합니다.' },
      { q: '데이터가 안 나와요', a: '활성 캠페인이 있는지 확인하세요. 캠페인 없으면 데이터가 없습니다.' },
      { q: '"SignatureDoesNotMatch" 오류', a: 'Secret Key가 잘못되었습니다. 키를 다시 확인하거나 재발급 받으세요.' }
    ]
  },

  criteo: {
    id: 'criteo',
    name: '크리테오',
    icon: '🔴',
    color: 'from-red-500 to-red-600',
    difficulty: '어려움',
    timeRequired: '20-30분',
    description: '크리테오 Marketing API를 연동하여 리타게팅 광고를 관리합니다.',
    prerequisites: [
      '크리테오 광고주 계정',
      '크리테오 담당자 연락 (API 접근 요청)',
      'OAuth 2.0 클라이언트 발급'
    ],
    steps: [
      {
        title: '1. 크리테오 계정 및 담당자 연락',
        content: `크리테오는 B2B 셀프서비스가 제한적입니다:

1. 크리테오 공식 웹사이트에서 문의
2. 담당 영업 매니저 배정 대기
3. 계약 및 광고 계정 개설

이미 계정이 있다면:
- 담당 매니저에게 API 접근 요청`,
        tips: ['최소 광고비 기준이 있을 수 있음', '대행사 통해 가입 가능']
      },
      {
        title: '2. API 접근 권한 요청',
        content: `크리테오 담당자에게 API 접근 요청:

1. Marketing API 사용 목적 설명
2. 필요 권한 명시:
   - Campaign Management
   - Analytics
   - Budget Management
3. OAuth 클라이언트 생성 요청`,
        tips: ['이메일로 요청 가능', '승인까지 1-2주 소요될 수 있음']
      },
      {
        title: '3. OAuth 클라이언트 정보 수령',
        content: `담당자로부터 다음 정보 수령:

1. Client ID (클라이언트 ID)
2. Client Secret (클라이언트 시크릿)
3. Advertiser ID (광고주 ID)

크리테오 Management Center에서도 확인 가능:
https://marketing.criteo.com`,
        tips: ['Client Secret은 안전하게 보관', 'Advertiser ID는 숫자']
      },
      {
        title: '4. 액세스 토큰 발급',
        content: `OAuth 2.0 Client Credentials 방식으로 토큰 발급:

POST https://api.criteo.com/oauth2/token
Content-Type: application/x-www-form-urlencoded

client_id={CLIENT_ID}
&client_secret={CLIENT_SECRET}
&grant_type=client_credentials

응답에서 access_token 확인 (1시간 유효)`,
        tips: ['토큰은 자동 갱신 구현 필요', '블랭크에서 자동 처리']
      },
      {
        title: '5. 블랭크에 연동',
        content: `블랭크 통합광고 > 플랫폼 관리에서 "크리테오" 연동하기 클릭 후:

1. Client ID 입력
2. Client Secret 입력
3. Advertiser ID 입력
4. "연동하기" 클릭`,
        tips: ['토큰 갱신은 자동으로 처리됨', '여러 광고주 계정 연동 가능']
      }
    ],
    requiredFields: [
      { name: 'client_id', label: 'Client ID', placeholder: 'abc123-...', helpText: '크리테오 담당자에게 발급받음' },
      { name: 'client_secret', label: 'Client Secret', placeholder: 'xyz789...', helpText: '안전하게 보관 필요' },
      { name: 'advertiser_id', label: 'Advertiser ID', placeholder: '123456', helpText: 'Management Center에서 확인' }
    ],
    troubleshooting: [
      { q: 'API 접근 권한이 없어요', a: '크리테오 담당 매니저에게 Marketing API 접근 권한을 요청하세요.' },
      { q: '토큰 발급이 안 돼요', a: 'Client ID/Secret이 정확한지 확인하세요. 발급 후 활성화까지 시간이 걸릴 수 있습니다.' },
      { q: '데이터가 제한적이에요', a: '할당된 API 권한 범위를 확인하세요. 담당자에게 추가 권한 요청이 필요할 수 있습니다.' }
    ]
  }
}

type PlatformId = keyof typeof PLATFORM_GUIDES

export default function SetupGuidePage() {
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformId | null>(null)
  const [expandedStep, setExpandedStep] = useState<number | null>(0)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    toast.success('복사됨!')
    setTimeout(() => setCopiedField(null), 2000)
  }

  const guide = selectedPlatform ? PLATFORM_GUIDES[selectedPlatform] : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* 헤더 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/ad-optimizer/unified" className="text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              통합 광고
            </Link>
            <div className="w-px h-6 bg-gray-300" />
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">플랫폼 세팅 가이드</h1>
                <p className="text-xs text-gray-500">각 광고 플랫폼별 상세 설정 방법</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {!selectedPlatform ? (
          // 플랫폼 선택 화면
          <div>
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">어떤 플랫폼을 연동하시겠어요?</h2>
              <p className="text-gray-600">세팅하려는 광고 플랫폼을 선택하세요</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.values(PLATFORM_GUIDES).map((platform) => (
                <motion.button
                  key={platform.id}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setSelectedPlatform(platform.id as PlatformId)
                    setExpandedStep(0)
                  }}
                  className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-4xl">{platform.icon}</span>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        platform.difficulty === '쉬움' ? 'bg-green-100 text-green-700' :
                        platform.difficulty === '보통' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {platform.difficulty}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {platform.timeRequired}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{platform.name}</h3>
                  <p className="text-sm text-gray-600 line-clamp-2">{platform.description}</p>
                  <div className="mt-4 flex items-center text-indigo-600 text-sm font-medium">
                    가이드 보기 <ChevronRight className="w-4 h-4 ml-1" />
                  </div>
                </motion.button>
              ))}
            </div>
          </div>
        ) : guide && (
          // 상세 가이드 화면
          <div>
            {/* 뒤로가기 및 플랫폼 정보 */}
            <div className="mb-8">
              <button
                onClick={() => setSelectedPlatform(null)}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
              >
                <ArrowLeft className="w-4 h-4" />
                다른 플랫폼 선택
              </button>

              <div className={`bg-gradient-to-r ${guide.color} rounded-2xl p-6 text-white`}>
                <div className="flex items-center gap-4">
                  <span className="text-5xl">{guide.icon}</span>
                  <div>
                    <h2 className="text-2xl font-bold">{guide.name}</h2>
                    <p className="text-white/80">{guide.description}</p>
                    <div className="flex items-center gap-4 mt-2 text-sm">
                      <span className="flex items-center gap-1">
                        <Shield className="w-4 h-4" />
                        난이도: {guide.difficulty}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {guide.timeRequired}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 준비사항 */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-blue-900 flex items-center gap-2 mb-3">
                <Info className="w-5 h-5" />
                시작하기 전 준비사항
              </h3>
              <ul className="space-y-2">
                {guide.prerequisites.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-blue-800">
                    <Check className="w-4 h-4 mt-0.5 text-blue-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* 단계별 가이드 */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900">단계별 설정 가이드</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {guide.steps.map((step, idx) => (
                  <div key={idx}>
                    <button
                      onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}
                      className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          expandedStep === idx ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="font-medium text-gray-900">{step.title}</span>
                      </div>
                      {expandedStep === idx ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                    <AnimatePresence>
                      {expandedStep === idx && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pl-16">
                            <div className="prose prose-sm max-w-none">
                              <pre className="whitespace-pre-wrap text-gray-700 font-sans bg-gray-50 p-4 rounded-lg">
                                {step.content}
                              </pre>
                            </div>
                            {step.tips && step.tips.length > 0 && (
                              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                <p className="text-xs font-medium text-yellow-800 mb-2">💡 팁</p>
                                <ul className="space-y-1">
                                  {step.tips.map((tip, tipIdx) => (
                                    <li key={tipIdx} className="text-sm text-yellow-700">• {tip}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {idx < guide.steps.length - 1 && (
                              <button
                                onClick={() => setExpandedStep(idx + 1)}
                                className="mt-4 text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1"
                              >
                                다음 단계로 <ChevronRight className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>

            {/* 필요한 정보 요약 */}
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
              <h3 className="font-bold text-gray-900 mb-4">연동에 필요한 정보</h3>
              <div className="space-y-3">
                {guide.requiredFields.map((field) => (
                  <div key={field.name} className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900">{field.label}</span>
                      <button
                        onClick={() => copyToClipboard(field.placeholder, field.name)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {copiedField === field.name ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm text-gray-500">{field.helpText}</p>
                    <code className="text-xs text-gray-400 mt-1 block">예: {field.placeholder}</code>
                  </div>
                ))}
              </div>
            </div>

            {/* 문제 해결 */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                  자주 묻는 질문
                </h3>
              </div>
              <div className="divide-y divide-gray-100">
                {guide.troubleshooting.map((item, idx) => (
                  <div key={idx} className="p-4">
                    <p className="font-medium text-gray-900 mb-2">Q. {item.q}</p>
                    <p className="text-sm text-gray-600">A. {item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 하단 CTA */}
            <div className="mt-8 text-center">
              <Link
                href="/ad-optimizer/unified"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
              >
                <Zap className="w-5 h-5" />
                지금 연동하러 가기
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
