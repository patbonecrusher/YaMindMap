# YaMindMap Electron — Claude Code Instructions

## Project Overview

Electron rewrite of YaMindMap (originally Rust/iced). Full spec in `/Users/patricklaplante/Projects/YaMindMap/REQUIREMENTS.md`.

**Stack**: Electron + electron-vite + React 19 + React Flow + TypeScript (strict) + Zustand + Immer

## Required Skills

### React Best Practices (Vercel)

ALWAYS apply the `vercel-react-best-practices` skill when writing, reviewing, or refactoring React components. The skill is installed at `~/.agents/skills/vercel-react-best-practices/` and contains 58 rules across 8 categories. Key priorities:

1. **Eliminate waterfalls** — `Promise.all()` for independent operations, defer awaits, use Suspense boundaries
2. **Bundle size** — import directly (no barrel files), dynamic imports for heavy components
3. **Re-render optimization** — defer reads, memoize expensive components, use functional setState, derive state during render (not effects)

### React Composition Patterns (Vercel)

ALWAYS apply the `vercel-composition-patterns` skill when designing component architecture. The skill is installed at `~/.agents/skills/vercel-composition-patterns/`. Key principles:

- Prefer compound components over boolean prop proliferation
- Lift state appropriately, compose internals
- Use React 19 APIs where applicable

### Agent-Browser for Visual Testing

Use the `electron` skill (installed at `~/.agents/skills/electron/`) for visual verification of the app. This uses `agent-browser` to connect to the Electron app via Chrome DevTools Protocol.

**Standard workflow:**
```bash
# The app launches with --remote-debugging-port=9333 in dev mode
agent-browser connect 9333

# Snapshot to discover interactive elements
agent-browser snapshot -i

# Take screenshots for visual verification
agent-browser screenshot screenshot-name.png

# Interact with elements
agent-browser click @e5
agent-browser fill @e3 "text"
agent-browser press Enter

# Re-snapshot after state changes
agent-browser snapshot -i
```

Use agent-browser after each chunk to visually verify rendering, interactions, and layout correctness.

## Coding Standards

### TypeScript
- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` — use `unknown` + type guards when needed
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `readonly` for immutable data structures

### React
- Functional components only
- Use `React.memo()` only when profiling shows a bottleneck — don't pre-optimize
- Avoid `useEffect` for derived state — compute during render
- Import directly from packages, never through barrel `index.ts` re-exports in hot paths
- Keep components small and composable

### State Management (Zustand + Immer)
- One store per window (no shared state between BrowserWindows)
- Store split into slices: `documentSlice`, `selectionSlice`, `historySlice`, `uiSlice`
- All mutations go through Immer `produce()` — never mutate state directly
- Commands operate on plain document data, not store — store dispatches commands

### Layout Architecture
- Layout engine produces pure `{ nodeId, x, y, w, h }` results — NO React dependencies
- Separate `toReactFlowNodes()` converts layout results to React Flow format
- This keeps the layout engine independently testable with Vitest

### Node IDs
- `crypto.randomUUID()` string IDs (not auto-incrementing numbers)
- File parsing maps legacy u64 IDs to/from string UUIDs

### Testing
- **Vitest** for unit/integration tests — every chunk must have passing tests
- **agent-browser** for visual verification **after every chunk** (not just chunk 6+)
- Tests live next to source files as `*.test.ts` / `*.test.tsx`

### Post-Chunk agent-browser Verification (MANDATORY)

After completing every chunk, you MUST run the following verification sequence:

1. Launch the app: `npx electron-vite dev &` (wait for startup)
2. Connect: `agent-browser connect 9333`
3. Snapshot the DOM: `agent-browser snapshot` and `agent-browser snapshot -i`
4. Take a screenshot: `agent-browser screenshot /tmp/yamindmap-chunk-N.png`
5. Verify the chunk's features are visible/working by interacting with elements as needed
6. Leave the app running — let the user close it manually (Cmd+Q). Do NOT use `pkill` or `kill` as it leaves ghost windows on macOS.
7. Report results — show the screenshot and confirm what was verified

Do NOT skip this step, even for chunks that are purely data/logic (chunks 2–5). For those, verify the app still launches and renders correctly after the changes.

**NOTE**: `pkill -f "electron"` and `kill` leave blank ghost windows on macOS. Always let the user close the app manually with Cmd+Q. Once IPC is wired up (Chunk 12), we can add a clean quit command via agent-browser.

## File Structure

```
src/
├── src/
│   ├── main/           # Electron main process
│   ├── preload/        # Context bridge
│   ├── renderer/       # React app
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/
│   │   └── utils/
│   └── shared/         # Pure logic (no Electron/React deps)
│       ├── types/
│       ├── commands/
│       └── layout/
├── electron-vite.config.ts
├── vitest.config.ts
└── package.json
```

## Key Constants

All numeric constants (padding, gaps, font sizes, colors) are defined in `src/shared/constants.ts` — never hardcode magic numbers in components.

## Reference

- Full specification: `/Users/patricklaplante/Projects/YaMindMap/REQUIREMENTS.md`
- Rust source (removed): originally in `crates/` — porting complete
- App icons: `/Users/patricklaplante/Projects/YaMindMap/assets/icons/`
