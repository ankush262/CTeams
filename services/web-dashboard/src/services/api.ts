import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[API error]', error.response?.status, error.config?.url, error.response?.data);
    }
    return Promise.reject(error);
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  title: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  transcript_chunks: number;
  summary_bullets: string[];
  key_decisions?: string[];
  open_questions?: string[];
  action_items_count: number;
  has_conflict: boolean;
  conflict_message?: string | null;
  debrief?: Record<string, any> | null;
}

export interface TranscriptChunk {
  id: string;
  meeting_id: string;
  text: string;
  speaker: string | null;
  start_time_ms: number;
  confidence: number;
  created_at: string;
}

export interface ActionItem {
  id: string;
  meeting_id: string;
  task: string;
  owner: string | null;
  deadline: string | null;
  priority: string;
  status: string;
  source_text: string;
  created_at: string;
}

export interface Debrief {
  summary: string;
  decisions: string[];
  action_items: { task: string; owner: string | null; deadline: string | null }[];
  open_questions: string[];
  blockers: string[];
  next_meeting_topics: string[];
}

// ── Meeting endpoints ─────────────────────────────────────────────────────────

export const startMeeting = (title: string, participant_count = 2): Promise<Meeting> =>
  api.post<Meeting>('/api/meetings/start', { title, participant_count }).then((r) => r.data);

export const endMeeting = (meetingId: string): Promise<Meeting> =>
  api.post<Meeting>(`/api/meetings/${meetingId}/end`).then((r) => r.data);

export const getMeeting = (meetingId: string): Promise<Meeting> =>
  api.get<Meeting>(`/api/meetings/${meetingId}`).then((r) => r.data);

export const getActiveMeeting = (): Promise<Meeting | null> =>
  api.get<Meeting | null>('/api/meetings/active').then((r) => r.data);

export const listMeetings = (): Promise<Meeting[]> =>
  api.get<Meeting[]>('/api/meetings').then((r) => r.data);

// ── Transcript endpoints ──────────────────────────────────────────────────────

export const getTranscript = (meetingId: string): Promise<TranscriptChunk[]> =>
  api.get<TranscriptChunk[]>(`/api/transcript/${meetingId}`).then((r) => r.data);

// ── Action item endpoints ─────────────────────────────────────────────────────

export const getActionItems = (meetingId: string): Promise<ActionItem[]> =>
  api.get<ActionItem[]>(`/api/actions/${meetingId}`).then((r) => r.data);

export const updateActionItem = (
  id: string,
  updates: Partial<Pick<ActionItem, 'status' | 'owner' | 'deadline'>>
): Promise<ActionItem> =>
  api.patch<ActionItem>(`/api/actions/${id}`, updates).then((r) => r.data);

// ── Debrief endpoints ─────────────────────────────────────────────────────────

export const getDebrief = (meetingId: string): Promise<Debrief | null> =>
  api.get(`/api/debrief/${meetingId}`).then((r) => r.data).catch((e) => {
    if (e.response?.status === 400 || e.response?.status === 202) return null;
    throw e;
  });

// ── Google Calendar / Scheduling endpoints ────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  html_link?: string;
}

export interface ScheduleBody {
  title: string;
  start_iso: string;
  end_iso: string;
  description?: string;
  location?: string;
}

export const getGoogleStatus = (): Promise<{ connected: boolean; auto_schedule_enabled: boolean }> =>
  api.get('/api/integrations/google/status').then((r) => r.data);

export const getGoogleAuthUrl = (): Promise<{ auth_url: string }> =>
  api.get('/api/integrations/google/auth-url').then((r) => r.data);

export const getUpcomingEvents = (maxResults = 10): Promise<CalendarEvent[]> =>
  api.get<{ events: CalendarEvent[] }>(`/api/integrations/google/upcoming?max_results=${maxResults}`)
    .then((r) => r.data.events);

export const scheduleMeeting = (body: ScheduleBody): Promise<{ scheduled: boolean; event: any }> =>
  api.post('/api/integrations/google/schedule/manual', body).then((r) => r.data);

// ── WebSocket helper ──────────────────────────────────────────────────────────

export function connectWebSocket(meetingId: string): WebSocket {
  return new WebSocket(`${WS_URL}/ws/${meetingId}`);
}

export default api;
