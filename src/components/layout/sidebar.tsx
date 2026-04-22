'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Target,
  FileText,
  RefreshCw,
  Search,
  Settings,
  Zap,
} from 'lucide-react'

const nav = [
  { href: '/', label: 'דשבורד', icon: LayoutDashboard },
  { href: '/opportunities', label: 'הזדמנויות', icon: Target },
  { href: '/articles', label: 'מאמרים', icon: FileText },
  { href: '/refresh', label: 'רענון תוכן', icon: RefreshCw },
  { href: '/audit', label: 'SEO אודיט', icon: Search },
  { href: '/settings', label: 'הגדרות', icon: Settings },
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

      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <p className="text-xs text-slate-400 text-center">Solina © 2025</p>
      </div>
    </aside>
  )
}
