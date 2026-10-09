# ApplyOS - Project Instructions

## Tech Stack

- Frontend: Next.js 15 (App Router, TypeScript, Tailwind CSS, TanStack Query, Zustand)
- Backend: Python 3.12 (FastAPI, Pydantic v2, SQLAlchemy 2.0 Async, PostgreSQL)
- Engines: Typst (PDF compilation), Anthropic / OpenAI / Google Python SDKs
- Architecture: Immutable Master Resume AST -> JSON Delta Patch -> Rendered PDF

## Core Rules

1. NEVER overwrite the master resume file. All resume changes must be generated as non-destructive JSON delta patches.
2. Strict Typing: Every API response must match a Pydantic schema in Python and a matching TypeScript interface.
3. Multi-Model Support: All AI interactions must route through `apps/api/app/gateway/`, never calling vendor SDKs directly in route handlers.
4. Error Handling: Always handle LLM token limits, network timeouts, and JSON parse failures with fallbacks.
5. Surgical Changes: Only touch files required for the current task. Do not refactor stable modules.

## Dev Commands

- Backend: `cd apps/api && uv run uvicorn app.main:app --reload --port 8000`
- Frontend: `cd apps/web && pnpm dev`
- Test: `cd apps/api && uv run pytest`
