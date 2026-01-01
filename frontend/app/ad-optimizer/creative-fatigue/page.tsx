"use client";

import { useState, useEffect } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import Link from "next/link";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
  PLATFORM_STYLES,
} from "@/components/ad-optimizer/PlatformSupportBanner";

interface FatigueSummary {
  total_creatives: number;
  average_fatigue_score: number;
  fresh_count: number;
  good_count: number;
  moderate_count: number;
  tired_count: number;
  exhausted_count: number;
  urgent_replacement_needed: number;
  health_status: string;
}

interface FatigueAnalysis {
  creative_id: string;
  creative_name: string;
  fatigue_level: string;
  fatigue_score: number;
  indicator_scores: Record<string, number>;
  issues: string[];
  recommendations: string[];
  estimated_days_remaining: number;
  replacement_priority: number;
  analyzed_at: string;
}

interface Recommendation {
  id: number;
  creative_id: string;
  creative_name: string;
  current_type: string;
  fatigue_level: string;
  recommended_action: string;
  urgency: string;
  suggested_variations: string[];
  expected_improvement: Record<string, number>;
  budget_impact: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://naverpay-delivery-tracker.fly.dev";

const FATIGUE_LEVEL_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  fresh: { label: "신선함", color: "text-green-600", bg: "bg-green-100" },
  good: { label: "양호", color: "text-lime-600", bg: "bg-lime-100" },
  moderate: { label: "보통", color: "text-yellow-600", bg: "bg-yellow-100" },
  tired: { label: "피로", color: "text-orange-600", bg: "bg-orange-100" },
  exhausted: { label: "고갈", color: "text-red-600", bg: "bg-red-100" },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  immediate: { label: "즉시", color: "text-red-600" },
  within_week: { label: "1주 내", color: "text-orange-600" },
  monitor: { label: "모니터링", color: "text-blue-600" },
};

