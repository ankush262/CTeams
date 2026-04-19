from typing import Any, List, Optional

import json
from datetime import datetime, timedelta, timezone
from beanie import PydanticObjectId
from groq import Groq

from app.core.config import settings
from app.models.action_item import ActionItem
from app.models.meeting import Meeting
from app.models.transcript import TranscriptChunk
from app.services.ws_manager import manager

client = Groq(api_key=settings.GROQ_API_KEY)

# ── Speaker tracking state (per meeting) ─────────────────────────────────────
# Keeps recent transcript context so the LLM can maintain consistent speaker
# labels across chunks within the same meeting.
_speaker_context: dict[str, List[dict]] = {}  # meeting_id → [{speaker, text}]


async def _get_meeting_doc(meeting_id: str) -> Optional[Meeting]:
    """Safely load a Meeting by id string.

    Transcript rows store meeting_id as string, while Meeting uses ObjectId as
    primary key. Normalizing here avoids scattered conversion bugs.
    """
    try:
        return await Meeting.get(PydanticObjectId(meeting_id))
    except Exception:
        return None


def _clean_model_json(raw_text: str) -> str:
    """Normalize LLM output into a JSON string.

    Models occasionally wrap JSON in markdown fences even when instructed not to.
    We strip common wrappers and return a plain JSON payload string.
    """
    text = (raw_text or "").strip()

    # Keep the exact cleanup style requested, then apply safer fallback cleanup.
    text = text.strip().strip("```json").strip("```")
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    return text


def _parse_response_json(response: Any) -> dict:
    """Extract and parse JSON dict from a Groq chat completion response."""
    content = response.choices[0].message.content if response and response.choices else ""
    cleaned = _clean_model_json(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        # Model may emit multiple JSON objects back-to-back; take the first one.
        import re
        match = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', cleaned)
        if match:
            parsed = json.loads(match.group())
        else:
            return {}
    return parsed if isinstance(parsed, dict) else (parsed[0] if isinstance(parsed, list) and parsed else {})


async def _get_full_text(meeting_id: str) -> str:
    """Return full transcript text for a meeting.

    Uses TranscriptChunk.get_full_text when available. Falls back to joining
    ordered chunks to keep this service compatible with current model versions.
    """
    get_full_text = getattr(TranscriptChunk, "get_full_text", None)
    if callable(get_full_text):
        return await get_full_text(meeting_id)

    chunks = await TranscriptChunk.get_by_meeting(meeting_id)
    return "\n".join(chunk.text for chunk in chunks if chunk.text).strip()


async def identify_speakers(meeting_id: str, new_text: str) -> List[dict]:
    """Use LLM to split transcribed text into speaker-labeled dialogue lines.

    Takes the raw Whisper output (which has no speaker labels) and uses the
    Groq LLM with recent conversation context to identify speaker changes
    and return structured dialogue lines.

    Returns a list of dicts: [{"speaker": "Speaker 1", "text": "..."}]
    """
    # Build context from recent chunks (last 10)
    ctx = _speaker_context.get(meeting_id, [])
    context_str = ""
    if ctx:
        recent = ctx[-10:]
        context_str = "\n".join(f"{e['speaker']}: {e['text']}" for e in recent)

    try:
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meeting transcript speaker diarization assistant. "
                        "You receive a chunk of transcribed speech from a meeting and must "
                        "split it into dialogue lines with speaker labels.\n\n"
                        "Rules:\n"
                        "- Use labels like 'Speaker 1', 'Speaker 2', etc.\n"
                        "- If only one person is speaking, assign the entire text to one speaker.\n"
                        "- Look for cues like questions followed by answers, topic changes, "
                        "or conversational patterns to detect speaker switches.\n"
                        "- Be consistent with previous speaker labels from context.\n"
                        "- If you cannot determine a speaker change, keep it as one speaker.\n\n"
                        "Respond with ONLY valid JSON:\n"
                        '{"lines": [{"speaker": "Speaker 1", "text": "what they said"}, '
                        '{"speaker": "Speaker 2", "text": "what they said"}]}\n'
                        "No markdown. No explanation. JSON only."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Previous conversation context:\n{context_str}\n\n"
                        f"New transcribed text to split into speakers:\n{new_text}"
                        if context_str else
                        f"New transcribed text to split into speakers:\n{new_text}"
                    ),
                },
            ],
            max_tokens=400,
            temperature=0.1,
        )

        result = _parse_response_json(response)
        lines = result.get("lines", [])

        if not lines:
            # Fallback: return whole text as single speaker
            lines = [{"speaker": "Speaker 1", "text": new_text}]

        # Update context for this meeting
        if meeting_id not in _speaker_context:
            _speaker_context[meeting_id] = []
        for line in lines:
            _speaker_context[meeting_id].append({
                "speaker": line.get("speaker", "Speaker 1"),
                "text": line.get("text", ""),
            })
        # Keep context window manageable (last 30 lines)
        if len(_speaker_context[meeting_id]) > 30:
            _speaker_context[meeting_id] = _speaker_context[meeting_id][-30:]

        return lines

    except Exception as exc:
        print(f"identify_speakers error for meeting {meeting_id}: {exc}")
        return [{"speaker": "Speaker 1", "text": new_text}]


