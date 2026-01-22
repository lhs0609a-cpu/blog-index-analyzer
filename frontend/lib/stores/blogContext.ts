import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BlogIndexResult } from '../types/api'

interface BlogContextState {
  // 최근 분석한 블로그 결과
  lastAnalysisResult: BlogIndexResult | null
  lastAnalyzedBlogId: string | null
  lastAnalyzedAt: string | null

  // 분석 결과 저장
  setAnalysisResult: (result: BlogIndexResult) => void

  // 분석 결과 초기화
  clearAnalysisResult: () => void

  // 마지막 분석 결과가 특정 시간 내인지 확인 (기본 30분)
  isAnalysisRecent: (minutes?: number) => boolean
}

export const useBlogContextStore = create<BlogContextState>()(
  persist(
    (set, get) => ({
      lastAnalysisResult: null,
      lastAnalyzedBlogId: null,
      lastAnalyzedAt: null,

      setAnalysisResult: (result) => {
        set({
          lastAnalysisResult: result,
          lastAnalyzedBlogId: result.blog.blog_id,
          lastAnalyzedAt: new Date().toISOString(),
        })
      },

      clearAnalysisResult: () => {
        set({
          lastAnalysisResult: null,
          lastAnalyzedBlogId: null,
          lastAnalyzedAt: null,
        })
      },

      isAnalysisRecent: (minutes = 30) => {
        const { lastAnalyzedAt } = get()
        if (!lastAnalyzedAt) return false

        const analysisTime = new Date(lastAnalyzedAt).getTime()
        const now = Date.now()
        const diffMinutes = (now - analysisTime) / (1000 * 60)

        return diffMinutes < minutes
      },
    }),
    {
      name: 'blog-context-storage',
      partialize: (state) => ({
        lastAnalysisResult: state.lastAnalysisResult,
        lastAnalyzedBlogId: state.lastAnalyzedBlogId,
        lastAnalyzedAt: state.lastAnalyzedAt,
      }),
    }
  )
)
