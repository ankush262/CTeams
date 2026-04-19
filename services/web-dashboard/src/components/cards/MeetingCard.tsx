import Link from 'next/link';
import { Clock, MessageSquare, CheckCircle, AlertTriangle } from 'lucide-react';
import type { Meeting } from '../../services/api';

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MeetingCard({ meeting }: { meeting: Meeting }) {
  const isActive = meeting.status === 'active';

  return (
    <Link
      href={isActive ? `/meeting/${meeting.id}` : `/meeting/${meeting.id}/debrief`}
      className="block bg-[#0b1120] border border-slate-800 rounded-xl p-4 hover:border-indigo-500/40 transition-all hover:bg-[#0d1428]"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white">{meeting.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(meeting.started_at)} &middot; {timeAgo(meeting.started_at)}
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isActive
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              : 'bg-slate-700/50 text-slate-400 border border-slate-700'
          }`}
        >
          {isActive ? '● Live' : 'Ended'}
        </span>
      </div>

      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {meeting.transcript_chunks} chunks
        </span>
        <span className="flex items-center gap-1">
          <CheckCircle className="w-3 h-3" />
          {meeting.action_items_count} actions
        </span>
        {meeting.has_conflict && (
          <span className="flex items-center gap-1 text-amber-400">
            <AlertTriangle className="w-3 h-3" />
            Conflict
          </span>
        )}
      </div>

      {meeting.summary_bullets.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-400 line-clamp-2">
            {meeting.summary_bullets[0]}
          </p>
        </div>
      )}
    </Link>
  );
}
