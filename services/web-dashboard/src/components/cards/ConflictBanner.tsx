import { AlertTriangle, X } from 'lucide-react';

export default function ConflictBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3">
      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
      <p className="flex-1 text-sm text-amber-200">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="text-amber-400 hover:text-amber-200">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
