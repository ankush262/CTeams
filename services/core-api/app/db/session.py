from typing import Optional

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

# Module-level MongoDB client connection
client: Optional[AsyncIOMotorClient] = None

# Using a single module-level client instead of creating a new connection per request
# ensures we reuse the same connection pool across all requests, which:
#   1. Improves performance - connection pooling avoids the overhead of creating new connections
#   2. Provides better resource management - the pool exhausts gracefully under load
#   3. Maintains state - sessions and transactions work correctly
# This pattern is standard in async database applications.


async def init_db() -> None:
    """Initialize the MongoDB connection and Beanie ODM.
    
    Called during application startup (via lifespan context manager).
    Sets up the async motor client and initializes Beanie's document registry.
    """
    global client
    
    client = AsyncIOMotorClient(settings.MONGO_URL)
    
    # Get the database instance
    db = client[settings.MONGO_DB_NAME]
    
    # Initialize Beanie with the database
    # Document models will be registered here as they're created
    await init_beanie(database=db, document_models=[])


async def get_db() -> AsyncIOMotorDatabase:
    """Return the MongoDB database instance for use in FastAPI endpoints.
    
    This function can be used with FastAPI's Depends() for dependency injection.
    
    Returns:
        The AsyncIOMotorDatabase instance for querying collections
    """
    return client[settings.MONGO_DB_NAME]
