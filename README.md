# Travel Album LLM

Travel album intelligent organization system.

## Project Structure

- `mobile/`: React Native (Expo) + TypeScript
- `backend/`: FastAPI + SQLAlchemy + Alembic
- `my-spec/docs/`: Product and implementation docs
- `my-spec/system/knowledge/`: Project knowledge base

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

## AI Story Generation Prerequisites

To make event title/story/emotion generation work end-to-end, configure these in `backend/.env`:

- `AI_PROVIDER` (`openai` or `tongyi`, default `openai`)
- OpenAI-compatible provider:
  - `OPENAI_BASE_URL` (default `http://api.yescode.cloud/v1`)
  - `OPENAI_API_KEY`
  - `OPENAI_VISION_MODEL` / `OPENAI_STORY_MODEL`
- Tongyi provider (when `AI_PROVIDER=tongyi`):
  - `DASHSCOPE_API_KEY` (or `TONGYI_API_KEY`)
- `AMAP_API_KEY` (location reverse geocoding)
- OSS config (`OSS_ENDPOINT`, `OSS_BUCKET`, `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET`)

Recommended for local debugging:

- Set `BACKEND_PUBLIC_BASE_URL` to an externally reachable URL (or use OSS public URL directly).
- If OSS is configured, uploaded thumbnails are written to OSS and AI uses public URLs.

### Troubleshooting: event detail shows missing title/story/emotion

1. Check task status from `/api/v1/tasks/status/{taskId}`
   - `stage=ai` + `status=failure` means AI generation failed.
   - `result/error` now includes `provider`, `visionModel`, `storyModel` for debugging.
2. Check event fields from `/api/v1/events/{eventId}`
   - `status=ai_failed` and `aiError` explains root cause.
3. Common causes:
   - `openai_api_key_not_configured`
   - `tongyi_api_key_not_configured`
   - `openai_http_error` / `tongyi_http_error`
   - `openai_response_parse_failed` / `tongyi_response_parse_failed`
   - `photos_are_not_publicly_accessible_for_ai`
4. You can retry by calling `POST /api/v1/events/{eventId}/regenerate-story`.


## Slideshow Music Fallback

- Default local fallback music file: `mobile/assets/audio/default-bgm.wav`
- Replace this file with your own licensed BGM if needed.
- Playback priority: `event.musicUrl` (remote) -> local fallback file -> show "no music" status.
