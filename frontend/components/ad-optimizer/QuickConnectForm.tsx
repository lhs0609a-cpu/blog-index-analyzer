'use client'

import { useState, ClipboardEvent } from 'react'
import { CheckCircle, Loader2, AlertTriangle, Eye, EyeOff, Zap, ExternalLink, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { adPost } from '@/lib/api/adFetch'

interface QuickConnectFormProps {
  userId: number
  onComplete: (account: { customer_id: string; name: string }) => void
  /** 처음 연동하는 사용자를 위한 단계별 튜토리얼로 전환 */
  onShowTutorial?: () => void
}

/**
 * 빠른 연동 폼 — 튜토리얼(8단계 마법사)을 건너뛰고
 * 고객 ID / API 키 / 비밀키만 바로 입력해 연동한다.
 * 이미 키를 보유한 재연동·다중 광고주 추가 시나리오용.
 */
export default function QuickConnectForm({ userId, onComplete, onShowTutorial }: QuickConnectFormProps) {
  const [form, setForm] = useState({ customer_id: '', api_key: '', secret_key: '', name: '' })
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)

  // 네이버 CUSTOMER_ID 는 자릿수 고정이 아닌 숫자 계정번호(6~10자리 혼재)
  const customerIdValid = /^\d{6,10}$/.test(form.customer_id)
  const apiKeyFilled = form.api_key.trim().length > 0
  const secretKeyFilled = form.secret_key.trim().length >= 20
  const canSubmit = customerIdValid && apiKeyFilled && secretKeyFilled && !isConnecting

  const handlePaste = (field: 'customer_id' | 'api_key' | 'secret_key', e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\s/g, '')
    const value = field === 'customer_id' ? pasted.replace(/\D/g, '').slice(0, 10) : pasted
    setForm(prev => ({ ...prev, [field]: value }))
    toast.success('붙여넣기 완료! (공백 자동 제거됨)', { duration: 1500, icon: '📋' })
  }

  const connect = async () => {
    if (!canSubmit) {
      toast.error('고객 ID·API 키·비밀키를 모두 입력해주세요')
      return
    }
    setIsConnecting(true)
    setError(null)
    try {
      // 백엔드 connect 는 연결테스트 실패 시에도 HTTP 200 + {success:false} 로 응답하므로
      // body.success 를 직접 확인해 거짓 성공 표시를 막는다. (AccountSetupWizard 와 동일)
      const res = await adPost<{ success?: boolean; message?: string }>(
        '/api/naver-ad/account/connect', form, { userId }
      )
      if (res && res.success === false) {
        setError(res.message || 'API 연결 확인에 실패했습니다. 고객 ID·API 키·비밀키를 확인하거나 잠시 후 다시 시도하세요.')
        return
      }
      toast.success('계정이 연동되었습니다!')
      onComplete({ customer_id: form.customer_id, name: form.name || `계정 ${form.customer_id}` })
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : '계정 연동에 실패했습니다.'
      if (detail.includes('고객') || detail.includes('customer')) {
        setError('고객 ID가 올바르지 않습니다. 광고시스템 좌상단에서 정확한 번호를 확인하세요.')
      } else if (detail.includes('인증') || detail.includes('auth') || detail.includes('401')) {
        setError('API 키 또는 비밀키가 올바르지 않습니다. 키 정보를 다시 확인하세요.')
      } else if (detail.includes('네트워크') || detail.includes('network') || detail.includes('연결')) {
        setError('서버에 연결할 수 없습니다. 인터넷 연결을 확인하고 다시 시도하세요.')
      } else {
        setError(detail)
      }
    } finally {
      setIsConnecting(false)
    }
  }

  const inputClass = (filled: boolean, valid: boolean) =>
    `w-full px-4 py-3 border rounded-xl focus:ring-2 focus:border-transparent transition-all ${
      filled
        ? valid
          ? 'border-green-300 focus:ring-green-500 bg-green-50'
          : 'border-red-300 focus:ring-red-500 bg-red-50'
        : 'border-gray-200 focus:ring-blue-500'
    }`

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">빠른 연동</h3>
            <p className="text-sm text-gray-500">키 3개만 입력하면 바로 연동됩니다.</p>
          </div>
        </div>
        <a
          href="https://manage.searchad.naver.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 flex-shrink-0"
        >
          네이버 광고시스템 <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="space-y-4">
        {/* 고객 ID */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded flex items-center justify-center text-xs font-bold">1</span>
            고객 ID (Customer ID) *
            <span className="text-xs text-gray-400 ml-auto">숫자 6~10자리 · 광고시스템 좌상단</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.customer_id}
            onChange={(e) => setForm({ ...form, customer_id: e.target.value.replace(/\D/g, '').slice(0, 10) })}
            onPaste={(e) => handlePaste('customer_id', e)}
            placeholder="예: 1234567 또는 441986"
            className={inputClass(!!form.customer_id, customerIdValid)}
          />
          {form.customer_id && !customerIdValid && (
            <p className="text-xs text-red-500 mt-1">숫자 6~10자리를 입력하세요</p>
          )}
        </div>

        {/* API 키 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <span className="w-5 h-5 bg-indigo-100 text-indigo-700 rounded flex items-center justify-center text-xs font-bold">2</span>
            API 키 (Access License) *
            <span className="text-xs text-gray-400 ml-auto">API 라이선스 정보</span>
          </label>
          <input
            type="text"
            value={form.api_key}
            onChange={(e) => setForm({ ...form, api_key: e.target.value.trim() })}
            onPaste={(e) => handlePaste('api_key', e)}
            placeholder="예: 01000000001a2b3c..."
            className={inputClass(apiKeyFilled, apiKeyFilled)}
          />
        </div>

        {/* 비밀키 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <span className="w-5 h-5 bg-red-100 text-red-700 rounded flex items-center justify-center text-xs font-bold">3</span>
            비밀 키 (Secret Key) *
            <span className="text-xs text-gray-400 ml-auto">발급 시 1회 표시</span>
          </label>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={form.secret_key}
              onChange={(e) => setForm({ ...form, secret_key: e.target.value.trim() })}
              onPaste={(e) => handlePaste('secret_key', e)}
              placeholder="비밀 키를 입력하세요"
              className={inputClass(!!form.secret_key, secretKeyFilled) + ' pr-11'}
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {form.secret_key && !secretKeyFilled && (
            <p className="text-xs text-amber-500 mt-1">20자 이상이어야 합니다 (현재: {form.secret_key.length}자)</p>
          )}
        </div>

        {/* 계정 이름 (선택) */}
        <div>
          <label className="text-sm font-medium text-gray-700 mb-2 block">계정 이름 (선택사항)</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="식별을 위한 계정 이름"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          onClick={connect}
          disabled={!canSubmit}
          className={`w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold transition-all ${
            canSubmit
              ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:shadow-lg hover:shadow-blue-500/30'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {isConnecting ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> 연동 확인 중...</>
          ) : (
            <><CheckCircle className="w-5 h-5" /> 연동하기</>
          )}
        </button>

        {onShowTutorial && (
          <button
            onClick={onShowTutorial}
            className="w-full flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-blue-600 py-1"
          >
            <BookOpen className="w-4 h-4" />
            처음이세요? 단계별 가이드로 연동하기
          </button>
        )}
      </div>
    </div>
  )
}
