import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { Search, Bell, Plus } from 'lucide-react';

interface TopbarProps {
  title: string;
  onNewCard: () => void;
  hasNotifications: boolean;
}

const Topbar: React.FC<TopbarProps> = ({ title, onNewCard, hasNotifications }) => {
  const router = useRouter();
  const [searchValue, setSearchValue] = useState('');

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchValue.trim()) {
      router.push(`/dashboard/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <div className="sticky top-0 z-10 h-16 bg-white border-b border-[var(--color-border)] flex items-center justify-between px-6">
      {/* Left side: Page title */}
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">{title}</h1>

      {/* Right side */}
      <div className="flex items-center space-x-4">
        {/* Search input */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[var(--color-text-muted)]" />
          </div>
          <input
            type="text"
            placeholder="Search cards..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-48 pl-9 pr-3 py-2 bg-gray-100 border border-gray-200 rounded-md text-sm placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)] focus:border-[var(--color-brand)]"
          />
        </div>

        {/* Notification bell */}
        <div className="relative">
          <Bell className="h-5 w-5 text-[var(--color-text-secondary)] cursor-pointer hover:text-[var(--color-text-primary)]" />
          {hasNotifications && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
          )}
        </div>

        {/* New Card button */}
        <button
          onClick={onNewCard}
          className="flex items-center px-4 py-2 bg-[var(--color-brand)] text-white text-sm font-medium rounded-md hover:bg-[var(--color-brand-dark)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--color-brand)] transition-colors duration-200"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Card
        </button>
      </div>
    </div>
  );
};

export default Topbar;