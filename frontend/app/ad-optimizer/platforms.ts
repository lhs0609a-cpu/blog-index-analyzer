// 광고 플랫폼 정의
export type PlatformCategory = 'search' | 'social' | 'video' | 'native' | 'app' | 'commerce' | 'programmatic'

export interface AdPlatform {
  id: string
  name: string
  nameKo: string
  category: PlatformCategory
  icon: string // emoji or icon name
  color: string // tailwind gradient
  description: string
  features: string[]
  apiAvailable: boolean
  setupGuideUrl?: string
  requiredFields: {
    name: string
    label: string
    type: 'text' | 'password'
    placeholder: string
    helpText?: string
  }[]
  comingSoon?: boolean
}

export const PLATFORM_CATEGORIES: Record<PlatformCategory, { name: string; icon: string }> = {
  search: { name: '검색 광고', icon: '🔍' },
  social: { name: '소셜/디스플레이', icon: '📱' },
  video: { name: '동영상 광고', icon: '🎬' },
  native: { name: '네이티브/DSP', icon: '📰' },
  app: { name: '앱 광고', icon: '📲' },
  commerce: { name: '커머스/쇼핑', icon: '🛒' },
  programmatic: { name: '프로그래매틱', icon: '🤖' },
}

export const AD_PLATFORMS: AdPlatform[] = [
  // ============ 검색 광고 ============
  {
    id: 'naver_searchad',
    name: 'Naver Search Ad',
    nameKo: '네이버 검색광고',
    category: 'search',
    icon: '🟢',
    color: 'from-green-500 to-emerald-600',
    description: '한국 검색 점유율 1위, 파워링크 광고',
    features: ['입찰가 자동 최적화', '비효율 키워드 제외', '트렌드 키워드 발굴', 'ROAS 극대화'],
    apiAvailable: true,
    setupGuideUrl: 'https://searchad.naver.com',
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', type: 'text', placeholder: '네이버 광고 고객 ID (7자리)' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 액세스 라이선스' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키', helpText: '발급 시 1회만 표시됩니다' },
    ],
  },
  {
    id: 'google_ads',
    name: 'Google Ads',
    nameKo: '구글 애즈',
    category: 'search',
    icon: '🔵',
    color: 'from-blue-500 to-blue-600',
    description: '글로벌 1위 검색 광고, 유튜브/디스플레이 포함',
    features: ['스마트 입찰 최적화', '검색어 분석', '부정 키워드 자동 추가', '예산 재분배'],
    apiAvailable: true,
    setupGuideUrl: 'https://ads.google.com',
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', type: 'text', placeholder: 'Google Ads 고객 ID (xxx-xxx-xxxx)' },
      { name: 'developer_token', label: '개발자 토큰', type: 'password', placeholder: 'Google Ads API 개발자 토큰' },
      { name: 'refresh_token', label: '리프레시 토큰', type: 'password', placeholder: 'OAuth 리프레시 토큰' },
    ],
  },
  {
    id: 'kakao_keyword',
    name: 'Kakao Keyword Ad',
    nameKo: '카카오 키워드광고',
    category: 'search',
    icon: '🟡',
    color: 'from-yellow-400 to-yellow-500',
    description: '다음 검색, 카카오 생태계 광고',
    features: ['키워드 입찰 최적화', '검색어 분석', '시간대별 입찰 조정'],
    apiAvailable: true,
    setupGuideUrl: 'https://keywordad.kakao.com',
    requiredFields: [
      { name: 'account_id', label: '광고계정 ID', type: 'text', placeholder: '카카오 광고계정 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'REST API 키' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키' },
    ],
  },
  {
    id: 'microsoft_ads',
    name: 'Microsoft Ads',
    nameKo: '마이크로소프트 광고 (Bing)',
    category: 'search',
    icon: '🔷',
    color: 'from-cyan-500 to-blue-600',
    description: 'Bing 검색, LinkedIn 연동 가능',
    features: ['입찰 최적화', 'LinkedIn 프로필 타겟팅', '검색어 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'account_id', label: '계정 ID', type: 'text', placeholder: 'Microsoft Ads 계정 ID' },
      { name: 'developer_token', label: '개발자 토큰', type: 'password', placeholder: 'API 개발자 토큰' },
      { name: 'refresh_token', label: '리프레시 토큰', type: 'password', placeholder: 'OAuth 리프레시 토큰' },
    ],
  },

  // ============ 소셜/디스플레이 ============
  {
    id: 'meta_ads',
    name: 'Meta Ads',
    nameKo: '메타 광고 (페이스북/인스타)',
    category: 'social',
    icon: '🔵',
    color: 'from-blue-600 to-indigo-600',
    description: '페이스북, 인스타그램, 메신저 광고',
    features: ['예산 자동 분배', '오디언스 성과 분석', 'A/B 테스트 자동화', '크리에이티브 최적화'],
    apiAvailable: true,
    setupGuideUrl: 'https://business.facebook.com',
    requiredFields: [
      { name: 'ad_account_id', label: '광고 계정 ID', type: 'text', placeholder: 'act_xxxxxxxxxx' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'Meta Marketing API 토큰' },
    ],
  },
  {
    id: 'kakao_moment',
    name: 'Kakao Moment',
    nameKo: '카카오모먼트',
    category: 'social',
    icon: '💬',
    color: 'from-yellow-400 to-amber-500',
    description: '카카오톡, 다음, 카카오스토리 광고',
    features: ['메시지 광고 최적화', '타겟 오디언스 분석', '시간대별 성과 분석'],
    apiAvailable: true,
    setupGuideUrl: 'https://moment.kakao.com',
    requiredFields: [
      { name: 'ad_account_id', label: '광고계정 ID', type: 'text', placeholder: '카카오모먼트 광고계정 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'REST API 키' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키' },
    ],
  },
  {
    id: 'tiktok_ads',
    name: 'TikTok Ads',
    nameKo: '틱톡 광고',
    category: 'social',
    icon: '🎵',
    color: 'from-cyan-400 via-black to-pink-500',
    description: 'MZ세대 타겟, 숏폼 영상 광고',
    features: ['영상 성과 분석', '오디언스 최적화', '입찰가 자동 조정', '트렌드 해시태그 분석'],
    apiAvailable: true,
    setupGuideUrl: 'https://ads.tiktok.com',
    requiredFields: [
      { name: 'advertiser_id', label: '광고주 ID', type: 'text', placeholder: 'TikTok 광고주 ID' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'TikTok Marketing API 토큰' },
    ],
  },
  {
    id: 'twitter_ads',
    name: 'X (Twitter) Ads',
    nameKo: 'X(트위터) 광고',
    category: 'social',
    icon: '✖️',
    color: 'from-gray-800 to-gray-900',
    description: '실시간 트렌드, 이슈 마케팅',
    features: ['트렌드 타겟팅', '실시간 입찰 최적화', '해시태그 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'account_id', label: '광고 계정 ID', type: 'text', placeholder: 'X Ads 계정 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API Key' },
      { name: 'api_secret', label: 'API 시크릿', type: 'password', placeholder: 'API Secret' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'Access Token' },
    ],
  },
  {
    id: 'linkedin_ads',
    name: 'LinkedIn Ads',
    nameKo: '링크드인 광고',
    category: 'social',
    icon: '💼',
    color: 'from-blue-700 to-blue-800',
    description: 'B2B 마케팅, 직무/산업 타겟팅',
    features: ['리드젠 최적화', '직무별 타겟팅 분석', 'B2B 전환 추적'],
    apiAvailable: true,
    requiredFields: [
      { name: 'account_id', label: '광고 계정 ID', type: 'text', placeholder: 'LinkedIn 광고 계정 ID' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'LinkedIn Marketing API 토큰' },
    ],
  },
  {
    id: 'pinterest_ads',
    name: 'Pinterest Ads',
    nameKo: '핀터레스트 광고',
    category: 'social',
    icon: '📌',
    color: 'from-red-500 to-red-600',
    description: '여성 타겟, 라이프스타일 광고',
    features: ['핀 성과 분석', '관심사 타겟팅 최적화', '쇼핑 핀 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'ad_account_id', label: '광고 계정 ID', type: 'text', placeholder: 'Pinterest 광고 계정 ID' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'Pinterest API 토큰' },
    ],
  },
  {
    id: 'snapchat_ads',
    name: 'Snapchat Ads',
    nameKo: '스냅챗 광고',
    category: 'social',
    icon: '👻',
    color: 'from-yellow-300 to-yellow-400',
    description: '젊은층 타겟, AR 필터 광고',
    features: ['AR 렌즈 성과 분석', '스토리 광고 최적화', '지역 타겟팅'],
    apiAvailable: true,
    requiredFields: [
      { name: 'ad_account_id', label: '광고 계정 ID', type: 'text', placeholder: 'Snapchat 광고 계정 ID' },
      { name: 'access_token', label: '액세스 토큰', type: 'password', placeholder: 'Snapchat Marketing API 토큰' },
    ],
  },

  // ============ 동영상 광고 ============
  {
    id: 'youtube_ads',
    name: 'YouTube Ads',
    nameKo: '유튜브 광고',
    category: 'video',
    icon: '▶️',
    color: 'from-red-500 to-red-600',
    description: '영상 광고, Google Ads 연동',
    features: ['영상 조회 최적화', '스킵 분석', '타겟 오디언스 최적화', 'CPV 입찰 최적화'],
    apiAvailable: true,
    setupGuideUrl: 'https://ads.google.com',
    requiredFields: [
      { name: 'customer_id', label: 'Google Ads 고객 ID', type: 'text', placeholder: 'xxx-xxx-xxxx' },
      { name: 'developer_token', label: '개발자 토큰', type: 'password', placeholder: 'Google Ads API 토큰' },
      { name: 'refresh_token', label: '리프레시 토큰', type: 'password', placeholder: 'OAuth 리프레시 토큰' },
    ],
  },
  {
    id: 'naver_tv',
    name: 'Naver TV Ad',
    nameKo: '네이버 TV 광고',
    category: 'video',
    icon: '📺',
    color: 'from-green-500 to-green-600',
    description: '네이버 동영상 광고',
    features: ['CPV 최적화', '영상 완료율 분석', '타겟 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', type: 'text', placeholder: '네이버 광고 고객 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 키' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키' },
    ],
  },

  // ============ 네이티브/DSP ============
  {
    id: 'criteo',
    name: 'Criteo',
    nameKo: '크리테오',
    category: 'native',
    icon: '🎯',
    color: 'from-orange-500 to-orange-600',
    description: '리타겟팅 전문, 이커머스 강력',
    features: ['다이나믹 리타겟팅', '상품 피드 최적화', 'ROAS 극대화', '크로스디바이스 추적'],
    apiAvailable: true,
    requiredFields: [
      { name: 'advertiser_id', label: '광고주 ID', type: 'text', placeholder: 'Criteo 광고주 ID' },
      { name: 'client_id', label: '클라이언트 ID', type: 'text', placeholder: 'API 클라이언트 ID' },
      { name: 'client_secret', label: '클라이언트 시크릿', type: 'password', placeholder: 'API 시크릿' },
    ],
  },
  {
    id: 'taboola',
    name: 'Taboola',
    nameKo: '타불라',
    category: 'native',
    icon: '📰',
    color: 'from-blue-400 to-blue-500',
    description: '네이티브 광고, 콘텐츠 추천',
    features: ['CPC 최적화', '콘텐츠 성과 분석', '퍼블리셔 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'account_id', label: '계정 ID', type: 'text', placeholder: 'Taboola 계정 ID' },
      { name: 'client_id', label: '클라이언트 ID', type: 'text', placeholder: 'API 클라이언트 ID' },
      { name: 'client_secret', label: '클라이언트 시크릿', type: 'password', placeholder: 'API 시크릿' },
    ],
  },
  {
    id: 'outbrain',
    name: 'Outbrain',
    nameKo: '아웃브레인',
    category: 'native',
    icon: '🌐',
    color: 'from-orange-400 to-red-500',
    description: '네이티브 광고, 프리미엄 퍼블리셔',
    features: ['CPC 최적화', '콘텐츠 추천 최적화', '퍼블리셔 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'account_id', label: '계정 ID', type: 'text', placeholder: 'Outbrain 계정 ID' },
      { name: 'api_token', label: 'API 토큰', type: 'password', placeholder: 'Outbrain API 토큰' },
    ],
  },
  {
    id: 'mobon',
    name: 'Mobon',
    nameKo: '모비온',
    category: 'native',
    icon: '🇰🇷',
    color: 'from-purple-500 to-purple-600',
    description: '국내 DSP, 리타겟팅 전문',
    features: ['리타겟팅 최적화', '매체 분석', 'CPC/CPA 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'advertiser_id', label: '광고주 ID', type: 'text', placeholder: '모비온 광고주 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 키' },
    ],
  },
  {
    id: 'dable',
    name: 'Dable',
    nameKo: '데이블',
    category: 'native',
    icon: '📑',
    color: 'from-teal-500 to-teal-600',
    description: '국내 네이티브 광고, 콘텐츠 추천',
    features: ['콘텐츠 추천 최적화', 'CPC 입찰 조정', '매체 성과 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'client_id', label: '클라이언트 ID', type: 'text', placeholder: 'Dable 클라이언트 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 키' },
    ],
  },

  // ============ 앱 광고 ============
  {
    id: 'apple_searchads',
    name: 'Apple Search Ads',
    nameKo: '애플 서치 애즈',
    category: 'app',
    icon: '🍎',
    color: 'from-gray-700 to-gray-900',
    description: '앱스토어 검색 광고',
    features: ['키워드 입찰 최적화', '검색어 발굴', 'TAP 최적화', 'CPA 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'org_id', label: '조직 ID', type: 'text', placeholder: 'Apple 조직 ID' },
      { name: 'client_id', label: '클라이언트 ID', type: 'text', placeholder: 'API 클라이언트 ID' },
      { name: 'client_secret', label: '클라이언트 시크릿', type: 'password', placeholder: 'API 시크릿' },
    ],
  },
  {
    id: 'google_app_campaigns',
    name: 'Google App Campaigns',
    nameKo: '구글 앱 캠페인',
    category: 'app',
    icon: '📱',
    color: 'from-green-500 to-blue-500',
    description: '플레이스토어 + 네트워크 앱 광고',
    features: ['설치 최적화', 'CPI 입찰 조정', '인앱 이벤트 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'customer_id', label: 'Google Ads 고객 ID', type: 'text', placeholder: 'xxx-xxx-xxxx' },
      { name: 'developer_token', label: '개발자 토큰', type: 'password', placeholder: 'API 토큰' },
      { name: 'refresh_token', label: '리프레시 토큰', type: 'password', placeholder: 'OAuth 토큰' },
    ],
  },
  {
    id: 'admob',
    name: 'AdMob',
    nameKo: '애드몹',
    category: 'app',
    icon: '📲',
    color: 'from-amber-500 to-orange-500',
    description: '앱 내 광고 네트워크',
    features: ['eCPM 최적화', '광고 유닛 분석', '미디에이션 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'publisher_id', label: '퍼블리셔 ID', type: 'text', placeholder: 'AdMob 퍼블리셔 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'AdMob API 키' },
    ],
  },

  // ============ 커머스/쇼핑 ============
  {
    id: 'naver_shopping',
    name: 'Naver Shopping Ad',
    nameKo: '네이버 쇼핑광고',
    category: 'commerce',
    icon: '🛍️',
    color: 'from-green-500 to-emerald-600',
    description: '스마트스토어, 쇼핑검색 광고',
    features: ['상품 입찰 최적화', '카테고리 분석', 'ROAS 극대화', '리뷰 점수 반영'],
    apiAvailable: true,
    requiredFields: [
      { name: 'customer_id', label: '고객 ID', type: 'text', placeholder: '네이버 광고 고객 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 키' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키' },
    ],
  },
  {
    id: 'coupang_ads',
    name: 'Coupang Ads',
    nameKo: '쿠팡 광고',
    category: 'commerce',
    icon: '🚀',
    color: 'from-red-500 to-rose-600',
    description: '쿠팡 내 검색/디스플레이 광고',
    features: ['상품 입찰 최적화', '검색어 분석', '카테고리 타겟팅'],
    apiAvailable: true,
    requiredFields: [
      { name: 'vendor_id', label: '벤더 ID', type: 'text', placeholder: '쿠팡 벤더 ID' },
      { name: 'access_key', label: '액세스 키', type: 'password', placeholder: 'API 액세스 키' },
      { name: 'secret_key', label: '비밀 키', type: 'password', placeholder: 'API 비밀 키' },
    ],
  },
  {
    id: 'amazon_ads',
    name: 'Amazon Ads',
    nameKo: '아마존 광고',
    category: 'commerce',
    icon: '📦',
    color: 'from-orange-400 to-yellow-500',
    description: '아마존 셀러 광고',
    features: ['Sponsored Products 최적화', '키워드 분석', 'ACOS 최소화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'profile_id', label: '프로필 ID', type: 'text', placeholder: 'Amazon 광고 프로필 ID' },
      { name: 'client_id', label: '클라이언트 ID', type: 'text', placeholder: 'LWA 클라이언트 ID' },
      { name: 'client_secret', label: '클라이언트 시크릿', type: 'password', placeholder: 'LWA 시크릿' },
      { name: 'refresh_token', label: '리프레시 토큰', type: 'password', placeholder: 'LWA 리프레시 토큰' },
    ],
  },
  {
    id: '11st_ads',
    name: '11st Ads',
    nameKo: '11번가 광고',
    category: 'commerce',
    icon: '🏬',
    color: 'from-red-600 to-red-700',
    description: '11번가 내 광고',
    features: ['상품 광고 최적화', '카테고리 분석'],
    apiAvailable: false,
    comingSoon: true,
    requiredFields: [],
  },

  // ============ 프로그래매틱 ============
  {
    id: 'google_dv360',
    name: 'Google DV360',
    nameKo: '구글 DV360',
    category: 'programmatic',
    icon: '🎯',
    color: 'from-blue-500 to-indigo-600',
    description: '구글 프로그래매틱 DSP',
    features: ['RTB 입찰 최적화', '오디언스 분석', '크리에이티브 최적화'],
    apiAvailable: true,
    requiredFields: [
      { name: 'partner_id', label: '파트너 ID', type: 'text', placeholder: 'DV360 파트너 ID' },
      { name: 'advertiser_id', label: '광고주 ID', type: 'text', placeholder: 'DV360 광고주 ID' },
      { name: 'service_account_key', label: '서비스 계정 키', type: 'password', placeholder: 'JSON 키 (Base64)' },
    ],
  },
  {
    id: 'thetradedesk',
    name: 'The Trade Desk',
    nameKo: '더 트레이드 데스크',
    category: 'programmatic',
    icon: '🌐',
    color: 'from-green-600 to-teal-600',
    description: '글로벌 독립 DSP',
    features: ['RTB 최적화', '크로스채널 분석', '데이터 마켓플레이스 활용'],
    apiAvailable: true,
    requiredFields: [
      { name: 'partner_id', label: '파트너 ID', type: 'text', placeholder: 'TTD 파트너 ID' },
      { name: 'api_token', label: 'API 토큰', type: 'password', placeholder: 'TTD API 토큰' },
    ],
  },
  {
    id: 'nasmedia',
    name: 'NAS Media',
    nameKo: '나스미디어',
    category: 'programmatic',
    icon: '🇰🇷',
    color: 'from-indigo-500 to-purple-600',
    description: '국내 DSP, 프로그래매틱 광고',
    features: ['국내 매체 최적화', 'RTB 입찰 조정', '타겟팅 분석'],
    apiAvailable: true,
    requiredFields: [
      { name: 'advertiser_id', label: '광고주 ID', type: 'text', placeholder: '나스미디어 광고주 ID' },
      { name: 'api_key', label: 'API 키', type: 'password', placeholder: 'API 키' },
    ],
  },
]

// 플랫폼 ID로 플랫폼 찾기
export function getPlatformById(id: string): AdPlatform | undefined {
  return AD_PLATFORMS.find(p => p.id === id)
}

// 카테고리별 플랫폼 그룹화
export function getPlatformsByCategory(): Record<PlatformCategory, AdPlatform[]> {
  const result: Record<PlatformCategory, AdPlatform[]> = {
    search: [],
    social: [],
    video: [],
    native: [],
    app: [],
    commerce: [],
    programmatic: [],
  }

  AD_PLATFORMS.forEach(platform => {
    result[platform.category].push(platform)
  })

  return result
}

// 연동된 플랫폼 개수
// 현재는 네이버만 기본 연동 상태로 반환
// 추후 실제 플랫폼 연동 상태 조회 API 연동 필요
export function getConnectedPlatformsCount(): number {
  return 1
}
