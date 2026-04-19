import { useEffect, useRef } from 'react';
import { MessageSquare } from 'lucide-react';

type Chunk = {
  id: string;
  text: string;
  speaker: string | null;
  timestamp: number;
};

const SPEAKER_COLORS = [
  { bg: 'bg-indigo-500/15', border: 'border-indigo-500/30', label: 'text-indigo-400' },
  { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', label: 'text-emerald-400' },
  { bg: 'bg-amber-500/15', border: 'border-amber-500/30', label: 'text-amber-400' },
  { bg: 'bg-rose-500/15', border: 'border-rose-500/30', label: 'text-rose-400' },
  { bg: 'bg-cyan-500/15', border: 'border-cyan-500/30', label: 'text-cyan-400' },
  { bg: 'bg-purple-500/15', border: 'border-purple-500/30', label: 'text-purple-400' },
];

function getSpeakerColor(speaker: string | null, speakerMap: Map<string, number>) {
  if (!speaker) return SPEAKER_COLORS[0];
  if (!speakerMap.has(speaker)) {
    speakerMap.set(speaker, speakerMap.size % SPEAKER_COLORS.length);
  }
  return SPEAKER_COLORS[speakerMap.get(speaker)!];
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function TranscriptPanel({ chunks }: { chunks: Chunk[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const speakerMap = useRef(new Map<string, number>()).current;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chunks.length]);

  // Group consecutive chunks by same speaker
  const groups: { speaker: string | null; chunks: Chunk[] }[] = [];
  for (const chunk of chunks) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === chunk.speaker) {
      last.chunks.push(chunk);
    } else {
      groups.push({ speaker: chunk.speaker, chunks: [chunk] });
    }
  }

  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-slate-300">Live Transcript</h3>
        <span className="ml-auto text-xs text-slate-500">{chunks.length} lines</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 min-h-0 pr-1">
        {chunks.length === 0 && (
          <p className="text-slate-500 text-sm italic">Waiting for speech...</p>
        )}
        {groups.map((group, gi) => {
          const color = getSpeakerColor(group.speaker, speakerMap);
          return (
            <div key={gi} className={`rounded-lg border ${color.border} ${color.bg} px-3 py-2`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold ${color.label}`}>
                  {group.speaker || 'Unknown'}
                </span>
                <span className="text-[10px] text-slate-500">
                  {formatTime(group.chunks[0].timestamp)}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.chunks.map((chunk) => (
                  <p key={chunk.id} className="text-sm text-slate-200 leading-relaxed">
                    {chunk.text}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
