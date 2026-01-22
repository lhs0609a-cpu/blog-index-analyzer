'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  Zap, TrendingUp, Target, Clock, DollarSign, Users,
  CheckCircle, XCircle, ArrowRight, Star, Play, Shield,
  BarChart3, Search, Award, ChevronDown, Sparkles,
  AlertTriangle, Brain, Rocket, Gift, Crown, Timer
} from 'lucide-react';

// ============ HERO SECTION ============
function HeroSection() {
  const [displayNumber, setDisplayNumber] = useState(0);
  const targetNumber = 47382;

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = targetNumber / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += increment;
      if (current >= targetNumber) {
        setDisplayNumber(targetNumber);
        clearInterval(timer);
      } else {
        setDisplayNumber(Math.floor(current));
      }
    }, duration / steps);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-blue-500/10 to-transparent rounded-full" />
      </div>

      {/* Floating Stats */}
      <div className="absolute top-32 right-10 hidden lg:block">
        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1 }}
          className="bg-white/10 backdrop-blur-lg rounded-2xl p-4 border border-white/20"
        >
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            실시간 분석 중
          </div>
          <p className="text-white font-bold text-2xl mt-1">{displayNumber.toLocaleString()}명</p>
          <p className="text-gray-400 text-xs">오늘 블로그 분석 완료</p>
        </motion.div>
      </div>

      <div className="relative max-w-7xl mx-auto px-4 pt-24 pb-20">
        {/* Urgency Banner */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-8"
        >
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-full px-4 py-2">
            <Timer className="w-4 h-4 text-orange-400" />
            <span className="text-orange-300 text-sm font-medium">
              얼리버드 특가 마감까지 <span className="font-bold text-orange-400">D-3</span> |
              <span className="text-white font-bold ml-1">50% 할인</span>
            </span>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="text-center max-w-5xl mx-auto">
          {/* Pain Point Hook - 3초 안에 시선 강탈 */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-blue-400 text-lg md:text-xl font-medium mb-4">
              아직도 블로그 노출 안 된다고 밤새 키워드 찾고 계세요?
            </p>
          </motion.div>

          {/* H1 - 자극적인 헤드라인 */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-4xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6"
          >
            당신 블로그가
            <br />
            <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-green-400 bg-clip-text text-transparent">
              상위 노출 못 하는 이유,
            </span>
            <br />
            <span className="text-yellow-400">3분이면</span> 알려드립니다
          </motion.h1>

          {/* Sub Copy - 구체적 이득 */}
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto leading-relaxed"
          >
            상위 1% 블로거들만 알던 <strong className="text-white">블로그 지수 분석</strong>을
            <br className="hidden md:block" />
            AI가 <strong className="text-cyan-400">무료로</strong> 진단해드립니다
          </motion.p>

          {/* Social Proof Micro */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="flex items-center justify-center gap-4 mb-10"
          >
            <div className="flex -space-x-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 border-2 border-slate-900 flex items-center justify-center text-white text-xs font-bold"
                >
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
                <span className="text-white font-bold ml-1">4.9</span>
              </div>
              <p className="text-gray-400 text-sm">52,341명이 이미 사용 중</p>
            </div>
          </motion.div>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/analyze"
              className="group relative px-10 py-5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl text-white font-bold text-xl shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105"
            >
              <span className="flex items-center gap-2">
                <Zap className="w-6 h-6" />
                내 블로그 무료 진단받기
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
              <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full animate-bounce">
                무료
              </span>
            </Link>
            <button className="flex items-center gap-2 px-8 py-5 text-gray-300 hover:text-white transition-colors">
              <Play className="w-5 h-5" />
              2분 데모 영상 보기
            </button>
          </motion.div>

          {/* Trust Badges */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-10 flex items-center justify-center gap-6 text-gray-500 text-sm"
          >
            <span className="flex items-center gap-1">
              <Shield className="w-4 h-4" />
              카드 정보 필요 없음
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              3분 만에 결과 확인
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              가입 없이 바로 시작
            </span>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-8 h-8 text-gray-500 animate-bounce" />
        </motion.div>
      </div>
    </section>
  );
}

// ============ PROBLEM SECTION (Pain Agitation) ============
function ProblemSection() {
  const problems = [
    {
      icon: <Clock className="w-8 h-8" />,
      title: "매일 3시간씩 키워드 리서치",
      desc: "검색량 높은 키워드 찾느라 밤새 네이버 뒤지고 계시죠?",
      loss: "연간 1,095시간 낭비"
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: "노출 순위가 왜 떨어지는지 모름",
      desc: "어제까지 1페이지였는데 갑자기 10페이지로... 이유를 모르겠다고요?",
      loss: "월 방문자 -87% 급감"
    },
    {
      icon: <Target className="w-8 h-8" />,
      title: "경쟁 블로그 분석? 감으로 하는 중",
      desc: "상위 노출 블로그가 뭘 잘하는지 알면 따라할 텐데...",
      loss: "수익 기회 매달 놓침"
    },
    {
      icon: <AlertTriangle className="w-8 h-8" />,
      title: "저품질 블로그 낙인 공포",
      desc: "열심히 썼는데 갑자기 저품질? 복구 방법도 모르겠고...",
      loss: "6개월 노력 물거품"
    }
  ];

  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-6xl mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-red-500/20 text-red-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
            지금 당신의 상황
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            혹시 이런 고민
            <span className="text-red-400"> 있으신가요?</span>
          </h2>
          <p className="text-gray-400 text-lg">
            블로그 마케팅, 이렇게 어렵게 하실 필요 없습니다
          </p>
        </motion.div>

        {/* Problem Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {problems.map((problem, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-gradient-to-br from-red-950/50 to-slate-900 border border-red-900/30 rounded-2xl p-6 hover:border-red-500/50 transition-all group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-500/20 rounded-xl text-red-400 group-hover:bg-red-500/30 transition-colors">
                  {problem.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-white mb-2">{problem.title}</h3>
                  <p className="text-gray-400 mb-3">{problem.desc}</p>
                  <div className="inline-flex items-center gap-2 bg-red-500/10 text-red-400 px-3 py-1 rounded-full text-sm">
                    <XCircle className="w-4 h-4" />
                    {problem.loss}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Agitation */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-16 text-center"
        >
          <div className="inline-block bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-2xl p-8 max-w-3xl">
            <p className="text-2xl md:text-3xl text-white font-bold leading-relaxed">
              "이대로 계속하면 1년 후에도
              <br />
              <span className="text-red-400">똑같은 고민</span>을 하고 있을 겁니다"
            </p>
            <p className="text-gray-400 mt-4">
              상위 노출 블로거들은 이미 데이터 기반으로 움직이고 있습니다
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============ SOLUTION SECTION ============
function SolutionSection() {
  const features = [
    {
      icon: <Brain className="w-10 h-10" />,
      title: "AI 블로그 지수 분석",
      desc: "C-Rank, D.I.A 등 숨겨진 블로그 지수를 AI가 실시간 분석. 내 블로그가 왜 노출이 안 되는지 원인을 콕 집어드립니다.",
      metric: "정확도 94.7%",
      color: "blue"
    },
    {
      icon: <Search className="w-10 h-10" />,
      title: "황금 키워드 발굴",
      desc: "검색량은 높고 경쟁은 낮은 '블루오션 키워드'를 자동으로 찾아드립니다. 더 이상 감으로 키워드 찾지 마세요.",
      metric: "월 50개+ 추천",
      color: "cyan"
    },
    {
      icon: <BarChart3 className="w-10 h-10" />,
      title: "경쟁 블로그 역분석",
      desc: "상위 노출 블로그가 어떤 전략을 쓰는지 낱낱이 분석해드립니다. 그대로 따라만 하세요.",
      metric: "상위 20개 분석",
      color: "green"
    },
    {
      icon: <Zap className="w-10 h-10" />,
      title: "AI 광고 자동 최적화",
      desc: "1분마다 입찰가를 자동 조정. 잠자는 동안에도 ROAS 342% 달성. 광고비 38% 절감.",
      metric: "평균 ROAS 342%",
      color: "yellow"
    }
  ];

  const colorClasses: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-600/10 border-blue-500/30 text-blue-400",
    cyan: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30 text-cyan-400",
    green: "from-green-500/20 to-green-600/10 border-green-500/30 text-green-400",
    yellow: "from-yellow-500/20 to-yellow-600/10 border-yellow-500/30 text-yellow-400"
  };

  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-slate-900">
      <div className="max-w-6xl mx-auto px-4">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-green-500/20 text-green-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
            해결책
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            블랭크 하나면
            <span className="text-green-400"> 전부 해결</span>됩니다
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            52,341명의 블로거가 블랭크로 상위 노출에 성공했습니다
          </p>
        </motion.div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className={`bg-gradient-to-br ${colorClasses[feature.color]} border rounded-2xl p-8 hover:scale-[1.02] transition-all`}
            >
              <div className={`p-4 bg-${feature.color}-500/20 rounded-xl w-fit mb-4`}>
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
              <p className="text-gray-300 mb-4 leading-relaxed">{feature.desc}</p>
              <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-white font-medium">{feature.metric}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ COMPARISON SECTION ============
function ComparisonSection() {
  return (
    <section className="py-24 bg-slate-900">
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            왜 <span className="text-blue-400">블랭크</span>인가요?
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6"
        >
          {/* Before */}
          <div className="bg-gradient-to-br from-red-950/30 to-slate-900 border border-red-900/30 rounded-2xl p-8">
            <div className="flex items-center gap-2 text-red-400 mb-6">
              <XCircle className="w-6 h-6" />
              <span className="font-bold text-xl">기존 방식</span>
            </div>
            <ul className="space-y-4">
              {[
                "매일 3시간+ 키워드 리서치",
                "블로그 지수? 감으로 추측",
                "경쟁 분석 수동으로 일일이",
                "광고비 태우고 결과는 복불복",
                "저품질 예방? 방법을 모름",
                "월 100만원+ 마케팅 대행료"
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-3 text-gray-400">
                  <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* After */}
          <div className="bg-gradient-to-br from-green-950/30 to-slate-900 border border-green-500/30 rounded-2xl p-8 relative">
            <div className="absolute -top-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              추천
            </div>
            <div className="flex items-center gap-2 text-green-400 mb-6">
              <CheckCircle className="w-6 h-6" />
              <span className="font-bold text-xl">블랭크 사용 시</span>
            </div>
            <ul className="space-y-4">
              {[
                "클릭 한 번으로 키워드 자동 추천",
                "AI가 블로그 지수 실시간 분석",
                "상위 20개 경쟁 블로그 자동 역분석",
                "AI가 광고 입찰가 1분마다 최적화",
                "저품질 징후 사전 경고 알림",
                "월 9,900원으로 전부 해결"
              ].map((item, idx) => (
                <li key={idx} className="flex items-center gap-3 text-white">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============ TESTIMONIALS SECTION ============
function TestimonialsSection() {
  const testimonials = [
    {
      name: "김민수",
      role: "뷰티 블로거 | 월 방문자 12만",
      content: "진짜 미쳤어요. 3개월째 1페이지 유지 중입니다. 예전에는 운 좋으면 1주일 버텼는데... 블랭크 키워드 추천 그대로 따라했더니 이렇게 됐어요.",
      metric: "노출 순위 1위 → 3개월 유지",
      avatar: "MS"
    },
    {
      name: "이지영",
      role: "요리 블로거 | 협찬 월 8건",
      content: "협찬 제안이 3배 늘었어요. 블로그 지수 분석 보고 부족한 부분 개선했더니 C-Rank가 올라갔고, 광고주들이 먼저 연락 오기 시작했어요.",
      metric: "협찬 제안 3배 증가",
      avatar: "JY"
    },
    {
      name: "박준혁",
      role: "마케터 | 광고대행사 근무",
      content: "광고 관리 시간이 0이 됐어요. AI 자동 최적화 켜놓으면 ROAS가 알아서 오르더라고요. 덕분에 다른 업무에 집중할 수 있게 됐습니다.",
      metric: "광고 관리 시간 0 → ROAS 342%",
      avatar: "JH"
    }
  ];

  return (
    <section className="py-24 bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-6xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-yellow-500/20 text-yellow-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
            실제 후기
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            이미 <span className="text-yellow-400">52,341명</span>이
            <br />
            성과를 증명했습니다
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((testimonial, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6"
            >
              <div className="flex items-center gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <p className="text-gray-300 mb-6 leading-relaxed">"{testimonial.content}"</p>
              <div className="bg-green-500/10 text-green-400 px-3 py-2 rounded-lg text-sm font-medium mb-4">
                {testimonial.metric}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="text-white font-medium">{testimonial.name}</p>
                  <p className="text-gray-500 text-sm">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============ PRICING SECTION ============
function PricingSection() {
  return (
    <section className="py-24 bg-slate-950">
      <div className="max-w-5xl mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="inline-block bg-purple-500/20 text-purple-400 px-4 py-2 rounded-full text-sm font-medium mb-4">
            합리적인 가격
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            커피 한 잔 값으로
            <br />
            <span className="text-purple-400">마케터 1명분</span>의 효율
          </h2>
          <p className="text-gray-400 text-lg">
            마케팅 대행료 월 100만원 vs 블랭크 월 9,900원
          </p>
        </motion.div>

        {/* Price Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-purple-950/50 to-slate-900 border border-purple-500/30 rounded-3xl p-8 md:p-12 relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 bg-gradient-to-l from-purple-500/20 to-transparent w-1/2 h-full" />

          <div className="relative grid md:grid-cols-2 gap-12 items-center">
            {/* Left - Price */}
            <div>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="text-gray-500 line-through text-2xl">₩19,800</span>
                <span className="bg-red-500 text-white text-sm font-bold px-2 py-1 rounded">50% OFF</span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-6xl md:text-7xl font-black text-white">₩9,900</span>
                <span className="text-gray-400 text-xl">/월</span>
              </div>
              <p className="text-gray-400 mb-6">
                하루 <span className="text-white font-bold">330원</span> | 커피 한 잔보다 저렴
              </p>

              <div className="space-y-3 mb-8">
                {[
                  "AI 블로그 지수 무제한 분석",
                  "황금 키워드 월 50개 추천",
                  "경쟁 블로그 역분석",
                  "AI 광고 자동 최적화",
                  "저품질 사전 경고 알림",
                  "24시간 실시간 모니터링"
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-gray-300">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    {item}
                  </div>
                ))}
              </div>

              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-white font-bold text-lg hover:scale-105 transition-transform"
              >
                <Rocket className="w-5 h-5" />
                지금 시작하기
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>

            {/* Right - ROI Calculator */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-green-400" />
                ROI 계산기
              </h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-gray-400">마케팅 대행료 (월)</span>
                  <span className="text-red-400 font-bold">-₩1,000,000</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-gray-400">키워드 리서치 인건비 (월)</span>
                  <span className="text-red-400 font-bold">-₩500,000</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-slate-700">
                  <span className="text-gray-400">광고비 낭비 (월 평균)</span>
                  <span className="text-red-400 font-bold">-₩300,000</span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-white font-bold">블랭크 사용 시 절감액</span>
                  <span className="text-green-400 font-bold text-xl">+₩1,790,100/월</span>
                </div>
              </div>
              <div className="mt-4 p-4 bg-green-500/10 rounded-xl">
                <p className="text-green-400 font-bold text-center">
                  연간 약 <span className="text-2xl">2,148만원</span> 절감
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Guarantee */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 text-center"
        >
          <div className="inline-flex items-center gap-3 bg-slate-800/50 border border-slate-700 rounded-xl px-6 py-4">
            <Shield className="w-8 h-8 text-green-400" />
            <div className="text-left">
              <p className="text-white font-bold">7일 무료 체험 + 환불 보장</p>
              <p className="text-gray-400 text-sm">효과 없으면 100% 환불해 드립니다</p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ============ FINAL CTA SECTION ============
function FinalCTASection() {
  return (
    <section className="py-24 bg-gradient-to-b from-slate-950 to-blue-950 relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">
            아직도 망설이고 계세요?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            지금 이 순간에도 경쟁자들은 데이터로 무장하고 있습니다.
            <br />
            <strong className="text-white">3분 투자</strong>로 내 블로그의 문제점을 먼저 확인해보세요.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Link
              href="/analyze"
              className="group px-10 py-5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl text-white font-bold text-xl shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 transition-all hover:scale-105"
            >
              <span className="flex items-center gap-2">
                지금 바로 무료 분석 시작
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>
          </div>

          <p className="text-gray-500 text-sm">
            카드 정보 필요 없음 | 가입 없이 바로 시작 | 3분 만에 결과 확인
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ============ MAIN PAGE ============
export default function LandingPage() {
  return (
    <main className="bg-slate-950">
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <ComparisonSection />
      <TestimonialsSection />
      <PricingSection />
      <FinalCTASection />
    </main>
  );
}
