# YaMindMap Electron Port — Implementation Plan

## Why

Rewriting from Rust/iced to Electron due to rendering artifacts (window resize flicker, alt-tab flicker). The current app is ~8,600 lines of Rust across 5 crates. This port preserves all functionality while gaining stable rendering and easier UI iteration.

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron + electron-vite |
| UI | React 19 + React Flow |
| Language | TypeScript (strict) |
| State | Zustand + Immer |
| Testing | Vitest + agent-browser |

## Key Design Decisions

1. **electron-vite** — pre-configured main/preload/renderer separation, HMR, TypeScript out of the box
2. **Layout → React Flow transform** — layout engine produces pure `{ nodeId, x, y, w, h }`; a separate `toReactFlowNodes()` converts to React Flow format. Keeps layout testable without React.
3. **One Zustand store per window** — each BrowserWindow has its own React tree and store. No shared state. Store slices: `documentSlice`, `selectionSlice`, `historySlice`, `uiSlice`.
4. **Multi-window via BrowserWindow** — main process maintains `Map<windowId, { filePath, dirty }>`. IPC for file ops. `win.setDocumentEdited(dirty)` for macOS indicator.
5. **Settings** — `app.getPath('userData')/settings.json`. Main process owns read/write, broadcasts to all windows via IPC.
6. **NodeId as string** — `crypto.randomUUID()` instead of auto-incrementing u64. File parsing maps u64 ↔ string.

## Reference: Rust Source Files

| Rust File | What to Port |
|-----------|-------------|
| `crates/yamind-core/src/document.rs` | Document type + tree operations |
| `crates/yamind-core/src/node.rs` | Node, NodeContent, Attachment types |
| `crates/yamind-core/src/style.rs` | Style system + depth defaults |
| `crates/yamind-core/src/boundary.rs` | Boundary type |
| `crates/yamind-layout/src/balanced.rs` | Layout algorithm (most complex) |
| `crates/yamind-layout/src/routing.rs` | Bezier edge routing |
| `crates/yamind-commands/src/` | All 11 commands + history |
| `crates/yamind-file/src/format.rs` | File format |
| `src/shortcuts.rs` | Shortcut bindings |
| `REQUIREMENTS.md` | Complete specification |

---

## Chunk 1: Electron + Vite + React Scaffold

**Goal**: Bare electron-vite project, React 19 renderer showing "Hello YaMindMap", dev/build pipeline.

**Status**: [x] COMPLETE

**Files created**:
- `package.json` — electron 33, electron-vite 5, react 19, react-dom, typescript, vitest
- `electron-vite.config.ts`
- `tsconfig.json` (strict), `tsconfig.node.json`, `tsconfig.web.json`
- `src/main/index.ts` — BrowserWindow, loads renderer
- `src/preload/index.ts` — contextBridge with empty API
- `src/renderer/index.html`, `main.tsx`, `App.tsx`
- `vitest.config.ts`, `src/test-setup.ts`
- `.gitignore`

**Tests**:
- [x] Vitest: `App.test.tsx` — renders without crashing
- [x] agent-browser: verify window title, "Hello YaMindMap" visible

**Verified**: `npm test` passes (1 test). `npm run build` produces main/preload/renderer bundles.

---

## Chunk 2: Data Model + File Format

**Goal**: All TypeScript types, `.yamind` JSON parse/serialize, demo document, constants.

**Status**: [x] COMPLETE

**Files created**:
- `src/shared/types/node.ts`, `document.ts`, `style.ts`, `boundary.ts`, `geometry.ts`, `file.ts`, `index.ts`
- `src/shared/constants.ts`, `defaults.ts`, `file-format.ts`, `demo-document.ts`

**Tests** (24 total, all passing):
- [x] Round-trip parse/serialize `.yamind` file (7 tests)
- [x] `createDemoDocument()` correct structure (5 tests)
- [x] `styleForDepth()` returns correct styles (3 tests)
- [x] `Color.fromHex()` correctness (6 tests)
- [x] `mergeStyles` override/base merge (2 tests)
- [x] agent-browser: app still launches and renders after changes

---

## Chunk 3: Document Operations (Tree Mutations)

**Goal**: Pure functions for all tree ops, designed for Immer `produce()`.

**Status**: [x] COMPLETE

