'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useState, Suspense } from 'react'
import { CheckCircle, Settings, Link2, Globe } from 'lucide-react'

function SettingsContent() {
  const qc = useQueryClient()
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('connected') === 'true'

  const [form, setForm] = useState({
    name: '',
    domain: '',
    wpUrl: '',
    wpUser: '',
    wpAppPassword: '',
    gscSiteUrl: '',
    niche: '',
    brandTone: '',
  })

  const { data: sites = [] } = useQuery({
    queryKey: ['sites'],
    queryFn: () => fetch('/api/sites').then((r) => r.json()),
  })

  const createSite = useMutation({
    mutationFn: (data: typeof form) =>
      fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sites'] }),
  })

  function handleChange(key: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    createSite.mutate(form)
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">הגדרות</h1>
        <p className="text-slate-500 text-sm mt-1">חיבור אתרים ואינטגרציות</p>
      </div>

      {justConnected && (
        <div className="card p-4 bg-green-50 border-green-200 mb-6 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <p className="text-green-700 font-medium">Google Search Console חובר בהצלחה!</p>
        </div>
      )}

      {sites.length > 0 && (
        <div className="card p-4 mb-6">
          <h2 className="font-semibold text-slate-900 mb-3">אתרים מחוברים</h2>
          <div className="space-y-2">
            {sites.map((site: {
              id: string
              name: string
              domain: string
              gscTokens: { id: string } | null
              _count: { articles: number; opportunities: number }
            }) => (
              <div key={site.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-slate-400" />
                  <div>
                    <p className="font-medium text-sm">{site.name}</p>
                    <p className="text-xs text-slate-400">{site.domain}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span>{site._count.articles} מאמרים</span>
                  <span>{site._count.opportunities} הזדמנויות</span>
                  {site.gscTokens ? (
                    <span className="badge bg-green-100 text-green-700">GSC מחובר</span>
                  ) : (
                    <a
                      href={`/api/gsc/auth?siteId=${site.id}`}
                      className="badge bg-blue-100 text-blue-700 hover:bg-blue-200"
                    >
                      חבר GSC
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-6">
        <h2 className="font-semibold text-slate-900 mb-4">הוסף אתר חדש</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="שם האתר" value={form.name} onChange={(v) => handleChange('name', v)} placeholder="בלוג הבריאות שלי" />
            <Field label="דומיין" value={form.domain} onChange={(v) => handleChange('domain', v)} placeholder="example.co.il" />
          </div>
          <Field label="WordPress URL" value={form.wpUrl} onChange={(v) => handleChange('wpUrl', v)} placeholder="https://example.co.il" dir="ltr" />
          <div className="grid grid-cols-2 gap-4">
            <Field label="שם משתמש WordPress" value={form.wpUser} onChange={(v) => handleChange('wpUser', v)} dir="ltr" />
            <Field label="Application Password" value={form.wpAppPassword} onChange={(v) => handleChange('wpAppPassword', v)} type="password" dir="ltr" />
          </div>
          <Field label="GSC Site URL" value={form.gscSiteUrl} onChange={(v) => handleChange('gscSiteUrl', v)} placeholder="https://example.co.il/" dir="ltr" />
          <Field label="נישה/קטגוריה" value={form.niche} onChange={(v) => handleChange('niche', v)} placeholder="בריאות, פיננסים, טכנולוגיה..." />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">טון מותג</label>
            <textarea
              value={form.brandTone}
              onChange={(e) => handleChange('brandTone', e.target.value)}
              placeholder="כתיבה אנושית, חמה, מקצועית. לא מוגזמת. ממוקדת בפתרון בעיות..."
              rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={createSite.isPending}
            className="btn-primary w-full"
          >
            {createSite.isPending ? 'שומר...' : 'הוסף אתר'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400">טוען...</div>}>
      <SettingsContent />
    </Suspense>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text', dir,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  dir?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}
