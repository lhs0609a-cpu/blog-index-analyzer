"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { getApiBaseUrl } from "@/lib/api";
import Link from "next/link";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
} from "@/components/ad-optimizer/PlatformSupportBanner";

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
      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch health data:", err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchRecommendation = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/recommendation`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRecommendation(data.data);
      }
    } catch (err) {
      console.error("Failed to fetch recommendation:", err);
    }
  }, [token]);

  const fetchStrategies = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/strategies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStrategies(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch strategies:", err);
    }
  }, [token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.data || []);
      }
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

      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/plan/generate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          performances,
          total_budget: healthData.overall?.total_budget || 1000000,
          strategy: selectedStrategy,
          max_change_ratio: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setPlan({
          reallocations: data.data.reallocations,
          plan_id: data.data.plan_id,
        });
      }
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
      const res = await fetch(`${getApiBaseUrl()}/api/ads/budget/plan/apply`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          plan_id: plan.plan_id,
          notes: "UI에서 적용",
        }),
      });

      if (res.ok) {
        alert("예산 재분배 계획이 적용되었습니다.");
        setPlan(null);
        fetchHistory();
      }
    } catch (err) {
      console.error("Failed to apply plan:", err);
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
              <button className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg">
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

                {/* Platform Cards */}
                <div className="grid md:grid-cols-2 gap-4">
                  {healthData?.platforms?.map((platform) => (
                    <div
                      key={platform.platform_id}
                      className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-lg">{platform.platform_name}</h3>
                        <span className={`font-medium ${getStatusColor(platform.status)}`}>
                          {getStatusLabel(platform.status)}
                        </span>
                      </div>

                      {/* Efficiency Bar */}
                      <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-400 mb-1">
                          <span>효율성 점수</span>
                          <span>{platform.efficiency_score.toFixed(0)}점</span>
                        </div>
                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              platform.efficiency_score >= 70
                                ? "bg-green-500"
                                : platform.efficiency_score >= 40
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            style={{ width: `${platform.efficiency_score}%` }}
                          />
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                        <div>
                          <span className="text-gray-400">예산 비중</span>
                          <span className="float-right">{platform.budget_share}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">매출 비중</span>
                          <span className="float-right">{platform.revenue_share}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">ROAS</span>
                          <span className="float-right">{platform.metrics.roas}%</span>
                        </div>
                        <div>
                          <span className="text-gray-400">CPA</span>
                          <span className="float-right">
                            {platform.metrics.cpa ? `${formatCurrency(platform.metrics.cpa)}원` : "-"}
                          </span>
                        </div>
                      </div>

                      {/* Recommendation */}
                      <div className="text-sm text-blue-400 border-t border-gray-700 pt-3">
                        {platform.recommendation}
                      </div>
                    </div>
                  ))}
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
                  {plan.reallocations.map((realloc) => (
                    <div
                      key={realloc.platform_id}
                      className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`px-2 py-1 rounded text-xs ${getPriorityColor(realloc.priority)}`}
                        >
                          {realloc.priority === "high"
                            ? "우선"
                            : realloc.priority === "medium"
                            ? "보통"
                            : realloc.priority === "low"
                            ? "낮음"
                            : "제외"}
                        </span>
                        <div>
                          <div className="font-medium">{realloc.platform_name}</div>
                          <div className="text-sm text-gray-400">{realloc.reason}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-gray-400 text-sm">
                          {formatCurrency(realloc.current_budget)}원
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-400">→</span>
                          <span className="font-medium">
                            {formatCurrency(realloc.suggested_budget)}원
                          </span>
                          <span
                            className={`text-sm ${
                              realloc.change_amount > 0
                                ? "text-green-400"
                                : realloc.change_amount < 0
                                ? "text-red-400"
                                : "text-gray-400"
                            }`}
                          >
                            ({realloc.change_amount > 0 ? "+" : ""}
                            {realloc.change_percent.toFixed(1)}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
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
