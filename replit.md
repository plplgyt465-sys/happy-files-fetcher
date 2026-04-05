# VibeCode — Live Coding IDE with AI Agent

## Project Overview
A React/TypeScript live coding IDE with an AI coding assistant powered by an autonomous ReAct agent loop. Runs on Replit with a Vite frontend and Express backend.

## Architecture

### Frontend (Vite, port 5000)
- **Framework**: React 18 + TypeScript + Vite
- **Routing**: `react-router-dom`
- **State**: React `useState`/`useCallback` (no Redux)
- **UI**: shadcn/ui + Tailwind CSS (dark theme)
- **Key pages**: `src/pages/Index.tsx` (main IDE layout)

### Backend (Express, port 3000)
- **Entry**: `server/index.ts`
- **Proxy**: Vite dev server proxies `/api/*` → `localhost:3000`
- **Endpoints**:
  - `POST /api/gemini-unofficial` — Unofficial Gemini (Bard endpoint, no API key)
  - `POST /api/gemini-chat` — Official Gemini API (requires GEMINI_API_KEY)
  - `POST /api/multi-agent` — Orchestrator + 9 parallel specialized agents
  - `POST /api/agent/think` — Single ReAct step for the agent loop

## AI System

### Default Provider
- `'unofficial'` — Uses Bard/Gemini endpoint, no API key needed
- Falls back to `'official'` if GEMINI_API_KEY is set

### ReAct Agent Loop (`src/hooks/useAgentLoop.ts`)
- **States**: `idle → intent → context → planning → executing → verifying → done`
- **Tools**: FileList, FileRead, FileWrite, FileCreate, SearchCode, ErrorParser, etc.
- **Max iterations**: 50 (safeguard)
- **Runs client-side**: Tool executor reads/writes React state directly
- **Live feedback**: `onStateChange` and `onStep` callbacks for real-time UI updates

### Multi-Agent Mode (`/api/multi-agent`)
- Agent 0 (Orchestrator) plans and delegates to Agents 1–9
- Each specialized agent handles a domain (Setup, Styles, State, Shared, Pages, Data)
- Triggered for "build", "create", "make" type prompts via `shouldUseMultiAgent()`

## Key Files
| File | Purpose |
|------|---------|
| `server/index.ts` | Express server, all AI endpoints |
| `src/hooks/useCodeStore.ts` | Central state + AI message dispatch |
| `src/hooks/useAgentLoop.ts` | ReAct loop, tool executor, state machine |
| `src/hooks/useStaticAnalysis.ts` | TypeScript/lint diagnostics (client-side) |
| `src/components/ChatPanel.tsx` | Chat UI with live agent state display |
| `src/components/LivePreview.tsx` | Iframe preview with error capture |
| `vite.config.ts` | Vite config (proxy, aliases) |

## Environment Variables / Secrets
- `GEMINI_API_KEY` — (Optional) Google Gemini API key for official mode. Without it, the app uses the unofficial Bard endpoint automatically.

## Development
```bash
npm run dev   # Starts both Vite (5000) and Express (3000) via concurrently
```

## Notes
- **No database** — App is entirely client-side state (file contents in memory)
- **No Supabase** — Removed; app uses Express endpoints for AI calls
- Express 5 wildcard: use `'/{*splat}'` not `'*'`
- `lovable-tagger` and `@supabase/supabase-js` removed
