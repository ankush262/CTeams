import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Loader2, FileText, Copy, Check } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import DebriefView from '../../../components/cards/DebriefView';
import { getMeeting, getDebrief, type Meeting, type Debrief } from '../../../services/api';
import toast from 'react-hot-toast';

export default function DebriefPage() {
  const router = useRouter();
  const { id } = router.query;
  const meetingId = id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [debrief, setDebrief] = useState<Debrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!meetingId) return;

    async function load() {
      setLoading(true);
      try {
        const m = await getMeeting(meetingId);
        setMeeting(m);

        if (m.status === 'active') {
          router.replace(`/meeting/${meetingId}`);
          return;
        }

        const d = await getDebrief(meetingId);
        if (d) {
          setDebrief(d);
        } else {
          // Debrief still generating — poll
          const interval = setInterval(async () => {
            const result = await getDebrief(meetingId);
            if (result) {
              setDebrief(result);
              clearInterval(interval);
            }
          }, 3000);

          // Stop polling after 2 minutes
          setTimeout(() => clearInterval(interval), 120000);
        }
      } catch {
        toast.error('Failed to load meeting');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [meetingId]);

  async function handleCopy() {
    if (!debrief) return;
    const text = [
      `# ${meeting?.title || 'Meeting'} — Debrief`,
      '',
      '## Summary',
      debrief.summary,
      '',
      '## Key Decisions',
      ...debrief.decisions.map((d) => `- ${d}`),
      '',
      '## Action Items',
      ...debrief.action_items.map((a) => `- ${a.task}${a.owner ? ` (@${a.owner})` : ''}${a.deadline ? ` — ${a.deadline}` : ''}`),
      '',
      '## Open Questions',
      ...debrief.open_questions.map((q) => `- ${q}`),
      '',
      '## Blockers',
      ...debrief.blockers.map((b) => `- ${b}`),
      '',
      '## Next Meeting Topics',
      ...debrief.next_meeting_topics.map((t) => `- ${t}`),
    ].join('\n');

    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Debrief copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <span className="w-8 h-8 border-3 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">{meeting?.title || 'Meeting'}</h1>
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Post-Meeting Debrief
              </p>
            </div>
          </div>

          {debrief && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-4 py-2 rounded-xl transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy as Markdown'}
            </button>
          )}
        </div>

        {/* Content */}
        {debrief ? (
          <DebriefView debrief={debrief} />
        ) : (
          <div className="text-center py-20">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">Generating Debrief...</h3>
            <p className="text-sm text-slate-500">
              AI is analyzing the transcript. This usually takes 10-30 seconds.
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
