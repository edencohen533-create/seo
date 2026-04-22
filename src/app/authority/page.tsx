'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Map, RefreshCw, CheckCircle, Circle, Plus, TrendingUp } from 'lucide-react'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

export default function AuthorityPage() {
  const qc = useQueryClient()
  const [building, setBuilding] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['topical', SITE_ID],
    queryFn: () => fetch(`/api/topical?siteId=${SITE_ID}`).then((r) => r.json()),
  })

  async function handleBuild() {
    setBuilding(true)
    try {
      await fetch('/api/topical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID }),
      })
      qc.invalidateQueries({ queryKey: ['topical'] })
    } finally {
      setBuilding(false)
    }
  }

  const map = data?.map
  const coverage = map?.coverageScore ?? 0
  const pillars = (map?.pillars as TopicPillar[] | null) ?? []
  const nextToWrite = data?.nextToWrite ?? []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Topical Authority</h1>
          <p className="text-slate-500 text-sm mt-1">מפת נושאים — כיסוי מלא של הנישה</p>
        </div>
        <button onClick={handleBuild} disabled={building} className="btn-primary flex items-center gap-2">
          <RefreshCw className={`w-4 h-4 ${building ? 'animate-spin' : ''}`} />
          {building ? 'בונה...' : 'בנה Topic Map'}
        </button>
      </div>

      {map && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-brand-600">{coverage}%</p>
            <p className="text-sm text-slate-500 mt-1">כיסוי נישה</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-slate-900">{pillars.length}</p>
            <p className="text-sm text-slate-500 mt-1">Pillar Pages</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-slate-900">{map.totalArticles}</p>
            <p className="text-sm text-slate-500 mt-1">מאמרים נדרשים</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-3xl font-bold text-green-600">
              {map.articles?.filter((a: { status: string }) => a.status === 'published').length ?? 0}
            </p>
            <p className="text-sm text-slate-500 mt-1">מאמרים פורסמו</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {isLoading ? (
            <div className="text-center py-20 text-slate-400">טוען מפת נושאים...</div>
          ) : pillars.length === 0 ? (
            <div className="card p-12 text-center">
              <Map className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">אין Topic Map עדיין</p>
              <p className="text-slate-400 text-sm mt-1">לחץ "בנה Topic Map" ליצירת מפת נושאים</p>
            </div>
          ) : (
            pillars.map((pillar) => (
              <PillarCard key={pillar.id} pillar={pillar} />
            ))
          )}
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 mb-3 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-600" />
              הבא לכתיבה
            </h3>
            {nextToWrite.length === 0 ? (
              <p className="text-sm text-slate-400">אין מאמרים מתוכננים</p>
            ) : (
              <div className="space-y-2">
                {nextToWrite.map((item: { id: string; keyword: string; type: string; cluster: string }) => (
                  <div key={item.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.keyword}</p>
                      <p className="text-xs text-slate-400">{item.type}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {map && Array.isArray(map.missingTopics) && map.missingTopics.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 mb-3 text-sm">נושאים חסרים</h3>
              <div className="space-y-1">
                {(map.missingTopics as string[]).slice(0, 8).map((topic: string, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-slate-600">
                    <Circle className="w-3 h-3 text-red-400" />
                    {topic}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TopicPillar {
  id: string
  keyword: string
  h1: string
  searchVolumeTier: string
  clusters: { id: string; keyword: string; type: string; status: string; writingPriority: number }[]
}

function PillarCard({ pillar }: { pillar: TopicPillar }) {
  const [expanded, setExpanded] = useState(false)
  const published = pillar.clusters.filter((c) => c.status === 'published').length
  const total = pillar.clusters.length

  return (
    <div className="card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between text-right"
      >
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${
            pillar.searchVolumeTier === 'high' ? 'bg-red-500' :
            pillar.searchVolumeTier === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
          }`} />
          <div className="text-right">
            <p className="font-semibold text-slate-900">{pillar.keyword}</p>
            <p className="text-xs text-slate-400">{pillar.h1}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{published}/{total} מאמרים</span>
          <div className="w-16 bg-slate-200 rounded-full h-1.5">
            <div
              className="bg-brand-500 h-1.5 rounded-full"
              style={{ width: `${total > 0 ? (published / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 gap-2">
            {pillar.clusters.map((cluster) => (
              <div
                key={cluster.id}
                className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                  cluster.status === 'published' ? 'bg-green-50' : 'bg-slate-50'
                }`}
              >
                {cluster.status === 'published' ? (
                  <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />
                ) : (
                  <Circle className="w-3 h-3 text-slate-300 shrink-0" />
                )}
                <span className="truncate">{cluster.keyword}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
