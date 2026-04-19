import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowLeft, Radio, Square, Clock, Wifi, WifiOff } from 'lucide-react';
import Layout from '../../../components/layout/Layout';
import TranscriptPanel from '../../../components/cards/TranscriptPanel';
import SummaryPanel from '../../../components/cards/SummaryPanel';
import ActionItemList from '../../../components/cards/ActionItemList';
import ConflictBanner from '../../../components/cards/ConflictBanner';
import useStore from '../../../store/useStore';
import useMeetingSocket from '../../../hooks/useMeetingSocket';
import {
  getMeeting,
  endMeeting as endMeetingAPI,
  getTranscript,
  getActionItems,
  updateActionItem,
  type Meeting,
  type TranscriptChunk as APIChunk,
  type ActionItem,
} from '../../../services/api';
import toast from 'react-hot-toast';

export default function MeetingPage() {
  const router = useRouter();
  const { id } = router.query;
  const meetingId = id as string;

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [ending, setEnding] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');

  const {
    transcript,
    summaryBullets,
    actionItems,
    hasConflict,
    conflictMessage,
    isConnected,
    setMeeting: setStoreMeeting,
    addTranscriptChunk,
    setSummaryBullets,
    addActionItem,
    setConflict,
    clearMeeting,
  } = useStore();

  // Connect WebSocket
  useMeetingSocket(meetingId || null);

  // Load initial data
  useEffect(() => {
    if (!meetingId) return;

    async function load() {
      setLoading(true);
      try {
        const m = await getMeeting(meetingId);
        setMeeting(m);
        setStoreMeeting({
          id: m.id,
          title: m.title,
          status: m.status,
          startedAt: m.started_at,
        });

        if (m.status === 'ended') {
          router.replace(`/meeting/${meetingId}/debrief`);
          return;
        }

        // Load existing transcript chunks
        const chunks = await getTranscript(meetingId);
        chunks.forEach((c: APIChunk) =>
          addTranscriptChunk({
            id: c.id,
            text: c.text,
            speaker: c.speaker,
            timestamp: c.start_time_ms,
          })
        );

        if (m.summary_bullets.length > 0) {
          setSummaryBullets(m.summary_bullets);
        }

        // Load existing action items
        const items = await getActionItems(meetingId);
        items.forEach((item: ActionItem) =>
          addActionItem({
            id: item.id,
            task: item.task,
            owner: item.owner,
            deadline: item.deadline,
            priority: item.priority,
            status: item.status,
          })
        );

        if (m.has_conflict) {
          setConflict(true, 'Conflicting statements were detected');
        }
      } catch {
        toast.error('Failed to load meeting');
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => clearMeeting();
  }, [meetingId]);

  // Elapsed timer
  useEffect(() => {
    if (!meeting || meeting.status !== 'active') return;

    const start = new Date(meeting.started_at).getTime();
    const interval = setInterval(() => {
      const diff = Math.floor((Date.now() - start) / 1000);
      const mins = Math.floor(diff / 60).toString().padStart(2, '0');
      const secs = (diff % 60).toString().padStart(2, '0');
      setElapsed(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [meeting]);

  async function handleEnd() {
    if (!meetingId) return;
    setEnding(true);
    try {
      await endMeetingAPI(meetingId);
      toast.success('Meeting ended — generating debrief...');
      router.push(`/meeting/${meetingId}/debrief`);
    } catch {
      toast.error('Failed to end meeting');
    } finally {
      setEnding(false);
    }
  }

  async function handleToggleAction(itemId: string, newStatus: string) {
    try {
      await updateActionItem(itemId, { status: newStatus });
      useStore.getState().updateActionItem(itemId, { status: newStatus });
    } catch {
      toast.error('Failed to update action item');
    }
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

  if (!meeting) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-slate-400">Meeting not found</p>
          <button onClick={() => router.push('/dashboard')} className="text-indigo-400 text-sm mt-2">
            Back to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
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
              <h1 className="text-xl font-bold text-white">{meeting.title}</h1>
              <div className="flex items-center gap-3 mt-1 text-xs">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Radio className="w-3 h-3" /> Live
                </span>
                <span className="flex items-center gap-1 text-slate-500">
                  <Clock className="w-3 h-3" /> {elapsed}
                </span>
                <span className={`flex items-center gap-1 ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={handleEnd}
            disabled={ending}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors"
          >
            {ending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Square className="w-4 h-4" />
            )}
            End Meeting
          </button>
        </div>

        {/* Conflict banner */}
        {hasConflict && (
          <div className="mb-4">
            <ConflictBanner
              message={conflictMessage}
              onDismiss={() => setConflict(false, '')}
            />
          </div>
        )}

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Transcript - takes 2 cols */}
          <div className="lg:col-span-2 h-[500px]">
            <TranscriptPanel chunks={transcript} />
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            <SummaryPanel bullets={summaryBullets} />
            <ActionItemList items={actionItems} onToggle={handleToggleAction} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
