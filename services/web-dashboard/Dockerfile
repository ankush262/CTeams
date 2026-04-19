# Use a lightweight Node runtime as the base image
FROM node:20-slim

# Set working directory inside the container
WORKDIR /app

# Copy package files first to leverage Docker layer caching
# This way, npm install only reruns if dependencies change
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy the rest of the application source code into the container
COPY . /app

# Expose the Next.js development server port
EXPOSE 3000

# Enable polling for file system watchers inside Docker on Windows
# This allows hot reload to work properly when files change on the host
ENV WATCHPACK_POLLING=true

# Start the Next.js development server with hot reload enabled
CMD ["npm", "run", "dev"]
