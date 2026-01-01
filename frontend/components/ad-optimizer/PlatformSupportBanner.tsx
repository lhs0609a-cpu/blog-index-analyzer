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

// 플랫폼별 브랜드 컬러 및 스타일 정의
export const PLATFORM_STYLES: Record<string, {
  name: string;
  icon: string;
  bgGradient: string;
  bgSolid: string;
  borderColor: string;
  textColor: string;
  accentColor: string;
  hoverBg: string;
  badgeBg: string;
  badgeText: string;
  iconBg: string;
  supportedBg: string;
  supportedBorder: string;
  supportedText: string;
  comingSoonBg: string;
  comingSoonBorder: string;
  comingSoonText: string;
}> = {
  naver: {
    name: "네이버",
    icon: "🟢",
    bgGradient: "bg-gradient-to-r from-[#03C75A]/20 to-[#03C75A]/5",
    bgSolid: "bg-[#03C75A]",
    borderColor: "border-[#03C75A]/30",
    textColor: "text-[#03C75A]",
    accentColor: "#03C75A",
    hoverBg: "hover:bg-[#03C75A]/10",
    badgeBg: "bg-[#03C75A]/20",
    badgeText: "text-[#03C75A]",
    iconBg: "bg-[#03C75A]/20",
    supportedBg: "bg-[#03C75A]/20",
    supportedBorder: "border-[#03C75A]/30",
    supportedText: "text-[#03C75A]",
    comingSoonBg: "bg-[#03C75A]/10",
    comingSoonBorder: "border-[#03C75A]/20",
    comingSoonText: "text-[#03C75A]/70",
  },
  google: {
    name: "구글",
    icon: "🔵",
    bgGradient: "bg-gradient-to-r from-[#4285F4]/20 via-[#34A853]/10 to-[#EA4335]/10",
    bgSolid: "bg-[#4285F4]",
    borderColor: "border-[#4285F4]/30",
    textColor: "text-[#4285F4]",
    accentColor: "#4285F4",
    hoverBg: "hover:bg-[#4285F4]/10",
    badgeBg: "bg-[#4285F4]/20",
    badgeText: "text-[#4285F4]",
    iconBg: "bg-gradient-to-br from-[#4285F4] via-[#EA4335] to-[#FBBC05]",
    supportedBg: "bg-[#4285F4]/20",
    supportedBorder: "border-[#4285F4]/30",
    supportedText: "text-[#4285F4]",
    comingSoonBg: "bg-[#4285F4]/10",
    comingSoonBorder: "border-[#4285F4]/20",
    comingSoonText: "text-[#4285F4]/70",
  },
  meta: {
    name: "메타",
    icon: "🔷",
    bgGradient: "bg-gradient-to-r from-[#0866FF]/20 to-[#A033FF]/10",
    bgSolid: "bg-[#0866FF]",
    borderColor: "border-[#0866FF]/30",
    textColor: "text-[#0866FF]",
    accentColor: "#0866FF",
    hoverBg: "hover:bg-[#0866FF]/10",
    badgeBg: "bg-[#0866FF]/20",
    badgeText: "text-[#0866FF]",
    iconBg: "bg-gradient-to-br from-[#0866FF] to-[#A033FF]",
    supportedBg: "bg-[#0866FF]/20",
    supportedBorder: "border-[#0866FF]/30",
    supportedText: "text-[#0866FF]",
    comingSoonBg: "bg-[#0866FF]/10",
    comingSoonBorder: "border-[#0866FF]/20",
    comingSoonText: "text-[#0866FF]/70",
  },
  kakao: {
    name: "카카오",
    icon: "💛",
    bgGradient: "bg-gradient-to-r from-[#FEE500]/30 to-[#FEE500]/10",
    bgSolid: "bg-[#FEE500]",
    borderColor: "border-[#FEE500]/50",
    textColor: "text-[#3C1E1E]",
    accentColor: "#FEE500",
    hoverBg: "hover:bg-[#FEE500]/20",
    badgeBg: "bg-[#FEE500]/30",
    badgeText: "text-[#3C1E1E]",
    iconBg: "bg-[#FEE500]",
    supportedBg: "bg-[#FEE500]/30",
    supportedBorder: "border-[#FEE500]/50",
    supportedText: "text-[#FEE500]",
    comingSoonBg: "bg-[#FEE500]/10",
    comingSoonBorder: "border-[#FEE500]/30",
    comingSoonText: "text-[#FEE500]/70",
  },
  tiktok: {
    name: "틱톡",
    icon: "🎵",
    bgGradient: "bg-gradient-to-r from-[#00F2EA]/20 via-black/30 to-[#FF0050]/20",
    bgSolid: "bg-black",
    borderColor: "border-[#00F2EA]/30",
    textColor: "text-[#00F2EA]",
    accentColor: "#00F2EA",
    hoverBg: "hover:bg-[#00F2EA]/10",
    badgeBg: "bg-gradient-to-r from-[#00F2EA]/20 to-[#FF0050]/20",
    badgeText: "text-[#00F2EA]",
    iconBg: "bg-gradient-to-br from-[#00F2EA] via-black to-[#FF0050]",
    supportedBg: "bg-gradient-to-r from-[#00F2EA]/20 to-[#FF0050]/20",
    supportedBorder: "border-[#00F2EA]/30",
    supportedText: "text-[#00F2EA]",
    comingSoonBg: "bg-[#00F2EA]/10",
    comingSoonBorder: "border-[#00F2EA]/20",
    comingSoonText: "text-[#00F2EA]/70",
  },
  coupang: {
    name: "쿠팡",
    icon: "🛒",
    bgGradient: "bg-gradient-to-r from-[#E81E25]/20 to-[#E81E25]/5",
    bgSolid: "bg-[#E81E25]",
    borderColor: "border-[#E81E25]/30",
    textColor: "text-[#E81E25]",
    accentColor: "#E81E25",
    hoverBg: "hover:bg-[#E81E25]/10",
    badgeBg: "bg-[#E81E25]/20",
    badgeText: "text-[#E81E25]",
    iconBg: "bg-[#E81E25]",
    supportedBg: "bg-[#E81E25]/20",
    supportedBorder: "border-[#E81E25]/30",
    supportedText: "text-[#E81E25]",
    comingSoonBg: "bg-[#E81E25]/10",
    comingSoonBorder: "border-[#E81E25]/20",
    comingSoonText: "text-[#E81E25]/70",
  },
  criteo: {
    name: "크리테오",
    icon: "🔶",
    bgGradient: "bg-gradient-to-r from-[#FF6B00]/20 to-[#FF6B00]/5",
    bgSolid: "bg-[#FF6B00]",
    borderColor: "border-[#FF6B00]/30",
    textColor: "text-[#FF6B00]",
    accentColor: "#FF6B00",
    hoverBg: "hover:bg-[#FF6B00]/10",
    badgeBg: "bg-[#FF6B00]/20",
    badgeText: "text-[#FF6B00]",
    iconBg: "bg-[#FF6B00]",
    supportedBg: "bg-[#FF6B00]/20",
    supportedBorder: "border-[#FF6B00]/30",
    supportedText: "text-[#FF6B00]",
    comingSoonBg: "bg-[#FF6B00]/10",
    comingSoonBorder: "border-[#FF6B00]/20",
    comingSoonText: "text-[#FF6B00]/70",
  },
};

