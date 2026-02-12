'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiUrl } from '@/lib/api/apiConfig'
import { Bell, Loader2, Save, Star, MessageSquare, TrendingDown, Shield } from 'lucide-react'
import toast from 'react-hot-toast'

interface AlertSetting {
  id: string
  alert_type: string
  condition_json?: string
  condition?: Record<string, unknown>
  notification_channel: string
  is_active: number
}

interface StoreInfo {
  id: string
  store_name: string
}

export default function AlertsPage() {
  const [stores, setStores] = useState<StoreInfo[]>([])
  const [selectedStore, setSelectedStore] = useState<string | null>(null)
  const [settings, setSettings] = useState<AlertSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 알림 조건 편집 상태
  const [negativeEnabled, setNegativeEnabled] = useState(true)
  const [negativeMinRating, setNegativeMinRating] = useState(2)
  const [keywordEnabled, setKeywordEnabled] = useState(false)
  const [keywordList, setKeywordList] = useState('')
  const [ratingDropEnabled, setRatingDropEnabled] = useState(false)
  const [ratingDropThreshold, setRatingDropThreshold] = useState(0.5)
  const [channel, setChannel] = useState('in_app')

  useEffect(() => {
    const loadStores = async () => {
      try {
        const res = await fetch(`${getApiUrl()}/api/reputation/stores?user_id=demo_user`)
        const data = await res.json()
        if (data.success && data.stores.length > 0) {
          setStores(data.stores)
          setSelectedStore(data.stores[0].id)
        }
      } catch {
        console.error('Failed to load stores')
      } finally {
        setLoading(false)
      }
    }
    loadStores()
  }, [])

  const fetchSettings = useCallback(async () => {
    if (!selectedStore) return
    try {
      const res = await fetch(`${getApiUrl()}/api/reputation/alerts/settings?store_id=${selectedStore}`)
      const data = await res.json()
      if (data.success) {
        setSettings(data.settings)
        applySettingsToForm(data.settings)
      }
    } catch {
      console.error('Failed to fetch settings')
    }
  }, [selectedStore])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const applySettingsToForm = (settingsList: AlertSetting[]) => {
    // 설정값을 폼에 반영
    for (const s of settingsList) {
      const cond = s.condition || (s.condition_json ? JSON.parse(s.condition_json) : {})

      if (s.alert_type === 'negative_review') {
        setNegativeEnabled(true)
        setNegativeMinRating((cond as Record<string, number>).min_rating ?? 2)
        setChannel(s.notification_channel || 'in_app')
      } else if (s.alert_type === 'keyword_mention') {
        setKeywordEnabled(true)
        const kws = (cond as Record<string, string[]>).keywords || []
        setKeywordList(kws.join(', '))
      } else if (s.alert_type === 'rating_drop') {
        setRatingDropEnabled(true)
        setRatingDropThreshold((cond as Record<string, number>).threshold ?? 0.5)
      }
    }
  }

  const saveSettings = async () => {
    if (!selectedStore) return
    setSaving(true)

    try {
      const updates = []

      // 부정 리뷰 알림
      if (negativeEnabled) {
        updates.push(
          fetch(`${getApiUrl()}/api/reputation/alerts/settings?store_id=${selectedStore}&user_id=demo_user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert_type: 'negative_review',
              condition: { min_rating: negativeMinRating },
              notification_channel: channel,
            }),
          })
        )
      }

      // 키워드 감지 알림
      if (keywordEnabled && keywordList.trim()) {
        const keywords = keywordList.split(',').map(k => k.trim()).filter(Boolean)
        updates.push(
          fetch(`${getApiUrl()}/api/reputation/alerts/settings?store_id=${selectedStore}&user_id=demo_user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert_type: 'keyword_mention',
              condition: { keywords },
              notification_channel: channel,
            }),
          })
        )
      }

      // 평점 하락 알림
      if (ratingDropEnabled) {
        updates.push(
          fetch(`${getApiUrl()}/api/reputation/alerts/settings?store_id=${selectedStore}&user_id=demo_user`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert_type: 'rating_drop',
              condition: { threshold: ratingDropThreshold },
              notification_channel: channel,
            }),
          })
        )
      }

      await Promise.all(updates)
      toast.success('알림 설정이 저장되었습니다')
      fetchSettings()
    } catch {
      toast.error('설정 저장 실패')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#0064FF] animate-spin" />
      </div>
    )
  }

  if (stores.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
        <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">가게를 먼저 등록하세요</p>
        <p className="text-sm mt-1">대시보드에서 가게를 등록하면 알림을 설정할 수 있습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 가게 선택 */}
      {stores.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <label className="text-sm font-medium text-gray-700 mr-3">가게 선택:</label>
          <select
            value={selectedStore || ''}
            onChange={e => setSelectedStore(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.store_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* 알림 설정 카드들 */}
      <div className="space-y-4">
        {/* 1. 부정 리뷰 알림 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">부정 리뷰 알림</h3>
                <p className="text-xs text-gray-500">낮은 별점의 리뷰가 등록되면 즉시 알림</p>
              </div>
            </div>
            <button
              onClick={() => setNegativeEnabled(!negativeEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                negativeEnabled ? 'bg-[#0064FF]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                negativeEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {negativeEnabled && (
            <div className="ml-12 space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-32">별점 기준</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map(r => (
                    <button
                      key={r}
                      onClick={() => setNegativeMinRating(r)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        negativeMinRating === r
                          ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      <Star className="w-3 h-3" />
                      {r}점 이하
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. 키워드 감지 알림 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">키워드 감지 알림</h3>
                <p className="text-xs text-gray-500">특정 키워드가 포함된 리뷰 알림</p>
              </div>
            </div>
            <button
              onClick={() => setKeywordEnabled(!keywordEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                keywordEnabled ? 'bg-[#0064FF]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                keywordEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {keywordEnabled && (
            <div className="ml-12 space-y-3 border-t border-gray-100 pt-4">
              <div>
                <label className="text-sm text-gray-600 block mb-1">감지할 키워드 (쉼표로 구분)</label>
                <input
                  type="text"
                  value={keywordList}
                  onChange={e => setKeywordList(e.target.value)}
                  placeholder="예: 불친절, 비위생, 머리카락, 벌레"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0064FF]/30"
                />
                <p className="text-xs text-gray-400 mt-1">이 키워드가 리뷰에 포함되면 알림을 보냅니다</p>
              </div>
            </div>
          )}
        </div>

        {/* 3. 평점 하락 알림 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">평점 하락 알림</h3>
                <p className="text-xs text-gray-500">평균 평점이 급격히 하락하면 알림</p>
              </div>
            </div>
            <button
              onClick={() => setRatingDropEnabled(!ratingDropEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                ratingDropEnabled ? 'bg-[#0064FF]' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                ratingDropEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {ratingDropEnabled && (
            <div className="ml-12 space-y-3 border-t border-gray-100 pt-4">
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600 w-32">하락 기준</label>
                <div className="flex items-center gap-2">
                  {[0.3, 0.5, 1.0].map(t => (
                    <button
                      key={t}
                      onClick={() => setRatingDropThreshold(t)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        ratingDropThreshold === t
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          : 'bg-gray-100 text-gray-600 border border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      -{t}점 이상
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400">최근 7일 평균과 전체 평균 비교 시 알림</p>
            </div>
          )}
        </div>

        {/* 알림 채널 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#0064FF]" />
            알림 수신 방법
          </h3>
          <div className="flex gap-3">
            {[
              { value: 'in_app', label: '인앱 알림', icon: Bell, desc: '블랭크 앱 내 알림' },
              { value: 'email', label: '이메일', icon: MessageSquare, desc: '등록된 이메일로 발송 (준비중)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setChannel(opt.value)}
                disabled={opt.value === 'email'}
                className={`flex-1 p-4 rounded-lg border-2 transition-all text-left ${
                  channel === opt.value
                    ? 'border-[#0064FF] bg-[#0064FF]/5'
                    : 'border-gray-200 hover:border-gray-300'
                } ${opt.value === 'email' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <opt.icon className={`w-5 h-5 mb-1 ${channel === opt.value ? 'text-[#0064FF]' : 'text-gray-400'}`} />
                <div className="font-medium text-sm text-gray-800">{opt.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#0064FF] text-white rounded-xl text-sm font-medium hover:bg-[#0052CC] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          알림 설정 저장
        </button>
      </div>

      {/* 현재 활성 알림 요약 */}
      {settings.length > 0 && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">현재 활성 알림</h4>
          <div className="flex flex-wrap gap-2">
            {settings.map(s => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded-full border border-gray-200 text-xs text-gray-600"
              >
                {s.alert_type === 'negative_review' && <><TrendingDown className="w-3 h-3 text-red-500" /> 부정 리뷰</>}
                {s.alert_type === 'keyword_mention' && <><MessageSquare className="w-3 h-3 text-orange-500" /> 키워드 감지</>}
                {s.alert_type === 'rating_drop' && <><Shield className="w-3 h-3 text-yellow-500" /> 평점 하락</>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
