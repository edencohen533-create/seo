'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft, RefreshCw, Send, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import Link from 'next/link'

type PublishStatus = 'draft' | 'pending' | 'publish'

interface Article {
  id: string
  title: string | null
  slug: string | null
  content: string | null
  excerpt: string | null
  metaTitle: string | null
  metaDescription: string | null
  status: string
  primaryKeyword: string | null
  audience: string | null
  imagePrompt: string | null
  imageHistory: { url: string; prompt: string; createdAt: string }[] | null
  wpPostUrl: string | null
}

export default function ArticleReviewPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const qc = useQueryClient()
  const [imageFeedback, setImageFeedback] = useState('')
  const [publishStatus, setPublishStatus] = useState<PublishStatus>('draft')
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  const { data: article, isLoading } = useQuery<Article>({
    queryKey: ['article', id],
    queryFn: () => fetch(`/api/articles/${id}`).then((r) => r.json()),
  })

  const currentImage = article?.imageHistory?.at(-1)

  const regenerateImage = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/ai/regenerate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articleId: id,
          currentImagePrompt: article?.imagePrompt ?? '',
          feedback: imageFeedback,
          topic: article?.primaryKeyword ?? '',
          audience: article?.audience ?? '',
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: () => {
      setImageFeedback('')
      qc.invalidateQueries({ queryKey: ['article', id] })
      setNotification({ type: 'success', msg: 'תמונה חדשה נוצרה' })
    },
    onError: (e) => setNotification({ type: 'error', msg: String(e) }),
  })

  const publish = useMutation({
    mutationFn: async (status: PublishStatus) => {
      const res = await fetch('/api/ai/publish-approved-article', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: id, publishStatus: status }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['article', id] })
      setNotification({ type: 'success', msg: `פורסם בהצלחה! ${data.wordpressPostUrl ?? ''}` })
    },
    onError: (e) => setNotification({ type: 'error', msg: String(e) }),
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (!article) return <div className="p-6 text-red-500">מאמר לא נמצא</div>

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href={`/articles/${id}`} className="flex items-center gap-2 text-slate-500 hover:text-slate-700 text-sm">
          <ArrowLeft className="w-4 h-4" /> חזור
        </Link>
        <h1 className="text-xl font-bold text-slate-900">סקירה לפני פרסום</h1>
        <span className={`badge ${article.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
          {article.status}
        </span>
      </div>

      {notification && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${notification.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {notification.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {notification.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left — Article Preview */}
        <div className="lg:col-span-2 space-y-4">

          {/* Meta */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-slate-700 text-sm">מטאדאטה</h2>
            <div>
              <p className="text-xs text-slate-400 mb-1">כותרת</p>
              <p className="font-medium text-slate-900">{article.title}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Meta Title</p>
              <p className="text-sm text-slate-700">{article.metaTitle}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Meta Description</p>
              <p className="text-sm text-slate-600">{article.metaDescription}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 mb-1">Slug</p>
              <code className="text-xs bg-slate-100 px-2 py-1 rounded">{article.slug}</code>
            </div>
          </div>

          {/* Content Preview */}
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-slate-400" />
              <h2 className="font-semibold text-slate-700 text-sm">תוכן המאמר</h2>
            </div>
            <div
              className="prose prose-sm max-w-none text-slate-700 max-h-[500px] overflow-y-auto border border-slate-100 rounded p-3 text-right"
              dir="rtl"
              dangerouslySetInnerHTML={{ __html: article.content ?? '' }}
            />
          </div>
        </div>

        {/* Right — Image + Actions */}
        <div className="space-y-4">

          {/* Current Image */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-slate-700 text-sm">תמונה ראשית</h2>
            {currentImage ? (
              <img
                src={currentImage.url}
                alt={article.title ?? ''}
                className="w-full rounded-lg object-cover aspect-video"
              />
            ) : (
              <div className="w-full aspect-video bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-sm">
                אין תמונה
              </div>
            )}

            {article.imagePrompt && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Prompt נוכחי</p>
                <p className="text-xs text-slate-500 italic">{article.imagePrompt}</p>
              </div>
            )}

            {article.imageHistory && article.imageHistory.length > 1 && (
              <p className="text-xs text-slate-400">{article.imageHistory.length} תמונות נוצרו</p>
            )}
          </div>

          {/* Image Feedback */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-slate-700 text-sm">הערות לתמונה</h2>
            <textarea
              value={imageFeedback}
              onChange={(e) => setImageFeedback(e.target.value)}
              placeholder="למשל: תרחיק מהמוצר, תוסיף אישה צעירה, תשנה לרקע חוץ..."
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              rows={3}
              dir="rtl"
            />
            <button
              onClick={() => regenerateImage.mutate()}
              disabled={regenerateImage.isPending || !imageFeedback.trim()}
              className="w-full btn-secondary flex items-center justify-center gap-2"
            >
              {regenerateImage.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              צור תמונה חדשה
            </button>
          </div>

          {/* Publish Actions */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-slate-700 text-sm">פרסום לוורדפרס</h2>

            <select
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value as PublishStatus)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="draft">טיוטה (Draft)</option>
              <option value="pending">ממתין לאישור (Pending)</option>
              <option value="publish">פרסם עכשיו</option>
            </select>

            <button
              onClick={() => publish.mutate(publishStatus)}
              disabled={publish.isPending || article.status === 'published'}
              className="w-full btn-primary flex items-center justify-center gap-2"
            >
              {publish.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {publishStatus === 'publish' ? 'אשר ופרסם' : 'שמור בוורדפרס'}
            </button>

            {article.wpPostUrl && (
              <a
                href={article.wpPostUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-xs text-brand-600 hover:underline"
              >
                פתח בוורדפרס →
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
