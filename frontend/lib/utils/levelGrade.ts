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
    15: { grade: 'S', gradeColor: 'text-purple-600', gradeBg: 'bg-purple-100', tier: '최적4+', percentile: '상위 0.1%', description: '최정상급 블로그' },
    14: { grade: 'S', gradeColor: 'text-purple-600', gradeBg: 'bg-purple-100', tier: '최적3+', percentile: '상위 0.5%', description: '최정상급 블로그' },
    13: { grade: 'A+', gradeColor: 'text-red-600', gradeBg: 'bg-red-100', tier: '최적2+', percentile: '상위 1%', description: '인플루언서급 블로그' },
    12: { grade: 'A+', gradeColor: 'text-red-600', gradeBg: 'bg-red-100', tier: '최적1+', percentile: '상위 2%', description: '인플루언서급 블로그' },
    11: { grade: 'A', gradeColor: 'text-red-500', gradeBg: 'bg-red-50', tier: '최적3', percentile: '상위 3%', description: '고품질 블로그' },
    10: { grade: 'A', gradeColor: 'text-red-500', gradeBg: 'bg-red-50', tier: '최적2', percentile: '상위 5%', description: '고품질 블로그' },
    9: { grade: 'B+', gradeColor: 'text-orange-600', gradeBg: 'bg-orange-100', tier: '최적1', percentile: '상위 8%', description: '우수한 블로그' },
    8: { grade: 'B', gradeColor: 'text-orange-500', gradeBg: 'bg-orange-50', tier: '준최7', percentile: '상위 15%', description: '우수한 블로그' },
    7: { grade: 'B', gradeColor: 'text-orange-500', gradeBg: 'bg-orange-50', tier: '준최6', percentile: '상위 25%', description: '평균 이상 블로그' },
    6: { grade: 'C+', gradeColor: 'text-yellow-600', gradeBg: 'bg-yellow-100', tier: '준최5', percentile: '상위 35%', description: '평균 수준 블로그' },
    5: { grade: 'C', gradeColor: 'text-yellow-500', gradeBg: 'bg-yellow-50', tier: '준최4', percentile: '상위 45%', description: '평균 수준 블로그' },
    4: { grade: 'D+', gradeColor: 'text-green-600', gradeBg: 'bg-green-100', tier: '준최3', percentile: '중위권', description: '성장 중인 블로그' },
    3: { grade: 'D', gradeColor: 'text-green-500', gradeBg: 'bg-green-50', tier: '준최2', percentile: '하위 40%', description: '성장 중인 블로그' },
    2: { grade: 'E', gradeColor: 'text-blue-500', gradeBg: 'bg-blue-50', tier: '준최1', percentile: '하위 30%', description: '시작 단계 블로그' },
    1: { grade: 'F', gradeColor: 'text-gray-500', gradeBg: 'bg-gray-100', tier: '일반', percentile: '하위 20%', description: '시작 단계 블로그' },
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
 * 레벨 진입 컷 점수 (백엔드 services/blog_analyzer.py:_LEVEL_CUTS 와 동일해야 함)
 * 2026-07-29 실측 380개 분포 기반.
 */
export const LEVEL_CUTS: Array<{ level: number; cut: number }> = [
  { level: 15, cut: 98.9 },
  { level: 14, cut: 98.0 },
  { level: 13, cut: 97.5 },
  { level: 12, cut: 96.9 },
  { level: 11, cut: 95.9 },
  { level: 10, cut: 94.5 },
  { level: 9, cut: 93.0 },
  { level: 8, cut: 90.1 },
  { level: 7, cut: 86.8 },
  { level: 6, cut: 82.9 },
  { level: 5, cut: 80.0 },
  { level: 4, cut: 75.7 },
  { level: 3, cut: 66.8 },
  { level: 2, cut: 47.2 },
]

/**
 * 다음 레벨까지 남은 점수.
 *
 * 예전에는 `(level + 1) * 6.67 - total_score` 라는 가짜 공식을 썼는데,
 * 점수와 레벨이 그런 선형 관계였던 적이 없어서 음수("-3점 필요")가 표시됐다.
 * 실제 컷 테이블에서 다음 구간 경계를 찾아 계산한다.
 *
 * @returns 이미 최고 레벨이면 null
 */
export function getPointsToNextLevel(
  level: number,
  totalScore: number
): { nextLevel: number; pointsNeeded: number } | null {
  const next = LEVEL_CUTS.filter((c) => c.level > level).sort((a, b) => a.level - b.level)[0]
  if (!next) return null
  return {
    nextLevel: next.level,
    pointsNeeded: Math.max(0, Math.ceil((next.cut - totalScore) * 10) / 10),
  }
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
