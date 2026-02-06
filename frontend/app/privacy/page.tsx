'use client'

import Link from 'next/link'
import { ArrowLeft, Lock, Shield } from 'lucide-react'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-500 hover:text-gray-700">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Lock className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-bold">개인정보처리방침</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Company Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800">
            <strong>머프키치</strong>(이하 "회사")는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고
            이와 관련한 고충을 신속하게 처리하기 위하여 다음과 같이 개인정보 처리방침을 수립·공개합니다.
          </p>
        </div>

        {/* Last Updated */}
        <p className="text-sm text-gray-500 mb-6">
          최종 수정일: 2026년 2월 6일 | 시행일: 2026년 2월 6일
        </p>

        {/* Content */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="space-y-6 text-gray-700">
            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-600" />
                1. 수집하는 개인정보 항목
              </h4>
              <p className="mb-2">회사는 다음의 개인정보를 수집합니다:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>필수항목:</strong> 이메일 주소 (회원가입 시)</li>
                <li><strong>자동 수집:</strong> IP 주소, 접속 일시, 서비스 이용 기록, 브라우저 정보</li>
                <li><strong>선택항목:</strong> 블로그 ID, 닉네임</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">2. 개인정보의 수집 및 이용목적</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>서비스 제공 및 계약 이행</li>
                <li>회원 관리 및 본인확인</li>
                <li>서비스 개선 및 맞춤 서비스 제공</li>
                <li>부정 이용 방지 및 보안 강화</li>
                <li>통계 분석 및 서비스 최적화</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">3. 개인정보의 보유 및 이용기간</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>회원 탈퇴 시까지 보유 후 즉시 파기</li>
                <li>단, 관계법령에 의해 보존이 필요한 경우 해당 기간 동안 보존</li>
                <li>접속 로그: 3개월 보관 후 자동 삭제</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">4. 개인정보의 제3자 제공</h4>
              <p className="mb-2">회사는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우 예외로 합니다:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>이용자가 사전에 동의한 경우</li>
                <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">5. 개인정보의 파기절차 및 방법</h4>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>파기절차:</strong> 이용자가 회원가입 등을 위해 입력한 정보는 목적 달성 후 별도의 DB로 옮겨져 내부 방침 및 기타 관련 법령에 따라 일정기간 저장된 후 파기됩니다.</li>
                <li><strong>파기방법:</strong> 전자적 파일 형태의 정보는 복구가 불가능한 방법으로 영구 삭제합니다.</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">6. 이용자의 권리</h4>
              <ul className="list-disc list-inside space-y-1">
                <li>개인정보 열람, 정정, 삭제 요청 권리</li>
                <li>개인정보 처리 정지 요청 권리</li>
                <li>회원 탈퇴를 통한 개인정보 삭제 권리</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">7. 개인정보의 안전성 확보 조치</h4>
              <p className="mb-2">회사는 개인정보의 안전성 확보를 위해 다음과 같은 조치를 취하고 있습니다:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>비밀번호의 암호화 저장 (bcrypt 해시)</li>
                <li>SSL/TLS를 통한 데이터 전송 암호화</li>
                <li>접근 권한 관리 및 접근 통제</li>
                <li>개인정보 취급 직원의 최소화</li>
              </ul>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">8. 개인정보 보호책임자</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="mb-2">개인정보 처리에 관한 문의사항은 아래로 연락주시기 바랍니다.</p>
                <ul className="space-y-1 text-sm">
                  <li><strong>회사명:</strong> 머프키치</li>
                  <li><strong>개인정보 보호책임자:</strong> 대표</li>
                  <li><strong>이메일:</strong> <a href="mailto:lhs0609c@naver.com" className="text-blue-600 hover:underline">lhs0609c@naver.com</a></li>
                  <li><strong>전화:</strong> <a href="tel:010-8465-0609" className="text-blue-600 hover:underline">010-8465-0609</a></li>
                  <li><strong>주소:</strong> 경기도 의왕시 백운호수로6길 4, 202호(학의동)</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">9. 개인정보 처리방침 변경</h4>
              <p>
                본 개인정보처리방침은 법령 및 방침에 따라 변경될 수 있으며, 변경 시 웹사이트를 통해 공지합니다.
                이 개인정보처리방침은 2026년 2월 6일부터 적용됩니다.
              </p>
            </section>
          </div>
        </div>

        {/* Other Links */}
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/terms" className="text-sm text-blue-600 hover:underline">
            전체 이용약관 보기
          </Link>
          <Link href="/refund-policy" className="text-sm text-blue-600 hover:underline">
            환불정책 보기
          </Link>
        </div>

        {/* Contact */}
        <div className="mt-8 bg-gray-100 rounded-xl p-6">
          <h3 className="font-semibold mb-2">문의사항</h3>
          <p className="text-sm text-gray-600">
            개인정보 처리에 관한 문의사항이 있으시면 아래로 연락해 주세요.
          </p>
          <p className="text-sm text-blue-600 mt-2">lhs0609c@naver.com</p>
        </div>
      </div>
    </div>
  )
}