def clear_speaker_context(meeting_id: str):
    """Clear speaker context when a meeting ends."""
    _speaker_context.pop(meeting_id, None)


async def summarize_transcript(meeting_id: str) -> Optional[dict]:
    """Generate running meeting summary, decisions, and open questions.

    This function analyzes the full transcript so far, updates summary-oriented
    meeting fields, and pushes live summary updates to connected dashboard tabs.
    It always fails gracefully and returns None on error to avoid interrupting
    the real-time ingest pipeline.
    """
    try:
        # 1) Fetch full transcript text.
        full_text = await _get_full_text(meeting_id)

        # 2) Skip if not enough material to summarize reliably.
        if len(full_text.strip()) < 20:
            return None

        # 3) Ask Groq for strict JSON output.
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meeting intelligence assistant. Analyze this meeting "
                        "transcript and respond with ONLY a valid JSON object. No markdown "
                        "backticks. No explanation. No extra text. Format exactly:\n"
                        "{\n"
                        '  "summary_bullets": ["bullet 1", "bullet 2", "bullet 3"],\n'
                        '  "key_decisions": ["decision 1", "decision 2"],\n'
                        '  "open_questions": ["question 1", "question 2"]\n'
                        "}"
                    ),
                },
                {"role": "user", "content": f"Meeting transcript:\n{full_text}"},
            ],
            max_tokens=600,
            temperature=0.3,
        )

        # 4-6) Extract model content, clean markdown wrappers, parse JSON.
        result = _parse_response_json(response)

        # 7) Load meeting and bail out cleanly if it does not exist.
        meeting = await _get_meeting_doc(meeting_id)
        if not meeting:
            return None

        # 8) Update summary fields from model output.
        meeting.summary_bullets = result.get("summary_bullets", [])

        # These fields may not exist in older model schema versions yet.
        if hasattr(meeting, "key_decisions"):
            setattr(meeting, "key_decisions", result.get("key_decisions", []))
        if hasattr(meeting, "open_questions"):
            setattr(meeting, "open_questions", result.get("open_questions", []))

        # 9) Persist changes.
        await meeting.save()

        # 10) Notify connected clients with the latest summary snapshot.
        await manager.broadcast(
            meeting_id,
            {
                "type": "summary_update",
                "bullets": meeting.summary_bullets,
                "decisions": result.get("key_decisions", []),
                "questions": result.get("open_questions", []),
            },
        )

        # 11) Return parsed result for optional upstream usage.
        return result
    except Exception as exc:
        # 12) Never crash transcript ingestion due to AI failures.
        print(f"summarize_transcript error for meeting {meeting_id}: {exc}")
        return None


async def extract_action_items(meeting_id: str, chunk_text: str) -> None:
    """Detect and persist action items from a single transcript chunk.

    This runs on fresh chunks to catch assignments early, stores new action
    items in MongoDB, increments meeting counters, and broadcasts real-time
    action events to all connected clients.
    """
    try:
        # 1) Ask Groq to classify chunk and extract structured task data.
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an action item detector for meetings. Read this transcript "
                        "chunk carefully. Extract ALL task assignments, commitments, or "
                        "follow-up actions. Respond with ONLY a valid JSON object:\n"
                        "{\n"
                        '  "actions": [\n'
                        '    {\n'
                        '      "task": "what needs to be done",\n'
                        '      "owner": "person name or null",\n'
                        '      "deadline": "timeframe mentioned or null",\n'
                        '      "priority": "high" or "normal",\n'
                        '      "source_text": "exact sentence containing the action"\n'
                        '    }\n'
                        '  ]\n'
                        "}\n"
                        "If NO action items exist respond with ONLY:\n"
                        '{ "actions": [] }\n'
                        "No markdown. No explanation. JSON only."
                    ),
                },
                {"role": "user", "content": chunk_text},
            ],
            max_tokens=500,
            temperature=0.1,
        )

        # 2) Parse strict JSON output.
        result = _parse_response_json(response)
        actions = result.get("actions", [])

        # 3) Persist each detected action item.
        for item in actions:
            action = ActionItem(
                meeting_id=meeting_id,
                task=item.get("task", ""),
                owner=item.get("owner"),
                deadline=item.get("deadline"),
                priority=item.get("priority", "normal"),
                source_text=item.get("source_text", chunk_text),
            )
            await action.save()

            meeting = await _get_meeting_doc(meeting_id)
            if meeting:
                meeting.action_items_count += 1
                await meeting.save()

            await manager.broadcast(
                meeting_id,
                {
                    "type": "action_detected",
                    "action": {
                        "id": str(action.id),
                        "task": action.task,
                        "owner": action.owner,
                        "deadline": action.deadline,
                        "priority": action.priority,
                    },
                },
            )
    except Exception as exc:
        # 4) Action extraction is best-effort and must never crash request flow.
        print(f"extract_action_items error for meeting {meeting_id}: {exc}")


