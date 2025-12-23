'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft, Sparkles, Check, Lightbulb, SkipForward } from 'lucide-react'

export interface ToolTutorialStep {
  title: string
  description: string
  tip?: string
}

interface ToolTutorialProps {
  toolId: string
  isOpen: boolean
  onClose: () => void
}

// 모든 도구별 튜토리얼 정의
const toolTutorials: Record<string, ToolTutorialStep[]> = {
  // ===== 콘텐츠 제작 =====
  title: [
    {
      title: 'AI 제목 생성기',
      description: '클릭률 높은 블로그 제목을 AI가 자동으로 생성해드립니다.',
      tip: '검색량이 높은 키워드를 포함한 제목이 상위노출에 유리합니다.'
    },
    {
      title: '키워드 입력하기',
      description: '분석하고 싶은 키워드를 입력하세요. 예: "다이어트 식단", "아이폰 케이스"',
      tip: '너무 넓은 키워드보다는 구체적인 키워드가 좋은 제목을 만들어냅니다.'
    },
    {
      title: '제목 스타일 선택',
      description: '감정형, 질문형, 숫자형, 비교형 등 다양한 스타일의 제목이 생성됩니다.',
      tip: '질문형 제목은 클릭률이 평균 14% 더 높습니다!'
    },
    {
      title: '결과 확인 및 복사',
      description: '마음에 드는 제목을 클릭하면 자동으로 복사됩니다. CTR 점수가 높을수록 클릭률이 높아요!',
    }
  ],

  blueocean: [
    {
      title: '블루오션 키워드 발굴',
      description: '경쟁은 낮고 검색량은 높은 "블루오션" 키워드를 AI가 찾아드립니다.',
      tip: '블루오션 키워드로 글을 쓰면 상위노출 확률이 3배 이상 높아집니다!'
    },
    {
      title: '시드 키워드 입력',
      description: '분석하고 싶은 주제나 키워드를 입력하세요. AI가 관련된 블루오션 키워드를 발굴합니다.',
      tip: '구체적인 키워드보다는 넓은 주제를 입력하면 더 많은 키워드를 찾을 수 있어요!'
    },
    {
      title: '기회 점수 이해하기',
      description: '기회 점수는 검색량 대비 경쟁도를 계산한 수치입니다. 점수가 높을수록 상위 노출 가능성이 높습니다.',
      tip: '기회점수 70점 이상인 키워드는 꼭 공략해보세요!'
    },
    {
      title: '트렌드 확인',
      description: '상승(↑) 트렌드 키워드는 검색량이 증가하고 있어 선점하면 유리합니다.',
    }
  ],

  writing: [
    {
      title: '글쓰기 가이드',
      description: '작성한 글이 상위노출에 적합한지 AI가 분석하고 개선점을 알려드립니다.',
      tip: '발행 전에 꼭 체크하면 상위노출 확률이 높아집니다!'
    },
    {
      title: '글 내용 붙여넣기',
      description: '분석하고 싶은 블로그 글의 제목과 본문을 붙여넣으세요.',
    },
    {
      title: '점수 확인하기',
      description: '100점 만점으로 글의 품질을 평가합니다. 80점 이상이면 상위노출 가능성이 높습니다.',
      tip: '점수가 낮다면 개선 제안을 확인하고 수정해보세요!'
    },
    {
      title: '체크리스트 확인',
      description: '제목 길이, 키워드 밀도, 문단 구성, 이미지 개수 등을 체크합니다. 빨간색 항목을 우선 수정하세요.',
    }
  ],

  insight: [
    {
      title: '성과 인사이트',
      description: '블로그 성과 데이터를 분석하여 개선점과 기회를 찾아드립니다.',
      tip: '정기적으로 확인하면 블로그 성장 방향을 잡기 쉬워집니다!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 네이버 블로그 ID를 입력하세요. (예: myblog123)',
    },
    {
      title: '인사이트 확인',
      description: '어떤 카테고리가 잘 되고 있는지, 어떤 시간대에 방문자가 많은지 등을 확인할 수 있습니다.',
      tip: '가장 성과가 좋은 카테고리에 집중하면 효율이 높아집니다!'
    }
  ],

  prediction: [
    {
      title: '상위 노출 예측',
      description: '특정 키워드로 상위 노출될 확률을 AI가 예측해드립니다.',
      tip: '내 블로그 지수와 키워드 난이도를 비교해 전략을 세울 수 있어요!'
    },
    {
      title: '키워드 입력',
      description: '상위 노출을 노리는 키워드를 입력하세요.',
    },
    {
      title: '예측 결과 확인',
      description: '성공 확률, 예상 순위, 필요한 블로그 지수 등을 확인할 수 있습니다.',
      tip: '성공률 60% 이상인 키워드부터 공략하는 것이 효율적입니다!'
    }
  ],

  hashtag: [
    {
      title: '해시태그 추천',
      description: '키워드에 맞는 최적의 해시태그를 AI가 추천해드립니다.',
      tip: '적절한 해시태그는 검색 노출을 20% 이상 높일 수 있습니다!'
    },
    {
      title: '키워드 입력',
      description: '글의 주제나 키워드를 입력하세요.',
    },
    {
      title: '해시태그 선택',
      description: '추천된 해시태그 중 관련성 높은 것을 선택하세요. 빈도와 관련성 점수를 참고하세요.',
      tip: '해시태그는 10-15개가 적당합니다. 너무 많으면 스팸으로 인식될 수 있어요!'
    }
  ],

  timing: [
    {
      title: '최적 발행 시간',
      description: '타겟 독자가 가장 활발한 시간대를 분석하여 최적의 발행 시간을 알려드립니다.',
      tip: '같은 글이라도 발행 시간에 따라 초기 노출이 크게 달라집니다!'
    },
    {
      title: '카테고리 선택',
      description: '글의 주제나 카테고리를 선택하세요. 카테고리별로 최적 시간이 다릅니다.',
    },
    {
      title: '최적 시간 확인',
      description: '요일별, 시간대별 점수를 확인하고 가장 높은 시간대에 발행하세요.',
      tip: '평일 오전 9-11시, 저녁 7-9시가 대체로 좋은 시간대입니다!'
    }
  ],

  report: [
    {
      title: '블로그 리포트',
      description: '블로그 전체 성과를 종합 분석하여 리포트로 제공합니다.',
      tip: '월 1회 정도 리포트를 확인하면 성장 추이를 파악하기 좋습니다!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 네이버 블로그 ID를 입력하세요.',
    },
    {
      title: '리포트 확인',
      description: '방문자 추이, 인기 글, 성장률 등 종합 데이터를 확인할 수 있습니다.',
    },
    {
      title: '리포트 다운로드',
      description: 'PDF로 다운로드하여 보관하거나 공유할 수 있습니다.',
    }
  ],

  // ===== 분석 & 최적화 =====
  youtube: [
    {
      title: '유튜브 스크립트 변환',
      description: '유튜브 영상을 블로그 글로 자동 변환해드립니다.',
      tip: '유튜브 영상을 블로그로 재가공하면 콘텐츠 효율이 2배가 됩니다!'
    },
    {
      title: '유튜브 URL 입력',
      description: '변환할 유튜브 영상의 URL을 붙여넣으세요.',
    },
    {
      title: '스크립트 추출',
      description: 'AI가 영상의 자막을 추출하고 블로그 형식으로 재구성합니다.',
      tip: '추출된 스크립트를 그대로 쓰지 말고 자신만의 내용을 추가하세요!'
    },
    {
      title: '블로그 글 완성',
      description: '섹션별로 나뉜 글을 확인하고 필요한 부분을 수정하세요.',
    }
  ],

  lowquality: [
    {
      title: '저품질 위험 감지',
      description: '블로그가 저품질에 걸릴 위험이 있는지 미리 감지합니다.',
      tip: '저품질에 한번 걸리면 회복에 3-6개월이 걸릴 수 있어요. 미리 예방하세요!'
    },
    {
      title: '블로그 ID 입력',
      description: '검사할 네이버 블로그 ID를 입력하세요.',
    },
    {
      title: '위험도 확인',
      description: '안전(녹색), 주의(노란색), 위험(빨간색)으로 상태를 표시합니다.',
      tip: '주의 단계에서 바로 조치하면 저품질을 예방할 수 있습니다!'
    },
    {
      title: '체크리스트 확인',
      description: '복사 의심 글, 과도한 광고, 비정상 패턴 등을 체크합니다. 빨간 항목을 우선 수정하세요.',
    }
  ],

  backup: [
    {
      title: '블로그 백업',
      description: '블로그 글을 안전하게 백업해두세요. 만약의 사태에 대비할 수 있습니다.',
      tip: '저품질이나 계정 문제 시 소중한 글을 잃지 않도록 정기 백업하세요!'
    },
    {
      title: '블로그 ID 입력',
      description: '백업할 네이버 블로그 ID를 입력하세요.',
    },
    {
      title: '백업 시작',
      description: '백업 버튼을 클릭하면 모든 글을 안전하게 저장합니다.',
    },
    {
      title: '백업 파일 다운로드',
      description: '백업이 완료되면 파일로 다운로드할 수 있습니다.',
    }
  ],

  campaign: [
    {
      title: '체험단 매칭',
      description: '내 블로그에 맞는 체험단을 자동으로 찾아 매칭해드립니다.',
      tip: '체험단은 초보 블로거도 수익을 올릴 수 있는 좋은 방법입니다!'
    },
    {
      title: '블로그 정보 입력',
      description: '블로그 ID와 주요 카테고리를 입력하세요.',
    },
    {
      title: '매칭 캠페인 확인',
      description: '내 블로그 점수에 맞는 체험단 목록이 표시됩니다.',
      tip: '매칭 점수가 높을수록 선정 확률이 높습니다!'
    },
    {
      title: '신청하기',
      description: '마감일을 확인하고 관심 있는 체험단에 신청하세요.',
    }
  ],

  ranktrack: [
    {
      title: '순위 추적',
      description: '특정 키워드에서 내 블로그 글의 순위 변화를 추적합니다.',
      tip: '순위 변화를 모니터링하면 어떤 글이 잘 되고 있는지 알 수 있어요!'
    },
    {
      title: '키워드와 글 등록',
      description: '추적할 키워드와 해당 글의 URL을 등록하세요.',
    },
    {
      title: '순위 변화 확인',
      description: '일별, 주별 순위 변화를 그래프로 확인할 수 있습니다.',
      tip: '순위가 떨어지면 글을 업데이트하거나 링크를 추가해보세요!'
    },
    {
      title: '경쟁 블로그 확인',
      description: '같은 키워드에서 경쟁하는 다른 블로그도 함께 모니터링됩니다.',
    }
  ],

  clone: [
    {
      title: '클론 분석',
      description: '잘 되는 경쟁 블로그를 분석하여 성공 전략을 파악합니다.',
      tip: '벤치마킹은 가장 빠른 성장 방법입니다. 단, 표절은 금물!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 경쟁 블로그의 ID를 입력하세요.',
    },
    {
      title: '전략 분석 확인',
      description: '발행 주기, 글 길이, 주요 키워드, 성공 패턴 등을 확인합니다.',
      tip: '여러 성공 블로그의 공통점을 찾아보세요!'
    },
    {
      title: '적용하기',
      description: '분석된 전략을 내 블로그에 적용해보세요. 단, 자신만의 색깔을 유지하세요.',
    }
  ],

  keywordAnalysis: [
    {
      title: '키워드 분석',
      description: '키워드의 검색량, 경쟁도, 상위노출 난이도를 종합 분석합니다.',
      tip: '글을 쓰기 전에 키워드 분석은 필수입니다!'
    },
    {
      title: '키워드 입력',
      description: '분석할 키워드를 입력하세요. 여러 개를 쉼표로 구분해서 입력할 수 있습니다.',
    },
    {
      title: '지표 이해하기',
      description: '검색량(월간 검색 수), 경쟁도(광고 경쟁), 블로그 포화도(기존 글 수)를 확인하세요.',
      tip: '검색량 높고 + 포화도 낮은 키워드가 황금 키워드입니다!'
    },
    {
      title: '추천 키워드 확인',
      description: '입력한 키워드와 관련된 추천 키워드도 함께 제공됩니다.',
    }
  ],

  comment: [
    {
      title: 'AI 댓글 답변',
      description: '블로그 댓글에 대한 적절한 답변을 AI가 생성해드립니다.',
      tip: '댓글 답변을 잘 하면 이웃 증가와 재방문율이 높아집니다!'
    },
    {
      title: '댓글 내용 입력',
      description: '답변이 필요한 댓글 내용을 붙여넣으세요.',
    },
    {
      title: '톤 선택',
      description: '친근한, 전문적인, 감사한 등 답변 톤을 선택할 수 있습니다.',
    },
    {
      title: '답변 선택 및 복사',
      description: '여러 버전의 답변 중 마음에 드는 것을 선택하여 복사하세요.',
    }
  ],

  // ===== 성장 전략 =====
  algorithm: [
    {
      title: '알고리즘 변화 감지',
      description: '네이버 검색 알고리즘 변화를 실시간으로 감지하고 알려드립니다.',
      tip: '알고리즘 변화에 빠르게 대응하면 순위 하락을 방지할 수 있어요!'
    },
    {
      title: '상태 확인',
      description: '현재 알고리즘 상태가 안정/변화/대변동 중 어느 단계인지 확인합니다.',
    },
    {
      title: '변화 내역 확인',
      description: '최근 알고리즘 변화 내역과 영향을 받는 키워드를 확인합니다.',
      tip: '대변동 시에는 새 글 발행을 잠시 미루는 것이 좋습니다!'
    },
    {
      title: '대응 전략',
      description: '변화에 맞는 대응 전략과 권장 사항을 확인하세요.',
    }
  ],

  lifespan: [
    {
      title: '콘텐츠 수명 분석',
      description: '내 글이 얼마나 오래 트래픽을 유지하는지 분석합니다.',
      tip: '에버그린 콘텐츠 비율을 높이면 안정적인 방문자를 유지할 수 있어요!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 블로그 ID를 입력하세요.',
    },
    {
      title: '글 유형 확인',
      description: '에버그린(상시), 시즌(계절), 트렌드(이슈), 하락 중 글로 분류됩니다.',
      tip: '하락 중인 글은 업데이트하거나 재발행을 고려하세요!'
    }
  ],

  refresh: [
    {
      title: '리프레시 추천',
      description: '오래된 글 중 리프레시하면 효과 있는 글을 추천해드립니다.',
      tip: '잘 됐던 글을 업데이트하면 새 글보다 효율이 좋을 수 있어요!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 블로그 ID를 입력하세요.',
    },
    {
      title: '추천 글 확인',
      description: '리프레시 우선순위가 높은 글 목록을 확인합니다.',
      tip: '우선순위 "높음"인 글부터 업데이트하세요!'
    },
    {
      title: '리프레시 방법',
      description: '각 글에 대한 구체적인 개선 제안을 확인하고 적용하세요.',
    }
  ],

  related: [
    {
      title: '연관 글 추천',
      description: '현재 주제와 연관된 다음 글 주제를 AI가 추천합니다.',
      tip: '연관 글을 시리즈로 발행하면 체류시간과 이웃 증가에 효과적입니다!'
    },
    {
      title: '현재 주제 입력',
      description: '방금 쓴 글이나 앞으로 쓸 글의 주제를 입력하세요.',
    },
    {
      title: '연관 주제 확인',
      description: '관련성, 검색량, 경쟁도를 고려한 다음 글 주제를 추천합니다.',
    },
    {
      title: '시리즈 아이디어',
      description: '여러 글을 엮을 수 있는 시리즈 아이디어도 함께 제공됩니다.',
    }
  ],

  mentor: [
    {
      title: '멘토링 매칭',
      description: '경험 많은 블로거에게 1:1 멘토링을 받을 수 있습니다.',
      tip: '혼자 고민하지 말고 전문가의 조언을 받아보세요!'
    },
    {
      title: '내 정보 입력',
      description: '블로그 분야, 고민 사항, 목표 등을 입력하세요.',
    },
    {
      title: '멘토 확인',
      description: '내 분야에 맞는 멘토 목록을 확인합니다. 평점과 리뷰를 참고하세요.',
    },
    {
      title: '신청하기',
      description: '원하는 멘토에게 멘토링을 신청하세요.',
    }
  ],

  trend: [
    {
      title: '트렌드 스나이퍼',
      description: '실시간 인기 키워드 중 내가 쓸 수 있는 주제를 찾아드립니다.',
      tip: '트렌드를 빠르게 선점하면 방문자가 폭발적으로 늘어납니다!'
    },
    {
      title: '관심 분야 선택',
      description: '내 블로그 카테고리를 선택하세요.',
    },
    {
      title: '골든타임 키워드 확인',
      description: '지금 바로 써야 하는 "골든타임" 키워드를 확인하세요.',
      tip: '골든타임 키워드는 마감 시간 내에 발행해야 효과가 있어요!'
    },
    {
      title: '추천 제목 활용',
      description: '각 키워드에 대한 추천 제목도 함께 제공됩니다.',
    }
  ],

  revenue: [
    {
      title: '수익 대시보드',
      description: '애드포스트, 체험단, 제휴 등 모든 수익을 한눈에 확인합니다.',
      tip: '수익 흐름을 파악하면 더 효율적인 전략을 세울 수 있어요!'
    },
    {
      title: '계정 연결',
      description: '애드포스트 등 수익 계정을 연결하세요.',
    },
    {
      title: '수익 현황 확인',
      description: '월별, 소스별 수익 추이를 그래프로 확인합니다.',
    },
    {
      title: '상위 수익 글 확인',
      description: '가장 수익이 높은 글을 확인하고 비슷한 글을 더 써보세요.',
    }
  ],

  roadmap: [
    {
      title: '성장 로드맵',
      description: '블로그 레벨에 맞는 맞춤형 성장 가이드를 제공합니다.',
      tip: '게임처럼 미션을 수행하며 블로그를 성장시켜보세요!'
    },
    {
      title: '현재 레벨 확인',
      description: '내 블로그의 현재 레벨과 다음 레벨까지 필요한 조건을 확인합니다.',
    },
    {
      title: '일일 퀘스트 확인',
      description: '매일 수행할 미션을 확인하고 완료하세요.',
      tip: '일일 퀘스트를 꾸준히 수행하면 빠르게 성장할 수 있어요!'
    },
    {
      title: '주간 미션 확인',
      description: '더 큰 보상을 위한 주간 미션도 도전해보세요.',
    }
  ],

  // ===== 네이버 생태계 =====
  secretkw: [
    {
      title: '비밀 키워드 DB',
      description: '일반 도구에서는 찾기 힘든 숨겨진 블루오션 키워드를 제공합니다.',
      tip: '이 키워드들은 프리미엄 회원만 볼 수 있는 특별한 키워드입니다!'
    },
    {
      title: '카테고리 선택',
      description: '관심 있는 카테고리를 선택하세요.',
    },
    {
      title: '비밀 키워드 확인',
      description: '검색량, CPC, 기회점수를 확인하고 핫/상승 키워드에 주목하세요.',
      tip: 'HOT 태그 키워드는 지금 바로 써야 합니다!'
    }
  ],

  datalab: [
    {
      title: '네이버 데이터랩',
      description: '네이버 공식 데이터로 키워드의 검색 트렌드를 분석합니다.',
      tip: '연령대별, 성별 데이터로 타겟 독자를 정확히 파악하세요!'
    },
    {
      title: '키워드 입력',
      description: '분석할 키워드를 입력하세요. 최대 5개까지 비교 가능합니다.',
    },
    {
      title: '트렌드 그래프 확인',
      description: '기간별 검색량 변화를 그래프로 확인합니다.',
      tip: '계절성 키워드는 시즌 2-3주 전에 글을 준비하세요!'
    },
    {
      title: '인구통계 분석',
      description: '어떤 연령대, 성별이 많이 검색하는지 확인하고 글의 톤을 맞추세요.',
    }
  ],

  shopping: [
    {
      title: '네이버 쇼핑',
      description: '쇼핑 키워드 분석과 제휴마케팅 기회를 찾아드립니다.',
      tip: '쇼핑 키워드로 글을 쓰면 제휴 수익을 올릴 수 있어요!'
    },
    {
      title: '키워드 입력',
      description: '분석할 쇼핑 키워드를 입력하세요.',
    },
    {
      title: '인기 상품 확인',
      description: '해당 키워드의 인기 상품, 가격대, 리뷰 수 등을 확인합니다.',
    },
    {
      title: '제휴 기회 확인',
      description: '커미션이 높은 상품을 찾아 제휴마케팅에 활용하세요.',
      tip: '리뷰 수가 적고 커미션이 높은 상품이 기회입니다!'
    }
  ],

  place: [
    {
      title: '네이버 플레이스',
      description: '맛집, 카페 등 지역 키워드 분석에 특화된 도구입니다.',
      tip: '맛집 블로거라면 이 도구가 필수입니다!'
    },
    {
      title: '지역과 업종 입력',
      description: '분석할 지역(예: 강남)과 업종(예: 카페)을 입력하세요.',
    },
    {
      title: '플레이스 분석',
      description: '해당 지역의 인기 플레이스와 블로그 리뷰 현황을 확인합니다.',
      tip: '리뷰 수가 적은 새로운 가게를 선점하면 상위노출이 쉬워요!'
    },
    {
      title: '키워드 추출',
      description: '리뷰에서 자주 나오는 키워드를 확인하고 글에 활용하세요.',
    }
  ],

  news: [
    {
      title: '뉴스/실검 분석',
      description: '실시간 검색어와 뉴스를 분석하여 블로그 기회를 찾습니다.',
      tip: '뉴스 이슈를 블로그로 풀어내면 대량 트래픽을 얻을 수 있어요!'
    },
    {
      title: '실시간 키워드 확인',
      description: '지금 가장 많이 검색되는 키워드를 확인합니다.',
    },
    {
      title: '이슈 분석',
      description: '각 키워드와 관련된 뉴스와 블로그 작성 가능성을 분석합니다.',
      tip: 'NEW 태그 키워드가 기회입니다. 빠르게 선점하세요!'
    },
    {
      title: '각도 제안',
      description: '이슈를 블로그로 풀어낼 수 있는 관점을 제안해드립니다.',
    }
  ],

  cafe: [
    {
      title: '네이버 카페',
      description: '카페에서 화제되는 주제를 분석하여 블로그 아이디어를 찾습니다.',
      tip: '카페에서 자주 나오는 질문은 블로그 글 주제로 최고입니다!'
    },
    {
      title: '관심 분야 선택',
      description: '분석할 카테고리나 키워드를 선택하세요.',
    },
    {
      title: '인기 주제 확인',
      description: '카페에서 많이 논의되는 주제와 질문을 확인합니다.',
    },
    {
      title: '글감으로 활용',
      description: '자주 나오는 질문에 답하는 형식으로 글을 써보세요.',
      tip: '질문형 주제는 검색 의도와 정확히 일치해서 전환율이 높아요!'
    }
  ],

  naverView: [
    {
      title: '네이버 VIEW',
      description: 'VIEW 탭 상위노출을 위한 분석 도구입니다.',
      tip: 'VIEW 탭은 블로그 글이 네이버 첫 페이지에 노출되는 핵심입니다!'
    },
    {
      title: '키워드 입력',
      description: 'VIEW 탭 분석을 원하는 키워드를 입력하세요.',
    },
    {
      title: '상위노출 글 분석',
      description: '현재 VIEW 상위 글들의 패턴을 분석합니다.',
      tip: '상위 글의 제목 구조, 길이, 이미지 수를 참고하세요!'
    },
    {
      title: '노출 전략 확인',
      description: 'VIEW 탭 상위노출을 위한 최적의 전략을 제안합니다.',
    }
  ],

  influencer: [
    {
      title: '인플루언서 분석',
      description: '인플루언서 탭 진출을 위한 분석과 전략을 제공합니다.',
      tip: '인플루언서가 되면 블로그 수익이 5-10배 증가할 수 있어요!'
    },
    {
      title: '블로그 ID 입력',
      description: '분석할 블로그 ID를 입력하세요.',
    },
    {
      title: '자격 요건 확인',
      description: '인플루언서 선정 기준 대비 현재 상태를 확인합니다.',
    },
    {
      title: '성장 전략',
      description: '부족한 부분을 채우기 위한 구체적인 전략을 확인하세요.',
    }
  ],

  searchAnalysis: [
    {
      title: '통합검색 분석',
      description: '네이버 통합검색 결과의 구성을 분석합니다.',
      tip: '검색 결과에 블로그가 어디에 노출되는지 파악하는 것이 중요합니다!'
    },
    {
      title: '키워드 입력',
      description: '분석할 키워드를 입력하세요.',
    },
    {
      title: '검색 구성 확인',
      description: '블로그, 카페, 뉴스, 쇼핑 등 각 영역의 비중을 확인합니다.',
      tip: '블로그 영역이 상단에 있는 키워드가 공략하기 좋습니다!'
    },
    {
      title: '노출 전략',
      description: '해당 키워드에서 블로그 노출을 높이는 전략을 제안합니다.',
    }
  ],

  kin: [
    {
      title: '지식인 분석',
      description: '지식인에서 자주 나오는 질문을 분석하여 글감을 찾습니다.',
      tip: '지식인 질문은 실제 검색 의도를 반영하므로 글감으로 최고입니다!'
    },
    {
      title: '키워드 입력',
      description: '분석할 주제나 키워드를 입력하세요.',
    },
    {
      title: '질문 패턴 확인',
      description: '자주 나오는 질문 유형과 키워드를 확인합니다.',
    },
    {
      title: '글감으로 활용',
      description: '질문에 상세히 답하는 형식으로 블로그 글을 작성해보세요.',
    }
  ],

  smartstore: [
    {
      title: '스마트스토어 연동',
      description: '스마트스토어와 블로그의 시너지를 분석합니다.',
      tip: '블로그로 스마트스토어 트래픽을 늘릴 수 있어요!'
    },
    {
      title: '스토어 연결',
      description: '스마트스토어 정보를 연결하세요.',
    },
    {
      title: '제품별 키워드 분석',
      description: '각 제품에 적합한 블로그 키워드를 분석합니다.',
    },
    {
      title: '콘텐츠 전략',
      description: '제품 홍보를 위한 블로그 콘텐츠 전략을 제안합니다.',
    }
  ]
}

