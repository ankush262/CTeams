from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables or .env file."""

    # App metadata
    APP_NAME: str = "Cteams"
    DEBUG: bool = True

    # MongoDB configuration
    MONGO_URL: str
    MONGO_DB_NAME: str = "cteams"

    # Redis configuration
    REDIS_URL: str

    # Security and authentication
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # Groq AI configuration
    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama3-8b-8192"

    # CORS allowed origins for frontend communication
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    class Config:
        """Pydantic config to load environment variables from .env file."""

        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


# Module-level singleton instance of settings
# Using a single shared instance throughout the app (rather than reading .env in every module)
# ensures consistency, improves performance, and makes configuration testable.
# This pattern is standard in FastAPI applications for centralized settings management.
settings = Settings()
