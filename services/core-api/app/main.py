from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.endpoints import meetings, transcript, debrief, websocket, actions, audio
from app.api.endpoints.meetings import router as meetings_router
from app.api.endpoints.transcript import router as transcript_router
from app.core.config import settings
from app.db.session import init_db


# Lifespan replaces the deprecated @app.on_event("startup") pattern. It runs setup code
# before the app starts accepting requests and teardown code after the last request is served,
# all within one clearly scoped async context manager.
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("MeetMind API starting")
    await init_db()
    print("Database connected")
    yield
    print("MeetMind shutting down")


app = FastAPI(
    title="MeetMind API",
    description="AI-Powered Live Meeting Intelligence",
    version="0.1.0",
    lifespan=lifespan,
)

# Wildcard CORS is acceptable for a hackathon demo.
# In production lock this down to specific extension ID and dashboard URL.
# Note: allow_credentials must be False when allow_origins is wildcard.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(meetings_router, prefix="/api", tags=["Meetings"])
app.include_router(transcript_router, prefix="/api", tags=["Transcript"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["Meetings"])
app.include_router(transcript.router, prefix="/api/transcript", tags=["Transcript"])
app.include_router(debrief.router, prefix="/api/debrief", tags=["Debrief"])
app.include_router(actions.router, prefix="/api/actions", tags=["Actions"])
app.include_router(audio.router, prefix="/api/audio", tags=["Audio"])
app.include_router(websocket.router, tags=["WebSocket"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "MeetMind API"}


@app.get("/")
async def read_root():
    return {"message": "Welcome to MeetMind API. Visit /docs for interactive documentation."}
