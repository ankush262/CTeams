from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "MeetMind"
    DEBUG: bool = True

    MONGO_URI: str = ""
    MONGO_DB_NAME: str = "meetmind"

    REDIS_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    GROQ_API_KEY: str
    GROQ_MODEL: str = "llama-3.1-8b-instant"

    ASSEMBLYAI_API_KEY: str = ""

    STT_MODEL: str = "whisper-large-v3-turbo"

    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash-native-audio-latest"

    # Dev default allows dashboard and Chrome extension requests (including null/chrome-extension origins).
    # Lock this down in production to the dashboard URL and your specific chrome-extension://<extension-id> origin.
    ALLOWED_ORIGINS: List[str] = ["*"]

    AUDIO_SAMPLE_RATE: int = 16000
    AUDIO_CHUNK_DURATION_MS: int = 100

    APP_FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


# One shared settings instance keeps config loading centralized and consistent across imports.
settings = Settings()
