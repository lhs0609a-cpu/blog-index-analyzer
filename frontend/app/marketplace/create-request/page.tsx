'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Briefcase, Target, DollarSign, FileText, Camera,
  Clock, ChevronRight, AlertCircle, CheckCircle, ArrowLeft,
  Image, MapPin, Palette, List, Plus, X, Link as LinkIcon
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/stores/auth'
import { createRequest, CreateRequestData } from '@/lib/api/marketplace'
import toast from 'react-hot-toast'

export default function CreateRequestPage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [step, setStep] = useState(1)

  // 기본 정보
  const [formData, setFormData] = useState({
    keyword: '',
    category: '',
    budgetMin: 80000,
    budgetMax: 150000,
    targetRankMin: 1,
    targetRankMax: 5,
    maintainDays: 14,
    contentRequirements: '',
    photoCount: 10,
    minWordCount: 2000,
    businessName: '',
    expiresHours: 72
  })

  // 상세 가이드라인
  const [guidelines, setGuidelines] = useState({
    photoSource: 'blogger_takes' as 'business_provided' | 'blogger_takes' | 'mixed',
    visitRequired: false,
    productProvided: false,
    requiredKeywords: [] as string[],
    prohibitedKeywords: [] as string[],
    toneManner: 'friendly' as 'friendly' | 'professional' | 'informative' | 'casual',
    writingStyle: '',
    requiredShots: [] as string[],
    photoInstructions: '',
    referenceUrls: [] as string[],
    referenceImages: [] as string[],
    brandGuidelines: '',
    structureType: 'free' as 'free' | 'visit_review' | 'product_review' | 'information',
    requiredSections: [] as string[],
    dos: [] as string[],
    donts: [] as string[],
    additionalInstructions: ''
  })

  // 입력 필드 상태
  const [newKeyword, setNewKeyword] = useState('')
  const [newProhibited, setNewProhibited] = useState('')
  const [newDo, setNewDo] = useState('')
  const [newDont, setNewDont] = useState('')
  const [newReferenceUrl, setNewReferenceUrl] = useState('')
  const [newReferenceImage, setNewReferenceImage] = useState('')

  const categories = [
    '맛집', '카페', '여행', '숙소', '뷰티', '화장품',
    '병원', '피부과', '성형', '육아', '교육', 'IT',
    '가전', '자동차', '부동산', '패션', '인테리어', '기타'
  ]

  const shotTypes = [
    { id: 'exterior', label: '매장 외관' },
    { id: 'interior', label: '매장 내부' },
    { id: 'food', label: '음식 사진' },
    { id: 'menu', label: '메뉴판' },
    { id: 'product', label: '제품 사진' },
    { id: 'before_after', label: '시술 전후' },
    { id: 'receipt', label: '영수증' },
    { id: 'selfie', label: '셀피/인증샷' },
    { id: 'detail', label: '디테일컷' },
    { id: 'atmosphere', label: '분위기컷' }
  ]

  const sectionTypes = [
    { id: 'intro', label: '서론/인트로' },
    { id: 'menu_info', label: '메뉴/상품 정보' },
    { id: 'price_info', label: '가격 정보' },
    { id: 'location', label: '위치/찾아가는 길' },
    { id: 'parking', label: '주차 정보' },
    { id: 'hours', label: '영업시간' },
    { id: 'pros_cons', label: '장단점' },
    { id: 'comparison', label: '비교 분석' },
    { id: 'personal_review', label: '개인 후기' },
    { id: 'cta', label: 'CTA/마무리 멘트' }
  ]

  const handleSubmit = async () => {
    if (!isAuthenticated || !user) {
      toast.error('로그인이 필요합니다')
      router.push('/login')
      return
    }

    if (!formData.keyword) {
      toast.error('키워드를 입력해주세요')
      return
    }

    setIsSubmitting(true)

    try {
      const requestData: CreateRequestData = {
        keyword: formData.keyword,
        budget_min: formData.budgetMin,
        budget_max: formData.budgetMax,
        target_rank_min: formData.targetRankMin,
        target_rank_max: formData.targetRankMax,
        maintain_days: formData.maintainDays,
        content_requirements: formData.contentRequirements || undefined,
        photo_count: formData.photoCount,
        min_word_count: formData.minWordCount,
        business_name: formData.businessName || undefined,
        category: formData.category || undefined,
        expires_hours: formData.expiresHours,
        // 상세 가이드라인
        photo_source: guidelines.photoSource,
        visit_required: guidelines.visitRequired,
        product_provided: guidelines.productProvided,
        required_keywords: guidelines.requiredKeywords.length > 0 ? guidelines.requiredKeywords : undefined,
        prohibited_keywords: guidelines.prohibitedKeywords.length > 0 ? guidelines.prohibitedKeywords : undefined,
        tone_manner: guidelines.toneManner,
        writing_style: guidelines.writingStyle || undefined,
        required_shots: guidelines.requiredShots.length > 0 ? guidelines.requiredShots : undefined,
        photo_instructions: guidelines.photoInstructions || undefined,
        reference_urls: guidelines.referenceUrls.length > 0 ? guidelines.referenceUrls : undefined,
        reference_images: guidelines.referenceImages.length > 0 ? guidelines.referenceImages : undefined,
        brand_guidelines: guidelines.brandGuidelines || undefined,
        structure_type: guidelines.structureType,
        required_sections: guidelines.requiredSections.length > 0 ? guidelines.requiredSections : undefined,
        dos_and_donts: (guidelines.dos.length > 0 || guidelines.donts.length > 0)
          ? { dos: guidelines.dos, donts: guidelines.donts }
          : undefined,
        additional_instructions: guidelines.additionalInstructions || undefined
      }

      const result = await createRequest(user.id, requestData)

      toast.success('의뢰가 등록되었습니다!')
      router.push(`/marketplace/my-requests`)

    } catch (err) {
      console.error('Failed to create request:', err)
      toast.error('의뢰 등록에 실패했습니다')
    } finally {
      setIsSubmitting(false)
    }
  }

  const addToList = (list: string[], setList: (v: string[]) => void, value: string, setValue: (v: string) => void) => {
    if (value.trim() && !list.includes(value.trim())) {
      setList([...list, value.trim()])
      setValue('')
    }
  }

  const removeFromList = (list: string[], setList: (v: string[]) => void, index: number) => {
    setList(list.filter((_, i) => i !== index))
  }

  const toggleShot = (shotId: string) => {
    if (guidelines.requiredShots.includes(shotId)) {
      setGuidelines({
        ...guidelines,
        requiredShots: guidelines.requiredShots.filter(s => s !== shotId)
      })
    } else {
      setGuidelines({
        ...guidelines,
        requiredShots: [...guidelines.requiredShots, shotId]
      })
    }
  }

  const toggleSection = (sectionId: string) => {
    if (guidelines.requiredSections.includes(sectionId)) {
      setGuidelines({
        ...guidelines,
        requiredSections: guidelines.requiredSections.filter(s => s !== sectionId)
      })
    } else {
      setGuidelines({
        ...guidelines,
        requiredSections: [...guidelines.requiredSections, sectionId]
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 pt-24">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* 헤더 */}
          <div className="mb-8">
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              마켓플레이스로 돌아가기
            </Link>
            <h1 className="text-2xl font-bold">상위노출 의뢰 등록</h1>
            <p className="text-gray-600 mt-1">원하는 키워드와 가이드라인을 상세히 입력하세요</p>
          </div>

          {/* 진행 단계 */}
          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold ${
                  step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {step > s ? <CheckCircle className="w-5 h-5" /> : s}
                </div>
                {s < 4 && (
                  <div className={`w-8 h-1 ${step > s ? 'bg-blue-600' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step 1: 키워드 & 예산 */}
          {step === 1 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-8 shadow-lg"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Target className="w-5 h-5 text-blue-600" />
                키워드 & 예산
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    상위노출 키워드 *
                  </label>
                  <input
                    type="text"
                    value={formData.keyword}
                    onChange={(e) => setFormData({ ...formData, keyword: e.target.value })}
                    placeholder="예: 강남 피부과 추천"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    네이버에서 검색할 키워드를 입력하세요
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    카테고리
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                  >
                    <option value="">선택하세요</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    예산 범위 *
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
                        <input
                          type="number"
                          value={formData.budgetMin}
                          onChange={(e) => setFormData({ ...formData, budgetMin: parseInt(e.target.value) || 0 })}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">최소 예산</p>
                    </div>
                    <span className="text-gray-400">~</span>
                    <div className="flex-1">
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">₩</span>
                        <input
                          type="number"
                          value={formData.budgetMax}
                          onChange={(e) => setFormData({ ...formData, budgetMax: parseInt(e.target.value) || 0 })}
                          className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">최대 예산</p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    업체명 (선택)
                  </label>
                  <input
                    type="text"
                    value={formData.businessName}
                    onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                    placeholder="예: 강남스킨의원"
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!formData.keyword || formData.budgetMax <= 0}
                className="mt-8 w-full py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                다음 단계
              </button>
            </motion.div>
          )}

          {/* Step 2: 조건 설정 */}
          {step === 2 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-8 shadow-lg"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                조건 설정
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    목표 순위
                  </label>
                  <div className="flex items-center gap-4">
                    <select
                      value={formData.targetRankMin}
                      onChange={(e) => setFormData({ ...formData, targetRankMin: parseInt(e.target.value) })}
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n}위</option>
                      ))}
                    </select>
                    <span className="text-gray-400">~</span>
                    <select
                      value={formData.targetRankMax}
                      onChange={(e) => setFormData({ ...formData, targetRankMax: parseInt(e.target.value) })}
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 10].map((n) => (
                        <option key={n} value={n}>{n}위</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    유지 기간
                  </label>
                  <select
                    value={formData.maintainDays}
                    onChange={(e) => setFormData({ ...formData, maintainDays: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                  >
                    <option value={7}>1주일 (7일)</option>
                    <option value={14}>2주일 (14일)</option>
                    <option value={21}>3주일 (21일)</option>
                    <option value={30}>1개월 (30일)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    이 기간 동안 목표 순위를 유지해야 성공으로 인정됩니다
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      최소 글자수
                    </label>
                    <select
                      value={formData.minWordCount}
                      onChange={(e) => setFormData({ ...formData, minWordCount: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                    >
                      <option value={1000}>1,000자</option>
                      <option value={1500}>1,500자</option>
                      <option value={2000}>2,000자</option>
                      <option value={2500}>2,500자</option>
                      <option value={3000}>3,000자</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      필요 사진 수
                    </label>
                    <select
                      value={formData.photoCount}
                      onChange={(e) => setFormData({ ...formData, photoCount: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                    >
                      <option value={5}>5장</option>
                      <option value={10}>10장</option>
                      <option value={15}>15장</option>
                      <option value={20}>20장</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    입찰 마감
                  </label>
                  <select
                    value={formData.expiresHours}
                    onChange={(e) => setFormData({ ...formData, expiresHours: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none"
                  >
                    <option value={24}>24시간 후</option>
                    <option value={48}>48시간 후</option>
                    <option value={72}>72시간 후 (3일)</option>
                    <option value={168}>1주일 후</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  다음 단계
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 3: 상세 가이드라인 */}
          {step === 3 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-8 shadow-lg"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-600" />
                블로거 가이드라인
              </h2>

              <div className="space-y-6">
                {/* 사진 제공 방식 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <Camera className="w-4 h-4 inline mr-1" />
                    사진 제공 방식
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'business_provided', label: '업체 제공', desc: '사진을 직접 전달' },
                      { id: 'blogger_takes', label: '블로거 촬영', desc: '방문하여 직접 촬영' },
                      { id: 'mixed', label: '혼합', desc: '일부 제공 + 일부 촬영' }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setGuidelines({ ...guidelines, photoSource: opt.id as any })}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          guidelines.photoSource === opt.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="font-medium text-sm">{opt.label}</div>
                        <div className="text-xs text-gray-500 mt-1">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 방문/제품 제공 */}
                <div className="flex gap-4">
                  <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    guidelines.visitRequired ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={guidelines.visitRequired}
                      onChange={(e) => setGuidelines({ ...guidelines, visitRequired: e.target.checked })}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2">
                      <MapPin className="w-5 h-5 text-gray-600" />
                      <div>
                        <div className="font-medium text-sm">방문 필수</div>
                        <div className="text-xs text-gray-500">매장 방문 후 작성</div>
                      </div>
                    </div>
                  </label>
                  <label className={`flex-1 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    guidelines.productProvided ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}>
                    <input
                      type="checkbox"
                      checked={guidelines.productProvided}
                      onChange={(e) => setGuidelines({ ...guidelines, productProvided: e.target.checked })}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5 text-gray-600" />
                      <div>
                        <div className="font-medium text-sm">제품/서비스 제공</div>
                        <div className="text-xs text-gray-500">무료 체험 제공</div>
                      </div>
                    </div>
                  </label>
                </div>

                {/* 톤앤매너 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    톤앤매너
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { id: 'friendly', label: '친근한' },
                      { id: 'professional', label: '전문적' },
                      { id: 'informative', label: '정보성' },
                      { id: 'casual', label: '캐주얼' }
                    ].map((tone) => (
                      <button
                        key={tone.id}
                        onClick={() => setGuidelines({ ...guidelines, toneManner: tone.id as any })}
                        className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                          guidelines.toneManner === tone.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {tone.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 글 구성 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    글 구성 유형
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { id: 'free', label: '자유 형식' },
                      { id: 'visit_review', label: '방문 후기' },
                      { id: 'product_review', label: '제품 리뷰' },
                      { id: 'information', label: '정보 글' }
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setGuidelines({ ...guidelines, structureType: type.id as any })}
                        className={`py-3 px-4 rounded-xl border-2 text-sm font-medium transition-all ${
                          guidelines.structureType === type.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 필수 포함 키워드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    필수 포함 키워드
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newKeyword}
                      onChange={(e) => setNewKeyword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.requiredKeywords, (v) => setGuidelines({...guidelines, requiredKeywords: v}), newKeyword, setNewKeyword))}
                      placeholder="키워드 입력 후 Enter"
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.requiredKeywords, (v) => setGuidelines({...guidelines, requiredKeywords: v}), newKeyword, setNewKeyword)}
                      className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {guidelines.requiredKeywords.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1">
                        {kw}
                        <button onClick={() => removeFromList(guidelines.requiredKeywords, (v) => setGuidelines({...guidelines, requiredKeywords: v}), i)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 금지 키워드 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    금지 키워드
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newProhibited}
                      onChange={(e) => setNewProhibited(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.prohibitedKeywords, (v) => setGuidelines({...guidelines, prohibitedKeywords: v}), newProhibited, setNewProhibited))}
                      placeholder="키워드 입력 후 Enter"
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.prohibitedKeywords, (v) => setGuidelines({...guidelines, prohibitedKeywords: v}), newProhibited, setNewProhibited)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {guidelines.prohibitedKeywords.map((kw, i) => (
                      <span key={i} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm flex items-center gap-1">
                        {kw}
                        <button onClick={() => removeFromList(guidelines.prohibitedKeywords, (v) => setGuidelines({...guidelines, prohibitedKeywords: v}), i)}>
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* 필수 촬영 컷 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <Image className="w-4 h-4 inline mr-1" />
                    필수 촬영 컷
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {shotTypes.map((shot) => (
                      <button
                        key={shot.id}
                        onClick={() => toggleShot(shot.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          guidelines.requiredShots.includes(shot.id)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {shot.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 필수 섹션 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    <List className="w-4 h-4 inline mr-1" />
                    필수 포함 섹션
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sectionTypes.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => toggleSection(section.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          guidelines.requiredSections.includes(section.id)
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 참고 URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <LinkIcon className="w-4 h-4 inline mr-1" />
                    참고 포스트 URL
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={newReferenceUrl}
                      onChange={(e) => setNewReferenceUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.referenceUrls, (v) => setGuidelines({...guidelines, referenceUrls: v}), newReferenceUrl, setNewReferenceUrl))}
                      placeholder="https://blog.naver.com/..."
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.referenceUrls, (v) => setGuidelines({...guidelines, referenceUrls: v}), newReferenceUrl, setNewReferenceUrl)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {guidelines.referenceUrls.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-blue-600">
                        <LinkIcon className="w-3 h-3" />
                        <span className="truncate flex-1">{url}</span>
                        <button onClick={() => removeFromList(guidelines.referenceUrls, (v) => setGuidelines({...guidelines, referenceUrls: v}), i)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 참고 이미지 URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Image className="w-4 h-4 inline mr-1" />
                    참고 이미지 URL
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="url"
                      value={newReferenceImage}
                      onChange={(e) => setNewReferenceImage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.referenceImages, (v) => setGuidelines({...guidelines, referenceImages: v}), newReferenceImage, setNewReferenceImage))}
                      placeholder="https://example.com/image.jpg"
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-blue-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.referenceImages, (v) => setGuidelines({...guidelines, referenceImages: v}), newReferenceImage, setNewReferenceImage)}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {guidelines.referenceImages.map((url, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-purple-600">
                        <Image className="w-3 h-3" />
                        <span className="truncate flex-1">{url}</span>
                        <button onClick={() => removeFromList(guidelines.referenceImages, (v) => setGuidelines({...guidelines, referenceImages: v}), i)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 사진 촬영 지침 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Camera className="w-4 h-4 inline mr-1" />
                    사진 촬영 지침
                  </label>
                  <textarea
                    value={guidelines.photoInstructions}
                    onChange={(e) => setGuidelines({ ...guidelines, photoInstructions: e.target.value })}
                    placeholder="예: 음식은 45도 각도에서 촬영, 자연광 사용, 인물 노출 금지..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none resize-none text-sm"
                  />
                </div>

                {/* 브랜드 가이드라인 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <Briefcase className="w-4 h-4 inline mr-1" />
                    브랜드 가이드라인
                  </label>
                  <textarea
                    value={guidelines.brandGuidelines}
                    onChange={(e) => setGuidelines({ ...guidelines, brandGuidelines: e.target.value })}
                    placeholder="예: 브랜드명은 '강남스킨'으로 통일, 로고 이미지 필수 포함, 할인 정보 강조..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none resize-none text-sm"
                  />
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={() => setStep(4)}
                  className="flex-1 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors"
                >
                  다음 단계
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 4: 추가 지침 & 확인 */}
          {step === 4 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-8 shadow-lg"
            >
              <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                추가 지침 & 최종 확인
              </h2>

              <div className="space-y-6">
                {/* DO's */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="text-green-600">DO's</span> - 이것은 해주세요
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newDo}
                      onChange={(e) => setNewDo(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.dos, (v) => setGuidelines({...guidelines, dos: v}), newDo, setNewDo))}
                      placeholder="예: 매장 분위기를 자세히 묘사해주세요"
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-green-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.dos, (v) => setGuidelines({...guidelines, dos: v}), newDo, setNewDo)}
                      className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {guidelines.dos.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="flex-1 text-sm">{item}</span>
                        <button onClick={() => removeFromList(guidelines.dos, (v) => setGuidelines({...guidelines, dos: v}), i)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DON'Ts */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    <span className="text-red-600">DON'Ts</span> - 이것은 하지 마세요
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newDont}
                      onChange={(e) => setNewDont(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList(guidelines.donts, (v) => setGuidelines({...guidelines, donts: v}), newDont, setNewDont))}
                      placeholder="예: 경쟁업체 언급하지 마세요"
                      className="flex-1 px-4 py-2 rounded-lg border-2 border-gray-200 focus:border-red-400 focus:outline-none text-sm"
                    />
                    <button
                      onClick={() => addToList(guidelines.donts, (v) => setGuidelines({...guidelines, donts: v}), newDont, setNewDont)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {guidelines.donts.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 p-2 bg-red-50 rounded-lg">
                        <X className="w-4 h-4 text-red-600" />
                        <span className="flex-1 text-sm">{item}</span>
                        <button onClick={() => removeFromList(guidelines.donts, (v) => setGuidelines({...guidelines, donts: v}), i)} className="text-gray-400 hover:text-red-500">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 추가 지침 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    추가 지침 (선택)
                  </label>
                  <textarea
                    value={guidelines.additionalInstructions}
                    onChange={(e) => setGuidelines({ ...guidelines, additionalInstructions: e.target.value })}
                    placeholder="블로거에게 전달할 추가 지침이나 요청사항을 자유롭게 작성하세요..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-blue-400 focus:outline-none resize-none text-sm"
                  />
                </div>

                {/* 요약 */}
                <div className="p-6 bg-gray-50 rounded-xl">
                  <h3 className="font-semibold mb-4">의뢰 요약</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">키워드</span>
                      <span className="font-medium">{formData.keyword}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">카테고리</span>
                      <span className="font-medium">{formData.category || '미선택'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">예산</span>
                      <span className="font-medium">
                        ₩{formData.budgetMin.toLocaleString()} ~ ₩{formData.budgetMax.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">목표 순위</span>
                      <span className="font-medium">{formData.targetRankMin}위 ~ {formData.targetRankMax}위</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">유지 기간</span>
                      <span className="font-medium">{formData.maintainDays}일</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">글 조건</span>
                      <span className="font-medium">{formData.minWordCount.toLocaleString()}자 이상, 사진 {formData.photoCount}장</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between">
                      <span className="text-gray-500">사진 제공</span>
                      <span className="font-medium">
                        {guidelines.photoSource === 'business_provided' ? '업체 제공' :
                         guidelines.photoSource === 'blogger_takes' ? '블로거 촬영' : '혼합'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">톤앤매너</span>
                      <span className="font-medium">
                        {guidelines.toneManner === 'friendly' ? '친근한' :
                         guidelines.toneManner === 'professional' ? '전문적' :
                         guidelines.toneManner === 'informative' ? '정보성' : '캐주얼'}
                      </span>
                    </div>
                    {guidelines.visitRequired && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">방문</span>
                        <span className="font-medium text-blue-600">방문 필수</span>
                      </div>
                    )}
                    {guidelines.requiredKeywords.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">필수 키워드</span>
                        <span className="font-medium">{guidelines.requiredKeywords.length}개</span>
                      </div>
                    )}
                    {guidelines.requiredShots.length > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">필수 촬영컷</span>
                        <span className="font-medium">{guidelines.requiredShots.length}종류</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 안내 */}
                <div className="p-4 bg-blue-50 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-1">결제는 블로거 선택 후 진행됩니다</p>
                    <p className="text-blue-600">
                      에스크로 방식으로 안전하게 보관되며, 상위노출 실패 시 전액 환불됩니다.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-4 border-2 border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  이전
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1 py-4 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>처리 중...</>
                  ) : (
                    <>
                      의뢰 등록하기
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
