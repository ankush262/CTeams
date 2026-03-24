# Use a small, stable Python runtime as the base image
FROM python:3.11-slim

# Set working directory inside the container
WORKDIR /app

# Copy dependency manifest first to leverage Docker layer caching
COPY requirements.txt ./

# Install Python dependencies without cache to reduce image size
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source into container
COPY . /app

# Expose the FastAPI port
EXPOSE 8000

# Default command to run the app in development mode with auto-reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
