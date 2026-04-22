"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth";
import { adGet, adPost } from "@/lib/api/adFetch";
import Link from "next/link";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
  PLATFORM_STYLES,
  PlatformTabs,
} from "@/components/ad-optimizer/PlatformSupportBanner";
import { ValuePropositionCompact } from "@/components/ad-optimizer/ValueProposition";

interface AnomalyAlert {
  id: number;
  alert_id: string;
  platform_id: string;
  campaign_id?: string;
  keyword_id?: string;
  anomaly_type: string;
  severity: string;
  metric_name: string;
  current_value: number;
  baseline_value: number;
  change_percent: number;
  z_score?: number;
  detected_at: string;
  resolved_at?: string;
  is_acknowledged: boolean;
  recommended_action?: {
    action: string;
    urgency: string;
  };
}

interface AnomalySummary {
  total_active: number;
  by_severity: Record<string, number>;
  by_platform: Record<string, number>;
  by_type: Record<string, number>;
  needs_attention: boolean;
}

interface AnomalyType {
  type: string;
  name: string;
  description: string;
  metric: string;
  direction: string;
  icon: string;
}

interface Threshold {
  metric: string;
  low_threshold: number;
  medium_threshold: number;
  high_threshold: number;
  critical_threshold: number;
  direction: string;
  auto_action: string;
  lookback_hours: number;
  is_custom: boolean;
}