async def detect_conflicts(meeting_id: str) -> None:
    """Detect contradictions across recent transcript context.

    We examine the most recent 20 transcript chunks for mutually conflicting
    statements, then flag and broadcast conflict findings when detected.
    """
    try:
        # 1) Fetch latest 20 chunks by descending creation time.
        chunks = (
            await TranscriptChunk.find(TranscriptChunk.meeting_id == meeting_id)
            .sort("-created_at")
            .limit(20)
            .to_list()
        )

        # 2) Require enough context to compare claims meaningfully.
        if len(chunks) < 5:
            return

        # 3) Join chunk text for contradiction analysis.
        joined_text = "\n".join(chunk.text for chunk in reversed(chunks) if chunk.text).strip()
        if not joined_text:
            return

        # 4) Ask Groq for conflict detection in strict JSON format.
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a contradiction detector for meetings. Read "
                        "these transcript segments. Check if any statement directly contradicts "
                        "an earlier statement. Respond with ONLY JSON:\n"
                        "{\n"
                        '  "has_conflict": true or false,\n'
                        '  "conflict_message": "description of contradiction or null"\n'
                        "}"
                    ),
                },
                {"role": "user", "content": joined_text},
            ],
            max_tokens=200,
            temperature=0.1,
        )

        # 5) Parse response JSON.
        result = _parse_response_json(response)

        # 6) Persist and broadcast when a conflict exists.
        if result.get("has_conflict") is True:
            meeting = await _get_meeting_doc(meeting_id)
            if meeting:
                meeting.has_conflict = True
                if hasattr(meeting, "conflict_message"):
                    setattr(meeting, "conflict_message", result.get("conflict_message"))
                await meeting.save()

            await manager.broadcast(
                meeting_id,
                {
                    "type": "conflict_detected",
                    "message": result.get("conflict_message"),
                },
            )
    except Exception as exc:
        # 7) Conflict detection is advisory; fail silently except logging.
        print(f"detect_conflicts error for meeting {meeting_id}: {exc}")


async def generate_debrief(meeting_id: str) -> Optional[dict]:
    """Generate a structured post-meeting debrief report.

    This performs full-transcript synthesis for end-of-meeting reporting and
    stores the resulting structured debrief payload on the meeting document.
    """
    try:
        # 1) Retrieve complete transcript text.
        full_text = await _get_full_text(meeting_id)

        # 2) Skip generation if transcript is empty or too short.
        if len(full_text.strip()) < 20:
            return None

        # 3) Request comprehensive structured debrief JSON from Groq.
        response = client.chat.completions.create(
            model=settings.GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a meeting debrief generator. Generate a "
                        "comprehensive structured debrief. Respond with ONLY JSON:\n"
                        "{\n"
                        '  "summary": "2-3 sentence meeting overview",\n'
                        '  "decisions": ["decision 1", "decision 2"],\n'
                        '  "action_items": [{"task": "...", "owner": "...", "deadline": "...", "priority": "..."}],\n'
                        '  "open_questions": ["question 1"],\n'
                        '  "blockers": ["blocker 1"],\n'
                        '  "next_meeting_topics": ["topic 1"]\n'
                        "}"
                    ),
                },
                {"role": "user", "content": f"Complete meeting transcript:\n{full_text}"},
            ],
            max_tokens=1000,
            temperature=0.3,
        )

        # 4) Parse model response JSON.
        result = _parse_response_json(response)

        # 5) Save debrief payload on meeting document.
        meeting = await _get_meeting_doc(meeting_id)
        if not meeting:
            return None
        meeting.debrief = result
        await meeting.save()

        # 6) Return full debrief object.
        return result
    except Exception as exc:
        # 7) Debrief generation is non-critical; return None on failure.
        print(f"generate_debrief error for meeting {meeting_id}: {exc}")
        # Fallback: persist a minimal debrief so UI is never stuck in
        # "generating" when the model call fails.
        full_text = await _get_full_text(meeting_id)
        if len(full_text.strip()) < 20:
            return None
        fallback = {
            "summary": full_text[:500],
            "decisions": [],
            "action_items": [],
            "open_questions": [],
            "blockers": [],
            "next_meeting_topics": [],
        }
        meeting = await _get_meeting_doc(meeting_id)
        if not meeting:
            return None
        meeting.debrief = fallback
        await meeting.save()
        return fallback


async def process_transcript_batch(meeting_id: str) -> None:
    """Run periodic AI processing over meeting transcript progress.

    This orchestrates summary refresh and conflict checks over accumulated
    transcript data, then runs action-item extraction on the latest chunk to
    provide near-real-time task detection.
    """
    try:
        await summarize_transcript(meeting_id)
        await detect_conflicts(meeting_id)

        latest_chunk = (
            await TranscriptChunk.find(TranscriptChunk.meeting_id == meeting_id)
            .sort("-created_at")
            .first_or_none()
        )
        if latest_chunk and latest_chunk.text:
            await extract_action_items(meeting_id, latest_chunk.text)
    except Exception as exc:
        print(f"process_transcript_batch error for meeting {meeting_id}: {exc}")
