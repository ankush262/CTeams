import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, ExternalLink, CalendarPlus, RefreshCw, Link2 } from 'lucide-react';
import {
  getGoogleStatus,
  getGoogleAuthUrl,
  getUpcomingEvents,
  type CalendarEvent,
} from '../../services/api';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import toast from 'react-hot-toast';

export default function UpcomingMeetings() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [showSchedule, setShowSchedule] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    setLoading(true);
    try {
      const status = await getGoogleStatus();
      setConnected(status.connected);
      if (status.connected) {
        await loadEvents();
      }
    } catch {
      // Google integration not configured
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    try {
      const list = await getUpcomingEvents(8);
      setEvents(list);
    } catch {
      // silently fail
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const { auth_url } = await getGoogleAuthUrl();
      window.location.href = auth_url;
    } catch {
      toast.error('Failed to start Google auth');
      setConnecting(false);
    }
  }

  function formatEventTime(iso: string) {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatEventDate(iso: string) {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function groupEventsByDate(events: CalendarEvent[]) {
    const groups: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const dateKey = new Date(event.start).toDateString();
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(event);
    }
    return groups;
  }

  if (loading) {
    return (
      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6 animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-14 bg-slate-800 rounded-lg" />
          <div className="h-14 bg-slate-800 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-lg font-semibold text-white">Upcoming Meetings</h2>
        </div>
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
            <Link2 className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-sm text-slate-400 mb-4">Connect Google Calendar to see & schedule upcoming meetings</p>
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            {connecting ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            Connect Google Calendar
          </button>
        </div>
      </div>
    );
  }

  const grouped = groupEventsByDate(events);

  return (
    <>
      <div className="bg-[#0b1120] border border-slate-800 rounded-xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-white">Upcoming Meetings</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadEvents()}
              className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-800"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            >
              <CalendarPlus className="w-3.5 h-3.5" />
              Schedule
            </button>
          </div>
        </div>

        {/* Events */}
        {events.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No upcoming meetings</p>
            <button
              onClick={() => setShowSchedule(true)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Schedule your first meeting
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([dateKey, dayEvents]) => (
              <div key={dateKey}>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                  {formatEventDate(dayEvents[0].start)}
                </p>
                <div className="space-y-2">
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/40 hover:bg-slate-800/70 transition-colors group"
                    >
                      <div className="flex-shrink-0 w-1 h-10 bg-indigo-500 rounded-full mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{event.title || 'Untitled'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="w-3 h-3" />
                            {formatEventTime(event.start)} – {formatEventTime(event.end)}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1 text-xs text-slate-500 truncate">
                              <MapPin className="w-3 h-3" />
                              {event.location}
                            </span>
                          )}
                        </div>
                      </div>
                      {event.html_link && (
                        <a
                          href={event.html_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-shrink-0 p-1.5 text-slate-600 hover:text-indigo-400 transition-colors opacity-0 group-hover:opacity-100"
                          title="Open in Google Calendar"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ScheduleMeetingModal
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onScheduled={loadEvents}
      />
    </>
  );
}
