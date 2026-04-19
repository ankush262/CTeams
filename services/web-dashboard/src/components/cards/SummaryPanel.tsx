import { Lightbulb } from 'lucide-react';

export default function SummaryPanel({ bullets }: { bullets: string[] }) {
  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-300">AI Summary</h3>
      </div>

      {bullets.length === 0 ? (
        <p className="text-slate-500 text-sm italic">Summary will appear after enough transcript is collected...</p>
      ) : (
        <ul className="space-y-2">
          {bullets.map((bullet, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="text-amber-400 mt-0.5">•</span>
              <span className="text-slate-300">{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
