# Windows PowerShell version of docker-test.sh
# Docker Trading Bot - Troubleshooting Script for Windows

Write-Host "🔍 Docker Trading Bot - Troubleshooting Script (Windows)" -ForegroundColor Cyan
Write-Host "=============================================="

# Check Docker
Write-Host "1. Checking Docker..." -ForegroundColor Yellow
try {
    docker version | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check Docker Compose
Write-Host "2. Checking Docker Compose..." -ForegroundColor Yellow
try {
    docker-compose version | Out-Null
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose not found. Please install docker-compose." -ForegroundColor Red
    exit 1
}

# Check environment file
Write-Host "3. Checking environment file..." -ForegroundColor Yellow
if (-Not (Test-Path ".env.gpt5mini")) {
    Write-Host "❌ .env.gpt5mini file not found!" -ForegroundColor Red
    Write-Host "📝 Creating .env.gpt5mini from example template..." -ForegroundColor Blue
    
    if (Test-Path ".env.gpt5mini.example") {
        Copy-Item ".env.gpt5mini.example" ".env.gpt5mini"
        Write-Host "✅ Created .env.gpt5mini from template" -ForegroundColor Green
        Write-Host "🔑 IMPORTANT: Edit .env.gpt5mini and add your actual API keys:" -ForegroundColor Yellow
        Write-Host "   - OPENAI_API_KEY (from https://platform.openai.com/api-keys)" -ForegroundColor White
        Write-Host "   - ALPACA_API_KEY and ALPACA_SECRET_KEY (from https://app.alpaca.markets/paper/dashboard/overview)" -ForegroundColor White
        Write-Host "   - BRAVE_API_KEY (optional, from https://api.search.brave.com/)" -ForegroundColor White
        Write-Host ""
        Write-Host "📝 Edit the file with: notepad .env.gpt5mini" -ForegroundColor Cyan
        exit 1
    } else {
        Write-Host "📝 Please create .env.gpt5mini with your API keys:" -ForegroundColor Blue
        Write-Host "PROFILE_NAME=gpt5mini"
        Write-Host "MODEL=gpt-5-mini"
        Write-Host "OPENAI_API_KEY=your_openai_api_key"
        Write-Host "ALPACA_API_KEY=your_alpaca_api_key"
        Write-Host "ALPACA_SECRET_KEY=your_alpaca_secret_key"
        Write-Host "ALPACA_BASE_URL=https://paper-api.alpaca.markets"
        Write-Host "BRAVE_API_KEY=your_brave_api_key"
        exit 1
    }
}

# Check if API keys are filled in
Write-Host "4. Checking API keys in .env.gpt5mini..." -ForegroundColor Yellow
$envContent = Get-Content ".env.gpt5mini" -Raw
if ($envContent -match "your_.*_api_key") {
    Write-Host "❌ Please replace placeholder values in .env.gpt5mini with your actual API keys" -ForegroundColor Red
    Write-Host "🔍 Found placeholders that need to be replaced. Edit with: notepad .env.gpt5mini" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ .env.gpt5mini file exists and appears to have real API keys" -ForegroundColor Green

# Validate docker-compose config
Write-Host "5. Validating Docker Compose configuration..." -ForegroundColor Yellow
try {
    docker-compose --profile gpt5mini config | Out-Null
    Write-Host "✅ Docker Compose configuration is valid" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose configuration is invalid" -ForegroundColor Red
    docker-compose --profile gpt5mini config
    exit 1
}

# Test build
Write-Host "6. Testing Docker build..." -ForegroundColor Yellow
try {
    docker-compose --profile gpt5mini build
    Write-Host "✅ Docker build successful" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker build failed" -ForegroundColor Red
    exit 1
}

# Test quick run
Write-Host "7. Testing quick container start..." -ForegroundColor Yellow
Write-Host "Starting container for 10 seconds to test..." -ForegroundColor Blue
docker-compose --profile gpt5mini up -d
Start-Sleep -Seconds 10
Write-Host "Container logs:" -ForegroundColor Blue
docker logs priced-in-gpt5mini
docker-compose --profile gpt5mini down

Write-Host ""
Write-Host "🎉 All tests passed! Your setup should work." -ForegroundColor Green
Write-Host "🚀 Run: docker-compose --profile gpt5mini up -d" -ForegroundColor Cyan