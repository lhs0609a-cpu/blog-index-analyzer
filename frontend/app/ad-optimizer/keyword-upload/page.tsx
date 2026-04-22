'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Loader2, Trash2, Play, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuthStore } from '@/lib/stores/auth'
import { adGet, adUpload, adPost } from '@/lib/api/adFetch'

interface ParsedItem {
  keyword: string
  bid: number
  row: number
}

interface ParseResponse {
  success: boolean
  filename: string
  total: number
  items: ParsedItem[]
  items_count: number
  errors: string[]
  errors_count: number
  registered: number
  message?: string
}

interface AdGroup {
  nccAdgroupId: string
  name: string
  nccCampaignId?: string
}

export default function KeywordUploadPage() {
  const { isAuthenticated, user } = useAuthStore()
  const [file, setFile] = useState<File | null>(null)
  const [defaultBid, setDefaultBid] = useState(100)
  const [adGroupId, setAdGroupId] = useState('')
  const [adGroups, setAdGroups] = useState<AdGroup[]>([])
  const [parsing, setParsing] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResponse | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  // 기본값: 엑셀 B열 입찰가 무시하고 UI 입찰가로 전체 적용
  const [forceDefaultBid, setForceDefaultBid] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isAuthenticated && !user) {
      window.location.href = '/login'
    }
  }, [isAuthenticated, user])

  useEffect(() => {
    // 광고그룹 목록 로드
    adGet<{ success: boolean; ad_groups: AdGroup[] }>('/api/naver-ad/adgroups', { showToast: false })
      .then((res) => {
        if (res?.ad_groups?.length) {
          setAdGroups(res.ad_groups)
          setAdGroupId(res.ad_groups[0].nccAdgroupId)
        }
      })
      .catch(() => {
        // 연동 안 됨 - 빈 상태로 둠
      })
  }, [])

  const handleFileSelect = (f: File) => {
    const isExcel = /\.(xlsx|xls|csv)$/i.test(f.name)
    if (!isExcel) {
      toast.error('.xlsx 또는 .csv 파일만 업로드 가능합니다')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('파일 크기는 10MB를 초과할 수 없습니다')
      return
    }
    setFile(f)
    setParseResult(null)
  }

  const handleParse = async () => {
    if (!file) return
    if (defaultBid < 70 || defaultBid > 100000) {
      toast.error('입찰가는 70원 ~ 100,000원 사이여야 합니다')
      return
    }
    setParsing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('default_bid', String(defaultBid))
      fd.append('auto_register', 'false')
      fd.append('force_default_bid', String(forceDefaultBid))
      const res = await adUpload<ParseResponse>('/api/naver-ad/keywords/upload-excel', fd)
      setParseResult(res)
      toast.success(`${res.total}개 키워드 파싱 완료`)
    } catch (e) {
      // 토스트는 adUpload가 처리
    } finally {
      setParsing(false)
    }
  }

  const handleRegister = async () => {
    if (!parseResult?.items?.length) {
      toast.error('등록할 키워드가 없습니다')
      return
    }
    if (!adGroupId) {
      toast.error('광고그룹을 선택해주세요')
      return
    }
    // 전체 일괄 모드인 경우 UI 입찰가로 강제 덮어쓰기
    const items = parseResult.items.map((it) => ({
      keyword: it.keyword,
      bid: forceDefaultBid ? defaultBid : it.bid,
    }))

    const bidNote = forceDefaultBid
      ? `모든 키워드에 ${defaultBid.toLocaleString()}원 입찰가 적용`
      : '엑셀에 지정된 개별 입찰가 적용'
    if (!confirm(`${items.length}개 키워드를 네이버 광고에 등록합니다.\n${bidNote}\n계속하시겠습니까?`)) return

    setRegistering(true)
    try {
      const res = await adPost<{ success: boolean; added_count: number; total_requested: number }>(
        '/api/naver-ad/keywords/bulk-add-with-bids',
        {
          ad_group_id: adGroupId,
          items,
          default_bid: defaultBid,
        }
      )
      toast.success(`${res.added_count}/${res.total_requested}개 키워드 등록 완료`)
      setParseResult({
        ...parseResult,
        items: parseResult.items.map((it) => ({
          ...it,
          bid: forceDefaultBid ? defaultBid : it.bid,
        })),
        registered: res.added_count,
      })
    } catch (e) {
      // adPost가 처리
    } finally {
      setRegistering(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelect(f)
  }

  const resetAll = () => {
    setFile(null)
    setParseResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">키워드 엑셀 일괄 등록</h1>
          <p className="text-gray-600">
            엑셀(.xlsx) 또는 CSV 파일로 키워드와 입찰가를 한 번에 네이버 광고에 등록합니다.
          </p>
        </div>

        {/* 가이드 */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-semibold mb-1">엑셀 포맷</p>
              <ul className="space-y-1 text-blue-800">
                <li>• <b>A열(첫 번째 열): 키워드</b>만 있으면 됩니다 (40자 이하)</li>
                <li>• 입찰가는 <b>아래 "입찰가" 입력칸</b>에 한 번만 넣으면 모든 키워드에 똑같이 적용됩니다</li>
                <li>• 첫 행이 헤더("키워드")여도 자동 감지됩니다</li>
                <li>• 중복 키워드는 자동 제거됩니다</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 설정 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">등록 설정</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">광고그룹</label>
              {adGroups.length > 0 ? (
                <select
                  value={adGroupId}
                  onChange={(e) => setAdGroupId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
                >
                  {adGroups.map((g) => (
                    <option key={g.nccAdgroupId} value={g.nccAdgroupId}>
                      {g.name} ({g.nccAdgroupId})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={adGroupId}
                  onChange={(e) => setAdGroupId(e.target.value)}
                  placeholder="광고그룹 ID 직접 입력 (예: grp-a001-01-0000000123456)"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                입찰가 (원) {forceDefaultBid && <span className="text-blue-600">— 전체 키워드에 일괄 적용</span>}
              </label>
              <input
                type="number"
                min={70}
                max={100000}
                step={10}
                value={defaultBid}
                onChange={(e) => setDefaultBid(Number(e.target.value) || 100)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold"
              />
              <p className="text-xs text-gray-500 mt-1">
                70원 ~ 100,000원 (기본 100원)
              </p>
            </div>
          </div>

          {/* 모드 선택 */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={forceDefaultBid}
                onChange={(e) => setForceDefaultBid(e.target.checked)}
                className="mt-1"
              />
              <div className="text-sm">
                <div className="font-medium text-gray-900">
                  모든 키워드에 위 입찰가로 일괄 적용 (권장)
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  체크 해제 시: 엑셀 B열에 입찰가가 있으면 그 값을 우선 사용 (없으면 위 입찰가)
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* 파일 업로드 */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">파일 업로드</h2>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFileSelect(f)
              }}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <div className="font-medium text-gray-900">{file.name}</div>
                  <div className="text-sm text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    resetAll()
                  }}
                  className="ml-4 p-2 text-gray-400 hover:text-red-600"
                  title="파일 제거"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-700 font-medium">파일을 끌어놓거나 클릭해서 선택</p>
                <p className="text-sm text-gray-500 mt-1">.xlsx, .xls, .csv (최대 10MB)</p>
              </>
            )}
          </div>

          {file && !parseResult && (
            <button
              onClick={handleParse}
              disabled={parsing}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
            >
              {parsing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  파싱 중...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  미리보기 (파싱)
                </>
              )}
            </button>
          )}
        </div>

        {/* 파싱 결과 */}
        {parseResult && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">파싱 결과</h2>
              <div className="flex gap-2">
                <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  유효: {parseResult.total}개
                </div>
                {parseResult.errors_count > 0 && (
                  <div className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full text-sm font-medium flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    경고/오류: {parseResult.errors_count}개
                  </div>
                )}
                {parseResult.registered > 0 && (
                  <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    등록 완료: {parseResult.registered}개
                  </div>
                )}
              </div>
            </div>

            {parseResult.errors_count > 0 && (
              <details className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
                <summary className="text-sm font-medium text-amber-900 cursor-pointer">
                  경고/오류 보기 ({parseResult.errors_count}개)
                </summary>
                <ul className="mt-2 text-xs text-amber-800 space-y-1 max-h-40 overflow-y-auto">
                  {parseResult.errors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </details>
            )}

            {/* 키워드 테이블 */}
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 w-16">#</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">키워드</th>
                    <th className="px-3 py-2 text-right font-medium text-gray-700 w-24">입찰가</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.items.map((item, i) => (
                    <tr key={i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-500">{item.row}</td>
                      <td className="px-3 py-2 text-gray-900">{item.keyword}</td>
                      <td className="px-3 py-2 text-right text-gray-900 font-mono">
                        {item.bid.toLocaleString()}원
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parseResult.items_count > parseResult.items.length && (
                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 text-center border-t">
                  미리보기 {parseResult.items.length}개 표시 / 전체 {parseResult.items_count}개
                </div>
              )}
            </div>

            {/* 등록 버튼 */}
            {parseResult.registered === 0 && parseResult.items_count > 0 && (
              <button
                onClick={handleRegister}
                disabled={registering || !adGroupId}
                className="mt-4 w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 flex items-center justify-center gap-2"
              >
                {registering ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    등록 중... ({parseResult.items_count}개)
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    네이버 광고에 {parseResult.items_count}개 등록하기
                  </>
                )}
              </button>
            )}

            {parseResult.registered > 0 && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-900">
                  {parseResult.registered}개 키워드가 성공적으로 등록되었습니다
                </p>
                <button
                  onClick={resetAll}
                  className="mt-3 text-sm text-green-700 underline"
                >
                  새 파일 업로드
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
