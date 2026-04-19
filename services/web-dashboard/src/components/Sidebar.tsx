import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { LayoutDashboard, Mic, Search, Settings, LogOut } from 'lucide-react';
import useStore from '@/store/useStore';

const Sidebar: React.FC = () => {
  const router = useRouter();
  const { user } = useStore();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Meetings', href: '/dashboard', icon: Mic },
    { name: 'Search', href: '/dashboard/search', icon: Search },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : 'CT';

  const handleLogout = () => {
    // Handle logout logic here
    console.log('Logout clicked');
  };

  return (
    <div className="fixed left-0 top-0 h-full w-60 bg-white border-r border-[var(--color-border)] hidden md:flex flex-col">
      {/* Top Section */}
      <div className="p-6 border-b border-[var(--color-border)]">
        <div className="text-2xl font-bold text-[var(--color-brand)]">MeetMind</div>
        <div className="text-sm text-[var(--color-text-muted)] mt-1">Meeting Intelligence</div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-2">
          {navigation.map((item) => {
            const isActive = router.pathname === item.href;
            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-[var(--color-brand)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Section */}
      <div className="p-4 border-t border-[var(--color-border)]">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-[var(--color-brand)] text-white rounded-full flex items-center justify-center text-sm font-medium">
            {initials}
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {user?.name || 'User'}
            </div>
            <div className="text-xs text-[var(--color-text-muted)] truncate">
              {user?.email || 'user@example.com'}
            </div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center w-full mt-3 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] rounded-md hover:text-red-500 hover:bg-red-50 transition-colors duration-200"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;