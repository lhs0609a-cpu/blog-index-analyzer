'use client'

import Link from 'next/link'
import { ArrowLeft, CreditCard, Calendar, AlertCircle, CheckCircle, Phone, Mail, Clock, Shield, RefreshCw, XCircle } from 'lucide-react'

export default function RefundPolicyPage() {
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
              <CreditCard className="w-6 h-6 text-purple-600" />
              <h1 className="text-xl font-bold">환불 및 결제취소 정책</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Summary Card */}
        <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl p-6 text-white mb-8">
          <h2 className="text-2xl font-bold mb-4">블랭크 환불 정책 요약</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/20 rounded-xl p-4">
              <Calendar className="w-8 h-8 mb-2" />
              <div className="font-bold text-lg">7일 이내</div>
              <div className="text-sm opacity-90">전액 환불 가능</div>
            </div>
            <div className="bg-white/20 rounded-xl p-4">
              <Clock className="w-8 h-8 mb-2" />
              <div className="font-bold text-lg">7일 초과</div>
              <div className="text-sm opacity-90">일할 계산 환불</div>
            </div>
            <div className="bg-white/20 rounded-xl p-4">
              <CheckCircle className="w-8 h-8 mb-2" />
              <div className="font-bold text-lg">3영업일</div>
              <div className="text-sm opacity-90">환불 처리 기간</div>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <p className="text-sm text-gray-500 mb-6">
          최종 수정일: 2024년 12월 22일 | 시행일: 2024년 1월 31일
        </p>

        {/* Main Content */}
        <div className="space-y-8">
          {/* 제1조 서비스 안내 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">1</span>
              제1조 (정기결제 서비스 안내)
            </h3>
            <div className="space-y-4 text-gray-700">
              <p>
                블랭크는 AI 기반 블로그 분석 플랫폼으로, <strong>월간 또는 연간 정기결제</strong> 방식으로 프리미엄 서비스를 제공합니다.
              </p>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-3">서비스 제공 기간</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-semibold">결제 유형</th>
                        <th className="text-left py-2 px-3 font-semibold">서비스 제공 기간</th>
                        <th className="text-left py-2 px-3 font-semibold">자동 갱신</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 px-3">월간 정기결제</td>
                        <td className="py-2 px-3 font-medium text-purple-600">결제일로부터 1개월 (30일)</td>
                        <td className="py-2 px-3">매월 결제일에 자동 갱신</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3">연간 정기결제</td>
                        <td className="py-2 px-3 font-medium text-purple-600">결제일로부터 12개월 (365일)</td>
                        <td className="py-2 px-3">1년 후 결제일에 자동 갱신</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <RefreshCw className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-800 font-semibold mb-1">자동 갱신 안내</p>
                    <p className="text-blue-700 text-sm">
                      정기결제는 서비스 기간 만료일에 등록된 결제수단으로 자동 갱신됩니다.
                      갱신을 원하지 않으시면 <strong>만료일 최소 1일 전</strong>까지 해지 신청해 주세요.
                      해지 후에도 이미 결제된 기간까지는 서비스를 이용하실 수 있습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 제2조 결제 취소 및 환불 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">2</span>
              제2조 (결제 취소 및 환불)
            </h3>
            <div className="space-y-4 text-gray-700">
              <p>
                회사와 구매에 관한 계약을 체결한 회원은 아래와 같이 결제에 대한 취소 및 환불을 요구할 수 있습니다.
              </p>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">환불 시점</th>
                      <th className="px-4 py-3 text-left font-semibold">환불 금액</th>
                      <th className="px-4 py-3 text-left font-semibold">비고</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr>
                      <td className="px-4 py-3">결제 후 7일 이내<br/><span className="text-xs text-gray-500">(청약철회 기간)</span></td>
                      <td className="px-4 py-3 text-green-600 font-semibold">전액 환불</td>
                      <td className="px-4 py-3 text-sm text-gray-500">별도 조건 없음</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">결제 후 7일 초과<br/>~ 이용기간 50% 이내</td>
                      <td className="px-4 py-3">
                        <span className="text-orange-600 font-semibold">일할 계산 환불</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">아래 계산 방식 적용</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3">이용기간 50% 초과</td>
                      <td className="px-4 py-3 text-red-600 font-semibold">환불 불가</td>
                      <td className="px-4 py-3 text-sm text-gray-500">해지만 가능</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h4 className="font-semibold text-purple-800 mb-3">일할 계산 환불 방식</h4>
                <div className="space-y-3 text-sm">
                  <div className="bg-white rounded p-3">
                    <p className="font-medium text-purple-700 mb-1">월간 정기결제 회원</p>
                    <p className="text-gray-700">
                      환불금액 = 결제금액 - (이용일수 × 일일이용료)<br/>
                      <span className="text-gray-500">* 일일이용료 = 월 결제금액 ÷ 30일</span>
                    </p>
                  </div>
                  <div className="bg-white rounded p-3">
                    <p className="font-medium text-purple-700 mb-1">연간 정기결제 회원</p>
                    <p className="text-gray-700">
                      환불금액 = 결제금액 - (이용월수 × 월간요금) - (잔여일수 × 일일이용료)<br/>
                      <span className="text-gray-500">* 연간 결제도 월간 요금 기준으로 계산 후 환불</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 제3조 환불 제한 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">3</span>
              제3조 (환불 제한 사항)
            </h3>
            <div className="space-y-4 text-gray-700">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 mb-2">환불이 제한되는 경우</h4>
                    <ul className="text-sm text-yellow-700 space-y-2">
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>서비스 이용기간의 50%를 초과하여 이용한 경우</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>이벤트, 프로모션 등 특별 할인이 적용된 결제의 경우 (별도 안내된 환불정책 적용)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>서비스 악용, 부정 이용, 이용약관 위반이 확인된 경우</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <span>회원의 귀책사유로 서비스 이용이 제한된 경우</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">회사 귀책사유로 인한 환불</h4>
                <p className="text-sm">
                  다음의 경우 결제금액 전액을 환불해 드립니다:
                </p>
                <ul className="text-sm mt-2 space-y-1">
                  <li>• 회사의 귀책사유로 결제 오류가 발생한 경우</li>
                  <li>• 회사의 귀책사유로 서비스 제공이 불가능한 경우</li>
                  <li>• 결제 후 서비스가 제공되지 않은 경우</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 제4조 환불 신청 방법 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">4</span>
              제4조 (환불 신청 방법)
            </h3>
            <div className="space-y-4 text-gray-700">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="w-5 h-5 text-purple-600" />
                    <span className="font-semibold">이메일 신청</span>
                  </div>
                  <p className="text-sm mb-2">아래 이메일로 환불 신청해 주세요.</p>
                  <a href="mailto:lhs0609c@naver.com" className="text-purple-600 font-medium">
                    lhs0609c@naver.com
                  </a>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Phone className="w-5 h-5 text-purple-600" />
                    <span className="font-semibold">전화 신청</span>
                  </div>
                  <p className="text-sm mb-2">고객센터로 연락해 주세요.</p>
                  <a href="tel:010-8465-0609" className="text-purple-600 font-medium">
                    010-8465-0609
                  </a>
                  <p className="text-xs text-gray-500 mt-1">평일 10:00~18:00</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">환불 신청 시 필요 정보</h4>
                <ul className="list-disc list-inside text-sm space-y-1">
                  <li>가입 이메일 주소 (회원 확인용)</li>
                  <li>결제일 및 결제 금액</li>
                  <li>환불 사유</li>
                  <li>환불받을 계좌 정보 (은행명, 계좌번호, 예금주)</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 제5조 환불 처리 절차 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">5</span>
              제5조 (환불 처리 절차 및 기간)
            </h3>
            <div className="space-y-4 text-gray-700">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 text-center p-4 border rounded-lg">
                  <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold">1</div>
                  <div className="font-semibold">환불 신청</div>
                  <p className="text-sm text-gray-500">이메일/전화</p>
                </div>
                <div className="hidden md:flex items-center text-gray-400">→</div>
                <div className="flex-1 text-center p-4 border rounded-lg">
                  <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold">2</div>
                  <div className="font-semibold">신청 확인</div>
                  <p className="text-sm text-gray-500">1영업일 이내</p>
                </div>
                <div className="hidden md:flex items-center text-gray-400">→</div>
                <div className="flex-1 text-center p-4 border rounded-lg">
                  <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold">3</div>
                  <div className="font-semibold">환불 승인</div>
                  <p className="text-sm text-gray-500">2영업일 이내</p>
                </div>
                <div className="hidden md:flex items-center text-gray-400">→</div>
                <div className="flex-1 text-center p-4 border rounded-lg">
                  <div className="w-10 h-10 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-2 font-bold">✓</div>
                  <div className="font-semibold">환불 완료</div>
                  <p className="text-sm text-gray-500">결제수단별 상이</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">결제수단별 환불 소요 기간</h4>
                <ul className="text-sm space-y-1">
                  <li><strong>신용카드:</strong> 취소 승인 후 3~7영업일 (카드사별 상이)</li>
                  <li><strong>체크카드:</strong> 취소 승인 후 3~5영업일</li>
                  <li><strong>계좌이체:</strong> 취소 승인 후 3영업일 이내</li>
                  
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  * 환불 처리 후 실제 환불까지는 결제수단 및 카드사/은행 정책에 따라 추가 시간이 소요될 수 있습니다.
                </p>
              </div>
            </div>
          </section>

          {/* 제6조 구독 해지 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">6</span>
              제6조 (구독 해지)
            </h3>
            <div className="space-y-4 text-gray-700">
              <p>정기결제 해지는 다음 방법으로 가능합니다:</p>
              <ol className="list-decimal list-inside space-y-2">
                <li><strong>마이페이지 → 구독 관리</strong>에서 직접 해지</li>
                <li>고객센터 이메일(lhs0609c@naver.com) 또는 전화(010-8465-0609)로 해지 요청</li>
              </ol>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-blue-800 font-semibold mb-1">해지 후 서비스 이용</p>
                    <p className="text-blue-700 text-sm">
                      해지 신청 후에도 이미 결제된 서비스 기간이 종료될 때까지 서비스를 정상적으로 이용하실 수 있습니다.
                      해지 시점에 즉시 서비스가 중단되지 않습니다.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 제7조 환불 계산 예시 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">7</span>
              제7조 (환불 금액 계산 예시)
            </h3>
            <div className="space-y-4 text-gray-700">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-3">월간 정기결제 (프로 플랜 29,900원) 환불 예시</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span>결제 후 3일째 환불 신청 (7일 이내)</span>
                    <span className="font-semibold text-green-600">29,900원 전액 환불</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <div>
                      <span>결제 후 10일째 환불 신청</span>
                      <p className="text-xs text-gray-500">계산: 29,900 - (10일 × 997원)</p>
                    </div>
                    <span className="font-semibold text-orange-600">19,930원 환불</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>결제 후 20일째 환불 신청 (50% 초과)</span>
                    <span className="font-semibold text-red-600">환불 불가</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  * 일일이용료 = 29,900원 ÷ 30일 ≒ 997원
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-3">연간 정기결제 (프로 플랜 287,000원) 환불 예시</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span>결제 후 5일째 환불 신청 (7일 이내)</span>
                    <span className="font-semibold text-green-600">287,000원 전액 환불</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <div>
                      <span>결제 후 2개월 10일째 환불 신청</span>
                      <p className="text-xs text-gray-500">계산: 287,000 - (2개월 × 29,900) - (10일 × 997)</p>
                    </div>
                    <span className="font-semibold text-orange-600">217,230원 환불</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span>결제 후 7개월째 환불 신청 (50% 초과)</span>
                    <span className="font-semibold text-red-600">환불 불가</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  * 연간 결제도 월간 요금(29,900원) 기준으로 일할 계산
                </p>
              </div>
            </div>
          </section>

          {/* 제8조 기타 */}
          <section className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">8</span>
              제8조 (기타 사항)
            </h3>
            <div className="space-y-4 text-gray-700 text-sm">
              <ul className="space-y-2">
                <li>• 본 환불정책은 전자상거래 등에서의 소비자보호에 관한 법률을 준수합니다.</li>
                <li>• 환불정책은 회사 사정에 따라 변경될 수 있으며, 변경 시 사전 공지합니다.</li>
                <li>• 본 정책에 명시되지 않은 사항은 관련 법령 및 회사 이용약관에 따릅니다.</li>
                <li>• 분쟁 발생 시 소비자분쟁해결기준(공정거래위원회 고시)에 따라 해결합니다.</li>
              </ul>
            </div>
          </section>
        </div>

        {/* Contact */}
        <div className="mt-8 bg-purple-50 border border-purple-200 rounded-xl p-6">
          <h3 className="font-semibold text-purple-900 mb-3">환불 및 결제 관련 문의</h3>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-purple-700">이메일:</span>
              <a href="mailto:lhs0609c@naver.com" className="ml-2 text-purple-600 font-medium">
                lhs0609c@naver.com
              </a>
            </div>
            <div>
              <span className="text-purple-700">전화:</span>
              <a href="tel:010-8465-0609" className="ml-2 text-purple-600 font-medium">
                010-8465-0609
              </a>
            </div>
          </div>
          <p className="text-xs text-purple-600 mt-3">
            고객센터 운영시간: 평일 10:00 - 18:00 (주말/공휴일 휴무)
          </p>
        </div>

        {/* Related Links */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center">
          <Link href="/terms" className="text-sm text-gray-500 hover:text-purple-600">
            이용약관
          </Link>
          <span className="text-gray-300">|</span>
          <Link href="/pricing" className="text-sm text-gray-500 hover:text-purple-600">
            요금제 안내
          </Link>
        </div>
      </div>
    </div>
  )
}
