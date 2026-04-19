import os
from typing import Optional

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

# Module-level MongoDB client connection.
client: Optional[AsyncIOMotorClient] = None

# One shared client reuses Motor's connection pool, which is faster and more resource-efficient
# than opening a brand new MongoDB connection for every request.


async def init_db() -> None:
    """Initialize MongoDB and register Beanie document models."""
    global client

    from app.models.action_item import ActionItem
    from app.models.meeting import Meeting
    from app.models.transcript import Transcript

    mongo_uri = os.getenv("MONGO_URI") or settings.MONGO_URI
    if not mongo_uri:
        raise RuntimeError("MONGO_URI is not set. Add MONGO_URI to your environment or .env file.")

    if not mongo_uri.startswith(("mongodb://", "mongodb+srv://")):
        raise RuntimeError("Invalid MONGO_URI. Expected a mongodb:// or mongodb+srv:// connection string.")

    try:
        client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=5000)
        # Fail fast on startup if credentials/URI are invalid or cluster is unreachable.
        await client.admin.command("ping")
    except Exception as exc:
        raise RuntimeError(f"Failed to initialize MongoDB client from MONGO_URI: {exc}") from exc

    db = client[settings.MONGO_DB_NAME]

    await init_beanie(
        database=db,
        document_models=[Meeting, Transcript, ActionItem],
    )


async def get_db() -> AsyncIOMotorDatabase:
    """FastAPI dependency that returns the active MongoDB database."""
    if client is None:
        raise RuntimeError("Database client is not initialized. Call init_db() at startup.")

    return client[settings.MONGO_DB_NAME]
