import { useState } from 'react';
import { X, CalendarPlus, Loader2 } from 'lucide-react';
import { scheduleMeeting } from '../../services/api';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onScheduled: () => void;
}

export default function ScheduleMeetingModal({ open, onClose, onScheduled }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !startTime || !endTime) {
      toast.error('Please fill in all required fields');
      return;
    }

    const startIso = new Date(`${date}T${startTime}`).toISOString();
    const endIso = new Date(`${date}T${endTime}`).toISOString();

    if (endIso <= startIso) {
      toast.error('End time must be after start time');
      return;
    }

    setSubmitting(true);
    try {
      await scheduleMeeting({
        title,
        start_iso: startIso,
        end_iso: endIso,
        description: description || undefined,
        location: location || undefined,
      });
      toast.success('Meeting scheduled!');
      setTitle('');
      setDate('');
      setStartTime('');
      setEndTime('');
      setDescription('');
      setLocation('');
      onScheduled();
      onClose();
    } catch {
      toast.error('Failed to schedule meeting');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f172a] border border-slate-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Schedule Meeting</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team Standup"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Date *</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Start Time *</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">End Time *</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Google Meet / Room 4B"
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Meeting agenda..."
              rows={2}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CalendarPlus className="w-4 h-4" />
            )}
            {submitting ? 'Scheduling...' : 'Schedule Meeting'}
          </button>
        </form>
      </div>
    </div>
  );
}
