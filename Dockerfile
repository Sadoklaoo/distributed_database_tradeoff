# Use official Python 3.11 image
FROM python:3.11-slim-bullseye

# Set work directory inside container
WORKDIR /app

# Install system dependencies (optional but useful for Cassandra driver)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libssl-dev python3-dev \
	&& apt-get upgrade -y \
	&& rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

# Expose FastAPI port
EXPOSE 8000

# Run the FastAPI app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
