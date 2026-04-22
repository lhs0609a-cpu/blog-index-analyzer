"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { adGet, adPost } from "@/lib/api/adFetch";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
  PLATFORM_STYLES,
  PlatformCard,
  PlatformBadge,
} from "@/components/ad-optimizer/PlatformSupportBanner";
import { ValuePropositionCompact } from "@/components/ad-optimizer/ValueProposition";

interface PlatformHealth {
  platform_id: string;
  platform_name: string;
  budget_share: number;
  revenue_share: number;
  efficiency_ratio: number;
  efficiency_score: number;
  status: string;
  recommendation: string;
  metrics: {
    roas: number;
    cpa: number | null;
    cvr: number;
    ctr: number;
  };
}

interface HealthAnalysis {
  status: string;
  overall?: {
    total_budget: number;
    total_spend: number;
    total_revenue: number;
    total_conversions: number;
    overall_roas: number;
    overall_cpa: number | null;
  };
  platforms?: PlatformHealth[];
  is_imbalanced?: boolean;
  rebalance_recommended?: boolean;
}

interface Reallocation {
  platform_id: string;
  platform_name: string;
  current_budget: number;
  suggested_budget: number;
  change_amount: number;
  change_percent: number;
  reason: string;
  priority: string;
  expected_impact: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
}

interface Strategy {
  id: string;
  name: string;
  description: string;
  weights: { roas: number; cpa: number; conversions: number };
  recommended_for: string;
}

interface QuickRecommendation {
  has_recommendation: boolean;
  source_platform?: string;
  target_platform?: string;
  move_amount?: number;
  expected_roas_gain?: number;
  message: string;
}

