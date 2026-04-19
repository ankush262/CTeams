import { create } from 'zustand';

// Zustand gives every component access to shared app state without prop drilling.
// Components subscribe to only the slices they need, so unrelated updates do not cause re-renders.

type Meeting = {
  id: string;
  title: string;
  status: string;
  startedAt: string;
};

type TranscriptChunk = {
  id: string;
  text: string;
  speaker: string | null;
  timestamp: number;
};

type ActionItem = {
  id: string;
  task: string;
  owner: string | null;
  deadline: string | null;
  priority: string;
  status: string;
};

type MeetMindState = {
  // Active meeting metadata. Read by Topbar and dashboard header; written by useMeeting hook on start/end.
  currentMeeting: Meeting | null;

  // Ordered list of speech chunks arriving over WebSocket. Read by TranscriptPanel; appended by the WS handler.
  transcript: TranscriptChunk[];

  // AI-generated summary bullets refreshed every 60 s. Read by SummaryPanel; written by the WS handler.
  summaryBullets: string[];

  // Extracted tasks from the transcript. Read by ActionItemsPanel; items added/updated by WS and user actions.
  actionItems: ActionItem[];

  // True when AI detected a conflicting statement. Read by ConflictBanner; written by the WS handler.
  hasConflict: boolean;

  // Human-readable description of the detected conflict. Read by ConflictBanner alongside hasConflict.
  conflictMessage: string;

  // Reflects whether the WebSocket to the backend is currently open. Read by ConnectionBadge in Topbar.
  isConnected: boolean;

  setMeeting: (meeting: Meeting) => void;
  clearMeeting: () => void;
  addTranscriptChunk: (chunk: TranscriptChunk) => void;
  setSummaryBullets: (bullets: string[]) => void;
  addActionItem: (item: ActionItem) => void;
  updateActionItem: (id: string, updates: Partial<ActionItem>) => void;
  setConflict: (hasConflict: boolean, message: string) => void;
  setConnected: (isConnected: boolean) => void;
};

const useStore = create<MeetMindState>((set) => ({
  currentMeeting: null,
  transcript: [],
  summaryBullets: [],
  actionItems: [],
  hasConflict: false,
  conflictMessage: '',
  isConnected: false,

  setMeeting: (meeting) => set({ currentMeeting: meeting }),
  clearMeeting: () => set({ currentMeeting: null, transcript: [], summaryBullets: [], actionItems: [], hasConflict: false, conflictMessage: '' }),
  addTranscriptChunk: (chunk) => set((state) => ({ transcript: [...state.transcript, chunk] })),
  setSummaryBullets: (bullets) => set({ summaryBullets: bullets }),
  addActionItem: (item) => set((state) => ({ actionItems: [...state.actionItems, item] })),
  updateActionItem: (id, updates) =>
    set((state) => ({
      actionItems: state.actionItems.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    })),
  setConflict: (hasConflict, message) => set({ hasConflict, conflictMessage: message }),
  setConnected: (isConnected) => set({ isConnected }),
}));

export default useStore;
