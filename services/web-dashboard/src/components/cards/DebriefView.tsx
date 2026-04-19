import { FileText, List, HelpCircle, AlertCircle, CalendarDays } from 'lucide-react';
import type { Debrief } from '../../services/api';

export default function DebriefView({ debrief }: { debrief: Debrief }) {
  const sections = [
    { icon: FileText, title: 'Summary', content: debrief.summary, type: 'text' as const },
    { icon: List, title: 'Key Decisions', items: debrief.decisions, type: 'list' as const },
    { icon: HelpCircle, title: 'Open Questions', items: debrief.open_questions, type: 'list' as const },
    { icon: AlertCircle, title: 'Blockers', items: debrief.blockers, type: 'list' as const },
    { icon: CalendarDays, title: 'Next Meeting Topics', items: debrief.next_meeting_topics, type: 'list' as const },
  ];

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title} className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <section.icon className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-semibold text-slate-300">{section.title}</h3>
          </div>

          {section.type === 'text' ? (
            <p className="text-sm text-slate-300 leading-relaxed">{section.content}</p>
          ) : (
            <ul className="space-y-1.5">
              {(section.items || []).length === 0 ? (
                <li className="text-sm text-slate-500 italic">None</li>
              ) : (
                (section.items || []).map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span className="text-slate-300">{item}</span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      ))}

      {/* Action items from debrief */}
      {debrief.action_items && debrief.action_items.length > 0 && (
        <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <List className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-300">Action Items</h3>
          </div>
          <div className="space-y-2">
            {debrief.action_items.map((item, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                <div className="flex-1">
                  <p className="text-sm text-slate-200">{item.task}</p>
                  <div className="flex gap-2 mt-1">
                    {item.owner && (
                      <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full">
                        {item.owner}
                      </span>
                    )}
                    {item.deadline && (
                      <span className="text-xs text-slate-500">{item.deadline}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
