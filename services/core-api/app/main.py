from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    # On app startup, initialize the database connections and models
    await init_db()
    yield
    # No cleanup is required here; add teardown logic if needed later


# Create FastAPI application instance with project metadata
app = FastAPI(title="Cteams API", version="0.1.0", lifespan=lifespan)

# CORS (Cross-Origin Resource Sharing) allows this backend to serve requests
# from the frontend running on a different origin in development.
# Without CORS, browsers block requests from a different host/port for security.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "Cteams API is running"}


@app.get("/")
async def read_root():
    """Root endpoint provides basic welcome information."""
    return {
        "message": "Welcome to Cteams API",
        "next": "Visit /docs for interactive API documentation",
    }
