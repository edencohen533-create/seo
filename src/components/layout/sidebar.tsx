'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Target, FileText, RefreshCw,
  Search, Settings, Zap, Map, MousePointer,
  DollarSign, TestTube, Brain, TrendingUp,
} from 'lucide-react'

const nav = [
  { group: 'ליבה', items: [
    { href: '/', label: 'דשבורד', icon: LayoutDashboard },
    { href: '/opportunities', label: 'הזדמנויות', icon: Target },
    { href: '/articles', label: 'מאמרים', icon: FileText },
  ]},
  { group: 'תוכן', items: [
    { href: '/authority', label: 'Topical Authority', icon: Map },
    { href: '/ctr', label: 'CTR Engine', icon: MousePointer },
    { href: '/refresh', label: 'רענון תוכן', icon: RefreshCw },
  ]},
  { group: 'AI & טכני', items: [
    { href: '/geo', label: 'GEO Engine', icon: Brain },
    { href: '/audit', label: 'SEO אודיט', icon: Search },
  ]},
  { group: 'עסקי', items: [
    { href: '/revenue', label: 'Revenue Engine', icon: DollarSign },
    { href: '/experiments', label: 'ניסויים A/B', icon: TestTube },
  ]},
  { group: '', items: [
    { href: '/settings', label: 'הגדרות', icon: Settings },
  ]},
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 min-h-screen bg-white border-l border-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-900 text-sm">Solina SEO</p>
            <p className="text-xs text-slate-500">Engine v1.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {nav.map((section) => (
          <div key={section.group}>
            {section.group && (
              <p className="text-xs font-medium text-slate-400 px-3 mb-1 uppercase tracking-wide">
                {section.group}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || (href !== '/' && pathname.startsWith(href))
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <p className="text-xs text-slate-400 text-center">Solina © 2025</p>
      </div>
    </aside>
  )
}
