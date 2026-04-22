'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, ExternalLink, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: 'ממתין', color: 'bg-slate-100 text-slate-600' },
  brief: { label: 'בריף', color: 'bg-indigo-100 text-indigo-700' },
  writing: { label: 'כתיבה', color: 'bg-blue-100 text-blue-700' },
  images: { label: 'תמונות', color: 'bg-purple-100 text-purple-700' },
  publishing: { label: 'פרסום', color: 'bg-yellow-100 text-yellow-700' },
  published: { label: 'פורסם', color: 'bg-green-100 text-green-700' },
  failed: { label: 'שגיאה', color: 'bg-red-100 text-red-700' },
}

export default function ArticlesPage() {
  const qc = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [creating, setCreating] = useState(false)

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['articles', SITE_ID],
    queryFn: () => fetch(`/api/articles?siteId=${SITE_ID}&limit=100`).then((r) => r.json()),
  })

  async function handleCreate() {
    if (!keyword.trim()) return
    setCreating(true)
    try {
      await fetch('/api/articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID, primaryKeyword: keyword }),
      })
      setKeyword('')
      qc.invalidateQueries({ queryKey: ['articles'] })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מאמרים</h1>
          <p className="text-slate-500 text-sm mt-1">{articles.length} מאמרים</p>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-semibold text-slate-900 mb-3 text-sm">צור מאמר חדש</h2>
        <div className="flex gap-3">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="מילת מפתח ראשית..."
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !keyword.trim()}
            className="btn-primary flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            {creating ? 'יוצר...' : 'צור מאמר'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">טוען מאמרים...</div>
      ) : articles.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">אין מאמרים עדיין</p>
        </div>
      ) : (
        <div className="space-y-3">
          {articles.map((article: {
            id: string
            title: string | null
            primaryKeyword: string | null
            status: string
            wordCount: number | null
            wpPostUrl: string | null
            createdAt: string
            opportunity: { query: string; priority: number } | null
          }) => {
            const statusCfg = STATUS_CONFIG[article.status] ?? STATUS_CONFIG.pending
            return (
              <Link
                key={article.id}
                href={`/articles/${article.id}`}
                className="card p-4 flex items-center justify-between hover:shadow-md transition-shadow block"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge ${statusCfg.color}`}>{statusCfg.label}</span>
                    {article.opportunity && (
                      <span className="text-xs text-slate-400">
                        מ: {article.opportunity.query}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-slate-900 truncate">
                    {article.title ?? article.primaryKeyword ?? 'מאמר חדש'}
                  </h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-400">
                    {article.wordCount && <span>{article.wordCount.toLocaleString()} מילים</span>}
                    <span>{new Date(article.createdAt).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {article.wpPostUrl && (
                    <a
                      href={article.wpPostUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1.5 text-slate-400 hover:text-brand-600"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
