import { useState } from 'react';
import { useRouter } from 'next/router';
import { Brain, Mic, MessageSquare, CheckCircle, Zap, ArrowRight } from 'lucide-react';
import { startMeeting, getActiveMeeting } from '../services/api';
import toast from 'react-hot-toast';

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    try {
      const active = await getActiveMeeting();
      if (active) {
        router.push(`/meeting/${active.id}`);
        return;
      }
      const meeting = await startMeeting(title || 'Untitled Meeting');
      router.push(`/meeting/${meeting.id}`);
    } catch {
      toast.error('Failed to start meeting');
    } finally {
      setLoading(false);
    }
  }

  const features = [
    { icon: Mic, title: 'Live Transcription', desc: 'Real-time speech-to-text from any meeting tab' },
    { icon: MessageSquare, title: 'AI Summaries', desc: 'Auto-generated bullet points as you talk' },
    { icon: CheckCircle, title: 'Action Items', desc: 'Tasks extracted automatically from discussion' },
    { icon: Zap, title: 'Conflict Detection', desc: 'AI flags contradicting statements instantly' },
  ];

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Brain className="w-7 h-7 text-indigo-400" />
          <span className="text-xl font-bold">MeetMind</span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-sm text-slate-400 hover:text-white transition-colors"
        >
          View All Meetings →
        </button>
      </nav>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-2xl text-center">
          <h1 className="text-5xl md:text-6xl font-bold mb-4">
            <span className="text-indigo-400">AI-Powered</span> Meeting Intelligence
          </h1>
          <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto">
            Real-time transcription, smart summaries, action items, and conflict detection
            — all powered by Groq AI.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-16">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title (optional)"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              onKeyDown={(e) => e.key === 'Enter' && handleStart()}
            />
            <button
              onClick={handleStart}
              disabled={loading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>Start Meeting <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mx-auto">
            {features.map((f) => (
              <div key={f.title} className="bg-[#0b1120] border border-slate-800 rounded-xl p-4 text-left">
                <f.icon className="w-5 h-5 text-indigo-400 mb-2" />
                <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-xs text-slate-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-600 mt-12">
          Works with Google Meet, Zoom, and Microsoft Teams via Chrome Extension
        </p>
      </main>
    </div>
  );
}
