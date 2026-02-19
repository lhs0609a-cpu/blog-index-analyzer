'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Calculator, DollarSign, Users, MousePointer, TrendingUp,
  Info, BarChart3
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

import apiClient from '@/lib/api/client'

const FALLBACK_PRESETS: Record<string, IndustryPreset> = {
  '병원/의원': { label: '병원/의원', avg_order_value: 500000, traffic_to_consult: 0.03, consult_to_purchase: 0.4, avg_cpc: 2000, description: '피부과, 성형외과, 치과 등' },
  '학원/교육': { label: '학원/교육', avg_order_value: 300000, traffic_to_consult: 0.05, consult_to_purchase: 0.35, avg_cpc: 1200, description: '학원, 온라인 교육' },
  '인테리어': { label: '인테리어', avg_order_value: 3000000, traffic_to_consult: 0.02, consult_to_purchase: 0.25, avg_cpc: 1500, description: '인테리어 업체' },
  '쇼핑몰': { label: '쇼핑몰', avg_order_value: 50000, traffic_to_consult: 0.08, consult_to_purchase: 0.3, avg_cpc: 500, description: '의류, 잡화 등 이커머스' },
  '맛집/카페': { label: '맛집/카페', avg_order_value: 15000, traffic_to_consult: 0.1, consult_to_purchase: 0.5, avg_cpc: 300, description: '음식점, 카페' },
  '전문서비스': { label: '전문서비스', avg_order_value: 1000000, traffic_to_consult: 0.03, consult_to_purchase: 0.3, avg_cpc: 1800, description: '법률, 세무, 컨설팅' },
}

interface IndustryPreset {
  label: string
  avg_order_value: number
  traffic_to_consult: number
  consult_to_purchase: number
  avg_cpc: number
  description: string
}

