import Link from 'next/link';
import { useRouter } from 'next/router';
import { Brain, LayoutDashboard, Settings, Mic } from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Meetings', icon: LayoutDashboard },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  return (
    <div className="flex h-screen bg-[#0f172a] text-slate-100">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-slate-800 bg-[#0b1120]">
        <Link href="/" className="flex items-center gap-2 px-5 py-5 border-b border-slate-800">
          <Brain className="w-7 h-7 text-indigo-400" />
          <span className="text-xl font-bold text-white">MeetMind</span>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-indigo-600/20 text-indigo-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 text-xs text-slate-500">
          MeetMind v0.1.0 — Hackathon Build
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-[#0b1120]/80 backdrop-blur">
          <div className="flex items-center gap-3 md:hidden">
            <Brain className="w-6 h-6 text-indigo-400" />
            <span className="font-bold text-white">MeetMind</span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-2">
            <Mic className="w-4 h-4 text-slate-500" />
            <span className="text-xs text-slate-500">AI-Powered Meeting Intelligence</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
