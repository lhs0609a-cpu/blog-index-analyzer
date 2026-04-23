'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Activity, Users, Target, TrendingUp, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://blog-index-analyzer.fly.dev';

interface Variant {
  weight: number;
  config: Record<string, any>;
}

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: string;
  variants: Record<string, Variant>;
  traffic_percentage: number;
  created_at: string;
}

interface VariantStats {
  users: number;
  events: Record<string, number>;
  conversion_rate: number;
}

interface ExperimentStats {
  experiment_id: string;
  total_users: number;
  variants: Record<string, VariantStats>;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default function ABTestDashboard() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] = useState<string | null>(null);
  const [stats, setStats] = useState<ExperimentStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedExperiments, setExpandedExperiments] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchExperiments();
  }, []);

  async function fetchExperiments() {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/ab-test/experiments`);
      const data = await res.json();
      if (data.success) {
        setExperiments(data.experiments || []);
        if (data.experiments?.length > 0 && !selectedExperiment) {
          setSelectedExperiment(data.experiments[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch experiments:', error);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedExperiment) {
      fetchStats(selectedExperiment);
    }
  }, [selectedExperiment]);

  async function fetchStats(experimentId: string) {
    try {
      const res = await fetch(`${API_URL}/api/ab-test/experiments/${experimentId}/stats`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  async function updateStatus(experimentId: string, status: string) {
    try {
      await fetch(`${API_URL}/api/ab-test/experiments/${experimentId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      fetchExperiments();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  }

  function toggleExpanded(experimentId: string) {
    setExpandedExperiments(prev => {
      const next = new Set(prev);
      if (next.has(experimentId)) {
        next.delete(experimentId);
      } else {
        next.add(experimentId);
      }
      return next;
    });
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const chartData = stats ? Object.entries(stats.variants).map(([name, data], index) => ({
    name,
    users: data.users,
    conversionRate: data.conversion_rate,
    views: data.events.view || 0,
    clicks: data.events.click || 0,
    conversions: data.events.conversion || 0,
    color: COLORS[index % COLORS.length]
  })) : [];

  const pieData = chartData.map(item => ({
    name: item.name,
    value: item.users,
    fill: item.color
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-500" />
          A/B 테스트 대시보드
        </h2>
        <button
          onClick={fetchExperiments}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Target className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">활성 실험</p>
              <p className="text-xl font-bold">
                {experiments.filter(e => e.status === 'active').length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Users className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">총 참가자</p>
              <p className="text-xl font-bold">{stats?.total_users || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TrendingUp className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">평균 전환율</p>
              <p className="text-xl font-bold">
                {chartData.length > 0
                  ? (chartData.reduce((acc, d) => acc + d.conversionRate, 0) / chartData.length).toFixed(1)
                  : 0}%
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Activity className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">전체 실험</p>
              <p className="text-xl font-bold">{experiments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Experiment List */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="p-4 border-b">
          <h3 className="font-semibold">실험 목록</h3>
        </div>
        <div className="divide-y">
          {experiments.map(experiment => (
            <div key={experiment.id} className="p-4">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => {
                  setSelectedExperiment(experiment.id);
                  toggleExpanded(experiment.id);
                }}
              >
                <div className="flex items-center gap-4">
                  <div>
                    <h4 className="font-medium">{experiment.name}</h4>
                    <p className="text-sm text-gray-500">{experiment.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(experiment.status)}`}>
                    {experiment.status}
                  </span>
                  <span className="text-sm text-gray-500">
                    {Object.keys(experiment.variants).length} variants
                  </span>
                  {expandedExperiments.has(experiment.id) ? (
                    <ChevronUp className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  )}
                </div>
              </div>

              {expandedExperiments.has(experiment.id) && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  <p className="text-sm text-gray-600">{experiment.description}</p>

                  {/* Variants */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(experiment.variants).map(([name, data], index) => (
                      <div key={name} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium" style={{ color: COLORS[index % COLORS.length] }}>
                            {name}
                          </span>
                          <span className="text-sm text-gray-500">{data.weight}%</span>
                        </div>
                        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                          {JSON.stringify(data.config, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    {experiment.status === 'active' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus(experiment.id, 'paused');
                        }}
                        className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-lg text-sm hover:bg-yellow-200"
                      >
                        일시정지
                      </button>
                    ) : experiment.status === 'paused' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus(experiment.id, 'active');
                        }}
                        className="px-3 py-1 bg-green-100 text-green-800 rounded-lg text-sm hover:bg-green-200"
                      >
                        재개
                      </button>
                    ) : null}
                    {experiment.status !== 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStatus(experiment.id, 'completed');
                        }}
                        className="px-3 py-1 bg-gray-100 text-gray-800 rounded-lg text-sm hover:bg-gray-200"
                      >
                        완료
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Charts */}
      {stats && chartData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Distribution */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="font-semibold mb-4">사용자 분포</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Conversion Rates */}
          <div className="bg-white rounded-xl shadow-sm border p-4">
            <h3 className="font-semibold mb-4">전환율 비교</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="conversionRate" name="전환율 (%)" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Event Breakdown */}
          <div className="bg-white rounded-xl shadow-sm border p-4 lg:col-span-2">
            <h3 className="font-semibold mb-4">이벤트 분석</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="views" name="조회" fill="#10B981" />
                <Bar dataKey="clicks" name="클릭" fill="#F59E0B" />
                <Bar dataKey="conversions" name="전환" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