**Files created**:
- `src/shared/document-ops.ts` — addChild, addSibling, removeSubtree, restoreSubtree, moveNode, depthOf, isAncestorOf, visibleNodeIds

**Tests** (28 tests, all passing):
- [x] addChild/addSibling inserts correctly (7 tests)
- [x] addChild with specific ID reuses it for redo (1 test)
- [x] removeSubtree removes descendants, returns removed nodes (4 tests)
- [x] restoreSubtree re-inserts for undo (1 test)
- [x] moveNode reparents, returns old parent/index; rejects move into own subtree (5 tests)
- [x] moveNode within same parent adjusts index (1 test)
- [x] depthOf returns correct depths (3 tests)
- [x] isAncestorOf traverses parent chain (4 tests)
- [x] visibleNodeIds skips collapsed subtrees (4 tests)
- [x] agent-browser: app still launches and renders after changes

---

## Chunk 4: Command System (Undo/Redo)

**Goal**: Command pattern with all 11 commands + CommandHistory.

**Status**: [x] COMPLETE

**Files created**:
- `src/shared/commands/command.ts` — Command interface + TextUpdatable
- `src/shared/commands/history.ts` — CommandHistory with undo/redo stacks, updateLastText
- `src/shared/commands/node-commands.ts` — AddChild, AddSibling, DeleteNode, DeleteAndReparent, EditText, MoveNode
- `src/shared/commands/attachment-commands.ts` — AddAttachment, RemoveAttachment
- `src/shared/commands/boundary-commands.ts` — AddBoundary, DeleteBoundary, EditBoundaryLabel

**Tests** (17 tests, all passing):
- [x] Each command's execute + undo round-trips (11 commands)
- [x] AddChildCommand — redo reuses same ID
- [x] DeleteNodeCommand stores/restores entire subtree
- [x] DeleteAndReparentCommand promotes children, undo reverses
- [x] CommandHistory — redo stack cleared on new command
- [x] updateLastText updates last command (new-node workflow)
- [x] agent-browser: app still launches and renders after changes

---

## Chunk 5: Layout Engine

**Goal**: Balanced layout algorithm + bezier edge routing + text measurement.

**Status**: [x] COMPLETE

**Port from**: `crates/yamind-layout/src/balanced.rs`, `routing.rs`

**Files created**:
- `src/shared/layout/types.ts` — LayoutResult, BezierRoute, NodeSizeMap, edgeKey
- `src/shared/layout/balanced.ts` — balanced layout with greedy partition, boundary-aware spacing
- `src/shared/layout/routing.ts` — S-curve bezier edge routing (50% horizontal offset)
- `src/shared/layout/text-measure.ts` — Canvas 2D measureText with test fallback

**Tests** (10 tests, all passing):
- [x] Root at origin center
- [x] Balanced partition splits children to both sides
- [x] RightOnly/LeftOnly directions
- [x] Collapsed subtrees excluded from layout
- [x] Boundary gap between siblings in different boundaries
- [x] Edge route control points match bezier formula (2 tests)
- [x] Handles empty document
- [x] agent-browser: app still launches and renders after changes

---

## Chunk 6: React Flow Integration + Static Rendering

**Goal**: Demo mind map rendered with React Flow — correct positions, styled nodes, bezier edges, boundaries, fold badges, attachment icons.

**Status**: [x] COMPLETE — **FIRST VISUAL MILESTONE**

**Files created**:
- `src/renderer/components/MindMapCanvas.tsx` — wraps `<ReactFlow>` with fitView, pan/zoom
- `src/renderer/components/nodes/MindMapNode.tsx` — custom node: 5 shapes via CSS (Ellipse, RoundedRect, Diamond, Capsule, Underline)
- `src/renderer/components/nodes/node-styles.ts` — style → CSS mapping with selection highlight
- `src/renderer/components/edges/BezierEdge.tsx` — SVG cubic bezier path
- `src/renderer/components/overlays/BoundaryOverlay.tsx` — dashed rect with label
- `src/renderer/hooks/useLayout.ts` — runs layout on document change (memoized)
- `src/renderer/utils/to-react-flow.ts` — LayoutResult → React Flow nodes/edges

**Note**: Switched from `@shared/` aliases to relative imports — electron-vite v5 renderer root breaks alias resolution. Also installed `@xyflow/react` (React Flow v12).

