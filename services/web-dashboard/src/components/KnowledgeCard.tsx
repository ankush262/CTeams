import React, { useState } from 'react';
import { Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import Badge from '@/components/Badge';
import Button from '@/components/Button';

interface KnowledgeCardProps {
  id: string;
  authorName: string;
  authorInitials: string;
  createdAt: string;
  originalContent: string;
  summaryBullets: string[];
  topicTag: string;
  priority: 'normal' | 'high';
  sentiment: 'neutral' | 'positive' | 'negative';
  hasConflict: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const KnowledgeCard: React.FC<KnowledgeCardProps> = ({
  id,
  authorName,
  authorInitials,
  createdAt,
  originalContent,
  summaryBullets,
  topicTag,
  priority,
  sentiment,
  hasConflict,
  onEdit,
  onDelete,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);

  const formatTime = (isoString: string) => {
    const now = Date.now();
    const created = new Date(isoString).getTime();
    const diff = now - created;

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (diff < 60000) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const sentimentConfig = {
    neutral: { color: 'bg-gray-400', text: 'Neutral' },
    positive: { color: 'bg-green-400', text: 'Positive' },
    negative: { color: 'bg-red-400', text: 'Negative' },
  };

  return (
    <div className={`bg-white border border-[var(--color-border)] rounded-xl shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 ${hasConflict ? 'rounded-t-none' : ''}`}>
      {hasConflict && (
        <div className="bg-red-100 text-red-800 p-3 rounded-t-xl text-sm font-medium">
          ⚠️ Conflict detected with another card
        </div>
      )}

      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-[var(--color-brand)] text-white rounded-full flex items-center justify-center text-sm font-medium mr-3">
              {authorInitials}
            </div>
            <div>
              <div className="font-semibold text-[var(--color-text-primary)]">{authorName}</div>
              <div className="text-sm text-[var(--color-text-muted)]">{formatTime(createdAt)}</div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Badge label={topicTag} size="sm" />
            <Badge
              label={priority === 'high' ? 'High Priority' : 'Normal'}
              size="sm"
              // Override color for priority
            />
          </div>
        </div>

        {/* Body */}
        <div className="mb-4">
          <div className="text-sm text-[var(--color-text-muted)] mb-2">AI Summary</div>
          <ul className="space-y-1">
            {summaryBullets.map((bullet, index) => (
              <li key={index} className="flex items-start">
                <div className="w-1.5 h-1.5 bg-[var(--color-brand)] rounded-full mt-2 mr-3 flex-shrink-0"></div>
                <div className="text-[var(--color-text-primary)]">{bullet}</div>
              </li>
            ))}
          </ul>

          {/* Collapsible original content */}
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="flex items-center mt-3 text-sm text-[var(--color-brand)] hover:underline"
          >
            {showOriginal ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            {showOriginal ? 'Hide original' : 'View original'}
          </button>
          {showOriginal && (
            <div className="bg-gray-100 p-4 rounded-lg mt-2 text-[var(--color-text-primary)]">
              {originalContent}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${sentimentConfig[sentiment].color}`}></div>
            <span className="text-sm text-[var(--color-text-secondary)]">{sentimentConfig[sentiment].text}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(id)}
              className="p-2"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(id)}
              className="p-2 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeCard;