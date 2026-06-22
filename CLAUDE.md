# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

- Use comments sparingly. Only comment complex code where the logic is non-obvious.

## Commands

```bash
npm run setup          # First-time setup: install deps, generate Prisma client, run migrations
npm run dev            # Start dev server with Turbopack at http://localhost:3000
npm run dev:daemon     # Run dev server in background, logs to logs.txt
npm run build          # Production build
npm run lint           # ESLint
npm test               # Run Vitest tests
npm test -- src/path/to/test.tsx  # Run a single test file
npm run db:reset       # Reset and re-migrate the SQLite database
```

After schema changes: `npx prisma generate && npx prisma migrate dev`

## Architecture

### Core Concept

UIGen is a chat-driven React component generator. Users describe UI in natural language; the AI uses tool calls to write files into a **virtual (in-memory) file system** — nothing is written to disk. The virtual FS is serialized to JSON and persisted in SQLite via Prisma only when the user is authenticated and a project is saved.

### Data Flow

1. **Chat** (`src/app/api/chat/route.ts`) receives messages + serialized file tree from the client
2. It reconstructs a `VirtualFileSystem` from the serialized data, then calls `streamText` with two AI tools:
   - `str_replace_editor` — create/edit files via str-replace or insert
   - `file_manager` — rename/delete files
3. The AI streams tool calls back to the client
4. `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`) receives tool calls via `handleToolCall` and applies them to the in-memory `VirtualFileSystem`
5. `PreviewFrame` (`src/components/preview/PreviewFrame.tsx`) watches `refreshTrigger`, compiles all files via Babel in-browser, builds an import map with blob URLs, and renders into a sandboxed `<iframe>`

### Key Files

- `src/lib/file-system.ts` — `VirtualFileSystem` class (in-memory tree, CRUD + serialize/deserialize)
- `src/lib/transform/jsx-transformer.ts` — Babel transforms JSX/TSX → JS, resolves imports via blob URLs + `esm.sh` for third-party packages, injects Tailwind via CDN in the preview iframe
- `src/lib/provider.ts` — returns a real Anthropic model if `ANTHROPIC_API_KEY` is set, otherwise a `MockLanguageModel` that generates static counter/form/card demos
- `src/lib/auth.ts` — JWT sessions stored in `httpOnly` cookies (7-day expiry); `jose` library
- `src/lib/contexts/chat-context.tsx` — manages message history and streams AI responses
- `src/actions/` — Next.js Server Actions for project CRUD (create, get, list)
- `src/middleware.ts` — protects `/api/projects` and `/api/filesystem` routes

### Database

SQLite via Prisma. The schema is the source of truth for all data structures — reference `prisma/schema.prisma` whenever you need to understand how data is stored. Two models:
- `User` — email + bcrypt password
- `Project` — stores serialized messages (`String` JSON) and file system data (`String` JSON); `userId` is nullable for anonymous projects

Generated client goes to `src/generated/prisma/` (not the default location).

### Preview Rendering

The preview pipeline (`jsx-transformer.ts`) runs entirely in-browser:
1. Babel transforms each `.jsx/.tsx/.js/.ts` file with `@babel/standalone`
2. Each transformed file becomes a blob URL
3. An import map routes `react`/`react-dom` to `esm.sh`, local `@/` aliases to blob URLs, and unknown third-party packages to `esm.sh`
4. Missing local imports get placeholder empty components so the preview doesn't break
5. The iframe entry point is auto-detected: `App.jsx` → `App.tsx` → `index.jsx` → `index.tsx`

### Auth Flow

- Anonymous users can generate components; work is tracked in `sessionStorage` via `src/lib/anon-work-tracker.ts`
- On sign-up/sign-in, anonymous work is offered for migration into the new project
- Protected API routes are enforced in `src/middleware.ts`

### Without an API Key

Set `ANTHROPIC_API_KEY` in `.env`. Without it, `MockLanguageModel` in `src/lib/provider.ts` returns hardcoded counter/form/card components. The mock runs 4 steps max.
