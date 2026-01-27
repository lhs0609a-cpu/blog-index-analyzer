/**
 * P2-1: 레벨 → 등급 변환 유틸리티
 * 15단계 레벨을 A~F 등급으로 변환하여 직관적 이해 지원
 */

export interface LevelGradeInfo {
  level: number
  grade: string  // A+, A, B+, B, C+, C, D+, D, E, F
  gradeColor: string
  gradeBg: string
  tier: string
  percentile: string
  description: string
}

/**
 * 레벨을 등급 정보로 변환
 */
export function getLevelGrade(level: number): LevelGradeInfo {
  const gradeMap: Record<number, Omit<LevelGradeInfo, 'level'>> = {
    15: { grade: 'S', gradeColor: 'text-purple-600', gradeBg: 'bg-purple-100', tier: '레전드', percentile: '상위 0.1%', description: '최정상급 블로그' },
    14: { grade: 'S', gradeColor: 'text-purple-600', gradeBg: 'bg-purple-100', tier: '레전드', percentile: '상위 0.5%', description: '최정상급 블로그' },
    13: { grade: 'A+', gradeColor: 'text-red-600', gradeBg: 'bg-red-100', tier: '마스터', percentile: '상위 1%', description: '인플루언서급 블로그' },
    12: { grade: 'A+', gradeColor: 'text-red-600', gradeBg: 'bg-red-100', tier: '마스터', percentile: '상위 2%', description: '인플루언서급 블로그' },
    11: { grade: 'A', gradeColor: 'text-red-500', gradeBg: 'bg-red-50', tier: '전문가', percentile: '상위 3%', description: '고품질 블로그' },
    10: { grade: 'A', gradeColor: 'text-red-500', gradeBg: 'bg-red-50', tier: '전문가', percentile: '상위 5%', description: '고품질 블로그' },
    9: { grade: 'B+', gradeColor: 'text-orange-600', gradeBg: 'bg-orange-100', tier: '상급', percentile: '상위 8%', description: '우수한 블로그' },
    8: { grade: 'B', gradeColor: 'text-orange-500', gradeBg: 'bg-orange-50', tier: '상급', percentile: '상위 15%', description: '우수한 블로그' },
    7: { grade: 'B', gradeColor: 'text-orange-500', gradeBg: 'bg-orange-50', tier: '중상급', percentile: '상위 25%', description: '평균 이상 블로그' },
    6: { grade: 'C+', gradeColor: 'text-yellow-600', gradeBg: 'bg-yellow-100', tier: '중급', percentile: '상위 35%', description: '평균 수준 블로그' },
    5: { grade: 'C', gradeColor: 'text-yellow-500', gradeBg: 'bg-yellow-50', tier: '중급', percentile: '상위 45%', description: '평균 수준 블로그' },
    4: { grade: 'D+', gradeColor: 'text-green-600', gradeBg: 'bg-green-100', tier: '성장기', percentile: '중위권', description: '성장 중인 블로그' },
    3: { grade: 'D', gradeColor: 'text-green-500', gradeBg: 'bg-green-50', tier: '성장기', percentile: '하위 40%', description: '성장 중인 블로그' },
    2: { grade: 'E', gradeColor: 'text-blue-500', gradeBg: 'bg-blue-50', tier: '입문', percentile: '하위 30%', description: '시작 단계 블로그' },
    1: { grade: 'F', gradeColor: 'text-gray-500', gradeBg: 'bg-gray-100', tier: '입문', percentile: '하위 20%', description: '시작 단계 블로그' },
  }

  const info = gradeMap[Math.min(15, Math.max(1, level))] || gradeMap[1]
  return { level, ...info }
}

/**
 * 등급 배지 스타일 반환
 */
export function getGradeBadgeStyle(grade: string): string {
  const styles: Record<string, string> = {
    'S': 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    'A+': 'bg-gradient-to-r from-red-500 to-orange-500 text-white',
    'A': 'bg-red-500 text-white',
    'B+': 'bg-orange-500 text-white',
    'B': 'bg-orange-400 text-white',
    'C+': 'bg-yellow-500 text-white',
    'C': 'bg-yellow-400 text-gray-800',
    'D+': 'bg-green-500 text-white',
    'D': 'bg-green-400 text-white',
    'E': 'bg-blue-400 text-white',
    'F': 'bg-gray-400 text-white',
  }
  return styles[grade] || styles['F']
}

/**
 * 다음 등급까지 필요한 레벨 수 계산
 */
export function getLevelsToNextGrade(level: number): { nextGrade: string; levelsNeeded: number } | null {
  const gradeThresholds = [
    { grade: 'S', minLevel: 14 },
    { grade: 'A+', minLevel: 12 },
    { grade: 'A', minLevel: 10 },
    { grade: 'B+', minLevel: 9 },
    { grade: 'B', minLevel: 7 },
    { grade: 'C+', minLevel: 6 },
    { grade: 'C', minLevel: 5 },
    { grade: 'D+', minLevel: 4 },
    { grade: 'D', minLevel: 3 },
    { grade: 'E', minLevel: 2 },
  ]

  for (const threshold of gradeThresholds) {
    if (level < threshold.minLevel) {
      return {
        nextGrade: threshold.grade,
        levelsNeeded: threshold.minLevel - level
      }
    }
  }

  return null // 이미 최고 등급
}