**Tests** (5 tests, all passing):
- [x] `toReactFlowNodes` produces correct array (10 nodes)
- [x] Root node has correct data (Ellipse, fontSize 18)
- [x] Branch nodes have correct depth
- [x] Selected nodes marked correctly
- [x] `toReactFlowEdges` produces 9 edges
- [x] agent-browser: blue root ellipse visible, branches positioned left/right, depth-based colors correct

---

## Chunk 7: Zustand Store + Selection

**Goal**: Store with slices, click-to-select, shift-click multi-select, pan/zoom (React Flow native).

**Status**: [x] COMPLETE — **FIRST INTERACTIVE MILESTONE**

**Files created**:
- `src/renderer/store/index.ts` — combined Zustand store with 4 slices
- `src/renderer/store/document-slice.ts` — document state with demo doc, updateDocument with shallow clone
- `src/renderer/store/selection-slice.ts` — selectedNodeIds Set, select/toggle/clear/selectBoundary
- `src/renderer/store/history-slice.ts` — CommandHistory integration, executeCommand/undo/redo
- `src/renderer/store/ui-slice.ts` — editingNodeId, contextMenu, stylePanelOpen
- `src/renderer/hooks/useNodeInteraction.ts` — onNodeClick (select/shift-toggle), onPaneClick (clear)
- `src/renderer/store/store.test.ts` — 20 tests for all slices
- Updated `App.tsx` to use useStore instead of local useMemo
- Updated `MindMapCanvas.tsx` to pass selection state + click handlers to ReactFlow

**Tests**:
- [x] select/toggle/clear on store (9 tests)
- [x] undo/redo dispatches correctly (5 tests)
- [x] UI slice state management (3 tests)
- [x] Document slice mutations (3 tests)
- [x] agent-browser: click node → orange highlight; click empty → clears; shift-click two → both highlighted

---

## Chunk 8: Keyboard Shortcuts + Node CRUD

**Goal**: Tab (add child), Enter (add sibling), Delete (with confirmation dialog), Cmd+/ (fold), Cmd+Z/Shift+Z (undo/redo), Cmd+=/-/0 (zoom).

**Status**: [x] COMPLETE

**Files created**:
- `src/renderer/hooks/useKeyboardShortcuts.ts` — Tab/Enter/Delete/Cmd+Z/Cmd+Shift+Z/Cmd+//Cmd+=/-/0
- `src/renderer/components/dialogs/DeleteConfirmDialog.tsx` — dark dialog with Cancel/Keep Children/Delete All
- `src/renderer/components/nodes/FoldBadge.tsx` — collapsed count badge, hover-to-show expand button
- Updated `App.tsx` — wired keyboard shortcuts + delete dialog state
- Updated `MindMapNode.tsx` — added FoldBadge + hidden Handle components (required for edge rendering)
- Updated `to-react-flow.ts` — added nodeId, isLeftOfRoot to MindMapNodeData
- `src/renderer/hooks/useKeyboardShortcuts.test.ts` — 10 tests

**Tests**:
- [x] Shortcut dispatch logic per key combo (10 tests)
- [x] Delete leaf vs delete-with-children triggers dialog
- [x] agent-browser: Tab adds child; Delete shows dialog; Cmd+Z undoes

---

## Chunk 9: Text Editing + Context Menu

**Goal**: Double-click edit, Enter commit, Escape cancel, auto-edit on new node. Right-click context menu.

**Status**: [x] COMPLETE

**Files created**:
- `src/renderer/components/nodes/TextEditor.tsx` — dark bg, gold border textarea overlay with Enter/Escape/blur handling
- `src/renderer/components/overlays/ContextMenu.tsx` — positioned dark menu with Add Child/Sibling, Edit, Collapse, Delete
- Updated `src/renderer/store/ui-slice.ts` — added isNewNode, setIsNewNode, startEditing
- Updated `src/renderer/hooks/useNodeInteraction.ts` — added onNodeDoubleClick, onNodeContextMenu
- Updated `src/renderer/hooks/useKeyboardShortcuts.ts` — auto-enter edit mode on Tab/Enter
- Updated `src/renderer/components/nodes/MindMapNode.tsx` — renders TextEditor when editing
- Updated `src/renderer/components/MindMapCanvas.tsx` — wired double-click/context-menu handlers, disabled zoomOnDoubleClick
- Updated `src/renderer/App.tsx` — renders ContextMenu overlay
- `src/renderer/components/text-editing.test.ts` — 7 tests

