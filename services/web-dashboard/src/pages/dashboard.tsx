import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Plus } from 'lucide-react';
import Layout from '../components/layout/Layout';
import MeetingCard from '../components/cards/MeetingCard';
import { startMeeting, listMeetings, type Meeting } from '../services/api';
import toast from 'react-hot-toast';

export default function Dashboard() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    loadMeetings();
  }, []);

  async function loadMeetings() {
    setLoading(true);
    try {
      const list = await listMeetings();
      setMeetings(list);
    } catch {
      // API might not be ready
    } finally {
      setLoading(false);
    }
  }

  async function handleNewMeeting() {
    setStarting(true);
    try {
      const meeting = await startMeeting('New Meeting');
      router.push(`/meeting/${meeting.id}`);
    } catch {
      toast.error('Failed to start meeting');
    } finally {
      setStarting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Meetings</h1>
            <p className="text-sm text-slate-500 mt-1">Your meeting history and active sessions</p>
          </div>
          <button
            onClick={handleNewMeeting}
            disabled={starting}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            {starting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            New Meeting
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 animate-pulse">
                <div className="h-5 bg-slate-800 rounded w-1/3 mb-3" />
                <div className="h-3 bg-slate-800 rounded w-1/4" />
              </div>
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
              <Plus className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-lg font-medium text-slate-300 mb-2">No meetings yet</h3>
            <p className="text-sm text-slate-500 mb-6">Start your first meeting to see it here</p>
            <button
              onClick={handleNewMeeting}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-6 py-2.5 rounded-xl transition-colors"
            >
              Start a Meeting
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <MeetingCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}