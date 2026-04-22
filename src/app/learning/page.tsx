'use client'
import { useState } from 'react'
import { Brain, TrendingUp, BarChart2, Zap, RefreshCw } from 'lucide-react'

interface Pattern {
  type: string
  key: string
  value: string
  confidence: number
  avgCtrLift: number
  avgPositionGain: number
  recommendation: string
}

interface SiteModel {
  patterns: Pattern[]
  topPerformerProfile: { avgWordCount: number; avgH2Count: number; hasFaqRate: number; avgCtr: number; avgPosition: number }
  underperformerProfile: { avgWordCount: number; avgH2Count: number; hasFaqRate: number; avgCtr: number; avgPosition: number }
  keyInsights: string[]
  lastUpdated: string
}

export default function LearningPage() {
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState<SiteModel | null>(null)
  const [biReport, setBiReport] = useState<{ wordCountAnalysis: { range: string; avgCtr: number; count: number }[]; insights: string[] } | null>(null)

  async function buildModel() {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await fetch('/api/learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, action: 'build' }),
      })
      setModel(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function loadBIReport() {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await fetch('/api/data-layer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, action: 'bi_report' }),
      })
      setBiReport(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const confidenceColor = (c: number) =>
    c >= 0.8 ? 'text-green-700 bg-green-100' : c >= 0.6 ? 'text-yellow-700 bg-yellow-100' : 'text-red-700 bg-red-100'

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Learning Engine</h1>
        <p className="text-slate-500 text-sm mt-1">מזהה patterns ייחודיים לאתר שלך — מה גורם להצלחה</p>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex gap-3">
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="Site ID..."
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            dir="ltr"
          />
          <button onClick={buildModel} disabled={loading || !siteId} className="btn-primary flex items-center gap-2">
            <Brain className="w-4 h-4" />
            {loading ? 'מנתח...' : 'בנה מודל'}
          </button>
          <button onClick={loadBIReport} disabled={loading || !siteId} className="btn-secondary flex items-center gap-2">
            <BarChart2 className="w-4 h-4" />
            BI Report
          </button>
        </div>
      </div>

      {model && (
        <div className="space-y-6">
          {model.keyInsights.length > 0 && (
            <div className="card p-4 bg-brand-50 border-brand-200">
              <h3 className="font-semibold text-brand-900 mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                תובנות מפתח לאתר הזה
              </h3>
              <ul className="space-y-2">
                {model.keyInsights.map((insight, i) => (
                  <li key={i} className="text-sm text-brand-800 flex items-start gap-2">
                    <span className="font-bold text-brand-600">{i + 1}.</span>
                    {insight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3 text-green-700">Top Performers Profile</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">אורך מאמר</span><span className="font-medium">{model.topPerformerProfile.avgWordCount} מילים</span></div>
                <div className="flex justify-between"><span className="text-slate-500">כמות H2</span><span className="font-medium">{model.topPerformerProfile.avgH2Count}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">יש FAQ</span><span className="font-medium">{(model.topPerformerProfile.hasFaqRate * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CTR ממוצע</span><span className="font-medium text-green-600">{model.topPerformerProfile.avgCtr.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">מיקום ממוצע</span><span className="font-medium text-green-600">{model.topPerformerProfile.avgPosition.toFixed(1)}</span></div>
              </div>
            </div>
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3 text-red-600">Under Performers Profile</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">אורך מאמר</span><span className="font-medium">{model.underperformerProfile.avgWordCount} מילים</span></div>
                <div className="flex justify-between"><span className="text-slate-500">כמות H2</span><span className="font-medium">{model.underperformerProfile.avgH2Count}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">יש FAQ</span><span className="font-medium">{(model.underperformerProfile.hasFaqRate * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">CTR ממוצע</span><span className="font-medium text-red-600">{model.underperformerProfile.avgCtr.toFixed(2)}%</span></div>
                <div className="flex justify-between"><span className="text-slate-500">מיקום ממוצע</span><span className="font-medium text-red-600">{model.underperformerProfile.avgPosition.toFixed(1)}</span></div>
              </div>
            </div>
          </div>

          {model.patterns.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3">Patterns שזוהו ({model.patterns.length})</h3>
              <div className="space-y-3">
                {model.patterns.map((p, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-lg">
                    <span className={`badge text-xs px-2 py-0.5 rounded-full ${confidenceColor(p.confidence)}`}>
                      {(p.confidence * 100).toFixed(0)}%
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{p.key}</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{p.value}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{p.recommendation}</p>
                    </div>
                    <div className="text-right text-xs">
                      {p.avgCtrLift > 0 && <p className="text-green-600">+{p.avgCtrLift.toFixed(1)}% CTR</p>}
                      {p.avgPositionGain > 0 && <p className="text-blue-600">+{p.avgPositionGain.toFixed(1)} pos</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {biReport && (
        <div className="mt-6 card p-4">
          <h3 className="font-semibold text-slate-900 mb-3">BI Report — ניתוח לפי אורך מאמר</h3>
          <div className="grid grid-cols-5 gap-2">
            {biReport.wordCountAnalysis.map((w) => (
              <div key={w.range} className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-lg font-bold text-brand-600">{w.avgCtr.toFixed(1)}%</p>
                <p className="text-xs text-slate-500">CTR</p>
                <p className="text-xs font-medium mt-1">{w.range} מילים</p>
                <p className="text-xs text-slate-400">{w.count} מאמרים</p>
              </div>
            ))}
          </div>
          {biReport.insights.length > 0 && (
            <div className="mt-4 space-y-1">
              {biReport.insights.map((insight, i) => (
                <p key={i} className="text-sm text-slate-600 flex items-start gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
                  {insight}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
