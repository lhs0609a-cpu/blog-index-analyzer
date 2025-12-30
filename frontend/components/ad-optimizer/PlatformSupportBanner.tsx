"use client";

import Link from "next/link";
import { Info, ExternalLink, CheckCircle, XCircle, AlertCircle } from "lucide-react";

interface PlatformSupport {
  id: string;
  name: string;
  icon: string;
  supported: boolean;
  comingSoon?: boolean;
  features?: string[];
}

interface PlatformSupportBannerProps {
  title: string;
  description: string;
  platforms: PlatformSupport[];
  showGuideLink?: boolean;
  className?: string;
}

// 플랫폼별 가이드 ID 매핑
const PLATFORM_GUIDE_MAP: Record<string, string> = {
  naver: "naver_searchad",
  google: "google_ads",
  meta: "meta_ads",
  kakao: "kakao_moment",
  tiktok: "tiktok_ads",
  coupang: "coupang_ads",
  criteo: "criteo",
};

export function PlatformSupportBanner({
  title,
  description,
  platforms,
  showGuideLink = true,
  className = "",
}: PlatformSupportBannerProps) {
  const supportedPlatforms = platforms.filter((p) => p.supported);
  const comingSoonPlatforms = platforms.filter((p) => p.comingSoon);

  return (
    <div className={`bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-5 mb-6 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <Info className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-white">{title}</h3>
          <p className="text-sm text-gray-300 mt-1">{description}</p>
        </div>
      </div>

      {/* Supported Platforms */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">지원 플랫폼</div>
        <div className="flex flex-wrap gap-2">
          {supportedPlatforms.map((platform) => (
            <div
              key={platform.id}
              className="flex items-center gap-2 bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-1.5"
            >
              <span className="text-lg">{platform.icon}</span>
              <span className="text-sm text-green-400">{platform.name}</span>
              <CheckCircle className="w-4 h-4 text-green-400" />
            </div>
          ))}
        </div>
      </div>

      {/* Coming Soon Platforms */}
      {comingSoonPlatforms.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-2">준비 중</div>
          <div className="flex flex-wrap gap-2">
            {comingSoonPlatforms.map((platform) => (
              <div
                key={platform.id}
                className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-1.5"
              >
                <span className="text-lg opacity-60">{platform.icon}</span>
                <span className="text-sm text-yellow-500/80">{platform.name}</span>
                <AlertCircle className="w-4 h-4 text-yellow-500/80" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Guide Links */}
      {showGuideLink && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-600">
          <span className="text-xs text-gray-400 mr-2 self-center">연동 가이드:</span>
          {supportedPlatforms.map((platform) => {
            const guideId = PLATFORM_GUIDE_MAP[platform.id];
            if (!guideId) return null;
            return (
              <Link
                key={platform.id}
                href={`/ad-optimizer/setup-guide?platform=${guideId}`}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded"
              >
                <span>{platform.icon}</span>
                <span>{platform.name}</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// 기능별 플랫폼 지원 데이터
export const FEATURE_PLATFORMS = {
  anomalyDetection: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
    { id: "google", name: "구글", icon: "🔵", supported: true },
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "kakao", name: "카카오", icon: "💛", supported: true },
    { id: "tiktok", name: "틱톡", icon: "🎵", supported: false, comingSoon: true },
  ],
  hourlyBidding: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
    { id: "google", name: "구글", icon: "🔵", supported: true },
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "kakao", name: "카카오", icon: "💛", supported: true },
  ],
  budgetReallocation: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
    { id: "google", name: "구글", icon: "🔵", supported: true },
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "kakao", name: "카카오", icon: "💛", supported: true },
    { id: "coupang", name: "쿠팡", icon: "🛒", supported: true },
  ],
  creativeFatigue: [
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "tiktok", name: "틱톡", icon: "🎵", supported: true },
    { id: "google", name: "구글 디스플레이", icon: "🔵", supported: false, comingSoon: true },
  ],
  naverQuality: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
  ],
  googleQuality: [
    { id: "google", name: "구글", icon: "🔵", supported: true },
  ],
  budgetPacing: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
    { id: "google", name: "구글", icon: "🔵", supported: true },
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "kakao", name: "카카오", icon: "💛", supported: true },
    { id: "tiktok", name: "틱톡", icon: "🎵", supported: true },
  ],
  funnelBidding: [
    { id: "naver", name: "네이버", icon: "🟢", supported: true },
    { id: "google", name: "구글", icon: "🔵", supported: true },
    { id: "meta", name: "메타", icon: "🔷", supported: true },
    { id: "kakao", name: "카카오", icon: "💛", supported: true },
    { id: "tiktok", name: "틱톡", icon: "🎵", supported: true },
  ],
};

// 기능별 설명
export const FEATURE_DESCRIPTIONS = {
  anomalyDetection: {
    title: "지원 플랫폼",
    description: "CPC/CTR/전환율 등 주요 지표의 이상 변동을 실시간으로 감지하고 알림을 제공합니다.",
  },
  hourlyBidding: {
    title: "지원 플랫폼",
    description: "시간대별/요일별 입찰 가중치를 설정하여 고효율 시간대에 광고 노출을 집중합니다.",
  },
  budgetReallocation: {
    title: "지원 플랫폼",
    description: "여러 플랫폼의 성과를 비교 분석하여 고효율 플랫폼에 예산을 집중 배분합니다.",
  },
  creativeFatigue: {
    title: "지원 플랫폼",
    description: "광고 크리에이티브의 피로도를 분석하여 최적의 교체 시점을 추천합니다.",
  },
  naverQuality: {
    title: "지원 플랫폼",
    description: "네이버 검색광고 품질지수를 분석하고 CPC 절감을 위한 개선점을 제안합니다.",
  },
  budgetPacing: {
    title: "지원 플랫폼",
    description: "일/월 예산을 효율적으로 분배하여 예산 소진을 최적화합니다.",
  },
  funnelBidding: {
    title: "지원 플랫폼",
    description: "TOFU/MOFU/BOFU 퍼널 단계별로 최적의 입찰 전략을 제안합니다.",
  },
};
