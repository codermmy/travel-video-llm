# Travel Album LLM

Travel album intelligent organization system.

## Project Structure

- `mobile/`: React Native (Expo) + TypeScript
- `backend/`: FastAPI + SQLAlchemy + Alembic
- `openspec/`: OpenSpec change proposals and specs

## Prerequisites

- Node.js 18+ (recommended: 18/20 LTS)
- Python 3.11+
- PostgreSQL 15+ (local)
- Redis 7+ (local)

## Backend

### Setup

```bash
cd backend
cp .env.example .env

/opt/homebrew/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Database

```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis

/opt/homebrew/opt/postgresql@15/bin/createdb travel_album_dev
```

### Migrations

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### Run

```bash
cd backend
source .venv/bin/activate
python main.py
```

- Swagger UI: `http://localhost:8000/docs`
- Health: `GET http://localhost:8000/api/v1/health`
- Register: `POST http://localhost:8000/api/v1/auth/register`

Example:

```bash
curl -sS http://localhost:8000/api/v1/health

curl -sS -H 'Content-Type: application/json' \
  -X POST http://localhost:8000/api/v1/auth/register \
  -d '{"device_id":"dev-test-001"}'
```

## Mobile

### Setup

```bash
cd mobile
npm install
```

### Run

```bash
cd mobile
npm start
```

Notes:

- `@/*` path alias is configured for TypeScript and Metro (Babel module-resolver).
- If running on a physical device, `localhost` in `mobile/src/constants/api.ts` must be changed to your Mac LAN IP, e.g. `http://192.168.1.10:8000`.

## Dev Tooling

Mobile:

```bash
cd mobile
npm run lint
npm run typecheck
```

Backend:

```bash
cd backend
source .venv/bin/activate
black --check .
isort --check-only .
mypy app
```
