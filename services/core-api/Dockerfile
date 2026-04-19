# Use a stable Python runtime as the base image for the FastAPI app
FROM python:3.11-slim

# Install system build tools needed for packages like chromadb to compile
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      gcc \
      g++ \
      curl \
      libffi-dev \
      libssl-dev \
      python3-dev && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory for the application code
WORKDIR /app

# Copy dependency manifest first to leverage Docker layer caching
COPY requirements.txt ./

# Install Python dependencies without cache to keep the image smaller
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application source code into the container
COPY . /app

# Expose the port that Uvicorn will run on
EXPOSE 8000

# Start the FastAPI app with auto-reload for development
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]