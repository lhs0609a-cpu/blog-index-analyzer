"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import Link from "next/link";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
} from "@/components/ad-optimizer/PlatformSupportBanner";
import { ValuePropositionCompact } from "@/components/ad-optimizer/ValueProposition";

interface QualitySummary {
  total_keywords: number;
  average_quality_index: number;
  excellent_count: number;
  good_count: number;
  average_count: number;
  poor_count: number;
  total_improvement_potential: number;
  estimated_total_cpc_reduction: number;
  health_status: string;
}

interface QualityAnalysis {
  keyword_id: string;
  keyword_text: string;
  current_quality: number;
  quality_level: string;
  factor_scores: Record<string, number>;
  factor_issues: Record<string, string[]>;
  potential_quality: number;
  improvement_points: number;
  estimated_cpc_reduction: number;
  priority: number;
  analyzed_at: string;
}

interface Recommendation {
  id: number;
  keyword_id: string;
  keyword_text: string;
  recommendation_type: string;
  priority: number;
  title: string;
  description: string;
  current_value: string;
  suggested_action: string;
  suggested_value: string;
  expected_improvement: number;
  expected_cpc_reduction: number;
  difficulty: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.blrank.co.kr";

const QUALITY_LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  excellent: { label: "우수", color: "text-green-600", bg: "bg-green-100" },
  good: { label: "양호", color: "text-lime-600", bg: "bg-lime-100" },
  average: { label: "보통", color: "text-yellow-600", bg: "bg-yellow-100" },
  poor: { label: "낮음", color: "text-red-600", bg: "bg-red-100" },
};

const DIFFICULTY_CONFIG: Record<string, { label: string; color: string }> = {
  easy: { label: "쉬움", color: "text-green-600" },
  medium: { label: "보통", color: "text-yellow-600" },
  hard: { label: "어려움", color: "text-red-600" },
};

const FACTOR_LABELS: Record<string, string> = {
  ad_relevance: "광고 관련성",
  landing_page: "랜딩페이지 품질",
  expected_ctr: "예상 CTR",
  keyword_match: "키워드 일치도",
  ad_extensions: "광고확장 사용",
  historical_ctr: "과거 CTR 실적",
};