**Tests**:
- [x] Edit mode lifecycle (enter/commit/cancel) — 5 tests
- [x] New node cancel undoes the add
- [x] Context menu state management — 2 tests
- [x] agent-browser: double-click → editor appears; type + Enter → committed; right-click → menu

---

## Chunk 10: Attachments + URL Dialog

**Goal**: Attachment icons (URL/Doc/Photo), click to open, Alt+click to remove, Cmd+K URL dialog with title fetch, file pickers.

**Status**: [ ] Not started

**Files to create**:
- `src/renderer/components/nodes/AttachmentIcons.tsx`
- `src/renderer/components/dialogs/UrlInputDialog.tsx`
- `src/main/ipc-handlers.ts` — file dialogs, fetch title, shell.openPath
- `src/preload/index.ts` — updated IPC API

**Tests**:
- [ ] Attachment command round-trips
- [ ] Icon component renders correct type/color
- [ ] agent-browser: demo Branch 1 green icon; Cmd+K → URL dialog

---

## Chunk 11: Node Resize + Drag-to-Reparent

**Goal**: Edge drag to resize (6px handle, multi-resize), drag past 5px threshold to reparent.

**Status**: [ ] Not started

**Files to create**:
- `src/renderer/hooks/useNodeResize.ts`
- `src/renderer/hooks/useNodeDrag.ts`
- `src/renderer/components/overlays/DropTargetIndicator.tsx`

**Tests**:
- [ ] Resize updates manual_width, min 40px
- [ ] Multi-resize applies same delta
- [ ] Drag-to-reparent fires MoveNodeCommand
- [ ] agent-browser: hover edge → resize cursor; drag node → reparent

---

## Chunk 12: File Operations + Multi-Window + Packaging

**Goal**: New/Open/Save/SaveAs/Close, multi-window, dirty indicator, Finder open handler, ViewState persistence. App icon, About dialog, electron-builder, DMG packaging, `.yamind` file association.

**Status**: [ ] Not started

**Files to create**:
- `src/main/window-manager.ts` — create/track windows
- `src/main/file-operations.ts` — IPC handlers
- `src/main/menu.ts` — native macOS menu bar (including About YaMindMap)
- `src/renderer/components/dialogs/AboutDialog.tsx` — icon, version, description
- `electron-builder.yml` — macOS DMG config, `.yamind` file association (UTI), app icon, app ID
- `resources/icon.icns` — copied from `assets/icons/yamindmap.icns`
- `resources/icon.ico` — copied from `assets/icons/yamindmap.ico`
- `resources/icon.png` — 256px PNG for Linux + About dialog
- Updated `src/main/index.ts` — `app.on('open-file')`, argv handling, menu setup, icon
- Updated `package.json` — `build` config pointing to electron-builder.yml

**Packaging**: electron-builder for DMG (macOS), NSIS (Windows), AppImage (Linux).

**Tests**:
- [ ] Dirty flag set/cleared correctly
- [ ] Window title format
- [ ] `npm run build` produces working `.app` bundle
- [ ] agent-browser: Cmd+N → second window; Cmd+S → save dialog; dirty dot on modify; About dialog shows icon

---

## Chunk 13: Boundaries + Rubber-Band Selection

**Goal**: Boundary CRUD (Cmd+B, Delete, double-click label edit), rubber-band multi-select.

**Status**: [ ] Not started

**Files to create**:
- `src/renderer/components/dialogs/BoundaryLabelDialog.tsx`
- `src/renderer/hooks/useRubberBand.ts`
- `src/renderer/components/overlays/RubberBandRect.tsx`

**Tests**:
- [ ] Boundary command round-trips
- [ ] Rubber-band intersection logic
- [ ] agent-browser: Cmd+B → boundary appears; drag empty → selection rect

---

## Chunk 14: Theme System + Style Panel

**Goal**: Right sidebar panel for document-level theming. Named presets, per-property customization, per-node overrides.

**Status**: [ ] Not started

