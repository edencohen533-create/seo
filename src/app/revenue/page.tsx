'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { DollarSign, TrendingUp, ShoppingCart, BarChart2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const SITE_ID = process.env.NEXT_PUBLIC_DEFAULT_SITE_ID ?? 'default'

export default function RevenuePage() {
  const [syncing, setSyncing] = useState(false)
  const [wooKey, setWooKey] = useState('')
  const [wooSecret, setWooSecret] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['revenue', SITE_ID],
    queryFn: () => fetch(`/api/revenue?siteId=${SITE_ID}`).then((r) => r.json()),
  })

  async function handleSync() {
    if (!wooKey || !wooSecret) return
    setSyncing(true)
    try {
      await fetch('/api/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: SITE_ID, wooKey, wooSecret }),
      })
      refetch()
    } finally {
      setSyncing(false)
    }
  }

  const dashboard = data?.dashboard

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenue Engine</h1>
          <p className="text-slate-500 text-sm mt-1">שיוך הכנסות WooCommerce למאמרי SEO</p>
        </div>
      </div>

      <div className="card p-4 mb-6">
        <h2 className="font-semibold text-sm text-slate-900 mb-3">חיבור WooCommerce</h2>
        <div className="flex gap-3">
          <input value={wooKey} onChange={(e) => setWooKey(e.target.value)} placeholder="Consumer Key" dir="ltr"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <input value={wooSecret} onChange={(e) => setWooSecret(e.target.value)} placeholder="Consumer Secret" type="password" dir="ltr"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleSync} disabled={syncing || !wooKey} className="btn-primary">
            {syncing ? 'מסנכרן...' : 'סנכרן הזמנות'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400">טוען...</div>
      ) : !dashboard ? (
        <div className="card p-12 text-center text-slate-400">אין נתוני הכנסות עדיין</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'סה"כ הכנסות', value: `₪${dashboard.totalRevenue.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`, icon: DollarSign, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'הכנסות מ-SEO', value: `₪${dashboard.revenueFromSeo.toLocaleString('he-IL', { minimumFractionDigits: 0 })}`, icon: TrendingUp, color: 'text-brand-600', bg: 'bg-brand-50' },
              { label: 'אחוז SEO', value: `${dashboard.seoRevenueShare.toFixed(1)}%`, icon: BarChart2, color: 'text-purple-600', bg: 'bg-purple-50' },
              { label: 'הזמנות', value: dashboard.totalOrders, icon: ShoppingCart, color: 'text-orange-600', bg: 'bg-orange-50' },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500">{label}</span>
                  <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {dashboard.revenueByMonth.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-slate-900 mb-4">הכנסות לפי חודש</h2>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dashboard.revenueByMonth}>
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => `₪${v.toLocaleString()}`} />
                    <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {dashboard.topArticlesByRevenue.length > 0 && (
            <div className="card p-4">
              <h2 className="font-semibold text-slate-900 mb-4">מאמרים מובילים בהכנסות</h2>
              <div className="space-y-2">
                {dashboard.topArticlesByRevenue.slice(0, 8).map((article: {
                  articleId: string; title: string; totalRevenue: number; totalOrders: number; conversionRate: number
                }) => (
                  <div key={article.articleId} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <p className="text-sm font-medium truncate max-w-xs">{article.title}</p>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-semibold text-green-600">₪{article.totalRevenue.toLocaleString()}</span>
                      <span className="text-slate-500">{article.totalOrders} הזמנות</span>
                      <span className="text-slate-400">{(article.conversionRate * 100).toFixed(2)}% המרה</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data?.recommendations && (
            <div className="card p-4 bg-amber-50 border-amber-200">
              <h2 className="font-semibold text-slate-900 mb-2">המלצות AI להגדלת הכנסות</h2>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{data.recommendations}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