export default function ToolTutorial({ toolId, isOpen, onClose }: ToolTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const steps = toolTutorials[toolId] || []

  useEffect(() => {
    setCurrentStep(0)
  }, [toolId])

  if (!isOpen || steps.length === 0) return null

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      // Mark as completed and close
      localStorage.setItem(`tool_tutorial_${toolId}`, 'true')
      onClose()
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSkip = () => {
    localStorage.setItem(`tool_tutorial_${toolId}`, 'true')
    onClose()
  }

  const currentStepData = steps[currentStep]

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black/60 flex items-center justify-center p-4"
        onClick={handleSkip}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-white" />
                <span className="text-white/80 text-sm">
                  {currentStep + 1} / {steps.length}
                </span>
              </div>
              <button
                onClick={handleSkip}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-xl font-bold text-white mt-2">{currentStepData.title}</h3>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-gray-700 leading-relaxed">
              {currentStepData.description}
            </p>

            {currentStepData.tip && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">{currentStepData.tip}</p>
                </div>
              </div>
            )}

            {/* Progress dots */}
            <div className="flex justify-center gap-2 mt-6">
              {steps.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentStep(index)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    index === currentStep
                      ? 'bg-purple-500 w-6'
                      : index < currentStep
                      ? 'bg-purple-300'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="flex items-center gap-1 text-gray-500 hover:text-gray-700 transition-colors text-sm"
            >
              <SkipForward className="w-4 h-4" />
              건너뛰기
            </button>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handlePrev}
                  className="flex items-center gap-1 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  이전
                </button>
              )}
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-medium hover:shadow-lg transition-all"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <Check className="w-4 h-4" />
                    완료
                  </>
                ) : (
                  <>
                    다음
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// Helper function to check if tutorial was seen
export function shouldShowToolTutorial(toolId: string): boolean {
  if (typeof window === 'undefined') return false
  return !localStorage.getItem(`tool_tutorial_${toolId}`)
}

// Helper function to reset tutorial
export function resetToolTutorial(toolId: string): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(`tool_tutorial_${toolId}`)
}

// Helper function to reset all tutorials
export function resetAllToolTutorials(): void {
  if (typeof window === 'undefined') return
  Object.keys(toolTutorials).forEach(toolId => {
    localStorage.removeItem(`tool_tutorial_${toolId}`)
  })
}
