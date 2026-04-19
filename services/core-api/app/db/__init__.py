# __init__.py marks this folder as a Python package so other files can import from it.
import asyncio

async def init_db():
    for i in range(10):
        try:
            await init_beanie(...)
            print("DB connected")
            return
        except Exception as e:
            print(f"Retry {i}: DB not ready...")
            await asyncio.sleep(2)

    raise Exception("DB connection failed after retries")