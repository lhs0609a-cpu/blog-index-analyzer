/**
 * 다국어 번역 데이터
 */

export type Language = 'ko' | 'en' | 'ja' | 'zh';

export const languages: { code: Language; name: string; nativeName: string }[] = [
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' }
];

export const translations: Record<Language, Record<string, string>> = {
  ko: {
    // 공통
    'common.loading': '로딩 중...',
    'common.error': '오류가 발생했습니다',
    'common.retry': '다시 시도',
    'common.save': '저장',
    'common.cancel': '취소',
    'common.confirm': '확인',
    'common.delete': '삭제',
    'common.edit': '수정',
    'common.close': '닫기',
    'common.search': '검색',
    'common.more': '더 보기',
    'common.back': '뒤로',
    'common.next': '다음',
    'common.prev': '이전',
    'common.submit': '제출',
    'common.yes': '예',
    'common.no': '아니오',

    // 네비게이션
    'nav.home': '홈',
    'nav.analyze': '분석하기',
    'nav.keyword': '키워드 분석',
    'nav.pricing': '요금제',
    'nav.login': '로그인',
    'nav.signup': '회원가입',
    'nav.logout': '로그아웃',
    'nav.mypage': '마이페이지',
    'nav.settings': '설정',

    // 홈페이지
    'home.title': '블로그 지수 분석',
    'home.subtitle': '당신의 블로그 성장을 위한 AI 분석 서비스',
    'home.cta': '무료로 분석 시작하기',
    'home.feature1.title': '블로그 점수 분석',
    'home.feature1.desc': 'AI가 블로그의 품질과 영향력을 정밀 분석합니다',
    'home.feature2.title': '키워드 최적화',
    'home.feature2.desc': '검색에 최적화된 키워드를 추천해드립니다',
    'home.feature3.title': '경쟁 분석',
    'home.feature3.desc': '상위 노출 블로그와 비교 분석합니다',
    'home.stats.users': '명이 사용 중',
    'home.stats.analyses': '회 분석 완료',
    'home.stats.satisfaction': '만족도',

    // 분석 페이지
    'analyze.title': '블로그 분석',
    'analyze.input.placeholder': '블로그 주소를 입력하세요',
    'analyze.button': '분석하기',
    'analyze.analyzing': '분석 중...',
    'analyze.result.score': '블로그 점수',
    'analyze.result.level': '레벨',
    'analyze.result.rank': '상위',
    'analyze.result.detail': '상세 분석',
    'analyze.tips.title': '개선 팁',
    'analyze.share': '결과 공유',
    'analyze.reanalyze': '다시 분석',

    // 키워드 분석
    'keyword.title': '키워드 분석',
    'keyword.input.placeholder': '분석할 키워드를 입력하세요',
    'keyword.button': '분석하기',
    'keyword.result.volume': '월간 검색량',
    'keyword.result.competition': '경쟁 강도',
    'keyword.result.difficulty': '난이도',
    'keyword.result.suggestion': '추천 키워드',
    'keyword.result.related': '연관 키워드',
    'keyword.guide': '이 키워드로 글쓰기 가이드',

    // 요금제
    'pricing.title': '요금제',
    'pricing.subtitle': '당신에게 맞는 플랜을 선택하세요',
    'pricing.free.name': '무료',
    'pricing.free.price': '₩0',
    'pricing.free.period': '/월',
    'pricing.pro.name': '프로',
    'pricing.pro.price': '₩9,900',
    'pricing.pro.period': '/월',
    'pricing.business.name': '비즈니스',
    'pricing.business.price': '₩29,900',
    'pricing.business.period': '/월',
    'pricing.cta.free': '무료로 시작',
    'pricing.cta.pro': '프로 시작하기',
    'pricing.cta.business': '문의하기',
    'pricing.feature.analyses': '분석 횟수',
    'pricing.feature.keywords': '키워드 분석',
    'pricing.feature.competitors': '경쟁 분석',
    'pricing.feature.reports': '리포트',
    'pricing.feature.support': '고객 지원',

    // 인증
    'auth.login.title': '로그인',
    'auth.login.email': '이메일',
    'auth.login.password': '비밀번호',
    'auth.login.button': '로그인',
    'auth.login.forgot': '비밀번호를 잊으셨나요?',
    'auth.login.signup': '계정이 없으신가요?',
    'auth.signup.title': '회원가입',
    'auth.signup.name': '이름',
    'auth.signup.email': '이메일',
    'auth.signup.password': '비밀번호',
    'auth.signup.confirm': '비밀번호 확인',
    'auth.signup.button': '가입하기',
    'auth.signup.login': '이미 계정이 있으신가요?',
    'auth.signup.terms': '이용약관에 동의합니다',

    // 알림
    'notification.title': '알림',
    'notification.empty': '알림이 없습니다',
    'notification.markAllRead': '모두 읽음',
    'notification.settings': '알림 설정',

    // 설정
    'settings.title': '설정',
    'settings.profile': '프로필',
    'settings.notification': '알림 설정',
    'settings.language': '언어',
    'settings.theme': '테마',
    'settings.dark': '다크 모드',
    'settings.light': '라이트 모드',
    'settings.system': '시스템 설정',

    // 에러
    'error.404.title': '페이지를 찾을 수 없습니다',
    'error.404.desc': '요청하신 페이지가 존재하지 않습니다',
    'error.500.title': '서버 오류',
    'error.500.desc': '잠시 후 다시 시도해주세요',
    'error.network': '네트워크 연결을 확인해주세요',

    // 베타 경고
    'beta.warning': '베타 서비스 안내',
    'beta.message': '현재 베타 서비스로, 분석 결과가 부정확할 수 있습니다',

    // 추천
    'recommendation.title': '맞춤 추천',
    'recommendation.keywords': '추천 키워드',
    'recommendation.trending': '인기 키워드',
    'recommendation.similar': '비슷한 사용자',
    'recommendation.content': '콘텐츠 아이디어'
  },

  en: {
    // Common
    'common.loading': 'Loading...',
    'common.error': 'An error occurred',
    'common.retry': 'Retry',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.close': 'Close',
    'common.search': 'Search',
    'common.more': 'More',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.prev': 'Previous',
    'common.submit': 'Submit',
    'common.yes': 'Yes',
    'common.no': 'No',

    // Navigation
    'nav.home': 'Home',
    'nav.analyze': 'Analyze',
    'nav.keyword': 'Keyword Analysis',
    'nav.pricing': 'Pricing',
    'nav.login': 'Login',
    'nav.signup': 'Sign Up',
    'nav.logout': 'Logout',
    'nav.mypage': 'My Page',
    'nav.settings': 'Settings',

    // Home
    'home.title': 'Blog Index Analysis',
    'home.subtitle': 'AI-powered analysis service for your blog growth',
    'home.cta': 'Start Free Analysis',
    'home.feature1.title': 'Blog Score Analysis',
    'home.feature1.desc': 'AI precisely analyzes your blog quality and influence',
    'home.feature2.title': 'Keyword Optimization',
    'home.feature2.desc': 'We recommend search-optimized keywords',
    'home.feature3.title': 'Competition Analysis',
    'home.feature3.desc': 'Compare with top-ranked blogs',
    'home.stats.users': 'users',
    'home.stats.analyses': 'analyses completed',
    'home.stats.satisfaction': 'satisfaction',

    // Analyze
    'analyze.title': 'Blog Analysis',
    'analyze.input.placeholder': 'Enter your blog URL',
    'analyze.button': 'Analyze',
    'analyze.analyzing': 'Analyzing...',
    'analyze.result.score': 'Blog Score',
    'analyze.result.level': 'Level',
    'analyze.result.rank': 'Top',
    'analyze.result.detail': 'Detailed Analysis',
    'analyze.tips.title': 'Improvement Tips',
    'analyze.share': 'Share Results',
    'analyze.reanalyze': 'Analyze Again',

    // Keyword
    'keyword.title': 'Keyword Analysis',
    'keyword.input.placeholder': 'Enter a keyword to analyze',
    'keyword.button': 'Analyze',
    'keyword.result.volume': 'Monthly Search Volume',
    'keyword.result.competition': 'Competition Level',
    'keyword.result.difficulty': 'Difficulty',
    'keyword.result.suggestion': 'Suggested Keywords',
    'keyword.result.related': 'Related Keywords',
    'keyword.guide': 'Writing Guide for This Keyword',

    // Pricing
    'pricing.title': 'Pricing',
    'pricing.subtitle': 'Choose the plan that fits you',
    'pricing.free.name': 'Free',
    'pricing.free.price': '$0',
    'pricing.free.period': '/month',
    'pricing.pro.name': 'Pro',
    'pricing.pro.price': '$9.99',
    'pricing.pro.period': '/month',
    'pricing.business.name': 'Business',
    'pricing.business.price': '$29.99',
    'pricing.business.period': '/month',
    'pricing.cta.free': 'Start Free',
    'pricing.cta.pro': 'Start Pro',
    'pricing.cta.business': 'Contact Us',
    'pricing.feature.analyses': 'Analyses',
    'pricing.feature.keywords': 'Keyword Analysis',
    'pricing.feature.competitors': 'Competitor Analysis',
    'pricing.feature.reports': 'Reports',
    'pricing.feature.support': 'Customer Support',

    // Auth
    'auth.login.title': 'Login',
    'auth.login.email': 'Email',
    'auth.login.password': 'Password',
    'auth.login.button': 'Login',
    'auth.login.forgot': 'Forgot password?',
    'auth.login.signup': "Don't have an account?",
    'auth.signup.title': 'Sign Up',
    'auth.signup.name': 'Name',
    'auth.signup.email': 'Email',
    'auth.signup.password': 'Password',
    'auth.signup.confirm': 'Confirm Password',
    'auth.signup.button': 'Sign Up',
    'auth.signup.login': 'Already have an account?',
    'auth.signup.terms': 'I agree to the Terms of Service',

    // Notification
    'notification.title': 'Notifications',
    'notification.empty': 'No notifications',
    'notification.markAllRead': 'Mark all as read',
    'notification.settings': 'Notification Settings',

    // Settings
    'settings.title': 'Settings',
    'settings.profile': 'Profile',
    'settings.notification': 'Notification Settings',
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.dark': 'Dark Mode',
    'settings.light': 'Light Mode',
    'settings.system': 'System Default',

    // Error
    'error.404.title': 'Page Not Found',
    'error.404.desc': 'The requested page does not exist',
    'error.500.title': 'Server Error',
    'error.500.desc': 'Please try again later',
    'error.network': 'Please check your network connection',

    // Beta
    'beta.warning': 'Beta Service Notice',
    'beta.message': 'This is a beta service. Analysis results may be inaccurate',

    // Recommendation
    'recommendation.title': 'Personalized Recommendations',
    'recommendation.keywords': 'Recommended Keywords',
    'recommendation.trending': 'Trending Keywords',
    'recommendation.similar': 'Similar Users',
    'recommendation.content': 'Content Ideas'
  },

  ja: {
    // 共通
    'common.loading': '読み込み中...',
    'common.error': 'エラーが発生しました',
    'common.retry': '再試行',
    'common.save': '保存',
    'common.cancel': 'キャンセル',
    'common.confirm': '確認',
    'common.delete': '削除',
    'common.edit': '編集',
    'common.close': '閉じる',
    'common.search': '検索',
    'common.more': 'もっと見る',
    'common.back': '戻る',
    'common.next': '次へ',
    'common.prev': '前へ',
    'common.submit': '送信',
    'common.yes': 'はい',
    'common.no': 'いいえ',

    // ナビゲーション
    'nav.home': 'ホーム',
    'nav.analyze': '分析する',
    'nav.keyword': 'キーワード分析',
    'nav.pricing': '料金プラン',
    'nav.login': 'ログイン',
    'nav.signup': '新規登録',
    'nav.logout': 'ログアウト',
    'nav.mypage': 'マイページ',
    'nav.settings': '設定',

    // ホーム
    'home.title': 'ブログ指数分析',
    'home.subtitle': 'ブログ成長のためのAI分析サービス',
    'home.cta': '無料で分析を始める',
    'home.feature1.title': 'ブログスコア分析',
    'home.feature1.desc': 'AIがブログの品質と影響力を精密分析します',
    'home.feature2.title': 'キーワード最適化',
    'home.feature2.desc': '検索に最適化されたキーワードをお勧めします',
    'home.feature3.title': '競合分析',
    'home.feature3.desc': '上位表示ブログと比較分析します',
    'home.stats.users': '人が使用中',
    'home.stats.analyses': '回分析完了',
    'home.stats.satisfaction': '満足度',

    // 分析
    'analyze.title': 'ブログ分析',
    'analyze.input.placeholder': 'ブログのURLを入力してください',
    'analyze.button': '分析する',
    'analyze.analyzing': '分析中...',
    'analyze.result.score': 'ブログスコア',
    'analyze.result.level': 'レベル',
    'analyze.result.rank': '上位',
    'analyze.result.detail': '詳細分析',
    'analyze.tips.title': '改善のヒント',
    'analyze.share': '結果を共有',
    'analyze.reanalyze': '再分析',

    // キーワード
    'keyword.title': 'キーワード分析',
    'keyword.input.placeholder': '分析するキーワードを入力',
    'keyword.button': '分析する',
    'keyword.result.volume': '月間検索量',
    'keyword.result.competition': '競合レベル',
    'keyword.result.difficulty': '難易度',
    'keyword.result.suggestion': 'おすすめキーワード',
    'keyword.result.related': '関連キーワード',
    'keyword.guide': 'このキーワードで記事を書くガイド',

    // 料金
    'pricing.title': '料金プラン',
    'pricing.subtitle': 'あなたに合ったプランを選んでください',
    'pricing.free.name': '無料',
    'pricing.free.price': '¥0',
    'pricing.free.period': '/月',
    'pricing.pro.name': 'プロ',
    'pricing.pro.price': '¥990',
    'pricing.pro.period': '/月',
    'pricing.business.name': 'ビジネス',
    'pricing.business.price': '¥2,990',
    'pricing.business.period': '/月',
    'pricing.cta.free': '無料で始める',
    'pricing.cta.pro': 'プロを始める',
    'pricing.cta.business': 'お問い合わせ',

    // 認証
    'auth.login.title': 'ログイン',
    'auth.login.email': 'メールアドレス',
    'auth.login.password': 'パスワード',
    'auth.login.button': 'ログイン',
    'auth.login.forgot': 'パスワードをお忘れですか?',
    'auth.login.signup': 'アカウントをお持ちでない方',
    'auth.signup.title': '新規登録',
    'auth.signup.name': '名前',
    'auth.signup.email': 'メールアドレス',
    'auth.signup.password': 'パスワード',
    'auth.signup.confirm': 'パスワード確認',
    'auth.signup.button': '登録する',
    'auth.signup.login': 'すでにアカウントをお持ちの方',
    'auth.signup.terms': '利用規約に同意します',

    // 通知
    'notification.title': '通知',
    'notification.empty': '通知はありません',
    'notification.markAllRead': 'すべて既読にする',
    'notification.settings': '通知設定',

    // 設定
    'settings.title': '設定',
    'settings.profile': 'プロフィール',
    'settings.notification': '通知設定',
    'settings.language': '言語',
    'settings.theme': 'テーマ',
    'settings.dark': 'ダークモード',
    'settings.light': 'ライトモード',
    'settings.system': 'システム設定',

    // エラー
    'error.404.title': 'ページが見つかりません',
    'error.404.desc': 'お探しのページは存在しません',
    'error.500.title': 'サーバーエラー',
    'error.500.desc': 'しばらくしてからもう一度お試しください',
    'error.network': 'ネットワーク接続を確認してください',

    // ベータ
    'beta.warning': 'ベータサービスのお知らせ',
    'beta.message': '現在ベータサービスのため、分析結果が不正確な場合があります',

    // 推奨
    'recommendation.title': 'おすすめ',
    'recommendation.keywords': 'おすすめキーワード',
    'recommendation.trending': '人気キーワード',
    'recommendation.similar': '似たユーザー',
    'recommendation.content': 'コンテンツアイデア'
  },

  zh: {
    // 通用
    'common.loading': '加载中...',
    'common.error': '发生错误',
    'common.retry': '重试',
    'common.save': '保存',
    'common.cancel': '取消',
    'common.confirm': '确认',
    'common.delete': '删除',
    'common.edit': '编辑',
    'common.close': '关闭',
    'common.search': '搜索',
    'common.more': '更多',
    'common.back': '返回',
    'common.next': '下一步',
    'common.prev': '上一步',
    'common.submit': '提交',
    'common.yes': '是',
    'common.no': '否',

    // 导航
    'nav.home': '首页',
    'nav.analyze': '分析',
    'nav.keyword': '关键词分析',
    'nav.pricing': '价格',
    'nav.login': '登录',
    'nav.signup': '注册',
    'nav.logout': '登出',
    'nav.mypage': '我的页面',
    'nav.settings': '设置',

    // 首页
    'home.title': '博客指数分析',
    'home.subtitle': '为您的博客成长提供AI分析服务',
    'home.cta': '免费开始分析',
    'home.feature1.title': '博客评分分析',
    'home.feature1.desc': 'AI精准分析您的博客质量和影响力',
    'home.feature2.title': '关键词优化',
    'home.feature2.desc': '为您推荐搜索优化的关键词',
    'home.feature3.title': '竞争分析',
    'home.feature3.desc': '与排名靠前的博客进行比较分析',
    'home.stats.users': '用户使用中',
    'home.stats.analyses': '次分析完成',
    'home.stats.satisfaction': '满意度',

    // 分析
    'analyze.title': '博客分析',
    'analyze.input.placeholder': '请输入博客地址',
    'analyze.button': '分析',
    'analyze.analyzing': '分析中...',
    'analyze.result.score': '博客评分',
    'analyze.result.level': '等级',
    'analyze.result.rank': '排名前',
    'analyze.result.detail': '详细分析',
    'analyze.tips.title': '改进建议',
    'analyze.share': '分享结果',
    'analyze.reanalyze': '重新分析',

    // 关键词
    'keyword.title': '关键词分析',
    'keyword.input.placeholder': '输入要分析的关键词',
    'keyword.button': '分析',
    'keyword.result.volume': '月搜索量',
    'keyword.result.competition': '竞争程度',
    'keyword.result.difficulty': '难度',
    'keyword.result.suggestion': '推荐关键词',
    'keyword.result.related': '相关关键词',
    'keyword.guide': '此关键词写作指南',

    // 价格
    'pricing.title': '价格方案',
    'pricing.subtitle': '选择适合您的方案',
    'pricing.free.name': '免费',
    'pricing.free.price': '¥0',
    'pricing.free.period': '/月',
    'pricing.pro.name': '专业版',
    'pricing.pro.price': '¥69',
    'pricing.pro.period': '/月',
    'pricing.business.name': '企业版',
    'pricing.business.price': '¥199',
    'pricing.business.period': '/月',
    'pricing.cta.free': '免费开始',
    'pricing.cta.pro': '开始专业版',
    'pricing.cta.business': '联系我们',

    // 认证
    'auth.login.title': '登录',
    'auth.login.email': '邮箱',
    'auth.login.password': '密码',
    'auth.login.button': '登录',
    'auth.login.forgot': '忘记密码?',
    'auth.login.signup': '没有账户?',
    'auth.signup.title': '注册',
    'auth.signup.name': '姓名',
    'auth.signup.email': '邮箱',
    'auth.signup.password': '密码',
    'auth.signup.confirm': '确认密码',
    'auth.signup.button': '注册',
    'auth.signup.login': '已有账户?',
    'auth.signup.terms': '我同意服务条款',

    // 通知
    'notification.title': '通知',
    'notification.empty': '没有通知',
    'notification.markAllRead': '全部标为已读',
    'notification.settings': '通知设置',

    // 设置
    'settings.title': '设置',
    'settings.profile': '个人资料',
    'settings.notification': '通知设置',
    'settings.language': '语言',
    'settings.theme': '主题',
    'settings.dark': '深色模式',
    'settings.light': '浅色模式',
    'settings.system': '系统默认',

    // 错误
    'error.404.title': '页面未找到',
    'error.404.desc': '您请求的页面不存在',
    'error.500.title': '服务器错误',
    'error.500.desc': '请稍后重试',
    'error.network': '请检查网络连接',

    // 测试版
    'beta.warning': '测试版服务通知',
    'beta.message': '这是测试版服务，分析结果可能不准确',

    // 推荐
    'recommendation.title': '个性化推荐',
    'recommendation.keywords': '推荐关键词',
    'recommendation.trending': '热门关键词',
    'recommendation.similar': '相似用户',
    'recommendation.content': '内容创意'
  }
};
