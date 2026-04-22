'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Zap, CheckCircle, TrendingUp, BarChart2, ChevronDown } from 'lucide-react'

export default function CtrPage() {
  const qc = useQueryClient()
  const [articleId, setArticleId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<CtrResult | null>(null)

  async function handleGenerate() {
    if (!articleId.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/ctr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function handleApply(variantId: string) {
    await fetch('/api/ctr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId, action: 'apply', variantId }),
    })
    alert('כותרת עודכנה!')
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">CTR Engine</h1>
        <p className="text-slate-500 text-sm mt-1">5 וריאציות כותרת + חיזוי CTR לפני פרסום</p>
      </div>

      <div className="card p-4 mb-6">
        <div className="flex gap-3">
          <input
            value={articleId}
            onChange={(e) => setArticleId(e.target.value)}
            placeholder="Article ID..."
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
            dir="ltr"
          />
          <button onClick={handleGenerate} disabled={loading || !articleId} className="btn-primary">
            {loading ? 'מייצר...' : 'צור 5 וריאציות'}
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{(result.currentCtr * 100).toFixed(1)}%</p>
              <p className="text-xs text-slate-500">CTR נוכחי</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-green-600">{result.bestVariant.predictedCtr}%</p>
              <p className="text-xs text-slate-500">CTR חזוי (best)</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-2xl font-bold text-brand-600">+{result.ctriImprovementPotential}%</p>
              <p className="text-xs text-slate-500">פוטנציאל שיפור</p>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="font-semibold mb-1 text-sm text-slate-500">כותרת נוכחית</h2>
            <p className="font-medium text-slate-900">{result.currentTitle || '—'}</p>
          </div>

          <div className="space-y-3">
            {result.variants.map((v, i) => (
              <VariantCard
                key={i}
                variant={v}
                isBest={v.title === result.bestVariant.title}
                onApply={() => handleApply(`variant-${i}`)}
              />
            ))}
          </div>

          {result.avoidWords.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm mb-2">מילים להימנע</h3>
              <div className="flex flex-wrap gap-2">
                {result.avoidWords.map((w) => (
                  <span key={w} className="badge bg-red-100 text-red-700">{w}</span>
                ))}
              </div>
            </div>
          )}

          {result.powerWords.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm mb-2">Power Words שעובדים</h3>
              <div className="flex flex-wrap gap-2">
                {result.powerWords.map((w) => (
                  <span key={w} className="badge bg-green-100 text-green-700">{w}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface CtrResult {
  articleId: string
  primaryKeyword: string
  currentTitle: string
  currentCtr: number
  variants: VariantData[]
  bestVariant: VariantData
  ctriImprovementPotential: number
  avoidWords: string[]
  powerWords: string[]
  competitorTitles: string[]
}

interface VariantData {
  title: string
  metaTitle: string
  metaDescription: string
  angle: string
  emotionalHook: string
  predictedCtr: number
  powerWords: string[]
  reasoning: string
}

function VariantCard({ variant, isBest, onApply }: { variant: VariantData; isBest: boolean; onApply: () => void }) {
  const [expanded, setExpanded] = useState(false)

  const angleLabels: Record<string, string> = {
    curiosity_gap: 'סקרנות',
    direct_benefit: 'תועלת ישירה',
    fear_avoidance: 'הימנעות מפחד',
    authority: 'סמכות',
    question: 'שאלה',
  }

  return (
    <div className={`card border-2 ${isBest ? 'border-green-400' : 'border-transparent'}`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isBest && <span className="badge bg-green-100 text-green-700">מומלץ</span>}
              <span className="badge bg-slate-100 text-slate-600">{angleLabels[variant.angle] ?? variant.angle}</span>
              <span className="badge bg-blue-100 text-blue-700">CTR חזוי: {variant.predictedCtr}%</span>
            </div>
            <p className="font-semibold text-slate-900">{variant.title}</p>
            <p className="text-sm text-slate-500 mt-1">{variant.metaDescription}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </button>
            <button onClick={onApply} className="btn-primary text-xs">
              יישם
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-600">
            <p><strong>Hook רגשי:</strong> {variant.emotionalHook}</p>
            <p className="mt-1"><strong>סיבה:</strong> {variant.reasoning}</p>
            <p className="mt-1"><strong>Meta Title:</strong> {variant.metaTitle}</p>
          </div>
        )}
      </div>
    </div>
  )
}
