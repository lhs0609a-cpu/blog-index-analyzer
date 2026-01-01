"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Calendar,
  TrendingUp,
  TrendingDown,
  Zap,
  Save,
  RefreshCw,
  ChevronLeft,
  Info,
  Sun,
  Moon,
  Sunrise,
  Sunset,
  Settings,
  BarChart3,
  Target,
  Sparkles,
  Check,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  PlatformSupportBanner,
  FEATURE_PLATFORMS,
  FEATURE_DESCRIPTIONS,
  PLATFORM_STYLES,
} from "@/components/ad-optimizer/PlatformSupportBanner";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://naverpay-delivery-tracker.fly.dev";

// 시간대별 기본 아이콘
const getTimeIcon = (hour: number) => {
  if (hour >= 6 && hour < 12) return <Sunrise className="w-4 h-4 text-orange-400" />;
  if (hour >= 12 && hour < 18) return <Sun className="w-4 h-4 text-yellow-400" />;
  if (hour >= 18 && hour < 22) return <Sunset className="w-4 h-4 text-purple-400" />;
  return <Moon className="w-4 h-4 text-blue-400" />;
};

// 가중치에 따른 색상
const getModifierColor = (modifier: number) => {
  if (modifier >= 1.3) return "bg-green-500";
  if (modifier >= 1.1) return "bg-green-400";
  if (modifier >= 0.9) return "bg-gray-400";
  if (modifier >= 0.7) return "bg-orange-400";
  return "bg-red-400";
};

const getModifierBgColor = (modifier: number) => {
  if (modifier >= 1.3) return "bg-green-500/20 border-green-500/50";
  if (modifier >= 1.1) return "bg-green-400/20 border-green-400/50";
  if (modifier >= 0.9) return "bg-gray-400/20 border-gray-400/50";
  if (modifier >= 0.7) return "bg-orange-400/20 border-orange-400/50";
  return "bg-red-400/20 border-red-400/50";
};

const dayNames = ["월", "화", "수", "목", "금", "토", "일"];
const dayFullNames = ["월요일", "화요일", "수요일", "목요일", "금요일", "토요일", "일요일"];

interface ScheduleData {
  hourly_modifiers: { [key: number]: number };
  daily_modifiers: { [key: number]: number };
  special_slots: Array<{
    hour: number;
    day_of_week: number | null;
    modifier: number;
    enabled: boolean;
  }>;
  auto_optimize: boolean;
  insights: {
    high_performance_hours: number[];
    low_performance_hours: number[];
    high_performance_days: string[];
    low_performance_days: string[];
    potential_savings: {
      low_efficiency_hours: number;
      estimated_cost_reduction_percent: number;
      recommendation: string;
    };
  };
}

interface PresetData {
  [key: string]: {
    name: string;
    description: string;
    hourly: { [key: number]: number };
    daily: { [key: number]: number };
  };
}

