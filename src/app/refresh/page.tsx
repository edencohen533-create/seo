'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, TrendingDown, AlertTriangle, ChevronUp, ExternalLink } from 'lucide-react'
import { useState } from 'react'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

const ACTION_LABELS: Record<string, string> = {
  rewrite_title: 'שכתוב כותרת',
  expand_content: 'הרחבת תוכן',
  refresh_content: 'רענון תוכן',
  add_faq: 'הוספת FAQ',
  add_internal_links: 'קישורים פנימיים',
}

const URGENCY_CONFIG: Record<string, { color: string; label: string }> = {
  high: { color: 'bg-red-100 text-red-700', label: 'דחוף' },
  medium: { color: 'bg-yellow-100 text-yellow-700', label: 'בינוני' },
  low: { color: 'bg-green-100 text-green-700', label: 'נמוך' },
}

export default function RefreshPage() {
  const qc = useQueryClient()
  const [scanning, setScanning] = useState(false)

  const { data: recommendations = [], isLoading } = useQuery({
    queryKey: ['refresh', SITE_ID],
    queryFn: () =>
      fetch(`/api/feedback?siteId=${SITE_ID}`).then((r) => r.json()),
  })

  async function handleScan() {
    setScanning(true)
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID }),
      })
      qc.invalidateQueries({ queryKey: ['refresh'] })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">תור רענון תוכן</h1>
          <p className="text-slate-500 text-sm mt-1">עמודים שצריכים שיפור לפי ביצועים</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'מנתח...' : 'ריצת לולאת שיפור'}
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">טוען...</div>
      ) : recommendations.length === 0 ? (
        <div className="card p-12 text-center">
          <ChevronUp className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">אין עמודים לרענון כרגע</p>
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec: {
            articleId: string
            url: string
            title: string | null
            action: string
            reason: string
            urgency: string
            currentPosition: number
            currentCtr: number
            impressions: number
          }) => {
            const urgencyCfg = URGENCY_CONFIG[rec.urgency] ?? URGENCY_CONFIG.low
            return (
              <div key={rec.articleId} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge ${urgencyCfg.color}`}>{urgencyCfg.label}</span>
                      <span className="badge bg-slate-100 text-slate-600">
                        {ACTION_LABELS[rec.action] ?? rec.action}
                      </span>
                    </div>
                    <h3 className="font-medium text-slate-900">{rec.title ?? rec.url}</h3>
                    <p className="text-sm text-slate-500 mt-1">{rec.reason}</p>
                  </div>

                  <div className="flex items-center gap-6 text-sm shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-slate-400">מיקום</p>
                      <p className="font-semibold text-slate-900">{rec.currentPosition.toFixed(1)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">CTR</p>
                      <p className="font-semibold text-slate-900">
                        {(rec.currentCtr * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-slate-400">חשיפות</p>
                      <p className="font-semibold text-slate-900">{rec.impressions.toLocaleString()}</p>
                    </div>

                    <a
                      href={rec.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-slate-400 hover:text-brand-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
