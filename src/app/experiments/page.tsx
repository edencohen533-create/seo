'use client'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { TestTube, CheckCircle, Clock, HelpCircle } from 'lucide-react'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  running: { label: 'רץ', color: 'bg-blue-100 text-blue-700', icon: Clock },
  completed: { label: 'הושלם', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  inconclusive: { label: 'לא מכריע', color: 'bg-slate-100 text-slate-600', icon: HelpCircle },
}

export default function ExperimentsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['experiments', SITE_ID],
    queryFn: () => fetch(`/api/experiments?siteId=${SITE_ID}`).then((r) => r.json()),
  })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Experiment Engine</h1>
        <p className="text-slate-500 text-sm mt-1">A/B testing אוטומטי — כותרות, מבנה, CTA</p>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">טוען...</div>
      ) : !data?.experiments?.length ? (
        <div className="card p-12 text-center">
          <TestTube className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">אין ניסויים פעילים</p>
          <p className="text-slate-400 text-sm mt-1">ניסויים יווצרו אוטומטית מ-CTR Engine</p>
        </div>
      ) : (
        <div className="space-y-4">
          {data.insights?.length > 0 && (
            <div className="card p-4 bg-purple-50 border-purple-200">
              <h2 className="font-semibold text-slate-900 mb-2 text-sm">תובנות מניסויים</h2>
              <div className="space-y-2">
                {data.insights.map((insight: { pattern: string; confidence: number; applies_to: string }, i: number) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="badge bg-purple-100 text-purple-700">{(insight.confidence * 100).toFixed(0)}%</span>
                    <span className="text-slate-700">{insight.pattern}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.experiments.map((exp: {
            id: string; name: string; type: string; status: string;
            winnerId: string | null; significance: number | null;
            article: { title: string; primaryKeyword: string } | null;
            startedAt: string;
          }) => {
            const cfg = STATUS_CONFIG[exp.status] ?? STATUS_CONFIG.running
            const Icon = cfg.icon
            return (
              <div key={exp.id} className="card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge ${cfg.color} flex items-center gap-1`}>
                        <Icon className="w-3 h-3" />
                        {cfg.label}
                      </span>
                      <span className="badge bg-slate-100 text-slate-600">{exp.type}</span>
                    </div>
                    <h3 className="font-semibold text-slate-900">{exp.name}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{exp.article?.primaryKeyword}</p>
                  </div>
                  <div className="text-right text-sm">
                    {exp.winnerId && exp.winnerId !== 'inconclusive' && (
                      <p className="font-semibold text-green-600">מנצח: גרסה {exp.winnerId}</p>
                    )}
                    {exp.significance && (
                      <p className="text-slate-400">מובהקות: {(exp.significance * 100).toFixed(0)}%</p>
                    )}
                    <p className="text-xs text-slate-300 mt-1">
                      {new Date(exp.startedAt).toLocaleDateString('he-IL')}
                    </p>
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
