import { useEffect, useRef } from 'react';
import useStore from '../store/useStore';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';

export default function useMeetingSocket(meetingId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    addTranscriptChunk,
    setSummaryBullets,
    addActionItem,
    setConflict,
    setConnected,
  } = useStore();

  useEffect(() => {
    if (!meetingId) return;

    const ws = new WebSocket(`${WS_URL}/ws/${meetingId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case 'transcript_chunk':
            addTranscriptChunk({
              id: data.chunk_id || Date.now().toString(),
              text: data.text,
              speaker: data.speaker || null,
              timestamp: data.timestamp || data.start_time_ms || 0,
            });
            break;
          case 'summary_update':
            if (data.bullets) setSummaryBullets(data.bullets);
            break;
          case 'action_detected':
            {
              const a = data.action || data;
              addActionItem({
                id: a.id || data.action_item_id || Date.now().toString(),
                task: a.task || data.task,
                owner: a.owner || data.owner || null,
                deadline: a.deadline || data.deadline || null,
                priority: a.priority || data.priority || 'normal',
                status: 'open',
              });
            }
            break;
          case 'conflict_detected':
            setConflict(true, data.message || 'Conflicting statements detected');
            break;
          case 'debrief_ready':
            // Handled by polling in debrief page
            break;
        }
      } catch {
        // Ignore non-JSON messages (e.g. keepalive)
      }
    };

    return () => {
      ws.close();
      setConnected(false);
    };
  }, [meetingId]);

  return wsRef;
}
