'use client'

import Link from 'next/link'
import { Building2, ArrowRight, Mic, Sparkles } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-5 gap-8">
          {/* Company Info */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">블랭크</span>
              <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded">v2.0</span>
            </div>
            <p className="text-sm text-gray-400 mb-4 leading-relaxed">
              AI 기반 블로그 분석 플랫폼으로 네이버 블로그의 품질 지수를 정확하게 측정하고,
              상위 노출을 위한 최적화 전략을 제공합니다.
            </p>
          </div>

          {/* 서비스 */}
          <div>
            <h3 className="text-white font-semibold mb-4">서비스</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/analyze" className="hover:text-violet-400 transition-colors">
                  블로그 분석
                </Link>
              </li>
              <li>
                <Link href="/keyword-search" className="hover:text-violet-400 transition-colors">
                  키워드 검색
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-violet-400 transition-colors">
                  대시보드
                </Link>
              </li>
              <li>
                <Link href="/tools" className="hover:text-violet-400 transition-colors">
                  프리미엄 도구
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-violet-400 transition-colors">
                  요금제
                </Link>
              </li>
            </ul>
          </div>

          {/* 플라톤마케팅 */}
          <div>
            <h3 className="text-white font-semibold mb-4">플라톤마케팅</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="hover:text-violet-400 transition-colors flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  병원마케팅 전문
                </a>
              </li>
              <li>
                <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="hover:text-violet-400 transition-colors flex items-center gap-2">
                  <ArrowRight className="w-4 h-4" />
                  무료 상담 신청
                </a>
              </li>
              <li>
                <a href="https://doctor-voice-pro-ghwi.vercel.app/" target="_blank" rel="noopener noreferrer" className="hover:text-cyan-400 transition-colors flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  AI 자동 글쓰기
                </a>
              </li>
            </ul>
          </div>

          {/* 고객지원 */}
          <div>
            <h3 className="text-white font-semibold mb-4">고객지원</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/terms" className="hover:text-violet-400 transition-colors">
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-violet-400 transition-colors">
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-violet-400 transition-colors">
                  환불정책
                </Link>
              </li>
              <li>
                <a href="mailto:lhs0609c@naver.com" className="hover:text-violet-400 transition-colors">
                  문의하기
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Business Info - Required for Toss Payments */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>상호명:</strong> 머프키치</span>
              <span><strong>사업자등록번호:</strong> 401-20-84647</span>
              <span><strong>통신판매업신고:</strong> 제2025-고양덕양구-1770호</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span><strong>주소:</strong> 경기도 의왕시 백운호수로6길 4, 202호(학의동)</span>
              <span><strong>전화:</strong> <a href="tel:010-8465-0609" className="hover:text-gray-300">010-8465-0609</a></span>
              <span><strong>이메일:</strong> <a href="mailto:lhs0609c@naver.com" className="hover:text-gray-300">lhs0609c@naver.com</a></span>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-2 text-xs text-gray-500">
            <p>© 2024{' '}
              <a href="https://www.brandplaton.com/" target="_blank" rel="noopener noreferrer" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
                플라톤마케팅
              </a>
              . All rights reserved.
            </p>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-gray-300">이용약관</Link>
              <Link href="/privacy" className="hover:text-gray-300">개인정보처리방침</Link>
              <a href="mailto:lhs0609c@naver.com" className="hover:text-gray-300">lhs0609c@naver.com</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
