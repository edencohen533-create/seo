'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Zap, TrendingUp, Eye, MousePointer, RefreshCcw, Plus } from 'lucide-react'
import { useState } from 'react'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

const TYPE_LABELS: Record<string, string> = {
  new_article: 'מאמר חדש',
  upgrade_article: 'שדרוג',
  ctr_improvement: 'שיפור CTR',
  internal_links: 'קישורים פנימיים',
  declining_page: 'עמוד יורד',
}

const TYPE_COLORS: Record<string, string> = {
  new_article: 'bg-blue-100 text-blue-700',
  upgrade_article: 'bg-purple-100 text-purple-700',
  ctr_improvement: 'bg-yellow-100 text-yellow-700',
  internal_links: 'bg-green-100 text-green-700',
  declining_page: 'bg-red-100 text-red-700',
}

export default function OpportunitiesPage() {
  const qc = useQueryClient()
  const [scanning, setScanning] = useState(false)

  const { data: opportunities = [], isLoading } = useQuery({
    queryKey: ['opportunities', SITE_ID],
    queryFn: () => fetch(`/api/opportunities?siteId=${SITE_ID}&limit=100`).then((r) => r.json()),
  })

  const createArticle = useMutation({
    mutationFn: (opportunityId: string) =>
      fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID, opportunityId }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['opportunities'] })
      qc.invalidateQueries({ queryKey: ['articles'] })
    },
  })

  async function handleScan() {
    setScanning(true)
    try {
      await fetch('/api/opportunities/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID }),
      })
      qc.invalidateQueries({ queryKey: ['opportunities'] })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">הזדמנויות SEO</h1>
          <p className="text-slate-500 text-sm mt-1">
            {opportunities.length} הזדמנויות זוהו מ-Search Console
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCcw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'סורק...' : 'סרוק עכשיו'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">טוען הזדמנויות...</div>
      ) : opportunities.length === 0 ? (
        <div className="card p-12 text-center">
          <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">אין הזדמנויות עדיין</p>
          <p className="text-slate-400 text-sm mt-1">לחץ על "סרוק עכשיו" לאחר חיבור GSC</p>
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp: {
            id: string
            query: string
            type: string
            priority: number
            impressions: number
            clicks: number
            ctr: number
            position: number
            notes: string
            articles: { id: string; status: string }[]
          }) => (
            <div key={opp.id} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${TYPE_COLORS[opp.type] ?? 'bg-slate-100 text-slate-600'}`}>
                      {TYPE_LABELS[opp.type] ?? opp.type}
                    </span>
                    <PriorityScore score={opp.priority} />
                  </div>
                  <h3 className="font-semibold text-slate-900">{opp.query}</h3>
                  <p className="text-sm text-slate-500 mt-1">{opp.notes}</p>
                </div>

                <div className="flex items-center gap-6 text-sm shrink-0">
                  <Stat icon={Eye} label="חשיפות" value={opp.impressions.toLocaleString()} />
                  <Stat icon={MousePointer} label="קליקים" value={opp.clicks.toLocaleString()} />
                  <Stat
                    icon={TrendingUp}
                    label="CTR"
                    value={`${(opp.ctr * 100).toFixed(1)}%`}
                  />
                  <Stat
                    icon={Target}
                    label="מיקום"
                    value={opp.position.toFixed(1)}
                    highlight={opp.position <= 10}
                  />

                  {opp.articles?.length > 0 ? (
                    <span className="badge bg-green-100 text-green-700">
                      {opp.articles[0].status}
                    </span>
                  ) : (
                    <button
                      onClick={() => createArticle.mutate(opp.id)}
                      className="btn-primary text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      צור מאמר
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ElementType
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="text-center">
      <div className="flex items-center gap-1 text-slate-400 justify-center mb-0.5">
        <Icon className="w-3 h-3" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`font-semibold ${highlight ? 'text-green-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  )
}

function PriorityScore({ score }: { score: number }) {
  const color =
    score >= 70 ? 'bg-red-500' : score >= 40 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-1">
      <div className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-slate-500">עדיפות {Math.round(score)}</span>
    </div>
  )
}
