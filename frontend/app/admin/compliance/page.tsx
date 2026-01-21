'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Clock,
  ArrowLeft, RefreshCw, FileText, Eye, AlertCircle,
  ChevronDown, ChevronRight, Filter, Download, Search
} from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth'
import toast from 'react-hot-toast'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.blrank.co.kr'

interface FeatureRisk {
  feature_name: string
  name: string
  risk_level: string
  category: string
  legal_issues: string[]
  problems: string[]
  safe_implementation: string[]
  monitoring_required: boolean
  user_consent_required: boolean
}

interface UsageLog {
  id: number
  user_id: number | null
  feature_name: string
  risk_level: string
  action: string
  target_data: string | null
  ip_address: string | null
  consent_given: boolean
  created_at: string
}

interface RiskAlert {
  id: number
  user_id: number | null
  feature_name: string
  alert_type: string
  alert_message: string
  severity: string
  resolved: boolean
  created_at: string
}

interface ComplianceStats {
  usage_by_risk: Record<string, number>
  top_risky_features: Array<{ feature: string; count: number }>
  unresolved_alerts: number
  high_risk_today: number
}

export default function CompliancePage() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'guidelines' | 'logs' | 'alerts'>('guidelines')
  const [guidelines, setGuidelines] = useState<{
    high: FeatureRisk[]
    medium: FeatureRisk[]
    low: FeatureRisk[]
  }>({ high: [], medium: [], low: [] })
  const [logs, setLogs] = useState<UsageLog[]>([])
  const [alerts, setAlerts] = useState<RiskAlert[]>([])
  const [stats, setStats] = useState<ComplianceStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null)
  const [logFilter, setLogFilter] = useState<string>('all')

  useEffect(() => {
    if (!isAuthenticated || !user?.is_admin) {
      router.push('/admin')
      return
    }
    fetchData()
  }, [isAuthenticated, user, router])

  const fetchData = async () => {
    setLoading(true)
    const token = localStorage.getItem('auth_token')

    try {
      // Fetch guidelines
      const guidelinesRes = await fetch(`${API_BASE}/api/compliance/guidelines`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (guidelinesRes.ok) {
        const data = await guidelinesRes.json()
        setGuidelines(data.guidelines)
      }

      // Fetch stats
      const statsRes = await fetch(`${API_BASE}/api/compliance/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStats(data.data)
      }

      // Fetch logs
      const logsRes = await fetch(`${API_BASE}/api/compliance/logs?limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (logsRes.ok) {
        const data = await logsRes.json()
        setLogs(data.logs)
      }

      // Fetch alerts
      const alertsRes = await fetch(`${API_BASE}/api/compliance/alerts?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (alertsRes.ok) {
        const data = await alertsRes.json()
        setAlerts(data.alerts)
      }
    } catch (error) {
      console.error('Failed to fetch compliance data:', error)
      toast.error('데이터를 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  const resolveAlert = async (alertId: number) => {
    const token = localStorage.getItem('auth_token')

    try {
      const res = await fetch(`${API_BASE}/api/compliance/alerts/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ alert_id: alertId })
      })

      if (res.ok) {
        toast.success('알림이 해결 처리되었습니다')
        fetchData()
      } else {
        toast.error('처리에 실패했습니다')
      }
    } catch (error) {
      toast.error('오류가 발생했습니다')
    }
  }

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">높음</span>
      case 'medium':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-700">중간</span>
      case 'low':
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">낮음</span>
      default:
        return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">-</span>
    }
  }

  const filteredLogs = logFilter === 'all' ? logs : logs.filter(log => log.risk_level === logFilter)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin" className="text-gray-500 hover:text-gray-700">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-blue-600" />
                <h1 className="text-xl font-bold">법적 준수 관리</h1>
              </div>
            </div>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              새로고침
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">미해결 알림</p>
                  <p className="text-2xl font-bold text-red-600">{stats.unresolved_alerts}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">오늘 고위험 사용</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.high_risk_today}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Eye className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">7일 고위험</p>
                  <p className="text-2xl font-bold">{stats.usage_by_risk?.high || 0}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">7일 저위험</p>
                  <p className="text-2xl font-bold text-green-600">{stats.usage_by_risk?.low || 0}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border mb-6">
          <div className="border-b">
            <div className="flex">
              <button
                onClick={() => setActiveTab('guidelines')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'guidelines'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  가이드라인
                </div>
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'logs'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4" />
                  사용 로그
                </div>
              </button>
              <button
                onClick={() => setActiveTab('alerts')}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'alerts'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  알림
                  {stats && stats.unresolved_alerts > 0 && (
                    <span className="px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                      {stats.unresolved_alerts}
                    </span>
                  )}
                </div>
              </button>
            </div>
          </div>

          <div className="p-6">
            {/* Guidelines Tab */}
            {activeTab === 'guidelines' && (
              <div className="space-y-6">
                {/* High Risk */}
                <div>
                  <h3 className="text-lg font-bold text-red-600 mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    높은 위험 ({guidelines.high.length}개)
                  </h3>
                  <div className="space-y-3">
                    {guidelines.high.map((feature) => (
                      <div key={feature.feature_name} className="border border-red-200 rounded-lg bg-red-50/50">
                        <button
                          onClick={() => setExpandedFeature(
                            expandedFeature === feature.feature_name ? null : feature.feature_name
                          )}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-red-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {getRiskBadge('high')}
                            <span className="font-medium">{feature.name}</span>
                            <span className="text-xs text-gray-500">({feature.feature_name})</span>
                          </div>
                          {expandedFeature === feature.feature_name ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        {expandedFeature === feature.feature_name && (
                          <div className="px-4 pb-4 space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">법적 이슈</h4>
                              <div className="flex flex-wrap gap-2">
                                {feature.legal_issues.map((issue, i) => (
                                  <span key={i} className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">문제점</h4>
                              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                {feature.problems.map((problem, i) => (
                                  <li key={i}>{problem}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">안전한 구현 방법</h4>
                              <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                                {feature.safe_implementation.map((impl, i) => (
                                  <li key={i}>{impl}</li>
                                ))}
                              </ul>
                            </div>
                            <div className="flex gap-4 text-xs text-gray-500">
                              <span className={feature.monitoring_required ? 'text-yellow-600' : ''}>
                                {feature.monitoring_required ? '모니터링 필수' : '모니터링 선택'}
                              </span>
                              <span className={feature.user_consent_required ? 'text-red-600' : ''}>
                                {feature.user_consent_required ? '사용자 동의 필수' : '동의 불필요'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Medium Risk */}
                <div>
                  <h3 className="text-lg font-bold text-yellow-600 mb-4 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    중간 위험 ({guidelines.medium.length}개)
                  </h3>
                  <div className="space-y-3">
                    {guidelines.medium.map((feature) => (
                      <div key={feature.feature_name} className="border border-yellow-200 rounded-lg bg-yellow-50/50">
                        <button
                          onClick={() => setExpandedFeature(
                            expandedFeature === feature.feature_name ? null : feature.feature_name
                          )}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-yellow-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {getRiskBadge('medium')}
                            <span className="font-medium">{feature.name}</span>
                            <span className="text-xs text-gray-500">({feature.feature_name})</span>
                          </div>
                          {expandedFeature === feature.feature_name ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        {expandedFeature === feature.feature_name && (
                          <div className="px-4 pb-4 space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">법적 이슈</h4>
                              <div className="flex flex-wrap gap-2">
                                {feature.legal_issues.map((issue, i) => (
                                  <span key={i} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">
                                    {issue}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">문제점</h4>
                              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                                {feature.problems.map((problem, i) => (
                                  <li key={i}>{problem}</li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">안전한 구현 방법</h4>
                              <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                                {feature.safe_implementation.map((impl, i) => (
                                  <li key={i}>{impl}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Low Risk */}
                <div>
                  <h3 className="text-lg font-bold text-green-600 mb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    낮은 위험 ({guidelines.low.length}개)
                  </h3>
                  <div className="space-y-3">
                    {guidelines.low.map((feature) => (
                      <div key={feature.feature_name} className="border border-green-200 rounded-lg bg-green-50/50">
                        <button
                          onClick={() => setExpandedFeature(
                            expandedFeature === feature.feature_name ? null : feature.feature_name
                          )}
                          className="w-full px-4 py-3 flex items-center justify-between hover:bg-green-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {getRiskBadge('low')}
                            <span className="font-medium">{feature.name}</span>
                            <span className="text-xs text-gray-500">({feature.feature_name})</span>
                          </div>
                          {expandedFeature === feature.feature_name ? (
                            <ChevronDown className="w-5 h-5 text-gray-400" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                        {expandedFeature === feature.feature_name && (
                          <div className="px-4 pb-4 space-y-4">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">안전한 구현 방법</h4>
                              <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                                {feature.safe_implementation.map((impl, i) => (
                                  <li key={i}>{impl}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                      value={logFilter}
                      onChange={(e) => setLogFilter(e.target.value)}
                      className="text-sm border rounded-lg px-3 py-2"
                    >
                      <option value="all">전체</option>
                      <option value="high">높은 위험</option>
                      <option value="medium">중간 위험</option>
                      <option value="low">낮은 위험</option>
                    </select>
                  </div>
                  <span className="text-sm text-gray-500">
                    {filteredLogs.length}개 로그
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-medium">시간</th>
                        <th className="text-left p-3 font-medium">기능</th>
                        <th className="text-left p-3 font-medium">위험도</th>
                        <th className="text-left p-3 font-medium">액션</th>
                        <th className="text-left p-3 font-medium">사용자</th>
                        <th className="text-left p-3 font-medium">동의</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b hover:bg-gray-50">
                          <td className="p-3 text-gray-500">
                            {new Date(log.created_at).toLocaleString('ko-KR')}
                          </td>
                          <td className="p-3 font-medium">{log.feature_name}</td>
                          <td className="p-3">{getRiskBadge(log.risk_level)}</td>
                          <td className="p-3">{log.action}</td>
                          <td className="p-3">
                            {log.user_id ? `User #${log.user_id}` : '비회원'}
                          </td>
                          <td className="p-3">
                            {log.consent_given ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              <XCircle className="w-4 h-4 text-gray-300" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredLogs.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      로그가 없습니다
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Alerts Tab */}
            {activeTab === 'alerts' && (
              <div className="space-y-4">
                {alerts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-400" />
                    <p>알림이 없습니다</p>
                  </div>
                ) : (
                  alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className={`p-4 rounded-lg border ${
                        alert.resolved
                          ? 'bg-gray-50 border-gray-200'
                          : alert.severity === 'warning'
                          ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {alert.resolved ? (
                            <CheckCircle className="w-5 h-5 text-gray-400 mt-0.5" />
                          ) : (
                            <AlertTriangle className={`w-5 h-5 mt-0.5 ${
                              alert.severity === 'warning' ? 'text-yellow-500' : 'text-red-500'
                            }`} />
                          )}
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{alert.feature_name}</span>
                              <span className="text-xs text-gray-500">#{alert.id}</span>
                            </div>
                            <p className={`text-sm ${alert.resolved ? 'text-gray-500' : 'text-gray-700'}`}>
                              {alert.alert_message}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {new Date(alert.created_at).toLocaleString('ko-KR')}
                            </p>
                          </div>
                        </div>
                        {!alert.resolved && (
                          <button
                            onClick={() => resolveAlert(alert.id)}
                            className="px-3 py-1 text-sm bg-white border rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            해결
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
