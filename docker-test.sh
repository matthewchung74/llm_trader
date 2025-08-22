#!/bin/bash

echo "🔍 Docker Trading Bot - Troubleshooting Script"
echo "=============================================="

# Check Docker
echo "1. Checking Docker..."
if ! docker version >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi
echo "✅ Docker is running"

# Check Docker Compose
echo "2. Checking Docker Compose..."
if ! docker-compose version >/dev/null 2>&1; then
    echo "❌ Docker Compose not found. Please install docker-compose."
    exit 1
fi
echo "✅ Docker Compose is available"

# Check environment file
echo "3. Checking environment file..."
if [ ! -f ".env.gpt5mini" ]; then
    echo "❌ .env.gpt5mini file not found!"
    echo "📝 Please create .env.gpt5mini with your API keys:"
    echo "OPENAI_API_KEY=your_openai_api_key"
    echo "ALPACA_API_KEY=your_alpaca_api_key"
    echo "ALPACA_SECRET_KEY=your_alpaca_secret_key"
    echo "ALPACA_BASE_URL=https://paper-api.alpaca.markets"
    exit 1
fi
echo "✅ .env.gpt5mini file exists"

# Validate docker-compose config
echo "4. Validating Docker Compose configuration..."
if ! docker-compose --profile gpt5mini config >/dev/null 2>&1; then
    echo "❌ Docker Compose configuration is invalid"
    docker-compose --profile gpt5mini config
    exit 1
fi
echo "✅ Docker Compose configuration is valid"

# Test build
echo "5. Testing Docker build..."
if ! docker-compose --profile gpt5mini build; then
    echo "❌ Docker build failed"
    exit 1
fi
echo "✅ Docker build successful"

# Test quick run
echo "6. Testing quick container start..."
echo "Starting container for 10 seconds to test..."
docker-compose --profile gpt5mini up -d
sleep 10
echo "Container logs:"
docker logs priced-in-gpt5mini
docker-compose --profile gpt5mini down

echo ""
echo "🎉 All tests passed! Your setup should work."
echo "🚀 Run: docker-compose --profile gpt5mini up -d"