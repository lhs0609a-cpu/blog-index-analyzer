'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield, FileText, AlertTriangle, Scale, Lock, Users, Globe, ChevronDown, ChevronRight } from 'lucide-react'

type SectionId = 'terms' | 'privacy' | 'disclaimer' | 'data' | 'liability' | 'ip'

export default function TermsPage() {
  const [expandedSection, setExpandedSection] = useState<SectionId | null>('terms')

  const sections = [
    { id: 'terms' as SectionId, title: '서비스 이용약관', icon: FileText },
    { id: 'privacy' as SectionId, title: '개인정보처리방침', icon: Lock },
    { id: 'disclaimer' as SectionId, title: '면책 조항', icon: AlertTriangle },
    { id: 'data' as SectionId, title: '데이터 수집 및 이용', icon: Globe },
    { id: 'liability' as SectionId, title: '책임 제한', icon: Scale },
    { id: 'ip' as SectionId, title: '지적재산권', icon: Shield },
  ]

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
              <Scale className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-bold">이용약관 및 법적 고지</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Important Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-yellow-800 mb-2">중요 안내</h3>
              <p className="text-sm text-yellow-700">
                본 서비스를 이용하시기 전에 아래 약관을 주의 깊게 읽어주세요.
                서비스 이용 시 본 약관에 동의한 것으로 간주됩니다.
                본 서비스는 정보 제공 목적으로만 운영되며, 법적 조언을 구성하지 않습니다.
              </p>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        <p className="text-sm text-gray-500 mb-6">
          최종 수정일: {new Date().toLocaleDateString('ko-KR')}
        </p>

        {/* Sections */}
        <div className="space-y-4">
          {sections.map((section) => {
            const Icon = section.icon
            const isExpanded = expandedSection === section.id

            return (
              <div key={section.id} className="bg-white rounded-xl shadow-sm border overflow-hidden">
                <button
                  onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-gray-900">{section.title}</span>
                  </div>
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                </button>

                {isExpanded && (
                  <div className="px-6 pb-6 prose prose-sm max-w-none">
                    {section.id === 'terms' && <TermsContent />}
                    {section.id === 'privacy' && <PrivacyContent />}
                    {section.id === 'disclaimer' && <DisclaimerContent />}
                    {section.id === 'data' && <DataContent />}
                    {section.id === 'liability' && <LiabilityContent />}
                    {section.id === 'ip' && <IPContent />}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Contact */}
        <div className="mt-8 bg-gray-100 rounded-xl p-6">
          <h3 className="font-semibold mb-2">문의사항</h3>
          <p className="text-sm text-gray-600">
            본 약관에 대한 문의사항이 있으시면 아래로 연락해 주세요.
          </p>
          <p className="text-sm text-blue-600 mt-2">lhs0609c@naver.com</p>
        </div>
      </div>
    </div>
  )
}

function TermsContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <section>
        <h4 className="font-bold text-gray-900 mb-3">제1조 (목적)</h4>
        <p>
          본 약관은 머프키치(이하 "회사")가 운영하는 블랭크(이하 "서비스")가 제공하는 모든 서비스의 이용조건 및
          절차, 이용자와 회사의 권리, 의무, 책임사항과 기타 필요한 사항을 규정함을 목적으로 합니다.
        </p>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">제2조 (정의)</h4>
        <ol className="list-decimal list-inside space-y-2">
          <li>"서비스"란 블랭크 플랫폼에서 제공하는 블로그 분석, 키워드 추천, AI 콘텐츠 생성 등 모든 기능을 의미합니다.</li>
          <li>"이용자"란 본 약관에 따라 서비스를 이용하는 회원 및 비회원을 말합니다.</li>
          <li>"회원"이란 서비스에 가입하여 아이디를 부여받은 자를 말합니다.</li>
          <li>"콘텐츠"란 서비스를 통해 생성, 분석, 제공되는 모든 텍스트, 데이터, 정보를 의미합니다.</li>
        </ol>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">제3조 (서비스 이용계약의 성립)</h4>
        <ol className="list-decimal list-inside space-y-2">
          <li>서비스 이용계약은 이용자가 본 약관에 동의하고 서비스를 이용함으로써 성립됩니다.</li>
          <li>비회원의 경우 서비스 접속 및 이용 시 본 약관에 동의한 것으로 간주됩니다.</li>
          <li>서비스 제공자는 다음 각 호에 해당하는 이용신청에 대하여는 승낙을 거부할 수 있습니다:
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              <li>타인의 명의를 도용하여 신청한 경우</li>
              <li>허위 정보를 기재한 경우</li>
              <li>본 약관을 위반하여 이용이 중지된 적이 있는 자가 신청한 경우</li>
            </ul>
          </li>
        </ol>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">제4조 (이용자의 의무)</h4>
        <p className="mb-2">이용자는 다음 행위를 하여서는 안 됩니다:</p>
        <ol className="list-decimal list-inside space-y-2">
          <li>서비스를 이용하여 얻은 정보를 서비스 제공자의 사전 승낙 없이 영리 목적으로 이용하거나 제3자에게 제공하는 행위</li>
          <li>서비스의 안정적 운영을 방해하는 행위 (과도한 요청, DDoS 공격 등)</li>
          <li>다른 이용자의 개인정보를 수집, 저장, 공개하는 행위</li>
          <li>타인의 저작권, 상표권 등 지적재산권을 침해하는 행위</li>
          <li>불법적인 목적으로 서비스를 이용하는 행위</li>
          <li>네이버, 구글 등 제3자 플랫폼의 이용약관을 위반하는 행위</li>
          <li>자동화 도구를 사용하여 대량의 요청을 발생시키는 행위</li>
          <li>서비스를 통해 생성된 콘텐츠를 자신의 창작물로 허위 표시하는 행위</li>
        </ol>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">제5조 (서비스의 중단)</h4>
        <ol className="list-decimal list-inside space-y-2">
          <li>서비스 제공자는 다음 각 호에 해당하는 경우 서비스 제공을 중단할 수 있습니다:
            <ul className="list-disc list-inside ml-4 mt-2 space-y-1">
              <li>서비스용 설비의 보수 등 공사로 인한 부득이한 경우</li>
              <li>제3자 API 서비스(네이버 API 등)의 중단 또는 변경</li>
              <li>기타 불가항력적 사유가 있는 경우</li>
            </ul>
          </li>
          <li>서비스 제공자는 서비스의 전부 또는 일부를 사전 예고 없이 변경, 중단할 수 있습니다.</li>
        </ol>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">제6조 (분쟁해결)</h4>
        <ol className="list-decimal list-inside space-y-2">
          <li>본 약관과 관련하여 분쟁이 발생한 경우, 양 당사자는 우선 원만한 합의를 통해 해결하도록 노력합니다.</li>
          <li>합의가 이루어지지 않는 경우, 관할 법원은 서비스 제공자의 소재지를 관할하는 법원으로 합니다.</li>
          <li>본 약관의 해석 및 적용에 관하여는 대한민국 법률이 적용됩니다.</li>
        </ol>
      </section>
    </div>
  )
}

function PrivacyContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <section>
        <h4 className="font-bold text-gray-900 mb-3">1. 수집하는 개인정보 항목</h4>
        <p className="mb-2">서비스는 다음의 개인정보를 수집합니다:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>필수항목:</strong> 이메일 주소 (회원가입 시)</li>
          <li><strong>자동 수집:</strong> IP 주소, 접속 일시, 서비스 이용 기록, 브라우저 정보</li>
          <li><strong>선택항목:</strong> 블로그 ID, 닉네임</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">2. 개인정보의 수집 및 이용목적</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>서비스 제공 및 계약 이행</li>
          <li>회원 관리 및 본인확인</li>
          <li>서비스 개선 및 맞춤 서비스 제공</li>
          <li>부정 이용 방지 및 보안 강화</li>
          <li>통계 분석 및 서비스 최적화</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">3. 개인정보의 보유 및 이용기간</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>회원 탈퇴 시까지 보유 후 즉시 파기</li>
          <li>단, 관계법령에 의해 보존이 필요한 경우 해당 기간 동안 보존</li>
          <li>접속 로그: 3개월 보관 후 자동 삭제</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">4. 개인정보의 제3자 제공</h4>
        <p className="mb-2">서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우 예외로 합니다:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">5. 이용자의 권리</h4>
        <ul className="list-disc list-inside space-y-1">
          <li>개인정보 열람, 정정, 삭제 요청 권리</li>
          <li>개인정보 처리 정지 요청 권리</li>
          <li>회원 탈퇴를 통한 개인정보 삭제 권리</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">6. 개인정보 보호책임자</h4>
        <p>개인정보 처리에 관한 문의사항은 lhs0609c@naver.com으로 연락주시기 바랍니다.</p>
      </section>
    </div>
  )
}

function DisclaimerContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
        <p className="text-red-700 font-medium">
          본 면책 조항을 주의 깊게 읽어주세요. 서비스 이용 시 아래 조항에 동의한 것으로 간주됩니다.
        </p>
      </div>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">1. 정보의 정확성</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>본 서비스에서 제공하는 모든 분석 결과, 예측, 추천은 <strong>참고용 정보</strong>에 불과합니다.</li>
          <li>서비스 제공자는 정보의 정확성, 완전성, 적시성을 보장하지 않습니다.</li>
          <li>AI가 생성한 콘텐츠는 오류를 포함할 수 있으며, 이용자의 검토와 수정이 필요합니다.</li>
          <li>검색 순위 예측, 블루오션 키워드 등의 분석 결과는 실제 결과와 다를 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">2. 제3자 플랫폼</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>본 서비스는 네이버, 구글 등 제3자 플랫폼의 공개 데이터를 활용합니다.</li>
          <li>제3자 플랫폼의 정책 변경, API 변경 등으로 인한 서비스 중단 또는 오류에 대해 책임지지 않습니다.</li>
          <li>이용자는 제3자 플랫폼의 이용약관을 준수해야 하며, 위반에 따른 책임은 이용자 본인에게 있습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">3. 법적 조언 배제</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>본 서비스에서 제공하는 정보는 법적 조언을 구성하지 않습니다.</li>
          <li>저작권, 개인정보보호, 광고법 등 관련 법률 문제는 전문 법률가와 상담하시기 바랍니다.</li>
          <li>서비스 이용 과정에서 발생하는 법적 문제에 대해 서비스 제공자는 책임을 지지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">4. 콘텐츠 사용</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>AI가 생성한 제목, 본문 등의 콘텐츠는 이용자의 책임 하에 사용해야 합니다.</li>
          <li>생성된 콘텐츠가 타인의 저작권, 상표권 등을 침해할 경우 이용자가 모든 책임을 집니다.</li>
          <li>AI 생성 콘텐츠임을 표시하지 않아 발생하는 문제에 대해 책임지지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">5. 결과에 대한 책임</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>서비스 이용으로 인한 블로그 순위 하락, 저품질 판정, 수익 감소 등에 대해 책임지지 않습니다.</li>
          <li>키워드 추천, SEO 가이드 등을 따른 결과에 대해 보장하지 않습니다.</li>
          <li>서비스 이용에 따른 모든 결과는 이용자 본인의 책임입니다.</li>
        </ul>
      </section>
    </div>
  )
}

function DataContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <section>
        <h4 className="font-bold text-gray-900 mb-3">1. 데이터 수집 방법</h4>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>공개 데이터 활용:</strong> 네이버, 구글 등에서 공개적으로 제공하는 검색 결과, 통계 데이터를 활용합니다.</li>
          <li><strong>API 연동:</strong> 네이버 검색광고 API, 데이터랩 API 등 공식 API를 통해 데이터를 수집합니다.</li>
          <li><strong>이용자 제공:</strong> 이용자가 직접 입력한 키워드, 블로그 URL 등의 정보를 처리합니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">2. 데이터 처리 원칙</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>수집된 데이터는 서비스 제공 목적으로만 사용됩니다.</li>
          <li>개인을 식별할 수 있는 정보는 최소한으로 수집하고 즉시 익명화 처리합니다.</li>
          <li>제3자의 콘텐츠 전문(全文)은 저장하지 않으며, 통계 데이터만 처리합니다.</li>
          <li>robots.txt 및 플랫폼 이용약관을 준수합니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">3. 요청 빈도 제한</h4>
        <p className="mb-2">서비스는 다음과 같은 요청 제한을 적용합니다:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>분당 API 요청 수 제한</li>
          <li>일일 총 요청 수 제한</li>
          <li>동일 키워드/URL 재분석 간격 제한</li>
        </ul>
        <p className="mt-2 text-sm text-gray-600">
          이는 제3자 플랫폼에 과도한 부하를 주지 않기 위한 조치입니다.
        </p>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">4. 데이터 보관</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>분석 결과 캐시: 최대 24시간 보관</li>
          <li>사용자 분석 이력: 30일 보관 후 자동 삭제</li>
          <li>통계 데이터: 익명화 후 장기 보관 가능</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">5. 데이터 삭제 요청</h4>
        <p>
          이용자는 언제든지 자신과 관련된 데이터의 삭제를 요청할 수 있습니다.
          회원 탈퇴 시 모든 개인 데이터는 즉시 삭제됩니다.
        </p>
      </section>
    </div>
  )
}

function LiabilityContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-blue-700">
          본 조항은 서비스 제공자의 책임 범위를 명확히 하기 위한 것입니다.
        </p>
      </div>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">1. 책임의 제한</h4>
        <p className="mb-2">서비스 제공자는 다음 사항에 대해 책임을 지지 않습니다:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>서비스 이용으로 발생한 직접적, 간접적, 부수적, 결과적 손해</li>
          <li>데이터 손실, 사업 기회 상실, 수익 손실</li>
          <li>제3자 플랫폼(네이버, 구글 등)의 정책 변경으로 인한 손해</li>
          <li>천재지변, 전쟁, 테러, 사이버 공격 등 불가항력적 사유로 인한 손해</li>
          <li>이용자의 귀책사유로 인한 손해</li>
          <li>이용자가 서비스를 통해 얻은 정보를 신뢰하여 발생한 손해</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">2. 최대 책임 한도</h4>
        <p>
          어떠한 경우에도 서비스 제공자의 총 책임액은 해당 이용자가 서비스 이용을 위해
          지불한 금액을 초과하지 않습니다. 무료 이용자의 경우 책임 한도는 0원입니다.
        </p>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">3. 면책 사유</h4>
        <p className="mb-2">다음 각 호의 경우 서비스 제공자는 책임을 면합니다:</p>
        <ul className="list-disc list-inside space-y-2">
          <li>이용자가 본인의 아이디/비밀번호를 관리하지 않아 발생한 문제</li>
          <li>이용자가 약관을 위반하여 발생한 문제</li>
          <li>제3자가 이용자의 계정을 도용하여 발생한 문제</li>
          <li>이용자 간 또는 이용자와 제3자 간 분쟁</li>
          <li>서비스에 대한 이용자의 기대와 실제 서비스의 차이</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">4. 손해배상</h4>
        <p>
          이용자가 본 약관을 위반하여 서비스 제공자에게 손해를 입힌 경우,
          이용자는 서비스 제공자에게 발생한 모든 손해를 배상해야 합니다.
        </p>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">5. 제3자 청구에 대한 면책</h4>
        <p>
          이용자가 서비스를 이용하여 제3자에게 손해를 입히거나, 제3자의 권리를 침해하여
          서비스 제공자가 제3자로부터 청구를 받는 경우, 이용자는 자신의 비용과 책임으로
          서비스 제공자를 면책시켜야 합니다.
        </p>
      </section>
    </div>
  )
}

function IPContent() {
  return (
    <div className="space-y-6 text-gray-700">
      <section>
        <h4 className="font-bold text-gray-900 mb-3">1. 서비스의 지적재산권</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>본 서비스의 소프트웨어, 디자인, 로고, 상표, 데이터베이스 구조 등 모든 지적재산은 서비스 제공자에게 귀속됩니다.</li>
          <li>이용자는 서비스 제공자의 사전 서면 동의 없이 서비스를 복제, 배포, 수정, 역공학할 수 없습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">2. 이용자 콘텐츠</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>이용자가 서비스에 입력한 콘텐츠의 저작권은 이용자에게 있습니다.</li>
          <li>이용자는 서비스 제공자에게 서비스 운영에 필요한 범위 내에서 해당 콘텐츠를 사용할 수 있는 비독점적, 무상의 라이선스를 부여합니다.</li>
          <li>이 라이선스는 서비스 개선, 통계 분석 등의 목적으로만 사용됩니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">3. AI 생성 콘텐츠</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>AI가 생성한 콘텐츠(제목, 본문 등)는 이용자가 자유롭게 사용할 수 있습니다.</li>
          <li>단, 해당 콘텐츠가 제3자의 저작권을 침해할 경우의 책임은 이용자에게 있습니다.</li>
          <li>AI 생성 콘텐츠에 대한 배타적 저작권 주장은 인정되지 않을 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">4. 제3자 콘텐츠</h4>
        <ul className="list-disc list-inside space-y-2">
          <li>서비스에서 분석되는 네이버 블로그, 검색 결과 등의 콘텐츠에 대한 저작권은 해당 원저작자에게 있습니다.</li>
          <li>서비스는 이러한 콘텐츠를 분석 목적으로만 일시적으로 처리하며, 저장하지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-bold text-gray-900 mb-3">5. 저작권 침해 신고</h4>
        <p>
          저작권 침해가 의심되는 경우 lhs0609c@naver.com으로 신고해 주시기 바랍니다.
          신고 시 침해 사실을 입증할 수 있는 자료를 함께 제출해 주세요.
        </p>
      </section>
    </div>
  )
}
