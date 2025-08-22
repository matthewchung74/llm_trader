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
    echo "📝 Creating .env.gpt5mini from example template..."
    if [ -f ".env.gpt5mini.example" ]; then
        cp .env.gpt5mini.example .env.gpt5mini
        echo "✅ Created .env.gpt5mini from template"
        echo "🔑 IMPORTANT: Edit .env.gpt5mini and add your actual API keys:"
        echo "   - OPENAI_API_KEY (from https://platform.openai.com/api-keys)"
        echo "   - ALPACA_API_KEY and ALPACA_SECRET_KEY (from https://app.alpaca.markets/paper/dashboard/overview)"
        echo "   - BRAVE_API_KEY (optional, from https://api.search.brave.com/)"
        exit 1
    else
        echo "📝 Please create .env.gpt5mini with your API keys:"
        echo "PROFILE_NAME=gpt5mini"
        echo "MODEL=gpt-5-mini"
        echo "OPENAI_API_KEY=your_openai_api_key"
        echo "ALPACA_API_KEY=your_alpaca_api_key"
        echo "ALPACA_SECRET_KEY=your_alpaca_secret_key"
        echo "ALPACA_BASE_URL=https://paper-api.alpaca.markets"
        echo "BRAVE_API_KEY=your_brave_api_key"
        exit 1
    fi
fi

# Check if API keys are filled in
echo "4. Checking API keys in .env.gpt5mini..."
if grep -q "your_.*_api_key" .env.gpt5mini; then
    echo "❌ Please replace placeholder values in .env.gpt5mini with your actual API keys"
    echo "🔍 Found these placeholders that need to be replaced:"
    grep "your_.*_api_key" .env.gpt5mini
    exit 1
fi
echo "✅ .env.gpt5mini file exists and appears to have real API keys"

# Validate docker-compose config
echo "5. Validating Docker Compose configuration..."
if ! docker-compose --profile gpt5mini config >/dev/null 2>&1; then
    echo "❌ Docker Compose configuration is invalid"
    docker-compose --profile gpt5mini config
    exit 1
fi
echo "✅ Docker Compose configuration is valid"

# Test build
echo "6. Testing Docker build..."
if ! docker-compose --profile gpt5mini build; then
    echo "❌ Docker build failed"
    exit 1
fi
echo "✅ Docker build successful"

# Test quick run
echo "7. Testing quick container start..."
echo "Starting container for 10 seconds to test..."
docker-compose --profile gpt5mini up -d
sleep 10
echo "Container logs:"
docker logs priced-in-gpt5mini
docker-compose --profile gpt5mini down

echo ""
echo "🎉 All tests passed! Your setup should work."
echo "🚀 Run: docker-compose --profile gpt5mini up -d"