export default function ReverseCalculator() {
  const [presets, setPresets] = useState<Record<string, IndustryPreset>>({})
  const [selectedIndustry, setSelectedIndustry] = useState('')

  // 입력값
  const [targetRevenue, setTargetRevenue] = useState(10000000)
  const [avgOrderValue, setAvgOrderValue] = useState(50000)
  const [consultRate, setConsultRate] = useState(5)
  const [purchaseRate, setPurchaseRate] = useState(30)
  const [avgCpc, setAvgCpc] = useState(800)

  useEffect(() => {
    loadPresets()
  }, [])

  const loadPresets = async () => {
    try {
      const { data } = await apiClient.get('/api/funnel-designer/industry-presets')
      setPresets(data.presets || {})
    } catch {
      // 서버 실패 시 하드코딩 폴백
      if (Object.keys(presets).length === 0) {
        setPresets(FALLBACK_PRESETS)
      }
    }
  }

  const applyPreset = (industry: string) => {
    setSelectedIndustry(industry)
    const preset = presets[industry]
    if (preset) {
      setAvgOrderValue(preset.avg_order_value)
      setConsultRate(preset.traffic_to_consult * 100)
      setPurchaseRate(preset.consult_to_purchase * 100)
      setAvgCpc(preset.avg_cpc)
    }
  }

  // 역산 계산
  const calculation = useMemo(() => {
    const safeAvgOrderValue = Math.max(avgOrderValue, 1)
    const safePurchaseRate = Math.max(purchaseRate, 0.1)
    const safeConsultRate = Math.max(consultRate, 0.1)
    const requiredPurchases = Math.ceil(targetRevenue / safeAvgOrderValue)
    const requiredConsults = Math.ceil(requiredPurchases / (safePurchaseRate / 100))
    const requiredTraffic = Math.ceil(requiredConsults / (safeConsultRate / 100))
    const estimatedAdCost = requiredTraffic * avgCpc
    const roas = estimatedAdCost > 0 ? (targetRevenue / estimatedAdCost) * 100 : 0

    return {
      requiredPurchases,
      requiredConsults,
      requiredTraffic,
      estimatedAdCost,
      roas,
    }
  }, [targetRevenue, avgOrderValue, consultRate, purchaseRate, avgCpc])

  const waterfallData = [
    { name: '목표 매출', value: targetRevenue, color: '#8b5cf6' },
    { name: '필요 구매', value: calculation.requiredPurchases, color: '#22c55e' },
    { name: '필요 상담', value: calculation.requiredConsults, color: '#f59e0b' },
    { name: '필요 유입', value: calculation.requiredTraffic, color: '#3b82f6' },
    { name: '예상 광고비', value: calculation.estimatedAdCost, color: '#ef4444' },
  ]

  const funnelBarData = [
    { name: '유입', value: calculation.requiredTraffic, fill: '#3b82f6' },
    { name: '상담', value: calculation.requiredConsults, fill: '#f59e0b' },
    { name: '구매', value: calculation.requiredPurchases, fill: '#22c55e' },
  ]

  return (
    <div className="space-y-6">
      {/* 업종 선택 */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-500" />
          업종 선택
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(presets).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className={`p-3 rounded-lg border-2 text-left transition text-sm ${
                selectedIndustry === key
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-medium">{preset.label}</p>
              <p className="text-xs text-gray-500 mt-1">CPC {preset.avg_cpc.toLocaleString()}원</p>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 입력 패널 */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-500" />
            역산 입력
          </h3>
          <div className="space-y-5">
            {/* 목표 매출 */}
            <div>
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                월 목표 매출
              </label>
              <input
                type="number"
                value={targetRevenue}
                onChange={(e) => setTargetRevenue(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">{targetRevenue.toLocaleString()}원</p>
            </div>

            {/* 객단가 */}
            <div>
              <label className="text-sm font-medium text-gray-700">평균 객단가</label>
              <input
                type="number"
                value={avgOrderValue}
                onChange={(e) => setAvgOrderValue(Number(e.target.value))}
                className="mt-1 w-full px-3 py-2 border rounded-lg text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">{avgOrderValue.toLocaleString()}원</p>
            </div>

            {/* 유입→상담 전환율 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">유입→상담 전환율</label>
                <span className="text-sm font-bold text-blue-600">{consultRate.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.5}
                value={consultRate}
                onChange={(e) => setConsultRate(Number(e.target.value))}
                className="w-full mt-2 accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>0.5%</span>
                <span>20%</span>
              </div>
            </div>

            {/* 상담→구매 전환율 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">상담→구매 전환율</label>
                <span className="text-sm font-bold text-amber-600">{purchaseRate.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={80}
                step={5}
                value={purchaseRate}
                onChange={(e) => setPurchaseRate(Number(e.target.value))}
                className="w-full mt-2 accent-amber-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>5%</span>
                <span>80%</span>
              </div>
            </div>

            {/* 평균 CPC */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">평균 CPC (클릭당 비용)</label>
                <span className="text-sm font-bold text-red-600">{avgCpc.toLocaleString()}원</span>
              </div>
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={avgCpc}
                onChange={(e) => setAvgCpc(Number(e.target.value))}
                className="w-full mt-2 accent-red-500"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>100원</span>
                <span>10,000원</span>
              </div>
            </div>
          </div>
        </div>

        {/* 결과 패널 */}
        <div className="space-y-6">
          {/* 역산 결과 카드 */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white"
            >
              <Users className="w-5 h-5 mb-2 opacity-80" />
              <p className="text-sm opacity-80">필요 유입</p>
              <p className="text-2xl font-bold">{calculation.requiredTraffic.toLocaleString()}</p>
              <p className="text-xs opacity-60">명/월</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white"
            >
              <MousePointer className="w-5 h-5 mb-2 opacity-80" />
              <p className="text-sm opacity-80">필요 상담</p>
              <p className="text-2xl font-bold">{calculation.requiredConsults.toLocaleString()}</p>
              <p className="text-xs opacity-60">건/월</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white"
            >
              <DollarSign className="w-5 h-5 mb-2 opacity-80" />
              <p className="text-sm opacity-80">필요 구매</p>
              <p className="text-2xl font-bold">{calculation.requiredPurchases.toLocaleString()}</p>
              <p className="text-xs opacity-60">건/월</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white"
            >
              <TrendingUp className="w-5 h-5 mb-2 opacity-80" />
              <p className="text-sm opacity-80">예상 광고비</p>
              <p className="text-2xl font-bold">{(calculation.estimatedAdCost / 10000).toFixed(0)}만</p>
              <p className="text-xs opacity-60">원/월</p>
            </motion.div>
          </div>

          {/* ROAS 게이지 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">예상 ROAS</h4>
              <span className={`text-2xl font-bold ${
                calculation.roas >= 300 ? 'text-green-600' :
                calculation.roas >= 150 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {calculation.roas.toFixed(0)}%
              </span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, calculation.roas / 5)}%` }}
                className={`h-full rounded-full ${
                  calculation.roas >= 300 ? 'bg-green-500' :
                  calculation.roas >= 150 ? 'bg-amber-500' : 'bg-red-500'
                }`}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0%</span>
              <span className="text-amber-500">150%</span>
              <span className="text-green-500">300%</span>
              <span>500%</span>
            </div>
            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
              <Info className="w-3 h-3" />
              ROAS 300% 이상이면 수익성 있는 퍼널입니다
            </p>
          </div>

          {/* 퍼널 바 차트 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h4 className="font-semibold mb-4">퍼널 흐름</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={funnelBarData} layout="vertical" barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} />
                <YAxis type="category" dataKey="name" width={60} />
                <Tooltip formatter={(value: number) => value.toLocaleString()} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                  {funnelBarData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