export default function AnomalyDetectionPage() {
  const { token } = useAuthStore();
  const [activeTab, setActiveTab] = useState<"alerts" | "thresholds" | "history">("alerts");
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [summary, setSummary] = useState<AnomalySummary | null>(null);
  const [anomalyTypes, setAnomalyTypes] = useState<AnomalyType[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, Threshold>>({});
  const [selectedPlatform, setSelectedPlatform] = useState<string>("naver_searchad");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [showResolved, setShowResolved] = useState(false);

  const fetchSummary = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: AnomalySummary }>("/api/ads/anomaly/summary");
      setSummary(data.data);
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    }
  }, [token]);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedPlatform) params.append("platform_id", selectedPlatform);
      if (severityFilter) params.append("severity", severityFilter);
      if (showResolved) params.append("include_resolved", "true");

      const data = await adGet<{ data: AnomalyAlert[] }>(`/api/ads/anomaly/alerts?${params}`);
      setAlerts(data.data || []);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
    } finally {
      setLoading(false);
    }
  }, [token, selectedPlatform, severityFilter, showResolved]);

  const fetchAnomalyTypes = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: AnomalyType[] }>("/api/ads/anomaly/types");
      setAnomalyTypes(data.data || []);
    } catch (err) {
      console.error("Failed to fetch anomaly types:", err);
    }
  }, [token]);

  const fetchThresholds = useCallback(async () => {
    if (!token) return;

    try {
      const data = await adGet<{ data: Record<string, Threshold> }>(`/api/ads/anomaly/thresholds/${selectedPlatform}`);
      setThresholds(data.data || {});
    } catch (err) {
      console.error("Failed to fetch thresholds:", err);
    }
  }, [token, selectedPlatform]);

  useEffect(() => {
    fetchSummary();
    fetchAlerts();
    fetchAnomalyTypes();
  }, [fetchSummary, fetchAlerts, fetchAnomalyTypes]);

  useEffect(() => {
    if (activeTab === "thresholds") {
      fetchThresholds();
    }
  }, [activeTab, fetchThresholds]);

  const handleAcknowledge = async (alertId: string) => {
    if (!token) return;

    try {
      await adPost("/api/ads/anomaly/alerts/acknowledge", { alert_id: alertId });
      fetchAlerts();
      fetchSummary();
    } catch (err) {
      console.error("Failed to acknowledge alert:", err);
    }
  };

  const handleResolve = async (alertId: string) => {
    if (!token) return;

    try {
      await adPost("/api/ads/anomaly/alerts/resolve", { alert_id: alertId, notes: "UI에서 해결 처리" });
      fetchAlerts();
      fetchSummary();
    } catch (err) {
      console.error("Failed to resolve alert:", err);
    }
  };

  const handleResolveAll = async () => {
    if (!token) return;
    if (!confirm("모든 알림을 해결 처리하시겠습니까?")) return;

    try {
      await adPost(`/api/ads/anomaly/alerts/resolve-all?platform_id=${selectedPlatform}`);
      fetchAlerts();
      fetchSummary();
    } catch (err) {
      console.error("Failed to resolve all alerts:", err);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-600 text-white";
      case "high":
        return "bg-red-500 text-white";
      case "medium":
        return "bg-orange-500 text-white";
      case "low":
        return "bg-yellow-500 text-black";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "critical":
        return "심각";
      case "high":
        return "위험";
      case "medium":
        return "경고";
      case "low":
        return "주의";
      default:
        return severity;
    }
  };

  const getAnomalyTypeLabel = (type: string) => {
    const found = anomalyTypes.find((t) => t.type === type);
    return found?.name || type;
  };

  const getAnomalyTypeIcon = (type: string) => {
    const found = anomalyTypes.find((t) => t.type === type);
    return found?.icon || "🔔";
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
            <h1 className="text-2xl font-bold">이상 징후 감지</h1>
            <p className="text-gray-400 mt-1">
              광고 성과의 급격한 변화를 감지하고 즉시 대응하세요
            </p>
          </div>
          <div className="flex items-center gap-3">
            {summary?.needs_attention && (
              <span className="bg-red-600 text-white px-3 py-1 rounded-full text-sm animate-pulse">
                주의 필요
              </span>
            )}
            <button
              onClick={() => {
                fetchAlerts();
                fetchSummary();
              }}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <span>새로고침</span>
            </button>
          </div>
        </div>

        {/* Value Proposition */}
        <ValuePropositionCompact type="anomaly" />

        {/* Platform Support Banner */}
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.anomalyDetection.title}
          description={FEATURE_DESCRIPTIONS.anomalyDetection.description}
          platforms={FEATURE_PLATFORMS.anomalyDetection}
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-gray-400 text-sm">전체 알림</div>
            <div className="text-3xl font-bold text-white mt-1">
              {summary?.total_active || 0}
            </div>
          </div>
          <div className="bg-red-900/30 rounded-lg p-4 border border-red-700">
            <div className="text-red-400 text-sm">심각/위험</div>
            <div className="text-3xl font-bold text-red-400 mt-1">
              {(summary?.by_severity?.critical || 0) +
                (summary?.by_severity?.high || 0)}
            </div>
          </div>
          <div className="bg-orange-900/30 rounded-lg p-4 border border-orange-700">
            <div className="text-orange-400 text-sm">경고</div>
            <div className="text-3xl font-bold text-orange-400 mt-1">
              {summary?.by_severity?.medium || 0}
            </div>
          </div>
          <div className="bg-yellow-900/30 rounded-lg p-4 border border-yellow-700">
            <div className="text-yellow-400 text-sm">주의</div>
            <div className="text-3xl font-bold text-yellow-400 mt-1">
              {summary?.by_severity?.low || 0}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: "alerts", label: "알림 목록" },
            { id: "thresholds", label: "임계값 설정" },
            { id: "history", label: "히스토리" },
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

        {/* Alerts Tab */}
        {activeTab === "alerts" && (
          <div>
            {/* Platform Tabs - 플랫폼별 고유 디자인 적용 */}
            <div className="mb-4">
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: "naver_searchad", display: "naver" },
                  { id: "google_ads", display: "google" },
                  { id: "meta_ads", display: "meta" },
                  { id: "kakao_moment", display: "kakao" },
                ].map(({ id: platformId, display }) => {
                  const style = PLATFORM_STYLES[display];
                  const isSelected = selectedPlatform === platformId;
                  return (
                    <button
                      key={platformId}
                      onClick={() => setSelectedPlatform(platformId)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        isSelected
                          ? `${style?.bgSolid} text-white shadow-lg`
                          : `${style?.bgGradient} ${style?.textColor} border ${style?.borderColor} hover:scale-105`
                      }`}
                    >
                      <span className="text-lg">{style?.icon}</span>
                      <span>{style?.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              >
                <option value="">모든 심각도</option>
                <option value="critical">심각</option>
                <option value="high">위험</option>
                <option value="medium">경고</option>
                <option value="low">주의</option>
              </select>
              <label className="flex items-center gap-2 text-gray-400">
                <input
                  type="checkbox"
                  checked={showResolved}
                  onChange={(e) => setShowResolved(e.target.checked)}
                  className="rounded"
                />
                해결된 알림 포함
              </label>
              {alerts.length > 0 && (
                <button
                  onClick={handleResolveAll}
                  className="ml-auto bg-green-700 hover:bg-green-600 px-4 py-2 rounded-lg text-sm"
                >
                  모두 해결
                </button>
              )}
            </div>

            {/* Alert List */}
            {loading ? (
              <div className="text-center py-12 text-gray-400">로딩 중...</div>
            ) : alerts.length === 0 ? (
              <div className="text-center py-12 bg-gray-800 rounded-lg">
                <div className="text-4xl mb-3">✅</div>
                <div className="text-gray-400">
                  {showResolved
                    ? "알림 내역이 없습니다."
                    : "활성화된 이상 징후 알림이 없습니다."}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.alert_id || alert.id}
                    className={`bg-gray-800 rounded-lg p-4 border-l-4 ${
                      alert.resolved_at
                        ? "border-gray-600 opacity-60"
                        : alert.severity === "critical"
                        ? "border-red-600"
                        : alert.severity === "high"
                        ? "border-red-500"
                        : alert.severity === "medium"
                        ? "border-orange-500"
                        : "border-yellow-500"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">
                          {getAnomalyTypeIcon(alert.anomaly_type)}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(
                                alert.severity
                              )}`}
                            >
                              {getSeverityLabel(alert.severity)}
                            </span>
                            <span className="font-medium">
                              {getAnomalyTypeLabel(alert.anomaly_type)}
                            </span>
                            {alert.resolved_at && (
                              <span className="text-green-500 text-sm">
                                [해결됨]
                              </span>
                            )}
                          </div>
                          <div className="text-gray-400 text-sm mt-1">
                            {alert.metric_name}:{" "}
                            <span className="text-white">
                              {alert.baseline_value.toFixed(1)}
                            </span>{" "}
                            →{" "}
                            <span
                              className={
                                alert.change_percent > 0
                                  ? "text-red-400"
                                  : "text-green-400"
                              }
                            >
                              {alert.current_value.toFixed(1)}
                            </span>{" "}
                            <span
                              className={
                                alert.change_percent > 0
                                  ? "text-red-400"
                                  : "text-green-400"
                              }
                            >
                              ({alert.change_percent > 0 ? "+" : ""}
                              {alert.change_percent.toFixed(1)}%)
                            </span>
                          </div>
                          {alert.recommended_action && (
                            <div className="mt-2 text-sm">
                              <span className="text-blue-400">권장 조치:</span>{" "}
                              {alert.recommended_action.action}
                              {alert.recommended_action.urgency ===
                                "immediate" && (
                                <span className="ml-2 text-red-400 text-xs">
                                  [즉시 조치 필요]
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-gray-500 text-sm">
                          {formatDate(alert.detected_at)}
                        </span>
                        {!alert.resolved_at && (
                          <div className="flex gap-2">
                            {!alert.is_acknowledged && (
                              <button
                                onClick={() =>
                                  handleAcknowledge(alert.alert_id)
                                }
                                className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-sm"
                              >
                                확인
                              </button>
                            )}
                            <button
                              onClick={() => handleResolve(alert.alert_id)}
                              className="bg-green-700 hover:bg-green-600 px-3 py-1 rounded text-sm"
                            >
                              해결
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thresholds Tab */}
        {activeTab === "thresholds" && (
          <div>
            <div className="mb-4">
              <select
                value={selectedPlatform}
                onChange={(e) => setSelectedPlatform(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2"
              >
                <option value="naver_searchad">네이버</option>
                <option value="google_ads">구글</option>
                <option value="meta_ads">메타</option>
                <option value="kakao_moment">카카오</option>
              </select>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {Object.entries(thresholds).map(([anomalyType, threshold]) => (
                <div
                  key={anomalyType}
                  className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">
                        {getAnomalyTypeIcon(anomalyType)}
                      </span>
                      <span className="font-medium">
                        {getAnomalyTypeLabel(anomalyType)}
                      </span>
                    </div>
                    {threshold.is_custom && (
                      <span className="text-xs bg-blue-600 px-2 py-0.5 rounded">
                        커스텀
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-yellow-400">
                      <span>주의:</span>
                      <span>{(threshold.low_threshold * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex justify-between text-orange-400">
                      <span>경고:</span>
                      <span>
                        {(threshold.medium_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-red-400">
                      <span>위험:</span>
                      <span>
                        {(threshold.high_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-red-500">
                      <span>심각:</span>
                      <span>
                        {(threshold.critical_threshold * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="pt-2 border-t border-gray-700 flex justify-between text-gray-400">
                      <span>비교 기간:</span>
                      <span>{threshold.lookback_hours}시간</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>자동 조치:</span>
                      <span>
                        {threshold.auto_action === "none"
                          ? "없음"
                          : threshold.auto_action}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {Object.keys(thresholds).length === 0 && (
              <div className="text-center py-12 bg-gray-800 rounded-lg text-gray-400">
                임계값 설정을 불러오는 중...
              </div>
            )}
          </div>
        )}

        {/* History Tab — 해결된 알림 자동 포함 */}
        {activeTab === "history" && (
          <div>
            {(() => {
              const resolvedAlerts = alerts.filter((a) => a.resolved_at);
              if (!showResolved) {
                return (
                  <div className="text-center py-12 bg-gray-800 rounded-lg">
                    <div className="text-4xl mb-3">📊</div>
                    <div className="text-gray-400 mb-4">
                      해결된 알림 히스토리를 보려면 아래 버튼을 클릭하세요.
                    </div>
                    <button
                      onClick={() => {
                        setShowResolved(true);
                        setActiveTab("alerts");
                      }}
                      className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg"
                    >
                      해결된 알림 포함하여 보기
                    </button>
                  </div>
                );
              }
              if (resolvedAlerts.length === 0) {
                return (
                  <div className="text-center py-12 bg-gray-800 rounded-lg text-gray-400">
                    해결된 알림이 없습니다.
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  <p className="text-gray-400 text-sm mb-4">
                    총 {resolvedAlerts.length}건의 해결된 알림
                  </p>
                  {resolvedAlerts.map((alert) => (
                    <div
                      key={alert.alert_id || alert.id}
                      className="bg-gray-800 rounded-lg p-4 border-l-4 border-green-600 opacity-75"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{getAnomalyTypeIcon(alert.anomaly_type)}</span>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                            {getSeverityLabel(alert.severity)}
                          </span>
                          <span className="font-medium">{getAnomalyTypeLabel(alert.anomaly_type)}</span>
                          <span className="text-green-500 text-sm">[해결됨]</span>
                        </div>
                        <div className="text-gray-500 text-sm">
                          {formatDate(alert.detected_at)}
                          {alert.resolved_at && (
                            <span className="ml-2 text-green-500">→ {formatDate(alert.resolved_at)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-8 bg-gray-800/50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">이상 징후 유형</h3>
          <div className="grid md:grid-cols-3 gap-4">
            {anomalyTypes.map((type) => (
              <div
                key={type.type}
                className="bg-gray-800 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{type.icon}</span>
                  <span className="font-medium">{type.name}</span>
                </div>
                <p className="text-gray-400 text-sm">{type.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
