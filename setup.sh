#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  Moboost MAAS — One-Click Development Environment Setup            ║
# ║  Supports: macOS (Homebrew) and Linux (apt)                        ║
# ║  Usage:  chmod +x setup.sh && ./setup.sh                           ║
# ╚══════════════════════════════════════════════════════════════════════╝

set -euo pipefail

# ─── Colors ────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()    { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Moboost MAAS — Environment Setup        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ─── Detect OS ─────────────────────────────────────────────────────────
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
else
    fail "Unsupported OS: $OSTYPE. This script supports macOS and Linux."
fi
info "Detected OS: $OS"

# ─── Check Prerequisites ──────────────────────────────────────────────
check_command() {
    if command -v "$1" &> /dev/null; then
        local ver
        ver=$("$1" --version 2>/dev/null | head -n1 || echo "installed")
        success "$1 found: $ver"
        return 0
    else
        return 1
    fi
}

MISSING=()

echo ""
info "Checking prerequisites..."

# Node.js
if ! check_command node; then
    MISSING+=("node")
    warn "Node.js not found"
fi

# npm
if ! check_command npm; then
    MISSING+=("npm")
    warn "npm not found"
fi

# Python 3
if check_command python3; then
    PYTHON=python3
elif check_command python; then
    PYTHON=python
else
    MISSING+=("python")
    warn "Python 3 not found"
    PYTHON=""
fi

# pip
if [ -n "$PYTHON" ]; then
    if $PYTHON -m pip --version &> /dev/null; then
        success "pip found"
    else
        MISSING+=("pip")
        warn "pip not found"
    fi
fi

# Git
check_command git || MISSING+=("git")

# Docker (optional)
if check_command docker; then
    DOCKER_AVAILABLE=true
else
    DOCKER_AVAILABLE=false
    warn "Docker not found (optional — needed for docker compose mode)"
fi

# ─── Install Missing Dependencies ─────────────────────────────────────
if [ ${#MISSING[@]} -gt 0 ]; then
    echo ""
    warn "Missing dependencies: ${MISSING[*]}"
    read -p "Install missing dependencies? [Y/n] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        if [ "$OS" == "macos" ]; then
            if ! command -v brew &> /dev/null; then
                info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            for dep in "${MISSING[@]}"; do
                case $dep in
                    node|npm) brew install node ;;
                    python|pip) brew install python@3.12 ;;
                    git) brew install git ;;
                esac
            done
        elif [ "$OS" == "linux" ]; then
            sudo apt-get update
            for dep in "${MISSING[@]}"; do
                case $dep in
                    node|npm)
                        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
                        sudo apt-get install -y nodejs
                        ;;
                    python|pip)
                        sudo apt-get install -y python3 python3-pip python3-venv
                        ;;
                    git) sudo apt-get install -y git ;;
                esac
            done
        fi
        success "Dependencies installed"
    else
        fail "Cannot continue without required dependencies"
    fi
fi

# ─── Setup Mode Selection ─────────────────────────────────────────────
echo ""
info "Choose setup mode:"
echo "  1) Local development (npm + uvicorn — recommended for development)"
echo "  2) Docker Compose (containerized — recommended for quick start)"
echo ""
read -p "Select [1/2]: " -n 1 -r SETUP_MODE
echo ""

# ─── Environment File ─────────────────────────────────────────────────
echo ""
if [ ! -f .env.local ]; then
    info "Creating .env.local from template..."
    cp .env.example .env.local
    success "Created .env.local — edit it with your API keys"
    warn "You MUST fill in your API keys before starting the app!"
    echo ""
    echo "  Required keys:"
    echo "    - OPENROUTER_API_KEY     (get from https://openrouter.ai/keys)"
    echo "    - NEXT_PUBLIC_SUPABASE_* (get from Supabase dashboard)"
    echo "    - CLERK keys             (get from Clerk dashboard)"
    echo ""
    echo "  See docs/ENV_GUIDE.md for detailed instructions."
    echo ""
else
    success ".env.local already exists"
fi

# ─── Generate Secrets ─────────────────────────────────────────────────
generate_secret() {
    openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))"
}

