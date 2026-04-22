'use client'
import { useState } from 'react'
import { Brain, Zap, CheckCircle, AlertCircle } from 'lucide-react'

export default function GeoPage() {
  const [articleId, setArticleId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeoResult | null>(null)

  async function handleOptimize() {
    if (!articleId) return
    setLoading(true)
    try {
      const res = await fetch('/api/geo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId }),
      })
      setResult(await res.json())
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">GEO Engine</h1>
        <p className="text-slate-500 text-sm mt-1">Generative Engine Optimization — ChatGPT, Perplexity, AI Overviews</p>
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
          <button onClick={handleOptimize} disabled={loading || !articleId} className="btn-primary flex items-center gap-2">
            <Brain className="w-4 h-4" />
            {loading ? 'מאפטם...' : 'אפטם ל-AI Search'}
          </button>
        </div>
      </div>

      {result && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-brand-600">{result.aiReadabilityScore}</p>
              <p className="text-sm text-slate-500 mt-1">AI Readability Score</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-3xl font-bold text-green-600">{result.citationScore}</p>
              <p className="text-sm text-slate-500 mt-1">Citation Score</p>
            </div>
          </div>

          {result.featuredSnippetCandidate && (
            <div className="card p-4 bg-blue-50 border-blue-200">
              <h3 className="font-semibold text-sm text-blue-800 mb-2">Featured Snippet Candidate</h3>
              <p className="text-sm text-blue-900">{result.featuredSnippetCandidate}</p>
            </div>
          )}

          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3">AI Search Signals</h3>
            <div className="space-y-2">
              {result.aiSearchSignals?.map((signal: { signal: string; strength: string; present: boolean; impact: string }, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  {signal.present ? (
                    <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div className="flex-1">
                    <span className="text-sm font-medium">{signal.signal}</span>
                    <span className={`badge mr-2 text-xs ${
                      signal.strength === 'strong' ? 'bg-green-100 text-green-700' :
                      signal.strength === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{signal.strength}</span>
                  </div>
                  <p className="text-xs text-slate-400 max-w-[200px] text-right">{signal.impact}</p>
                </div>
              ))}
            </div>
          </div>

          {result.directAnswers?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3">תשובות ישירות ל-AI</h3>
              <div className="space-y-3">
                {result.directAnswers.slice(0, 4).map((da: { question: string; answer: string; confidence: number }, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-3">
                    <p className="font-medium text-sm text-slate-900">{da.question}</p>
                    <p className="text-sm text-slate-600 mt-1">{da.answer}</p>
                    <span className="badge bg-slate-100 text-slate-500 mt-1">
                      ביטחון: {(da.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.recommendations?.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3">המלצות אופטימיזציה</h3>
              <div className="space-y-2">
                {result.recommendations.slice(0, 5).map((rec: {
                  type: string; description: string; implementation: string; estimatedImpact: string; priority: number
                }, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <span className="badge bg-brand-100 text-brand-700">{rec.priority}</span>
                    <div>
                      <p className="text-sm font-medium">{rec.description}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{rec.implementation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface GeoResult {
  aiReadabilityScore: number
  citationScore: number
  featuredSnippetCandidate: string
  aiSearchSignals: { signal: string; strength: string; present: boolean; impact: string }[]
  directAnswers: { question: string; answer: string; confidence: number }[]
  recommendations: { type: string; description: string; implementation: string; estimatedImpact: string; priority: number }[]
}