export default function BudgetReallocationPage() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"health" | "plan" | "history">("health");
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthAnalysis | null>(null);
  const [recommendation, setRecommendation] = useState<QuickRecommendation | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState<string>("balanced");
  const [plan, setPlan] = useState<{ reallocations: Reallocation[]; plan_id?: string } | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const fetchHealthData = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const data = await adGet<{ data: HealthAnalysis }>("/api/ads/budget/health");
      setHealthData(data.data);
    } catch (err) {
      console.error("Failed to fetch health data:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchRecommendation = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: QuickRecommendation }>("/api/ads/budget/recommendation");
      setRecommendation(data.data);
    } catch (err) {
      console.error("Failed to fetch recommendation:", err);
    }
  }, [token]);

  const fetchStrategies = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: Strategy[] }>("/api/ads/budget/strategies");
      setStrategies(data.data || []);
    } catch (err) {
      console.error("Failed to fetch strategies:", err);
    }
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: any[] }>("/api/ads/budget/history");
      setHistory(data.data || []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchHealthData();
    fetchRecommendation();
    fetchStrategies();
  }, [fetchHealthData, fetchRecommendation, fetchStrategies]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const generatePlan = async () => {
    if (!token || !healthData?.platforms) return;

    setPlanLoading(true);
    try {
      const performances = healthData.platforms.map((p) => ({
        platform_id: p.platform_id,
        platform_name: p.platform_name,
        current_budget: (p.budget_share / 100) * (healthData.overall?.total_budget || 1000000),
        spend: (p.revenue_share / 100) * (healthData.overall?.total_spend || 0),
        impressions: 10000,
        clicks: Math.round(10000 * (p.metrics.ctr / 100)),
        conversions: Math.round(10000 * (p.metrics.cvr / 100)),
        revenue: (p.revenue_share / 100) * (healthData.overall?.total_revenue || 0),
      }));

      const data = await adPost<{ data: { reallocations: Reallocation[]; plan_id?: string } }>("/api/ads/budget/plan/generate", {
        performances,
        total_budget: healthData.overall?.total_budget || 1000000,
        strategy: selectedStrategy,
        max_change_ratio: 0.3,
      });

      setPlan({
        reallocations: data.data.reallocations,
        plan_id: data.data.plan_id,
      });
    } catch (err) {
      console.error("Failed to generate plan:", err);
    } finally {
      setPlanLoading(false);
    }
  };

  const applyPlan = async () => {
    if (!token || !plan?.plan_id) return;
    if (!confirm("이 예산 재분배 계획을 적용하시겠습니까?")) return;

    try {
      await adPost("/api/ads/budget/plan/apply", {
        plan_id: plan.plan_id,
        notes: "UI에서 적용",
      }, { showToast: false });

      toast.success("예산 재분배 계획이 적용되었습니다.");
      setPlan(null);
      fetchHistory();
    } catch (err) {
      console.error("Failed to apply plan:", err);
      toast.error("오류가 발생했습니다.");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "excellent":
        return "text-green-400";
      case "good":
        return "text-blue-400";
      case "fair":
        return "text-yellow-400";
      case "poor":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "excellent":
        return "우수";
      case "good":
        return "양호";
      case "fair":
        return "보통";
      case "poor":
        return "저조";
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-green-600";
      case "medium":
        return "bg-blue-600";
      case "low":
        return "bg-orange-600";
      case "exclude":
        return "bg-gray-600";
      default:
        return "bg-gray-600";
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("ko-KR").format(Math.round(value));
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link
              href="/ad-optimizer/unified"
              className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
            >
              ← 광고 최적화 대시보드
            </Link>
            <h1 className="text-2xl font-bold">크로스 플랫폼 예산 재분배</h1>
            <p className="text-gray-400 mt-1">
              고효율 플랫폼에 예산을 집중하여 전체 ROAS를 극대화하세요
            </p>
          </div>
          <button
            onClick={() => {
              fetchHealthData();
              fetchRecommendation();
            }}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg"
          >
            새로고침
          </button>
        </div>

        {/* Value Proposition */}
        <ValuePropositionCompact type="budget" />

        {/* Platform Support Banner */}
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.budgetReallocation.title}
          description={FEATURE_DESCRIPTIONS.budgetReallocation.description}
          platforms={FEATURE_PLATFORMS.budgetReallocation}
        />

        {/* Quick Recommendation */}
        {recommendation?.has_recommendation && (
          <div className="bg-gradient-to-r from-green-900/50 to-blue-900/50 border border-green-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-green-400">빠른 추천</h3>
                <p className="text-gray-300 mt-1">{recommendation.message}</p>
                <p className="text-sm text-gray-400 mt-1">
                  예상 ROAS 개선: +{recommendation.expected_roas_gain?.toFixed(1)}%
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('plan')
                  setSelectedStrategy('balanced')
                  generatePlan()
                }}
                className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg"
              >
                바로 적용
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: "health", label: "플랫폼 건강도" },
            { id: "plan", label: "재분배 계획" },
            { id: "history", label: "이력" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Health Tab */}
        {activeTab === "health" && (
          <div>
            {loading ? (
              <div className="text-center py-12 text-gray-400">로딩 중...</div>
            ) : healthData?.status === "no_data" ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <div className="text-4xl mb-3">📊</div>
                <div className="text-gray-400">성과 데이터가 없습니다.</div>
                <p className="text-sm text-gray-500 mt-2">
                  광고 플랫폼을 연동하고 성과 데이터를 수집하세요.
                </p>
              </div>
            ) : (
              <>
                {/* Overall Summary */}
                {healthData?.overall && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-gray-400 text-sm">총 예산</div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(healthData.overall.total_budget)}원
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-gray-400 text-sm">총 지출</div>
                      <div className="text-2xl font-bold">
                        {formatCurrency(healthData.overall.total_spend)}원
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-gray-400 text-sm">전체 ROAS</div>
                      <div className="text-2xl font-bold text-green-400">
                        {healthData.overall.overall_roas}%
                      </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-4">
                      <div className="text-gray-400 text-sm">총 전환</div>
                      <div className="text-2xl font-bold">
                        {healthData.overall.total_conversions}건
                      </div>
                    </div>
                  </div>
                )}

                {/* Imbalance Warning */}
                {healthData?.is_imbalanced && (
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-2 text-yellow-400">
                      <span className="text-xl">⚠️</span>
                      <span className="font-semibold">예산 불균형 감지</span>
                    </div>
                    <p className="text-gray-300 mt-1">
                      플랫폼 간 효율 차이가 큽니다. 예산 재분배를 권장합니다.
                    </p>
                  </div>
                )}

                {/* Platform Cards - 플랫폼별 고유 디자인 적용 */}
                <div className="grid md:grid-cols-2 gap-4">
                  {healthData?.platforms?.map((platform) => {
                    const style = PLATFORM_STYLES[platform.platform_id];
                    const defaultStyle = {
                      bgGradient: "bg-gray-800",
                      borderColor: "border-gray-700",
                      textColor: "text-white",
                      accentColor: "#6B7280",
                      iconBg: "bg-gray-700",
                      icon: "📊",
                    };
                    const platformStyle = style || defaultStyle;

                    return (
                      <div
                        key={platform.platform_id}
                        className={`${platformStyle.bgGradient} rounded-xl p-5 border ${platformStyle.borderColor} transition-all hover:shadow-lg hover:shadow-${platform.platform_id === 'naver' ? '[#03C75A]/10' : platform.platform_id === 'google' ? '[#4285F4]/10' : platform.platform_id === 'meta' ? '[#0866FF]/10' : platform.platform_id === 'kakao' ? '[#FEE500]/10' : platform.platform_id === 'coupang' ? '[#E81E25]/10' : 'gray-900/20'}`}
                      >
                        {/* Platform Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`${style?.iconBg || 'bg-gray-700'} p-2.5 rounded-xl`}>
                              <span className="text-2xl">{style?.icon || '📊'}</span>
                            </div>
                            <div>
                              <h3 className={`font-bold text-lg ${platformStyle.textColor}`}>
                                {platform.platform_name}
                              </h3>
                              <span className={`text-xs font-medium ${getStatusColor(platform.status)} bg-${platform.status === 'excellent' ? 'green' : platform.status === 'good' ? 'blue' : platform.status === 'fair' ? 'yellow' : 'red'}-500/20 px-2 py-0.5 rounded-full`}>
                                {getStatusLabel(platform.status)}
                              </span>
                            </div>
                          </div>
                          <div className={`text-3xl font-bold ${platformStyle.textColor}`}>
                            {platform.efficiency_score.toFixed(0)}
                            <span className="text-sm font-normal text-gray-400">점</span>
                          </div>
                        </div>

                        {/* Efficiency Bar - 플랫폼 색상 적용 */}
                        <div className="mb-4">
                          <div className="flex justify-between text-sm text-gray-400 mb-1">
                            <span>효율성</span>
                            <span>{platform.efficiency_ratio.toFixed(2)}x</span>
                          </div>
                          <div className="h-2.5 bg-gray-700/50 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(platform.efficiency_score, 100)}%`,
                                backgroundColor: style?.accentColor || '#6B7280'
                              }}
                            />
                          </div>
                        </div>

                        {/* Metrics Grid - 플랫폼 색상 적용 */}
                        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                          <div className="bg-black/20 rounded-lg p-2.5">
                            <span className="text-gray-400 text-xs">예산 비중</span>
                            <div className={`font-bold ${platformStyle.textColor}`}>{platform.budget_share}%</div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-2.5">
                            <span className="text-gray-400 text-xs">매출 비중</span>
                            <div className={`font-bold ${platformStyle.textColor}`}>{platform.revenue_share}%</div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-2.5">
                            <span className="text-gray-400 text-xs">ROAS</span>
                            <div className={`font-bold ${platform.metrics.roas >= 300 ? 'text-green-400' : platform.metrics.roas >= 150 ? platformStyle.textColor : 'text-red-400'}`}>
                              {platform.metrics.roas}%
                            </div>
                          </div>
                          <div className="bg-black/20 rounded-lg p-2.5">
                            <span className="text-gray-400 text-xs">CPA</span>
                            <div className="font-bold text-white">
                              {platform.metrics.cpa ? `₩${formatCurrency(platform.metrics.cpa)}` : "-"}
                            </div>
                          </div>
                        </div>

                        {/* Recommendation - 플랫폼 색상 테두리 적용 */}
                        <div className={`text-sm border-t border-gray-600/50 pt-3`}>
                          <span className={`${platformStyle.textColor} font-medium`}>💡 </span>
                          <span className="text-gray-300">{platform.recommendation}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Plan Tab */}
        {activeTab === "plan" && (
          <div>
            {/* Strategy Selection */}
            <div className="bg-gray-800 rounded-lg p-4 mb-6">
              <h3 className="font-semibold mb-3">재분배 전략 선택</h3>
              <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
                {strategies.map((strategy) => (
                  <button
                    key={strategy.id}
                    onClick={() => setSelectedStrategy(strategy.id)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      selectedStrategy === strategy.id
                        ? "border-blue-500 bg-blue-900/30"
                        : "border-gray-700 hover:border-gray-600"
                    }`}
                  >
                    <div className="font-medium">{strategy.name}</div>
                    <div className="text-xs text-gray-400 mt-1">{strategy.description}</div>
                  </button>
                ))}
              </div>
              <button
                onClick={generatePlan}
                disabled={planLoading}
                className="mt-4 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 px-6 py-2 rounded-lg"
              >
                {planLoading ? "계획 생성 중..." : "재분배 계획 생성"}
              </button>
            </div>

            {/* Generated Plan */}
            {plan && (
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-lg">재분배 계획</h3>
                  <button
                    onClick={applyPlan}
                    className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg"
                  >
                    계획 적용
                  </button>
                </div>

                <div className="space-y-3">
                  {plan.reallocations.map((realloc) => {
                    const style = PLATFORM_STYLES[realloc.platform_id];
                    const isIncrease = realloc.change_amount > 0;
                    const isDecrease = realloc.change_amount < 0;

                    return (
                      <div
                        key={realloc.platform_id}
                        className={`${style?.bgGradient || 'bg-gray-700'} rounded-xl p-4 border ${style?.borderColor || 'border-gray-600'} transition-all hover:scale-[1.01]`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            {/* Platform Icon */}
                            <div className={`${style?.iconBg || 'bg-gray-600'} p-2 rounded-xl`}>
                              <span className="text-xl">{style?.icon || '📊'}</span>
                            </div>

                            {/* Priority Badge */}
                            <span
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${getPriorityColor(realloc.priority)}`}
                            >
                              {realloc.priority === "high"
                                ? "🔥 우선"
                                : realloc.priority === "medium"
                                ? "📈 보통"
                                : realloc.priority === "low"
                                ? "📉 낮음"
                                : "⏸️ 제외"}
                            </span>

                            <div>
                              <div className={`font-bold ${style?.textColor || 'text-white'}`}>
                                {realloc.platform_name}
                              </div>
                              <div className="text-sm text-gray-400">{realloc.reason}</div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-gray-400 text-sm">
                              ₩{formatCurrency(realloc.current_budget)}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-gray-500">→</span>
                              <span className={`font-bold text-lg ${style?.textColor || 'text-white'}`}>
                                ₩{formatCurrency(realloc.suggested_budget)}
                              </span>
                              <span
                                className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                                  isIncrease
                                    ? "text-green-400 bg-green-500/20"
                                    : isDecrease
                                    ? "text-red-400 bg-red-500/20"
                                    : "text-gray-400 bg-gray-500/20"
                                }`}
                              >
                                {isIncrease ? "↑" : isDecrease ? "↓" : "−"}
                                {Math.abs(realloc.change_percent).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expected Impact */}
                        {realloc.expected_impact && (
                          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-600/30">
                            <div className="text-center">
                              <div className="text-xs text-gray-500">노출수</div>
                              <div className={`text-sm font-medium ${style?.textColor || 'text-white'}`}>
                                +{formatCurrency(realloc.expected_impact.impressions)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">클릭수</div>
                              <div className={`text-sm font-medium ${style?.textColor || 'text-white'}`}>
                                +{formatCurrency(realloc.expected_impact.clicks)}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">전환수</div>
                              <div className={`text-sm font-medium ${style?.textColor || 'text-white'}`}>
                                +{realloc.expected_impact.conversions}
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-xs text-gray-500">예상 매출</div>
                              <div className="text-sm font-medium text-green-400">
                                +₩{formatCurrency(realloc.expected_impact.revenue)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* History Tab */}
        {activeTab === "history" && (
          <div>
            {history.length === 0 ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <div className="text-4xl mb-3">📜</div>
                <div className="text-gray-400">재분배 이력이 없습니다.</div>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item, idx) => (
                  <div key={idx} className="bg-gray-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{item.source_platform}</span>
                        <span className="text-gray-400 mx-2">→</span>
                        <span className="font-medium">{item.target_platform}</span>
                        <span className="ml-3 text-green-400">
                          +{formatCurrency(item.amount)}원
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            item.status === "applied"
                              ? "bg-green-600"
                              : item.status === "pending"
                              ? "bg-yellow-600"
                              : "bg-gray-600"
                          }`}
                        >
                          {item.status === "applied"
                            ? "적용됨"
                            : item.status === "pending"
                            ? "대기중"
                            : item.status}
                        </span>
                        <div className="text-xs text-gray-500 mt-1">
                          {new Date(item.created_at).toLocaleString("ko-KR")}
                        </div>
                      </div>
                    </div>
                    {item.reason && (
                      <div className="text-sm text-gray-400 mt-2">{item.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