export default function CreativeFatiguePage() {
  const { user, token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"summary" | "analysis" | "recommendations">("summary");
  const [adAccountId, setAdAccountId] = useState("meta_default");
  const [summary, setSummary] = useState<FatigueSummary | null>(null);
  const [analyses, setAnalyses] = useState<FatigueAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) {
      fetchSummary();
      fetchAnalyses();
      fetchRecommendations();
    }
  }, [token, adAccountId]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_URL}/api/ads/creative-fatigue/summary?ad_account_id=${adAccountId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const res = await fetch(
        `${API_URL}/api/ads/creative-fatigue/analysis?ad_account_id=${adAccountId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const res = await fetch(
        `${API_URL}/api/ads/creative-fatigue/recommendations?ad_account_id=${adAccountId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
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
      const res = await fetch(`${API_URL}/api/ads/creative-fatigue/analyze`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ad_account_id: adAccountId }),
      });
      const data = await res.json();
      if (data.status === "success") {
        await fetchSummary();
        await fetchAnalyses();
        await fetchRecommendations();
      } else if (data.status === "no_data") {
        setError("분석할 크리에이티브 데이터가 없습니다. Meta 광고 계정을 연동해주세요.");
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
      const res = await fetch(`${API_URL}/api/ads/creative-fatigue/recommendations/apply`, {
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
      healthy: { label: "양호", color: "bg-green-500" },
      moderate: { label: "주의", color: "bg-yellow-500" },
      warning: { label: "경고", color: "bg-orange-500" },
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

  const getFatigueBar = (score: number) => {
    let color = "bg-green-500";
    if (score >= 80) color = "bg-red-500";
    else if (score >= 60) color = "bg-orange-500";
    else if (score >= 40) color = "bg-yellow-500";
    else if (score >= 20) color = "bg-lime-500";

    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className={`${color} h-2 rounded-full`} style={{ width: `${score}%` }} />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Link
            href="/ad-optimizer/unified"
            className="text-gray-500 hover:text-gray-700"
          >
            ← 통합 광고 관리
          </Link>
        </div>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">크리에이티브 피로도 감지</h1>
            <p className="text-gray-600 mt-1">
              Meta/TikTok 광고 크리에이티브의 피로도를 분석하고 교체 시점을 추천합니다
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* 플랫폼 선택 - 고유 브랜드 스타일 */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
              {[
                { id: "meta_default", key: "meta", name: "Meta", subtext: "Facebook/Instagram" },
                { id: "tiktok_default", key: "tiktok", name: "TikTok", subtext: "TikTok Ads" },
              ].map((platform) => {
                const style = PLATFORM_STYLES[platform.key];
                const isSelected = adAccountId === platform.id;
                return (
                  <button
                    key={platform.id}
                    onClick={() => setAdAccountId(platform.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                      isSelected
                        ? `${style?.bgSolid} text-white shadow-lg`
                        : `text-gray-600 hover:bg-gray-200`
                    }`}
                  >
                    <span className="text-lg">{style?.icon}</span>
                    <div className="text-left">
                      <div>{platform.name}</div>
                      <div className={`text-xs ${isSelected ? 'text-white/70' : 'text-gray-400'}`}>
                        {platform.subtext}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={runAnalysis}
              disabled={analyzing}
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {analyzing ? "분석 중..." : "피로도 분석 실행"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Platform Support Banner */}
      <div className="max-w-7xl mx-auto mb-6">
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.creativeFatigue.title}
          description={FEATURE_DESCRIPTIONS.creativeFatigue.description}
          platforms={FEATURE_PLATFORMS.creativeFatigue}
          className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/20"
        />
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="max-w-7xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">전체 크리에이티브</div>
            <div className="text-2xl font-bold">{summary.total_creatives}</div>
            <div className="mt-2">{getHealthStatusBadge(summary.health_status)}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">평균 피로도</div>
            <div className="text-2xl font-bold">{summary.average_fatigue_score}%</div>
            <div className="mt-2">{getFatigueBar(summary.average_fatigue_score)}</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">신선함 / 양호</div>
            <div className="text-2xl font-bold text-green-600">
              {summary.fresh_count + summary.good_count}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">피로 / 고갈</div>
            <div className="text-2xl font-bold text-red-600">
              {summary.tired_count + summary.exhausted_count}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow p-4">
            <div className="text-sm text-gray-500 mb-1">긴급 교체 필요</div>
            <div className="text-2xl font-bold text-orange-600">{summary.urgent_replacement_needed}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="border-b">
          <nav className="flex gap-4">
            {[
              { id: "summary", label: "피로도 분포" },
              { id: "analysis", label: "상세 분석" },
              { id: "recommendations", label: "교체 추천" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-3 px-4 border-b-2 ${
                  activeTab === tab.id
                    ? "border-purple-500 text-purple-600 font-medium"
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
            <h3 className="text-lg font-semibold mb-6">피로도 분포</h3>
            <div className="grid grid-cols-5 gap-4">
              {[
                { level: "fresh", count: summary.fresh_count },
                { level: "good", count: summary.good_count },
                { level: "moderate", count: summary.moderate_count },
                { level: "tired", count: summary.tired_count },
                { level: "exhausted", count: summary.exhausted_count },
              ].map((item) => {
                const config = FATIGUE_LEVEL_CONFIG[item.level];
                const percentage = summary.total_creatives > 0
                  ? Math.round((item.count / summary.total_creatives) * 100)
                  : 0;
                return (
                  <div
                    key={item.level}
                    className={`${config.bg} rounded-lg p-4 text-center`}
                  >
                    <div className={`text-3xl font-bold ${config.color}`}>{item.count}</div>
                    <div className={`text-sm font-medium ${config.color}`}>{config.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{percentage}%</div>
                  </div>
                );
              })}
            </div>

            {/* Chart placeholder */}
            <div className="mt-8">
              <h4 className="font-medium mb-4">피로도 레벨 설명</h4>
              <div className="space-y-3">
                {Object.entries(FATIGUE_LEVEL_CONFIG).map(([level, config]) => (
                  <div key={level} className="flex items-center gap-4">
                    <span className={`w-20 ${config.bg} ${config.color} px-2 py-1 rounded text-center text-sm`}>
                      {config.label}
                    </span>
                    <span className="text-gray-600 text-sm">
                      {level === "fresh" && "크리에이티브가 새롭고 성과가 좋습니다"}
                      {level === "good" && "아직 효과적이며 모니터링만 필요합니다"}
                      {level === "moderate" && "성과가 감소하기 시작했습니다. A/B 테스트를 권장합니다"}
                      {level === "tired" && "크리에이티브 교체가 필요합니다"}
                      {level === "exhausted" && "즉시 교체가 필요합니다. 성과가 크게 저하되었습니다"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "analysis" && (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold">크리에이티브별 상세 분석</h3>
            </div>
            {analyses.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                분석 결과가 없습니다. "피로도 분석 실행" 버튼을 클릭하세요.
              </div>
            ) : (
              <div className="divide-y">
                {analyses.map((analysis) => {
                  const levelConfig = FATIGUE_LEVEL_CONFIG[analysis.fatigue_level] || FATIGUE_LEVEL_CONFIG.moderate;
                  return (
                    <div key={analysis.creative_id} className="p-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="font-medium">{analysis.creative_name || analysis.creative_id}</div>
                          <div className="text-sm text-gray-500">ID: {analysis.creative_id}</div>
                        </div>
                        <div className="text-right">
                          <span className={`${levelConfig.bg} ${levelConfig.color} px-3 py-1 rounded-full text-sm`}>
                            {levelConfig.label}
                          </span>
                          <div className="text-2xl font-bold mt-1">{analysis.fatigue_score}%</div>
                        </div>
                      </div>

                      <div className="mb-4">{getFatigueBar(analysis.fatigue_score)}</div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">지표별 점수</div>
                          <div className="space-y-2">
                            {Object.entries(analysis.indicator_scores).map(([key, value]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-gray-600">
                                  {key === "ctr_decline" && "CTR 하락"}
                                  {key === "frequency_high" && "빈도 과다"}
                                  {key === "cpm_increase" && "CPM 상승"}
                                  {key === "engagement_drop" && "참여도 하락"}
                                  {key === "conversion_drop" && "전환율 하락"}
                                  {key === "reach_saturation" && "도달 포화"}
                                </span>
                                <span className={value > 50 ? "text-red-600" : "text-gray-900"}>
                                  {Math.round(value)}%
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">분석 정보</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">예상 남은 수명</span>
                              <span className="font-medium">{analysis.estimated_days_remaining}일</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">교체 우선순위</span>
                              <span className={`font-medium ${analysis.replacement_priority >= 4 ? "text-red-600" : ""}`}>
                                {analysis.replacement_priority}/5
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {analysis.issues.length > 0 && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-gray-600 mb-2">감지된 문제</div>
                          <ul className="list-disc list-inside text-sm text-red-600 space-y-1">
                            {analysis.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {analysis.recommendations.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">추천 사항</div>
                          <ul className="list-disc list-inside text-sm text-blue-600 space-y-1">
                            {analysis.recommendations.map((rec, idx) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
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
              <h3 className="font-semibold">크리에이티브 교체 추천</h3>
            </div>
            {recommendations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                교체 추천이 없습니다.
              </div>
            ) : (
              <div className="divide-y">
                {recommendations.map((rec) => {
                  const urgencyConfig = URGENCY_CONFIG[rec.urgency] || URGENCY_CONFIG.monitor;
                  const levelConfig = FATIGUE_LEVEL_CONFIG[rec.fatigue_level] || FATIGUE_LEVEL_CONFIG.moderate;
                  return (
                    <div key={rec.id} className="p-4">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="font-medium">{rec.creative_name || rec.creative_id}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`${levelConfig.bg} ${levelConfig.color} px-2 py-0.5 rounded text-xs`}>
                              {levelConfig.label}
                            </span>
                            <span className="text-sm text-gray-500">{rec.current_type}</span>
                          </div>
                        </div>
                        <span className={`font-medium ${urgencyConfig.color}`}>
                          {urgencyConfig.label} 교체 필요
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">추천 액션</div>
                          <div className="text-lg font-bold text-purple-600">
                            {rec.recommended_action === "replace" && "크리에이티브 교체"}
                            {rec.recommended_action === "refresh" && "크리에이티브 리프레시"}
                            {rec.recommended_action === "a/b_test" && "A/B 테스트"}
                            {rec.recommended_action === "monitor" && "모니터링 유지"}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">예상 효과</div>
                          <div className="text-sm space-y-1">
                            {rec.expected_improvement.ctr && (
                              <div className="text-green-600">CTR +{Math.round(rec.expected_improvement.ctr * 100)}%</div>
                            )}
                            {rec.expected_improvement.cpm && (
                              <div className="text-green-600">CPM {Math.round(rec.expected_improvement.cpm * 100)}%</div>
                            )}
                            {rec.expected_improvement.conversions && (
                              <div className="text-green-600">전환 +{Math.round(rec.expected_improvement.conversions * 100)}%</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {rec.suggested_variations.length > 0 && (
                        <div className="mb-4">
                          <div className="text-sm font-medium text-gray-600 mb-2">제안된 변형</div>
                          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                            {rec.suggested_variations.map((variation, idx) => (
                              <li key={idx}>{variation}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {rec.budget_impact && (
                        <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700 mb-4">
                          {rec.budget_impact}
                        </div>
                      )}

                      <button
                        onClick={() => applyRecommendation(rec.id)}
                        className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm hover:bg-purple-600"
                      >
                        추천 적용 완료 표시
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
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6">
          <h3 className="font-semibold text-purple-800 mb-3">크리에이티브 피로도 관리 팁</h3>
          <ul className="text-sm text-purple-700 space-y-2">
            <li>• <strong>빈도 관리:</strong> 빈도가 2.0을 넘으면 같은 사용자에게 너무 많이 노출된 것입니다</li>
            <li>• <strong>CTR 모니터링:</strong> CTR이 초기 대비 20% 이상 떨어지면 크리에이티브 교체를 고려하세요</li>
            <li>• <strong>정기적 리프레시:</strong> 이미지 광고는 약 2주, 동영상 광고는 약 3주마다 새로운 버전을 테스트하세요</li>
            <li>• <strong>A/B 테스트:</strong> 피로도가 "보통" 단계일 때 미리 새 크리에이티브를 테스트해두세요</li>
            <li>• <strong>타겟 확장:</strong> 빈도가 높아지면 유사 타겟이나 관심사 확장을 고려하세요</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