export default function NaverQualityPage() {
  const { user, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"summary" | "analysis" | "recommendations">("summary");
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [analyses, setAnalyses] = useState<QualityAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [selectedKeyword, setSelectedKeyword] = useState<QualityAnalysis | null>(null);

  useEffect(() => {
    if (token) {
      fetchSummary();
      fetchAnalyses();
      fetchRecommendations();
    }
  }, [token]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/ads/naver-quality/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        setSummary(data.summary);
      }
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyses = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ads/naver-quality/analysis`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        setAnalyses(data.analyses || []);
      }
    } catch (err) {
      console.error("Failed to fetch analyses:", err);
    }
  };

  const fetchRecommendations = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ads/naver-quality/recommendations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.status === "success") {
        setRecommendations(data.recommendations || []);
      }
    } catch (err) {
      console.error("Failed to fetch recommendations:", err);
    }
  };

  const runAnalysis = async () => {
    try {
      setAnalyzing(true);
      setError("");
      const res = await fetch(`${API_URL}/api/ads/naver-quality/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.status === "success") {
        await fetchSummary();
        await fetchAnalyses();
        await fetchRecommendations();
      } else if (data.status === "no_data") {
        setError("분석할 키워드 데이터가 없습니다. 네이버 검색광고 데이터를 먼저 동기화해주세요.");
      } else {
        setError(data.message || "분석에 실패했습니다");
      }
    } catch (err) {
      setError("분석 중 오류가 발생했습니다");
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRecommendation = async (recommendationId: number) => {
    try {
      const res = await fetch(`${API_URL}/api/ads/naver-quality/recommendations/apply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recommendation_id: recommendationId }),
      });
      if (res.ok) {
        await fetchRecommendations();
      }
    } catch (err) {
      console.error("Failed to apply recommendation:", err);
    }
  };

  const getHealthStatusBadge = (status: string) => {
    const config: Record<string, { label: string; color: string }> = {
      excellent: { label: "우수", color: "bg-green-500" },
      good: { label: "양호", color: "bg-lime-500" },
      warning: { label: "주의", color: "bg-yellow-500" },
      critical: { label: "위험", color: "bg-red-500" },
      no_data: { label: "데이터 없음", color: "bg-gray-400" },
    };
    const { label, color } = config[status] || config.no_data;
    return (
      <span className={`px-3 py-1 rounded-full text-white text-sm font-medium ${color}`}>
        {label}
      </span>
    );
  };

  const getQualityBar = (score: number) => {
    let color = "bg-red-500";
    if (score >= 7) color = "bg-green-500";
    else if (score >= 5) color = "bg-lime-500";
    else if (score >= 3) color = "bg-yellow-500";

    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${score * 10}%` }} />
      </div>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link href="/ad-optimizer/unified" className="text-gray-500 hover:text-gray-700">
            ← 통합 광고 관리
          </Link>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">네이버 품질지수 최적화</h1>
            <p className="text-gray-600 mt-1">
              네이버 검색광고 품질지수를 분석하고 개선하여 CPC를 절감합니다
            </p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="px-6 py-2 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {analyzing ? "분석 중..." : "품질지수 분석"}
          </button>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Value Proposition */}
      <div className="max-w-7xl mx-auto mb-6">
        <ValuePropositionCompact type="quality" />
      </div>

      {/* Platform Support Banner */}
      <div className="max-w-7xl mx-auto mb-6">
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.naverQuality.title}
          description={FEATURE_DESCRIPTIONS.naverQuality.description}
          platforms={FEATURE_PLATFORMS.naverQuality}
          className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 border border-green-500/20"
        />
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="max-w-7xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">전체 키워드</div>
            <div className="text-2xl font-bold">{summary.total_keywords}</div>
            <div className="mt-2">{getHealthStatusBadge(summary.health_status)}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">평균 품질지수</div>
            <div className="text-2xl font-bold">{summary.average_quality_index}/10</div>
            <div className="mt-2">{getQualityBar(summary.average_quality_index)}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">우수 / 양호</div>
            <div className="text-2xl font-bold text-green-600">
              {summary.excellent_count + summary.good_count}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">개선 필요</div>
            <div className="text-2xl font-bold text-red-600">
              {summary.average_count + summary.poor_count}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">예상 CPC 절감</div>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.estimated_total_cpc_reduction)}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="border-b">
          <nav className="flex gap-4">
            {[
              { id: "summary", label: "품질 분포" },
              { id: "analysis", label: "키워드 분석" },
              { id: "recommendations", label: "개선 추천" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-3 px-4 border-b-2 ${
                  activeTab === tab.id
                    ? "border-green-500 text-green-600 font-medium"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto">
        {activeTab === "summary" && summary && (
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold mb-6">품질지수 분포</h3>
            <div className="grid grid-cols-4 gap-4 mb-8">
              {[
                { level: "excellent", count: summary.excellent_count, range: "7-10점" },
                { level: "good", count: summary.good_count, range: "5-6점" },
                { level: "average", count: summary.average_count, range: "3-4점" },
                { level: "poor", count: summary.poor_count, range: "1-2점" },
              ].map((item) => {
                const config = QUALITY_LEVEL_CONFIG[item.level];
                const percentage = summary.total_keywords > 0
                  ? Math.round((item.count / summary.total_keywords) * 100)
                  : 0;
                return (
                  <div key={item.level} className={`${config.bg} rounded-lg p-4 text-center`}>
                    <div className={`text-3xl font-bold ${config.color}`}>{item.count}</div>
                    <div className={`text-sm font-medium ${config.color}`}>{config.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{item.range} ({percentage}%)</div>
                  </div>
                );
              })}
            </div>

            {/* Quality Index Explanation */}
            <div className="mt-8">
              <h4 className="font-medium mb-4">품질지수란?</h4>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-2">
                <p>
                  <strong>품질지수</strong>는 네이버가 광고의 품질을 평가하는 지표입니다 (1-10점).
                </p>
                <p>
                  품질지수가 높으면 <strong>더 낮은 CPC</strong>로 <strong>더 높은 순위</strong>에
                  광고를 게재할 수 있습니다.
                </p>
                <p className="text-green-600">
                  품질지수 7점 이상: CPC 15~30% 할인 효과
                </p>
                <p className="text-red-600">
                  품질지수 3점 이하: CPC 10~30% 할증 효과
                </p>
              </div>
            </div>

            {/* Factor Weights */}
            <div className="mt-8">
              <h4 className="font-medium mb-4">품질지수 영향 요소</h4>
              <div className="space-y-3">
                {[
                  { factor: "ad_relevance", weight: 25 },
                  { factor: "landing_page", weight: 20 },
                  { factor: "expected_ctr", weight: 20 },
                  { factor: "keyword_match", weight: 15 },
                  { factor: "ad_extensions", weight: 10 },
                  { factor: "historical_ctr", weight: 10 },
                ].map((item) => (
                  <div key={item.factor} className="flex items-center gap-4">
                    <span className="w-32 text-sm text-gray-600">
                      {FACTOR_LABELS[item.factor]}
                    </span>
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-green-500 h-3 rounded-full"
                        style={{ width: `${item.weight * 4}%` }}
                      />
                    </div>
                    <span className="w-12 text-sm text-gray-600 text-right">{item.weight}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "analysis" && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold">키워드별 품질 분석</h3>
            </div>
            {analyses.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                분석 결과가 없습니다. "품질지수 분석" 버튼을 클릭하세요.
              </div>
            ) : (
              <div className="divide-y">
                {analyses.map((analysis) => {
                  const levelConfig = QUALITY_LEVEL_CONFIG[analysis.quality_level] || QUALITY_LEVEL_CONFIG.average;
                  return (
                    <div
                      key={analysis.keyword_id}
                      className="p-4 hover:bg-gray-50 cursor-pointer"
                      onClick={() => setSelectedKeyword(selectedKeyword?.keyword_id === analysis.keyword_id ? null : analysis)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium">{analysis.keyword_text}</div>
                          <div className="text-sm text-gray-500">ID: {analysis.keyword_id}</div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className={`${levelConfig.bg} ${levelConfig.color} px-3 py-1 rounded-full text-sm`}>
                              {levelConfig.label}
                            </span>
                            <span className="text-2xl font-bold">{analysis.current_quality}</span>
                            <span className="text-gray-400">/10</span>
                          </div>
                          {analysis.improvement_points > 0 && (
                            <div className="text-sm text-green-600 mt-1">
                              +{analysis.improvement_points}점 개선 가능
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mb-2">{getQualityBar(analysis.current_quality)}</div>

                      {/* Expanded Details */}
                      {selectedKeyword?.keyword_id === analysis.keyword_id && (
                        <div className="mt-4 pt-4 border-t">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <div className="text-sm font-medium text-gray-600 mb-2">요소별 점수</div>
                              <div className="space-y-2">
                                {Object.entries(analysis.factor_scores).map(([key, value]) => (
                                  <div key={key} className="flex justify-between text-sm">
                                    <span className="text-gray-600">{FACTOR_LABELS[key] || key}</span>
                                    <span className={value < 5 ? "text-red-600" : value >= 7 ? "text-green-600" : "text-gray-900"}>
                                      {value}/10
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-medium text-gray-600 mb-2">예상 효과</div>
                              <div className="space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-600">잠재 품질지수</span>
                                  <span className="font-medium text-green-600">{analysis.potential_quality}/10</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">예상 CPC 절감</span>
                                  <span className="font-medium text-blue-600">
                                    {formatCurrency(analysis.estimated_cpc_reduction)}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-600">우선순위</span>
                                  <span className={`font-medium ${analysis.priority >= 4 ? "text-red-600" : ""}`}>
                                    {analysis.priority}/5
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          {Object.keys(analysis.factor_issues).length > 0 && (
                            <div className="mt-4">
                              <div className="text-sm font-medium text-gray-600 mb-2">발견된 문제</div>
                              <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                                {Object.entries(analysis.factor_issues).flatMap(([factor, issues]) =>
                                  (issues as string[]).map((issue, idx) => (
                                    <li key={`${factor}-${idx}`}>{issue}</li>
                                  ))
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "recommendations" && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold">품질지수 개선 추천</h3>
            </div>
            {recommendations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                개선 추천이 없습니다.
              </div>
            ) : (
              <div className="divide-y">
                {recommendations.map((rec) => {
                  const diffConfig = DIFFICULTY_CONFIG[rec.difficulty] || DIFFICULTY_CONFIG.medium;
                  return (
                    <div key={rec.id} className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              rec.priority >= 4 ? "bg-red-100 text-red-600" :
                              rec.priority >= 3 ? "bg-orange-100 text-orange-600" :
                              "bg-gray-100 text-gray-600"
                            }`}>
                              우선순위 {rec.priority}
                            </span>
                            <span className={`text-xs ${diffConfig.color}`}>
                              난이도: {diffConfig.label}
                            </span>
                          </div>
                          <h4 className="font-medium mt-2">{rec.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-green-600">+{rec.expected_improvement}점</div>
                          <div className="text-sm text-blue-600">
                            {formatCurrency(rec.expected_cpc_reduction)} 절감
                          </div>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3 mb-3">
                        <div className="text-xs text-gray-500 mb-1">키워드</div>
                        <div className="text-sm font-medium">{rec.keyword_text}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="bg-red-50 rounded-lg p-3">
                          <div className="text-xs text-red-600 mb-1">현재</div>
                          <div className="text-sm">{rec.current_value || "-"}</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3">
                          <div className="text-xs text-green-600 mb-1">추천</div>
                          <div className="text-sm">{rec.suggested_value || rec.suggested_action}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => applyRecommendation(rec.id)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600"
                      >
                        적용 완료
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tips */}
      <div className="max-w-7xl mx-auto mt-6">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6">
          <h3 className="font-semibold text-green-800 mb-3">품질지수 개선 팁</h3>
          <ul className="text-sm text-green-700 space-y-2">
            <li>• <strong>광고 제목에 키워드 포함:</strong> 검색 키워드가 광고 제목에 포함되면 관련성 점수가 크게 향상됩니다</li>
            <li>• <strong>광고확장 활용:</strong> 사이트링크, 콜아웃을 추가하면 품질지수와 CTR이 모두 상승합니다</li>
            <li>• <strong>랜딩페이지 최적화:</strong> 키워드와 관련된 콘텐츠를 랜딩페이지 제목, H1, 본문에 포함하세요</li>
            <li>• <strong>CTR 개선:</strong> 클릭을 유도하는 문구(무료, 할인, 지금 등)를 광고에 추가하세요</li>
            <li>• <strong>정기적 모니터링:</strong> 품질지수는 시간에 따라 변할 수 있으므로 주기적으로 확인하세요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
