'use client'

import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Company Info */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-xl font-bold text-white">블랭크</span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              AI 기반 블로그 분석 플랫폼으로 네이버 블로그의 품질 지수를 정확하게 측정하고,
              상위 노출을 위한 최적화 전략을 제공합니다.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">서비스</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/pricing" className="hover:text-white transition-colors">
                  요금제
                </Link>
              </li>
              <li>
                <Link href="/keyword-search" className="hover:text-white transition-colors">
                  키워드 분석
                </Link>
              </li>
              <li>
                <Link href="/analyze" className="hover:text-white transition-colors">
                  블로그 분석
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-white transition-colors">
                  대시보드
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">고객지원</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  이용약관
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-white transition-colors">
                  환불정책
                </Link>
              </li>
              <li>
                <a href="mailto:lhs0609c@naver.com" className="hover:text-white transition-colors">
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
              <span><strong>대표자:</strong> 양보름</span>
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
            <p>© 2024 머프키치. All rights reserved.</p>
            <div className="flex gap-4">
              <Link href="/terms" className="hover:text-gray-300">이용약관</Link>
              <Link href="/terms" className="hover:text-gray-300">개인정보처리방침</Link>
              <Link href="/refund-policy" className="hover:text-gray-300">환불정책</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
