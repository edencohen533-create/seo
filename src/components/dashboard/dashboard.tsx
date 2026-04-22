'use client'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, MousePointer, Eye, BarChart2, Target, FileText, RefreshCw } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

export function Dashboard() {
  const { data: perf } = useQuery({
    queryKey: ['performance', SITE_ID],
    queryFn: () => fetch(`/api/performance?siteId=${SITE_ID}&days=28`).then((r) => r.json()),
  })

  const { data: opportunities } = useQuery({
    queryKey: ['opportunities', SITE_ID, 'pending'],
    queryFn: () =>
      fetch(`/api/opportunities?siteId=${SITE_ID}&status=pending&limit=5`).then((r) => r.json()),
  })

  const { data: articles } = useQuery({
    queryKey: ['articles', SITE_ID],
    queryFn: () => fetch(`/api/articles?siteId=${SITE_ID}&limit=5`).then((r) => r.json()),
  })

  const metrics = [
    {
      label: 'קליקים (28 יום)',
      value: perf?.totals?.clicks?.toLocaleString() ?? '—',
      icon: MousePointer,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'חשיפות',
      value: perf?.totals?.impressions?.toLocaleString() ?? '—',
      icon: Eye,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      label: 'CTR ממוצע',
      value: perf?.totals?.avgCtr ? `${(perf.totals.avgCtr * 100).toFixed(1)}%` : '—',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'מיקום ממוצע',
      value: perf?.totals?.avgPosition?.toFixed(1) ?? '—',
      icon: BarChart2,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">דשבורד SEO</h1>
        <p className="text-slate-500 text-sm mt-1">סקירה כללית של ביצועי האתר</p>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-500">{label}</span>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 card p-4">
          <h2 className="font-semibold text-slate-900 mb-4">ביצועים לאורך זמן</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area type="monotone" dataKey="clicks" stroke="#0ea5e9" fill="#e0f2fe" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-brand-600" />
              <h3 className="font-semibold text-slate-900 text-sm">הזדמנויות מובילות</h3>
            </div>
            {opportunities?.slice(0, 4).map((opp: { id: string; query: string; priority: number; type: string }) => (
              <div key={opp.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-700 truncate max-w-[140px]">{opp.query}</span>
                <PriorityBadge priority={opp.priority} />
              </div>
            ))}
          </div>

          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-brand-600" />
              <h3 className="font-semibold text-slate-900 text-sm">מאמרים אחרונים</h3>
            </div>
            {articles?.slice(0, 4).map((article: { id: string; title: string; status: string }) => (
              <div key={article.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-sm text-slate-700 truncate max-w-[140px]">{article.title ?? '—'}</span>
                <StatusBadge status={article.status} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function PriorityBadge({ priority }: { priority: number }) {
  const color =
    priority >= 70 ? 'bg-red-100 text-red-700' :
    priority >= 40 ? 'bg-yellow-100 text-yellow-700' :
    'bg-green-100 text-green-700'
  return <span className={`badge ${color}`}>{Math.round(priority)}</span>
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-600',
    writing: 'bg-blue-100 text-blue-700',
    images: 'bg-purple-100 text-purple-700',
    publishing: 'bg-yellow-100 text-yellow-700',
    published: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = {
    pending: 'ממתין',
    writing: 'כתיבה',
    images: 'תמונות',
    publishing: 'פרסום',
    published: 'פורסם',
    failed: 'שגיאה',
  }
  return (
    <span className={`badge ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {labels[status] ?? status}
    </span>
  )
}