# Check if secrets need generating
if grep -q "your-random-secret-here" .env.local 2>/dev/null; then
    info "Generating ADMIN_TOKEN_SECRET..."
    SECRET=$(generate_secret)
    if [ "$OS" == "macos" ]; then
        sed -i '' "s/your-random-secret-here/$SECRET/" .env.local
    else
        sed -i "s/your-random-secret-here/$SECRET/" .env.local
    fi
    success "ADMIN_TOKEN_SECRET generated"
fi

# ─── Mode 1: Local Development ────────────────────────────────────────
if [ "$SETUP_MODE" == "1" ]; then
    echo ""
    info "Setting up local development environment..."

    # Frontend dependencies
    info "Installing frontend dependencies (npm)..."
    npm ci --prefer-offline 2>/dev/null || npm install
    success "Frontend dependencies installed"

    # Backend setup
    info "Setting up backend..."
    BACKEND_DIR="services/ad-localization/backend"

    if [ -d "$BACKEND_DIR" ]; then
        cd "$BACKEND_DIR"

        # Create virtual environment
        if [ ! -d ".venv" ]; then
            info "Creating Python virtual environment..."
            $PYTHON -m venv .venv
        fi

        # Activate and install
        source .venv/bin/activate
        info "Installing backend dependencies..."
        pip install -e ".[dev]" --quiet
        success "Backend dependencies installed"

        # Create storage directory
        mkdir -p storage

        # Check if PostgreSQL is accessible
        if command -v psql &> /dev/null; then
            if psql -h localhost -U postgres -lqt 2>/dev/null | grep -qw ad_localization; then
                success "Database 'ad_localization' exists"
            else
                info "Creating database 'ad_localization'..."
                createdb -h localhost -U postgres ad_localization 2>/dev/null || \
                    warn "Could not create database. Create it manually or use Docker."
            fi
        else
            warn "psql not found. Make sure PostgreSQL is running with database 'ad_localization'"
            warn "  Or use: docker compose up postgres -d"
        fi

        # Run migrations
        info "Running database migrations..."
        if alembic upgrade head 2>/dev/null; then
            success "Migrations applied"
        else
            warn "Migrations failed — check DATABASE_URL in .env"
        fi

        deactivate
        cd ../../..
    fi

    # Summary
    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Setup Complete!                         ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Start the app:"
    echo ""
    echo "    Frontend:  npm run dev"
    echo "    Backend:   cd services/ad-localization/backend && source .venv/bin/activate && uvicorn app.main:app --reload"
    echo "    Database:  docker compose up postgres -d  (if using Docker for PG)"
    echo ""
    echo "  Open: http://localhost:3000"
    echo ""

# ─── Mode 2: Docker Compose ───────────────────────────────────────────
elif [ "$SETUP_MODE" == "2" ]; then
    echo ""
    if [ "$DOCKER_AVAILABLE" != "true" ]; then
        fail "Docker is required for this mode. Install from https://docker.com"
    fi

    info "Starting with Docker Compose..."
    docker compose build
    docker compose up -d

    echo ""
    info "Waiting for services to start..."
    sleep 5

    # Check service health
    if docker compose ps | grep -q "running"; then
        success "Services are running"
    else
        warn "Some services may not have started. Check: docker compose logs"
    fi

    echo ""
    echo -e "${GREEN}╔══════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║  Docker Setup Complete!                  ║${NC}"
    echo -e "${GREEN}╚══════════════════════════════════════════╝${NC}"
    echo ""
    echo "  Services:"
    echo "    Frontend:  http://localhost:3000"
    echo "    Backend:   http://localhost:8000"
    echo "    Postgres:  localhost:5432"
    echo ""
    echo "  Commands:"
    echo "    Logs:      docker compose logs -f"
    echo "    Stop:      docker compose down"
    echo "    Reset DB:  docker compose down -v"
    echo ""
fi

echo "  Documentation:"
echo "    Dependencies:  docs/DEPENDENCIES.md"
echo "    Env Guide:     docs/ENV_GUIDE.md"
echo ""
