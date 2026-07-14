# Development Dockerfile for Svelte
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install git (needed for some npm packages)
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci || npm install

# Copy the rest of the application
COPY . .

# Expose port for development server
EXPOSE 5173

# Command to run the development server
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]