'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import {
  BookOpen,
  PenLine,
  Image,
  Upload,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
} from 'lucide-react'

type Step = 'brief' | 'write' | 'images' | 'publish'

const STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key: 'brief', label: 'בריף תוכן', icon: BookOpen },
  { key: 'write', label: 'כתיבת מאמר', icon: PenLine },
  { key: 'images', label: 'יצירת תמונות', icon: Image },
  { key: 'publish', label: 'פרסום לוורדפרס', icon: Upload },
]

const STATUS_STEP: Record<string, number> = {
  pending: -1,
  brief: 0,
  writing: 1,
  images: 2,
  publishing: 3,
  published: 4,
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [activeStep, setActiveStep] = useState<Step | null>(null)

  const { data: article, isLoading } = useQuery({
    queryKey: ['article', id],
    queryFn: () => fetch(`/api/articles/${id}`).then((r) => r.json()),
    refetchInterval: activeStep ? 3000 : false,
  })

  const runStep = useMutation({
    mutationFn: async (step: Step) => {
      setActiveStep(step)
      const res = await fetch(`/api/articles/${id}/${step}`, { method: 'POST' })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['article', id] })
      setActiveStep(null)
    },
    onError: () => setActiveStep(null),
  })

  if (isLoading) {
    return <div className="p-6 text-slate-400">טוען...</div>
  }

  if (!article) {
    return <div className="p-6 text-slate-400">מאמר לא נמצא</div>
  }

  const completedStep = STATUS_STEP[article.status] ?? -1

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          {article.title ?? article.primaryKeyword ?? 'מאמר חדש'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          מילת מפתח: <strong>{article.primaryKeyword}</strong>
          {article.wordCount && ` · ${article.wordCount.toLocaleString()} מילים`}
        </p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">צינור ייצור</h2>
        <div className="space-y-3">
          {STEPS.map((step, i) => {
            const done = completedStep >= i
            const current = completedStep === i - 1
            const running = activeStep === step.key

            return (
              <div
                key={step.key}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  done
                    ? 'bg-green-50 border-green-200'
                    : current
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {done ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : running ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  ) : (
                    <step.icon
                      className={`w-5 h-5 ${current ? 'text-blue-600' : 'text-slate-400'}`}
                    />
                  )}
                  <span
                    className={`font-medium ${
                      done
                        ? 'text-green-700'
                        : current
                        ? 'text-blue-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>

                {!done && !running && (
                  <button
                    onClick={() => runStep.mutate(step.key)}
                    disabled={!current || runStep.isPending}
                    className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                      current
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    הפעל
                  </button>
                )}
                {running && (
                  <span className="text-sm text-blue-600 font-medium">מעבד...</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {article.status === 'published' && (
        <div className="card p-4 bg-green-50 border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="font-semibold text-green-700">המאמר פורסם בהצלחה כטיוטה בוורדפרס</p>
            {article.wpPostUrl && (
              <a
                href={article.wpPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-auto flex items-center gap-1 text-sm text-green-600 hover:underline"
              >
                פתח בוורדפרס
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {article.errorLog && (
        <div className="card p-4 bg-red-50 border-red-200 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <p className="font-semibold text-red-700 text-sm">שגיאה</p>
          </div>
          <pre className="text-xs text-red-600 whitespace-pre-wrap">{article.errorLog}</pre>
        </div>
      )}

      {article.contentBrief && (
        <BriefDisplay brief={article.contentBrief} />
      )}

      {article.content && (
        <div className="card p-6 mt-6">
          <h2 className="font-semibold text-slate-900 mb-4">תצוגה מקדימה</h2>
          <div
            className="prose prose-sm max-w-none"
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: article.content.substring(0, 2000) + '...' }}
          />
        </div>
      )}
    </div>
  )
}

function BriefDisplay({ brief }: { brief: Record<string, unknown> }) {
  return (
    <div className="card p-6 mt-6">
      <h2 className="font-semibold text-slate-900 mb-4">בריף תוכן</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-slate-500">מילת מפתח ראשית</span>
          <p className="font-medium">{String(brief.primaryKeyword ?? '')}</p>
        </div>
        <div>
          <span className="text-slate-500">כוונת חיפוש</span>
          <p className="font-medium">{String(brief.searchIntent ?? '')}</p>
        </div>
        <div>
          <span className="text-slate-500">סוג מאמר</span>
          <p className="font-medium">{String(brief.articleType ?? '')}</p>
        </div>
        <div>
          <span className="text-slate-500">אורך מומלץ</span>
          <p className="font-medium">{String(brief.recommendedLength ?? '')} מילים</p>
        </div>
        <div className="col-span-2">
          <span className="text-slate-500">H1</span>
          <p className="font-medium">{String(brief.h1 ?? '')}</p>
        </div>
        {Array.isArray(brief.secondaryKeywords) && (
          <div className="col-span-2">
            <span className="text-slate-500">מילות מפתח משניות</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {(brief.secondaryKeywords as string[]).map((kw) => (
                <span key={kw} className="badge bg-slate-100 text-slate-700">{kw}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