**Panel sections** (no node selected — document defaults):
- **Theme Presets** — dropdown: "Default Blue", "Dark", "Minimal", "Colorful", "Custom"
- **Node Styles by Depth** — Root / Branch / Topic tabs with shape, colors, font, padding, width, radius
- **Edge Style** — line style, color, width
- **Layout** — h_gap, v_gap, direction
- **Boundary Defaults** — fill, stroke, padding

**Panel sections** (node selected — per-node overrides):
- Same fields as toggleable overrides (checkbox + value)
- Multi-select: shared values shown, mixed state for differences

**Built-in themes**: Default Blue, Dark, Minimal, Colorful

**Files to create**:
- `src/renderer/components/panels/StylePanel.tsx`
- `src/renderer/components/panels/ThemePresetPicker.tsx`
- `src/renderer/components/panels/NodeStyleEditor.tsx`
- `src/renderer/components/panels/EdgeStyleEditor.tsx`
- `src/renderer/components/panels/LayoutConfigEditor.tsx`
- `src/renderer/components/panels/BoundaryStyleEditor.tsx`
- `src/renderer/components/panels/ColorPicker.tsx`
- `src/shared/themes.ts` — built-in theme definitions
- `src/main/theme-manager.ts` — read/write custom themes to userData
- Updated `App.tsx` — conditional right panel
- Updated `src/renderer/store/ui-slice.ts` — `stylePanelOpen: boolean`

**Tests**:
- [ ] Applying "Dark" preset sets correct DefaultStyles
- [ ] Per-node override toggle on/off merges with defaults
- [ ] Theme serialization round-trip
- [ ] Multi-select mixed state
- [ ] agent-browser: toggle panel; select "Dark" → colors change; select node → overrides appear

---

## Chunk 15: Settings Window + Customizable Shortcuts

**Goal**: Cmd+, opens singleton settings window. Shortcuts tab with click-to-record, conflict detection, reset-to-defaults.

**Status**: [ ] Not started

**Files to create**:
- `src/main/settings-manager.ts` — reads/writes `userData/settings.json`, broadcasts to windows
- `src/renderer/settings/SettingsApp.tsx`
- `src/renderer/settings/ShortcutsTab.tsx`
- `src/renderer/settings/index.html`, `main.tsx`
- `src/shared/shortcuts.ts` — default map, action enum
- Updated `useKeyboardShortcuts.ts`

**Tests**:
- [ ] Shortcut serialization round-trip
- [ ] Conflict detection
- [ ] Reset restores defaults
- [ ] agent-browser: Cmd+, → settings; rebind Tab → works; Reset → restored

---

## Chunk 16: Polish + Integration Testing

**Goal**: All edge cases, final refinements, comprehensive integration tests.

**Status**: [ ] Not started

**Addresses**:
- Root node undeletable
- Zoom-to-fit with 80px padding
- Context menu clamping to viewport
- Relative attachment paths
- Photo file filter in picker
- Scroll normalization
- Trackpad pinch zoom
- Select-all on edit enter
- Shift+Enter for newline in editor
- Text alignment (left-of-root right-aligned, ellipse/diamond centered)
- Side column reserved only when attachments present
- Fold badge left/right positioning

**Tests**:
- [ ] Relative path resolution, clamp logic, zoom-to-fit math, text alignment rules
- [ ] agent-browser: full end-to-end walkthrough — create doc, add nodes, edit, boundary, attachment, undo chain, save, close, reopen, verify state

---

## Dependency Chain

```
1  Scaffold
└─ 2  Data Model
   └─ 3  Tree Ops
      └─ 4  Commands
         └─ 5  Layout
            └─ 6  Rendering         ← first visual
               └─ 7  Store + Selection  ← first interactive
                  └─ 8  Shortcuts + CRUD
                     └─ 9  Text Edit + Context Menu
                        └─ 10 Attachments
                           └─ 11 Resize + Drag
                              └─ 12 File I/O + Multi-Window + Packaging
                                 └─ 13 Boundaries + Rubber Band
                                    └─ 14 Theme System + Style Panel
                                       └─ 15 Settings Window
                                          └─ 16 Polish
```

## Verification Strategy

- **Every chunk**: `npm test` passes, app launches without errors
- **From chunk 6+**: agent-browser screenshots after each chunk for visual verification
- **Chunk 12+**: open existing `.yamind` files from the Rust app, verify visual parity
- **Chunk 16**: full regression walkthrough via agent-browser
