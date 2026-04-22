'use client'
import { useState } from 'react'
import { Search, CheckCircle, AlertTriangle, Info, BarChart2 } from 'lucide-react'

interface AuditResult {
  url: string
  score: number
  aiSummary: string
  issues: {
    type: string
    severity: 'critical' | 'warning' | 'info'
    description: string
    recommendation: string
    element?: string
  }[]
  stats: {
    title: string | null
    description: string | null
    h1Count: number
    h2Count: number
    wordCount: number
    imageCount: number
    imagesWithoutAlt: number
    internalLinks: number
    externalLinks: number
    hasCanonical: boolean
    hasSchema: boolean
    hasSitemap: boolean
    hasRobots: boolean
  }
}

const SEVERITY_CONFIG = {
  critical: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'קריטי' },
  warning: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'אזהרה' },
  info: { icon: Info, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'מידע' },
}

export default function AuditPage() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AuditResult | null>(null)
  const [error, setError] = useState('')

  async function handleAudit() {
    if (!url.trim()) return
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await fetch(`/api/seo/audit?url=${encodeURIComponent(url)}`)
      if (!res.ok) throw new Error('Audit failed')
      setResult(await res.json())
    } catch (e) {
      setError('אירעה שגיאה בביצוע הבדיקה')
    } finally {
      setLoading(false)
    }
  }

  const scoreColor =
    result?.score && result.score >= 80
      ? 'text-green-600'
      : result?.score && result.score >= 60
      ? 'text-yellow-600'
      : 'text-red-600'

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">SEO אודיט</h1>
        <p className="text-slate-500 text-sm mt-1">בדיקת SEO מקיפה לכל URL</p>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex gap-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAudit()}
            placeholder="https://example.com/page"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            dir="ltr"
          />
          <button
            onClick={handleAudit}
            disabled={loading || !url.trim()}
            className="btn-primary flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            {loading ? 'בודק...' : 'בצע אודיט'}
          </button>
        </div>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <div className="card p-4 text-center col-span-1">
              <p className="text-sm text-slate-500 mb-1">ציון SEO</p>
              <p className={`text-4xl font-bold ${scoreColor}`}>{result.score}</p>
              <p className="text-xs text-slate-400 mt-1">מתוך 100</p>
            </div>

            <div className="card p-4 col-span-3">
              <h3 className="font-semibold text-slate-900 mb-2 text-sm">סיכום AI</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{result.aiSummary}</p>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-4">נתונים טכניים</h3>
            <div className="grid grid-cols-4 gap-3 text-sm">
              {[
                { label: 'כותרת', value: result.stats.title ? `✓ (${result.stats.title.length} תווים)` : '✗ חסר' },
                { label: 'תיאור', value: result.stats.description ? `✓ (${result.stats.description.length} תווים)` : '✗ חסר' },
                { label: 'H1 / H2', value: `${result.stats.h1Count} / ${result.stats.h2Count}` },
                { label: 'מילים', value: result.stats.wordCount.toLocaleString() },
                { label: 'תמונות', value: `${result.stats.imageCount} (${result.stats.imagesWithoutAlt} ללא alt)` },
                { label: 'קישורים פנימיים', value: result.stats.internalLinks },
                { label: 'Canonical', value: result.stats.hasCanonical ? '✓' : '✗' },
                { label: 'Schema', value: result.stats.hasSchema ? '✓' : '✗' },
                { label: 'Sitemap', value: result.stats.hasSitemap ? '✓' : '✗' },
                { label: 'Robots.txt', value: result.stats.hasRobots ? '✓' : '✗' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="font-medium mt-0.5">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-4">
              בעיות ({result.issues.length})
            </h3>
            <div className="space-y-3">
              {result.issues.map((issue, i) => {
                const cfg = SEVERITY_CONFIG[issue.severity]
                return (
                  <div key={i} className={`border rounded-lg p-3 ${cfg.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <cfg.icon className={`w-4 h-4 ${cfg.color}`} />
                      <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-800">{issue.description}</p>
                    <p className="text-sm text-slate-600 mt-1">{issue.recommendation}</p>
                  </div>
                )
              })}
              {result.issues.length === 0 && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  <p className="font-medium">לא נמצאו בעיות!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
