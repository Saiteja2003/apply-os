# ApplyOS - Engineering & Design Directive

## 1. System Philosophy & Non-Negotiables

- **Zero-Destruction AST**: The user's master resume is strictly immutable (`master_resumes` is append-only). Tailoring emits only structured `PatchDocument` JSON deltas.
- **No Hallucination**: Never invent metrics, employers, degrees, or unearned claims. Patches re-rank, tailor phrasing toward ATS keywords, and adjust summaries.
- **Provider Agnostic**: All AI logic flows through `src/lib/llm/gateway.ts`. Support BYOK (AES-256-GCM) with runtime model fallbacks.
- **Free-Tier Operational Envelope**: Zero hosting costs. Vercel Hobby + Supabase Free Tier only. No external paid backends.
- Prefer Surgical Fixes only. And be Token Efficient while development.

## 2. Design System & UX Standards (Enterprise Grade)

- **Palette**: Deep slate/zinc neutral foundation (`bg-zinc-950`, surfaces `bg-zinc-900/60`, borders `border-zinc-800/80`). Accent in soft violet/indigo with subtle ambient glows (`shadow-indigo-500/10`).
- **Surface Elevation**: Layer cards and modals with backdrop blur (`backdrop-blur-md`), refined borders, and distinct surface depth. Never use harsh raw-white input boxes in dark mode.
- **Micro-Interactions**: All actions (modals, drawers, drag operations, status updates) must feature smooth transitions (150ms-200ms ease-out). Include skeleton loading states, inline spinner indicators, and toast feedback.
- **Form Ergonomics**: All credential fields require show/hide eye toggles, clear validation messages, autofocus, and keyboard escape/enter triggers.
- **Dual-Pane Diff View**: Master bullet points on the left; ATS-adapted variants on the right with soft green additions and subtle muted strikethroughs for deleted words.
- **Institutional-Grade Ergonomics (Zero Dead Clicks & Seamless Navigation)**:
  - Top-bar brand (`ApplyOS`) must always navigate directly to `/dashboard`.
  - Breadcrumbs (e.g., `Workspace > Settings`) must be interactive: `Workspace` links to `/dashboard` or the immediate parent stage, and active paths show clear hover/focus states.
  - Interactive elements must provide immediate feedback (cursor-pointer, 150ms transitions, clear active states). No non-clickable text masquerading as interactive chrome.

## 3. Tech Stack

- Frontend: Next.js 15 (App Router, React 19, TypeScript, Tailwind CSS, Radix UI, TanStack Query)
- Backend & DB: Supabase (PostgreSQL, Auth, RLS, Storage), Next.js Server Actions
- Document Engine: `@react-pdf/renderer` (deterministic ATS vector PDF compilation)
- AI SDKs: `@anthropic-ai/sdk`, `openai`, `@google/genai`

## 4. Runbook & Commands

- Dev: `pnpm dev`
- Build: `pnpm build`
- Typecheck: `pnpm typecheck`