// 플랫폼별 SVG 로고
export const PLATFORM_LOGOS: Record<string, React.ReactNode> = {
  naver: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  ),
  meta: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12.001 2.002c-5.522 0-9.999 4.477-9.999 9.999 0 4.99 3.656 9.126 8.437 9.879v-6.988h-2.54v-2.891h2.54V9.798c0-2.508 1.493-3.891 3.776-3.891 1.094 0 2.24.195 2.24.195v2.459h-1.264c-1.24 0-1.628.772-1.628 1.563v1.875h2.771l-.443 2.891h-2.328v6.988c4.78-.753 8.437-4.889 8.437-9.879 0-5.522-4.477-9.999-9.999-9.999z"/>
    </svg>
  ),
  kakao: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 01-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3z"/>
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1-.1z"/>
    </svg>
  ),
  coupang: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
  criteo: (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <circle cx="12" cy="12" r="10"/>
    </svg>
  ),
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

      {/* Supported Platforms - 플랫폼별 고유 스타일 적용 */}
      <div className="mb-4">
        <div className="text-xs text-gray-400 mb-2">지원 플랫폼</div>
        <div className="flex flex-wrap gap-2">
          {supportedPlatforms.map((platform) => {
            const style = PLATFORM_STYLES[platform.id] || {
              supportedBg: "bg-green-500/20",
              supportedBorder: "border-green-500/30",
              supportedText: "text-green-400",
            };
            return (
              <div
                key={platform.id}
                className={`flex items-center gap-2 ${style.supportedBg} border ${style.supportedBorder} rounded-lg px-3 py-1.5 transition-all hover:scale-105`}
              >
                <span className="text-lg">{platform.icon}</span>
                <span className={`text-sm ${style.supportedText} font-medium`}>{platform.name}</span>
                <CheckCircle className={`w-4 h-4 ${style.supportedText}`} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Coming Soon Platforms - 플랫폼별 고유 스타일 적용 */}
      {comingSoonPlatforms.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-gray-400 mb-2">준비 중</div>
          <div className="flex flex-wrap gap-2">
            {comingSoonPlatforms.map((platform) => {
              const style = PLATFORM_STYLES[platform.id] || {
                comingSoonBg: "bg-yellow-500/10",
                comingSoonBorder: "border-yellow-500/20",
                comingSoonText: "text-yellow-500/80",
              };
              return (
                <div
                  key={platform.id}
                  className={`flex items-center gap-2 ${style.comingSoonBg} border ${style.comingSoonBorder} rounded-lg px-3 py-1.5 opacity-70`}
                >
                  <span className="text-lg opacity-60">{platform.icon}</span>
                  <span className={`text-sm ${style.comingSoonText}`}>{platform.name}</span>
                  <AlertCircle className={`w-4 h-4 ${style.comingSoonText}`} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Guide Links - 플랫폼별 스타일 적용 */}
      {showGuideLink && (
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-600">
          <span className="text-xs text-gray-400 mr-2 self-center">연동 가이드:</span>
          {supportedPlatforms.map((platform) => {
            const guideId = PLATFORM_GUIDE_MAP[platform.id];
            const style = PLATFORM_STYLES[platform.id];
            if (!guideId) return null;
            return (
              <Link
                key={platform.id}
                href={`/ad-optimizer/setup-guide?platform=${guideId}`}
                className={`flex items-center gap-1 text-xs ${style?.textColor || 'text-blue-400'} ${style?.hoverBg || 'hover:bg-blue-500/10'} ${style?.badgeBg || 'bg-blue-500/10'} px-2 py-1 rounded transition-all hover:scale-105`}
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

// 플랫폼별 카드 컴포넌트
interface PlatformCardProps {
  platformId: string;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
  showLogo?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PlatformCard({
  platformId,
  title,
  description,
  children,
  className = "",
  showLogo = true,
  size = 'md',
}: PlatformCardProps) {
  const style = PLATFORM_STYLES[platformId];
  const logo = PLATFORM_LOGOS[platformId];

  if (!style) return null;

  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div className={`${style.bgGradient} border ${style.borderColor} rounded-xl ${sizeClasses[size]} ${className} transition-all hover:shadow-lg`}>
      <div className="flex items-center gap-3 mb-3">
        {showLogo && (
          <div className={`${style.iconBg} p-2 rounded-lg ${style.textColor}`}>
            {logo}
          </div>
        )}
        <div>
          <h4 className={`font-semibold ${style.textColor}`}>
            {title || style.name}
          </h4>
          {description && (
            <p className="text-sm text-gray-400 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

// 플랫폼 선택 버튼 컴포넌트
interface PlatformSelectButtonProps {
  platformId: string;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function PlatformSelectButton({
  platformId,
  selected = false,
  onClick,
  disabled = false,
  size = 'md',
}: PlatformSelectButtonProps) {
  const style = PLATFORM_STYLES[platformId];
  const logo = PLATFORM_LOGOS[platformId];

  if (!style) return null;

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-3 py-2 text-sm gap-2',
    lg: 'px-4 py-3 text-base gap-2.5',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center ${sizeClasses[size]} rounded-lg font-medium transition-all
        ${selected
          ? `${style.bgSolid} text-white shadow-lg scale-105`
          : `${style.badgeBg} ${style.textColor} ${style.hoverBg} border ${style.borderColor}`
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
      `}
    >
      <span className={iconSizes[size]}>{logo}</span>
      <span>{style.name}</span>
      {selected && <CheckCircle className={`${iconSizes[size]} ml-1`} />}
    </button>
  );
}

// 플랫폼별 배지 컴포넌트
interface PlatformBadgeProps {
  platformId: string;
  showIcon?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

export function PlatformBadge({
  platformId,
  showIcon = true,
  size = 'sm',
}: PlatformBadgeProps) {
  const style = PLATFORM_STYLES[platformId];

  if (!style) return null;

  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] gap-1',
    sm: 'px-2 py-1 text-xs gap-1.5',
    md: 'px-3 py-1.5 text-sm gap-2',
  };

  return (
    <span className={`inline-flex items-center ${sizeClasses[size]} ${style.badgeBg} ${style.badgeText} rounded-full font-medium`}>
      {showIcon && <span>{style.icon}</span>}
      <span>{style.name}</span>
    </span>
  );
}

// 플랫폼 탭 네비게이션 컴포넌트
interface PlatformTabsProps {
  platforms: string[];
  activeTab: string;
  onTabChange: (platformId: string) => void;
  className?: string;
}

export function PlatformTabs({
  platforms,
  activeTab,
  onTabChange,
  className = "",
}: PlatformTabsProps) {
  return (
    <div className={`flex gap-2 p-1 bg-slate-800/50 rounded-xl ${className}`}>
      {platforms.map((platformId) => {
        const style = PLATFORM_STYLES[platformId];
        if (!style) return null;
        const isActive = activeTab === platformId;

        return (
          <button
            key={platformId}
            onClick={() => onTabChange(platformId)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
              ${isActive
                ? `${style.bgSolid} text-white shadow-md`
                : `text-gray-400 hover:text-white ${style.hoverBg}`
              }
            `}
          >
            <span className="text-lg">{style.icon}</span>
            <span>{style.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// 플랫폼별 스탯 카드 컴포넌트
interface PlatformStatCardProps {
  platformId: string;
  label: string;
  value: string | number;
  change?: number;
  icon?: React.ReactNode;
}

export function PlatformStatCard({
  platformId,
  label,
  value,
  change,
  icon,
}: PlatformStatCardProps) {
  const style = PLATFORM_STYLES[platformId];

  if (!style) return null;

  return (
    <div className={`${style.bgGradient} border ${style.borderColor} rounded-xl p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">{label}</span>
        {icon && (
          <div className={`${style.iconBg} p-1.5 rounded-lg ${style.textColor}`}>
            {icon}
          </div>
        )}
      </div>
      <div className={`text-2xl font-bold ${style.textColor}`}>{value}</div>
      {change !== undefined && (
        <div className={`text-sm mt-1 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
        </div>
      )}
    </div>
  );
}
