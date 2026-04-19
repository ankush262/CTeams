import React from 'react';
import { BookOpen } from 'lucide-react';
import KnowledgeCard from './KnowledgeCard';

interface Card {
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
}

interface CardFeedProps {
  cards: Card[];
  isLoading: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const CardFeed: React.FC<CardFeedProps> = ({ cards, isLoading, onEdit, onDelete }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="bg-gray-200 animate-pulse rounded-xl h-64"></div>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">No cards yet</h3>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Create your first knowledge card using the button above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card) => (
        <KnowledgeCard
          key={card.id}
          {...card}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};

export default CardFeed;