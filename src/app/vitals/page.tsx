'use client'
import { useState } from 'react'
import { Zap, CheckCircle, AlertTriangle, XCircle, Monitor, Smartphone } from 'lucide-react'

interface VitalsResult {
  url: string
  device: string
  lcp: number | null
  fid: number | null
  cls: number | null
  ttfb: number | null
  performanceScore: number | null
  lcpStatus: string
  clsStatus: string
  ttfbStatus: string
  recommendations: string[]
}

interface SiteVitals {
  avgScore: number
  poorUrls: string[]
  goodUrls: string[]
  summary: string
}

export default function VitalsPage() {
  const [siteId, setSiteId] = useState('')
  const [url, setUrl] = useState('')
  const [device, setDevice] = useState<'mobile' | 'desktop'>('mobile')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VitalsResult | null>(null)
  const [siteResult, setSiteResult] = useState<SiteVitals | null>(null)

  async function measureSingle() {
    if (!siteId || !url) return
    setLoading(true)
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId, url, device }),
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function measureSite() {
    if (!siteId) return
    setLoading(true)
    try {
      const res = await fetch('/api/vitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId }),
      })
      setSiteResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  const statusIcon = (status: string) =>
    status === 'good' ? <CheckCircle className="w-4 h-4 text-green-600" /> :
    status === 'needs-improvement' ? <AlertTriangle className="w-4 h-4 text-yellow-500" /> :
    <XCircle className="w-4 h-4 text-red-500" />

  const scoreColor = (score: number | null) =>
    !score ? 'text-slate-400' :
    score >= 90 ? 'text-green-600' : score >= 50 ? 'text-yellow-500' : 'text-red-500'

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Core Web Vitals</h1>
        <p className="text-slate-500 text-sm mt-1">LCP, CLS, TTFB — מדידה אמיתית דרך PageSpeed API</p>
      </div>

      <div className="card p-4 mb-6">
        <div className="space-y-3">
          <input
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            placeholder="Site ID..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            dir="ltr"
          />
          <div className="flex gap-3">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/page (optional — leave empty for site audit)"
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
              dir="ltr"
            />
            <div className="flex border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setDevice('mobile')}
                className={`px-3 py-2 flex items-center gap-1 text-sm ${device === 'mobile' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDevice('desktop')}
                className={`px-3 py-2 flex items-center gap-1 text-sm ${device === 'desktop' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
            <button onClick={url ? measureSingle : measureSite} disabled={loading || !siteId} className="btn-primary flex items-center gap-2">
              <Zap className="w-4 h-4" />
              {loading ? 'מודד...' : url ? 'מדוד עמוד' : 'אודיט אתר'}
            </button>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">{result.url}</h3>
              <span className={`text-2xl font-bold ${scoreColor(result.performanceScore)}`}>
                {result.performanceScore ?? '—'}/100
              </span>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'LCP', value: result.lcp ? `${(result.lcp / 1000).toFixed(1)}s` : '—', status: result.lcpStatus, desc: 'Largest Contentful Paint' },
                { label: 'CLS', value: result.cls?.toFixed(3) ?? '—', status: result.clsStatus, desc: 'Cumulative Layout Shift' },
                { label: 'TTFB', value: result.ttfb ? `${result.ttfb.toFixed(0)}ms` : '—', status: result.ttfbStatus, desc: 'Time to First Byte' },
                { label: 'FCP', value: result.fid ? `${(result.fid / 1000).toFixed(1)}s` : '—', status: 'good', desc: 'First Contentful Paint' },
              ].map((metric) => (
                <div key={metric.label} className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="flex justify-center mb-1">{statusIcon(metric.status)}</div>
                  <p className="text-xl font-bold text-slate-900">{metric.value}</p>
                  <p className="text-xs font-medium text-slate-700">{metric.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{metric.desc}</p>
                </div>
              ))}
            </div>

            {result.recommendations.length > 0 && (
              <div className="mt-4 space-y-2">
                {result.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
                    {rec}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {siteResult && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Site Vitals Audit</h3>
            <span className={`text-2xl font-bold ${scoreColor(siteResult.avgScore)}`}>
              {siteResult.avgScore}/100
            </span>
          </div>
          <p className="text-sm text-slate-600 mb-4">{siteResult.summary}</p>
          <div className="grid grid-cols-2 gap-4">
            {siteResult.goodUrls.length > 0 && (
              <div>
                <p className="text-xs font-medium text-green-700 mb-2">עמודים טובים ({siteResult.goodUrls.length})</p>
                {siteResult.goodUrls.slice(0, 5).map((u, i) => (
                  <p key={i} className="text-xs text-slate-600 truncate">{u}</p>
                ))}
              </div>
            )}
            {siteResult.poorUrls.length > 0 && (
              <div>
                <p className="text-xs font-medium text-red-600 mb-2">עמודים שדורשים שיפור ({siteResult.poorUrls.length})</p>
                {siteResult.poorUrls.slice(0, 5).map((u, i) => (
                  <p key={i} className="text-xs text-slate-600 truncate">{u}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