export default function HourlyBiddingPage() {
  const router = useRouter();
  const [selectedPlatform, setSelectedPlatform] = useState("naver_searchad");
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [presets, setPresets] = useState<PresetData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"hourly" | "daily" | "heatmap" | "presets">("hourly");
  const [baseBid, setBaseBid] = useState(1000);
  const [previewData, setPreviewData] = useState<any>(null);

  // 초기 데이터 로드
  useEffect(() => {
    loadSchedule();
    loadPresets();
  }, [selectedPlatform]);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/ads/hourly-bidding/schedule/${selectedPlatform}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSchedule(data.data);
      } else {
        // 스케줄이 없으면 기본값 설정
        setSchedule({
          hourly_modifiers: Object.fromEntries([...Array(24)].map((_, i) => [i, 1.0])),
          daily_modifiers: Object.fromEntries([...Array(7)].map((_, i) => [i, 1.0])),
          special_slots: [],
          auto_optimize: true,
          insights: {
            high_performance_hours: [],
            low_performance_hours: [],
            high_performance_days: [],
            low_performance_days: [],
            potential_savings: {
              low_efficiency_hours: 0,
              estimated_cost_reduction_percent: 0,
              recommendation: "데이터 수집 중",
            },
          },
        });
      }
    } catch (error) {
      console.error("Failed to load schedule:", error);
      toast.error("스케줄 로드 실패");
    } finally {
      setLoading(false);
    }
  };

  const loadPresets = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/ads/hourly-bidding/presets`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPresets(data.data);
      }
    } catch (error) {
      console.error("Failed to load presets:", error);
    }
  };

  const loadPreview = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `${API_BASE_URL}/api/ads/hourly-bidding/preview/${selectedPlatform}/week?base_bid=${baseBid}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.ok) {
        const data = await res.json();
        setPreviewData(data.data);
      }
    } catch (error) {
      console.error("Failed to load preview:", error);
    }
  };

  useEffect(() => {
    if (activeTab === "heatmap" && schedule) {
      loadPreview();
    }
  }, [activeTab, schedule, baseBid]);

  const saveSchedule = async () => {
    if (!schedule) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/ads/hourly-bidding/schedule`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform_id: selectedPlatform,
          hourly_modifiers: schedule.hourly_modifiers,
          daily_modifiers: schedule.daily_modifiers,
          auto_optimize: schedule.auto_optimize,
        }),
      });

      if (res.ok) {
        toast.success("스케줄이 저장되었습니다!");
        loadSchedule();
      } else {
        toast.error("저장 실패");
      }
    } catch (error) {
      toast.error("저장 중 오류 발생");
    } finally {
      setSaving(false);
    }
  };

  const applyPreset = async (presetName: string) => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/ads/hourly-bidding/presets/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform_id: selectedPlatform,
          preset_name: presetName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`'${data.data.name}' 프리셋이 적용되었습니다!`);
        loadSchedule();
      } else {
        toast.error("프리셋 적용 실패");
      }
    } catch (error) {
      toast.error("프리셋 적용 중 오류 발생");
    }
  };

  const autoOptimize = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/api/ads/hourly-bidding/auto-optimize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          platform_id: selectedPlatform,
          optimization_target: "conversions",
        }),
      });

      if (res.ok) {
        toast.success("자동 최적화가 완료되었습니다!");
        loadSchedule();
      } else {
        const data = await res.json();
        toast.error(data.detail || "자동 최적화 실패");
      }
    } catch (error) {
      toast.error("자동 최적화 중 오류 발생");
    }
  };

  const updateHourlyModifier = (hour: number, value: number) => {
    if (!schedule) return;
    setSchedule({
      ...schedule,
      hourly_modifiers: {
        ...schedule.hourly_modifiers,
        [hour]: Math.max(0.3, Math.min(2.0, value)),
      },
    });
  };

  const updateDailyModifier = (day: number, value: number) => {
    if (!schedule) return;
    setSchedule({
      ...schedule,
      daily_modifiers: {
        ...schedule.daily_modifiers,
        [day]: Math.max(0.3, Math.min(2.0, value)),
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/ad-optimizer/unified")}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Clock className="w-7 h-7 text-blue-400" />
                시간대별 입찰 최적화
              </h1>
              <p className="text-gray-400 text-sm mt-1">
                시간대/요일별 입찰 가중치를 설정하여 광고 효율을 극대화하세요
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 플랫폼 선택 - 고유 브랜드 스타일 적용 */}
            <div className="flex gap-1.5 bg-white/5 rounded-xl p-1">
              {[
                { id: "naver_searchad", key: "naver", name: "네이버" },
                { id: "google_ads", key: "google", name: "구글" },
                { id: "meta_ads", key: "meta", name: "메타" },
                { id: "kakao_moment", key: "kakao", name: "카카오" },
              ].map((platform) => {
                const style = PLATFORM_STYLES[platform.key];
                const isSelected = selectedPlatform === platform.id;
                return (
                  <button
                    key={platform.id}
                    onClick={() => setSelectedPlatform(platform.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-sm transition-all ${
                      isSelected
                        ? `${style?.bgSolid} text-white shadow-lg`
                        : `text-gray-400 hover:text-white ${style?.hoverBg}`
                    }`}
                  >
                    <span>{style?.icon}</span>
                    <span>{platform.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={autoOptimize}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              자동 최적화
            </button>
            <button
              onClick={saveSchedule}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              저장
            </button>
          </div>
        </div>

        {/* Platform Support Banner */}
        <PlatformSupportBanner
          title={FEATURE_DESCRIPTIONS.hourlyBidding.title}
          description={FEATURE_DESCRIPTIONS.hourlyBidding.description}
          platforms={FEATURE_PLATFORMS.hourlyBidding}
          className="bg-gradient-to-r from-slate-800/50 to-slate-700/50"
        />

        {/* Insights Cards */}
        {schedule?.insights && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-green-500/10 border border-green-500/30 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <TrendingUp className="w-5 h-5" />
                <span className="font-medium">고효율 시간대</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {schedule.insights.high_performance_hours.length}개
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {schedule.insights.high_performance_hours.slice(0, 3).join(", ")}시
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <TrendingDown className="w-5 h-5" />
                <span className="font-medium">저효율 시간대</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {schedule.insights.low_performance_hours.length}개
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {schedule.insights.low_performance_hours.slice(0, 3).join(", ")}시
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Target className="w-5 h-5" />
                <span className="font-medium">예상 비용 절감</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {schedule.insights.potential_savings.estimated_cost_reduction_percent}%
              </p>
              <p className="text-sm text-gray-400 mt-1">
                저효율 시간대 최적화 시
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <Zap className="w-5 h-5" />
                <span className="font-medium">최적화 상태</span>
              </div>
              <p className="text-lg font-bold text-white">
                {schedule.auto_optimize ? "자동 최적화 ON" : "수동 설정"}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                {schedule.insights.potential_savings.recommendation}
              </p>
            </motion.div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 bg-white/5 p-1 rounded-xl w-fit">
          {[
            { id: "hourly", label: "시간대별", icon: Clock },
            { id: "daily", label: "요일별", icon: Calendar },
            { id: "heatmap", label: "히트맵", icon: BarChart3 },
            { id: "presets", label: "프리셋", icon: Settings },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-500 text-white"
                  : "text-gray-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {activeTab === "hourly" && schedule && (
            <motion.div
              key="hourly"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-400" />
                시간대별 입찰 가중치
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                각 시간대의 입찰 가중치를 설정하세요. 1.0 = 기본, 1.5 = 50% 증가, 0.5 = 50% 감소
              </p>

              <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
                {[...Array(24)].map((_, hour) => (
                  <div
                    key={hour}
                    className={`p-3 rounded-xl border transition-all ${getModifierBgColor(
                      schedule.hourly_modifiers[hour] || 1.0
                    )}`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-2">
                      {getTimeIcon(hour)}
                      <span className="text-xs font-medium">{hour}시</span>
                    </div>
                    <input
                      type="number"
                      min="0.3"
                      max="2.0"
                      step="0.1"
                      value={schedule.hourly_modifiers[hour] || 1.0}
                      onChange={(e) => updateHourlyModifier(hour, parseFloat(e.target.value))}
                      className="w-full bg-white/10 border-none rounded-lg px-2 py-1 text-center text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 mt-6 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-500"></div>
                  <span>고효율 (1.3+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-green-400"></div>
                  <span>효율 (1.1+)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gray-400"></div>
                  <span>기본 (0.9-1.1)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-orange-400"></div>
                  <span>저효율 (0.7-0.9)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-400"></div>
                  <span>최저 (0.7-)</span>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "daily" && schedule && (
            <motion.div
              key="daily"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                요일별 입찰 가중치
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                요일별 가중치는 시간대별 가중치와 곱해져 최종 입찰가에 적용됩니다.
              </p>

              <div className="grid grid-cols-7 gap-4">
                {dayFullNames.map((name, day) => (
                  <div
                    key={day}
                    className={`p-4 rounded-xl border transition-all ${getModifierBgColor(
                      schedule.daily_modifiers[day] || 1.0
                    )}`}
                  >
                    <div className="text-center mb-3">
                      <span className="text-lg font-bold">{dayNames[day]}</span>
                      <p className="text-xs text-gray-400">{name}</p>
                    </div>
                    <input
                      type="range"
                      min="0.3"
                      max="2.0"
                      step="0.1"
                      value={schedule.daily_modifiers[day] || 1.0}
                      onChange={(e) => updateDailyModifier(day, parseFloat(e.target.value))}
                      className="w-full mb-2"
                    />
                    <div className="text-center">
                      <span className="text-xl font-bold">
                        x{(schedule.daily_modifiers[day] || 1.0).toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === "heatmap" && schedule && (
            <motion.div
              key="heatmap"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-blue-400" />
                  주간 입찰 히트맵
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">기준 입찰가:</span>
                  <input
                    type="number"
                    value={baseBid}
                    onChange={(e) => setBaseBid(parseInt(e.target.value) || 1000)}
                    className="w-24 bg-white/10 border border-white/20 rounded-lg px-3 py-1 text-sm"
                  />
                  <span className="text-sm text-gray-400">원</span>
                </div>
              </div>

              {previewData && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th className="p-2 text-left text-sm text-gray-400">시간</th>
                        {dayNames.map((name, i) => (
                          <th key={i} className="p-2 text-center text-sm text-gray-400">
                            {name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...Array(24)].map((_, hour) => (
                        <tr key={hour}>
                          <td className="p-1 text-sm text-gray-400">{hour}:00</td>
                          {previewData.heatmap.map((dayData: any, day: number) => {
                            const hourData = dayData.hours[hour];
                            return (
                              <td key={day} className="p-1">
                                <div
                                  className={`p-2 rounded text-center text-xs transition-all ${getModifierBgColor(
                                    hourData.modifier
                                  )}`}
                                  title={`${dayNames[day]} ${hour}시: ${hourData.adjusted_bid}원 (x${hourData.modifier})`}
                                >
                                  <div className="font-medium">
                                    {hourData.adjusted_bid.toLocaleString()}
                                  </div>
                                  <div className="text-gray-400 text-[10px]">
                                    x{hourData.modifier.toFixed(1)}
                                  </div>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "presets" && (
            <motion.div
              key="presets"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6"
            >
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-400" />
                프리셋 템플릿
              </h2>
              <p className="text-sm text-gray-400 mb-6">
                업종/목적에 맞는 프리셋을 선택하여 빠르게 시간대별 설정을 적용하세요.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(presets).map(([key, preset]) => (
                  <div
                    key={key}
                    className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-blue-500/50 transition-all"
                  >
                    <h3 className="font-semibold mb-2">{preset.name}</h3>
                    <p className="text-sm text-gray-400 mb-4">{preset.description}</p>
                    <button
                      onClick={() => applyPreset(key)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                    >
                      <Check className="w-4 h-4" />
                      적용하기
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-xl p-4"
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 mt-0.5" />
            <div>
              <h3 className="font-medium text-blue-400 mb-1">시간대별 입찰 최적화 TIP</h3>
              <ul className="text-sm text-gray-400 space-y-1">
                <li>
                  - 최소 7일 이상의 성과 데이터가 쌓이면 <strong>자동 최적화</strong>를 사용해보세요.
                </li>
                <li>
                  - 전환이 많이 발생하는 시간대는 입찰을 높이고, 전환이 적은 새벽 시간대는 낮추세요.
                </li>
                <li>
                  - B2B 서비스는 평일 업무시간, B2C는 저녁/주말에 집중하는 것이 효과적입니다.
                </li>
                <li>
                  - 가중치 변경 후 최소 1주일은 성과를 관찰한 후 추가 조정하세요.
                </li>
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
