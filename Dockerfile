# Use Python 3.10 as base
FROM python:3.10

# Install Node.js (for frontend build if needed)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install Python deps
RUN pip install --no-cache-dir -r requirements.txt

# Install Node deps if needed
RUN if [ -f package.json ]; then yarn install; fi

# Expose port (if Flask)
EXPOSE 5000

# Start your server
CMD ["python", "server.py"]
