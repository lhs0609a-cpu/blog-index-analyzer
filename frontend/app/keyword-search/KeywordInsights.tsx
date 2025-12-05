'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Search, Loader2 } from 'lucide-react'

interface RelatedKeyword {
  keyword: string
  monthly_pc_search: number
  monthly_mobile_search: number
  monthly_total_search: number
  monthly_avg_pc_click: number
  monthly_avg_mobile_click: number
  monthly_avg_pc_ctr: number
  monthly_avg_mobile_ctr: number
  competition_level: number
  competition_index: string
}

interface KeywordInsightsData {
  keyword: string
  total_count: number
  related_keywords: RelatedKeyword[]
}

interface KeywordInsightsProps {
  keyword: string
  apiBaseUrl?: string
}

export default function KeywordInsights({
  keyword,
  apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
}: KeywordInsightsProps) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<KeywordInsightsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (keyword) {
      fetchKeywordInsights()
    }
  }, [keyword])

  const fetchKeywordInsights = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/keywords/related?keyword=${encodeURIComponent(keyword)}&show_detail=1`
      )

      if (!response.ok) {
        if (response.status === 503) {
          throw new Error('네이버 광고 API가 설정되지 않았습니다.')
        }
        throw new Error('연관 키워드 조회 실패')
      }

      const result = await response.json()

      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error('데이터를 불러오지 못했습니다.')
      }
    } catch (err: any) {
      setError(err.message || '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const formatNumber = (num: number) => {
    if (num >= 10000) {
      return `${(num / 10000).toFixed(1)}만`
    }
    return num.toLocaleString()
  }

  const getCompetitionColor = (index: string) => {
    if (index === '낮음') return 'text-green-600 bg-green-100'
    if (index === '중간') return 'text-yellow-600 bg-yellow-100'
    if (index === '높음') return 'text-red-600 bg-red-100'
    return 'text-gray-600 bg-gray-100'
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <p className="text-gray-600">연관 검색어 및 검색량 조회 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center">
          <p className="text-gray-600 mb-2">{error}</p>
          {error.includes('설정되지 않았습니다') && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg text-left">
              <h4 className="font-semibold text-blue-900 mb-2">네이버 광고 API 설정 방법</h4>
              <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
                <li>네이버 광고 시스템에 로그인</li>
                <li>도구 &gt; API 관리에서 API 키 발급</li>
                <li>.env 파일에 다음 값 설정:
                  <ul className="list-disc list-inside ml-4 mt-1">
                    <li>NAVER_AD_API_KEY</li>
                    <li>NAVER_AD_SECRET_KEY</li>
                    <li>NAVER_AD_CUSTOMER_ID</li>
                  </ul>
                </li>
              </ol>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const displayKeywords = showAll ? data.related_keywords : data.related_keywords.slice(0, 10)

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-blue-500" />
        <h3 className="text-lg font-semibold text-gray-800">
          연관 검색어 및 검색량 ({data.total_count}개)
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-2 font-semibold text-gray-700">키워드</th>
              <th className="text-right py-3 px-2 font-semibold text-gray-700">모바일 검색</th>
              <th className="text-right py-3 px-2 font-semibold text-gray-700">PC 검색</th>
              <th className="text-right py-3 px-2 font-semibold text-gray-700">총 검색</th>
              <th className="text-center py-3 px-2 font-semibold text-gray-700">경쟁도</th>
            </tr>
          </thead>
          <tbody>
            {displayKeywords.map((kw, index) => (
              <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-2 font-medium text-gray-900">{kw.keyword}</td>
                <td className="text-right py-3 px-2 text-gray-700">
                  {formatNumber(kw.monthly_mobile_search)}
                </td>
                <td className="text-right py-3 px-2 text-gray-700">
                  {formatNumber(kw.monthly_pc_search)}
                </td>
                <td className="text-right py-3 px-2 font-semibold text-blue-600">
                  {formatNumber(kw.monthly_total_search)}
                </td>
                <td className="text-center py-3 px-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getCompetitionColor(kw.competition_index)}`}>
                    {kw.competition_index}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.related_keywords.length > 10 && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            {showAll ? '접기' : `더보기 (${data.related_keywords.length - 10}개)`}
          </button>
        </div>
      )}
    </div>
  )
}
