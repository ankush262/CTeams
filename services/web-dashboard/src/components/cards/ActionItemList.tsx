import { CheckCircle, Circle, AlertTriangle } from 'lucide-react';

type ActionItem = {
  id: string;
  task: string;
  owner: string | null;
  deadline: string | null;
  priority: string;
  status: string;
};

type Props = {
  items: ActionItem[];
  onToggle?: (id: string, status: string) => void;
};

export default function ActionItemList({ items, onToggle }: Props) {
  return (
    <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-300">Action Items</h3>
        <span className="ml-auto bg-slate-800 text-xs px-2 py-0.5 rounded-full text-slate-400">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-slate-500 text-sm italic">No action items detected yet...</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                item.status === 'done'
                  ? 'bg-emerald-900/10 border-emerald-800/30'
                  : item.priority === 'high'
                  ? 'bg-red-900/10 border-red-800/30'
                  : 'bg-slate-900/50 border-slate-800'
              }`}
            >
              <button
                onClick={() => onToggle?.(item.id, item.status === 'done' ? 'open' : 'done')}
                className="mt-0.5 shrink-0"
              >
                {item.status === 'done' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Circle className="w-4 h-4 text-slate-500 hover:text-indigo-400" />
                )}
              </button>

              <div className="flex-1 min-w-0">
                <p className={`text-sm ${item.status === 'done' ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                  {item.task}
                </p>
                <div className="flex items-center gap-2 mt-1">
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

              {item.priority === 'high' && (
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
