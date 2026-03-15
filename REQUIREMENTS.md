# YaMindMap — Feature & Behavior Specification

This document captures every feature, interaction, measurement, color, constant, and behavior of the current Rust/iced implementation. It serves as the specification for the Electron rewrite.

---

## 1. Data Model

### 1.1 Node (`MindMapNode`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | `NodeId` (u64) | Auto-incrementing unique ID |
| `parent` | `Option<NodeId>` | `None` for root |
| `children` | `Vec<NodeId>` | Ordered list |
| `content` | `NodeContent` | Text, rich spans, notes, attachments |
| `style` | `NodeStyle` | Per-node overrides (all fields optional) |
| `collapsed` | `bool` | Fold/unfold state |
| `manual_position` | `Option<(f32, f32)>` | User-dragged override |
| `manual_width` | `Option<f32>` | User-resized override |
| `computed_bounds` | `Option<Rect>` | Layout result (not serialized) |

### 1.2 NodeContent

| Field | Type | Notes |
|-------|------|-------|
| `text` | `String` | Plain text content |
| `rich_spans` | `Vec<RichSpan>` | Rich text formatting (not yet used in rendering) |
| `notes` | `String` | Attached notes (not yet used in UI) |
| `attachments` | `Vec<Attachment>` | `#[serde(default)]` for backward compat |

### 1.3 Attachment

```
Attachment {
    kind: AttachmentKind,
    label: Option<String>,
}

AttachmentKind:
    Url(String)       // Web URL
    Document(String)  // File path (may be relative)
    Photo(String)     // Image file path (may be relative)
```

### 1.4 RichSpan (defined but not yet rendered)

```
RichSpan { start: usize, end: usize, style: RichStyle }
RichStyle: Bold | Italic | Underline | Color(u8, u8, u8) | FontSize(u16)
```

### 1.5 Document

| Field | Type | Default |
|-------|------|---------|
| `nodes` | `IndexMap<NodeId, MindMapNode>` | Preserves insertion order |
| `root_id` | `Option<NodeId>` | |
| `relationships` | `IndexMap<RelationshipId, Relationship>` | Future use |
| `boundaries` | `IndexMap<BoundaryId, Boundary>` | Visual groupings |
| `default_styles` | `DefaultStyles` | Styles by depth level |
| `default_edge_style` | `EdgeStyle` | Global edge appearance |
| `layout_config` | `LayoutConfig` | Layout algorithm params |

### 1.6 Boundary

| Field | Type | Default |
|-------|------|---------|
| `id` | `BoundaryId` (u64) | Auto-incrementing |
| `label` | `String` | Empty string |
| `node_ids` | `Vec<NodeId>` | Member nodes |
| `fill_color` | `Color` | `rgba(0.3, 0.5, 0.8, 0.1)` — light blue transparent |
| `stroke_color` | `Color` | `rgba(0.45, 0.65, 0.95, 0.7)` — bright blue |
| `stroke_width` | `f32` | `1.5` |
| `padding` | `f32` | `10.0` px |

### 1.7 LayoutConfig

| Field | Type | Default |
|-------|------|---------|
| `layout_type` | `LayoutType` | `Map` |
| `direction` | `LayoutDirection` | `Balanced` |
| `h_gap` | `f32` | `60.0` px |
| `v_gap` | `f32` | `20.0` px |

**LayoutType**: `Map`, `TreeRight`, `TreeDown`
**LayoutDirection**: `Balanced`, `LeftOnly`, `RightOnly`

### 1.8 Selection

- `nodes: Vec<NodeId>` — ordered set of selected node IDs
- Methods: `select(id)` replaces selection, `toggle(id)` adds/removes, `clear()`, `single()` returns `Some(id)` if exactly one selected, `is_selected(&id)`, `is_empty()`

---

## 2. Visual Styling

### 2.1 Default Styles by Depth

| Property | Root (depth 0) | Branch (depth 1) | Topic (depth 2+) |
|----------|----------------|-------------------|-------------------|
| Shape | Ellipse | RoundedRect | RoundedRect |
| Fill | `#4A90D9` | `#5BA5E6` | `#E8F0FE` |
| Stroke | `#2C5F8A` | `#3D7AB8` | `#A4C2E8` |
| Stroke width | 2.0 | 1.5 | 1.0 |
| Font size | 18.0 | 14.0 | 12.0 |
| Font color | WHITE | WHITE | `#333333` |
| Padding H | 24.0 | 16.0 | 12.0 |
| Padding V | 16.0 | 10.0 | 8.0 |
| Min width | 120.0 | 80.0 | 60.0 |
| Max width | 300.0 | 250.0 | 200.0 |
| Corner radius | 8.0 | 6.0 | 4.0 |

### 2.2 NodeStyle (Per-Node Overrides)

All fields are `Option<T>`. Resolved by merging node style with depth default: `node.style.merged_with(default_for_depth)` — node values take priority, gaps filled from default.

### 2.3 Node Shapes

| Shape | Rendering |
|-------|-----------|
| **RoundedRect** | Rectangle (corner_radius via CSS, currently drawn as plain rect in iced) |
| **Ellipse** | 4 bezier curves (kappa = 0.5522848), node bounds multiplied by 1.42 (√2) |
| **Diamond** | Polygon: top-center → right-center → bottom-center → left-center, bounds × 1.42 |
| **Capsule** | Currently renders as rectangle (same as RoundedRect) |
| **Underline** | Currently renders as rectangle (same as RoundedRect) |

### 2.4 Edge Style

| Property | Default |
|----------|---------|
| Line style | Bezier |
| Color | `#888888` |
| Width | 2.0 px |

**LineStyle** enum: `Bezier`, `Straight`, `Elbow`, `Rounded` (only Bezier is rendered currently)

### 2.5 Selection Highlight

- Stroke color: `rgb(1.0, 0.6, 0.0)` — orange `#FF9900`
- Stroke width: `normal_stroke_width + 1.5`

### 2.6 Color Type

Custom `Color { r, g, b, a }` with float values 0.0–1.0. Supports `from_hex()`, `rgb()`, `rgba()` constructors. Constants: `WHITE`, `BLACK`, `TRANSPARENT`.

---

## 3. Node Rendering

### 3.1 Text Layout

- **Font**: System default (iced `Font::DEFAULT`)
- **Line height**: `1.3 × font_size`
- **Text shaping**: Advanced (iced's cosmic-text)
- **Word wrapping**: Word-boundary wrapping
- **Usable text width**: `node_width - 2 × padding_h - side_column_width`

### 3.2 Text Alignment

| Context | Horizontal alignment |
|---------|---------------------|
| Nodes left of root | Right-aligned |
| Nodes right of root (and root) | Left-aligned |
| Ellipse / Diamond shapes | Center-aligned |
| All nodes | Vertically centered in node bounds |

### 3.3 Node Sizing

```
width = clamp(measured_unwrapped_text_width + 2 * padding_h + side_column, min_width, max_width)
height = measured_wrapped_text_height + 2 * padding_v

If shape is Ellipse or Diamond:
    width *= 1.42
    height *= 1.42
    width = max(width, min_width)

If manual_width is set:
    width = max(manual_width, min_width)
```

### 3.4 Side Column (Attachment Icons)

- **SIDE_COLUMN_WIDTH**: `22.0` px — reserved inside node for attachment icons
- Only reserved when node has ≥1 attachment
- Left-of-root nodes: column on left edge, text shifts right
- Right-of-root nodes: column on right edge, text width shrinks

### 3.5 Attachment Icons

| Property | Value |
|----------|-------|
| Icon size | 14.0 px |
| Icon spacing | 4.0 px between icons |
| Positioning | Vertically centered in node, inset by `padding_h` from node edge |

**Badge colors by type**:
| Type | Badge color | Icon |
|------|-------------|------|
| URL | `rgb(0.25, 0.65, 0.35)` — green | External link (open box + arrow) |
| Document | `rgb(0.35, 0.45, 0.65)` — blue-gray | Page with folded corner |
| Photo | `rgb(0.55, 0.40, 0.70)` — purple | Mountain/landscape silhouette |

All icons drawn as white shapes on colored circle badge.

### 3.6 Fold/Unfold Badge

| Property | Value |
|----------|-------|
| Radius | 8.0 px |
| Position | `2px` outside node edge (horizontally), vertically centered |
| Left-of-root | Badge on left side: `node.x - badge_r - 2` |
| Right-of-root | Badge on right side: `node.x + node.width + badge_r + 2` |

**Badge states**:
| State | Color | Content | Font size |
|-------|-------|---------|-----------|
| Collapsed | `rgb(0.9, 0.6, 0.1)` — orange | Child count (e.g., "3") | 11.0 |
| Expanded (hover) | `rgb(0.4, 0.4, 0.45)` — gray | Minus sign "−" | 13.0 |

- Only shown for non-root nodes with children
- Expanded badge only visible on hover

### 3.7 Boundary Rendering

- **Draw order**: Behind edges and nodes
- **Bounding rect**: Union of all member node positions + `padding` on all sides
- **Corner radius**: `8.0` px
- **Fill**: Semi-transparent (per boundary's `fill_color`)
- **Stroke**: Dashed border — `8px` dash, `8px` gap
- **Corners**: Drawn as solid bezier arcs (kappa approximation), straight edges dashed
- **Selected/hovered**: Stroke color changes to orange `rgb(1.0, 0.6, 0.0)`, width += 1.0

**Label rendering**:
- Font size: 12.0
- Position: `(bounds.x + 12, bounds.y - text_height/2)` — top-left of boundary, vertically straddling the border
- Background: Dark semi-transparent `rgba(0.15, 0.15, 0.2, 0.9)` with 4px padding
- Text color: Same as boundary stroke color

---

## 4. Edge Rendering

### 4.1 Bezier Routing

**Connection points**:
- If child is right of parent: `from = parent.right_center`, `to = child.left_center`
- If child is left of parent: `from = parent.left_center`, `to = child.right_center`

**Control points** (S-curve):
```
dx = (to.x - from.x) * 0.5
ctrl1 = (from.x + dx, from.y)
ctrl2 = (to.x - dx, to.y)
```

### 4.2 Edge Drawing

- Cubic bezier curve from `from` through `ctrl1`, `ctrl2` to `to`
- Color and width from `document.default_edge_style`

---

## 5. Layout Engine

### 5.1 Balanced Layout Algorithm

1. Place root node centered at origin `(0, 0)`
2. Partition root's children into left and right groups:
   - **Balanced**: Greedy — assign each child to the side with less total height
   - **LeftOnly**: All children go left
   - **RightOnly**: All children go right
3. Right children: `anchor_x = root.x + root.width + h_gap`, left-aligned
4. Left children: `anchor_x = root.x - h_gap`, right-aligned (child positioned at `anchor_x - child.width`)
5. Vertical centering: Each column of children is centered on parent's vertical center
6. Recursive: Each child's children are laid out the same way, continuing in the same direction (left stays left, right stays right)

### 5.2 Subtree Height Estimation

```
estimate_subtree_height(node):
    if no children or collapsed: return node_height
    children_total = sum(estimate_subtree_height(child)) + (num_children - 1) * v_gap
    return max(children_total, node_height)
```

### 5.3 Boundary-Aware Spacing

Extra gap inserted between adjacent siblings that belong to different boundaries:
```
boundary_gap_between(children, i):
    cur = boundary_of(children[i])
    next = boundary_of(children[i+1])

    Same boundary → 0
    Different boundaries → pad_a + pad_b
    One in boundary, one not → pad
    Neither in boundary → 0
```

### 5.4 Child Column Layout

```
layout_children_column(children, anchor_x, center_y, h_gap, v_gap, is_left):
    subtree_heights = [estimate_subtree_height(child) for child in children]
    boundary_gaps = [boundary_gap_between(children, i) for i in 0..len]
    total_height = sum(subtree_heights) + (n-1) * v_gap + sum(boundary_gaps)

    current_y = center_y - total_height / 2
    for each child:
        child_center_y = current_y + subtree_h / 2
        child_x = anchor_x - child_width (if left) or anchor_x (if right)
        place child at (child_x, child_center_y - child_height/2)
        recursively layout grandchildren
        current_y += subtree_h + v_gap + boundary_gap[i]
```

---

## 6. Viewport & Transform

### 6.1 Transform

- `Transform2D { translation: Vector, scale: f32 }`
- Identity: translation = (0, 0), scale = 1.0

### 6.2 Coordinate Conversion

- **World → Screen**: `screen = (world + translation) * scale`
- **Screen → World**: `world = screen / scale - translation`

### 6.3 Pan

- `translation += delta / scale` (delta is screen-space pixels)

### 6.4 Zoom

- Zoom toward a screen point (point stays fixed in world space)
- `scale = clamp(scale * factor, 0.1, 5.0)`
- After scale change, adjust translation to keep the screen point at the same world position

### 6.5 Zoom to Fit

- Padding: `80.0` px on each side
- Scale: `min(available_w / bounds.width, available_h / bounds.height)`, clamped to [0.1, 5.0]
- Translation: Centers the bounding rect in the viewport

---

## 7. Interaction Model

### 7.1 Mouse — Left Click

| Target | Action |
|--------|--------|
| Node (not selected, no Shift) | Select node (replace selection) |
| Node (already selected, no Shift) | Keep current multi-selection (for drag/resize) |
| Node + Shift | Toggle node in/out of selection |
| Attachment icon | Open attachment in system app |
| Attachment icon + Alt | Remove attachment (with undo) |
| Fold badge | Toggle collapsed state |
| Boundary border | Select boundary (deselect nodes) |
| Empty space | Clear selection; begin rubber-band selection |
| While editing text | Commit edit if clicking outside edited node |

### 7.2 Mouse — Left Drag

| Origin | Action |
|--------|--------|
| Node (past 5px threshold) | Drag to reparent or reorder |
| Node edge (within 6px of edge) | Resize node width |
| Empty space | Rubber-band multi-select |

**Drag threshold**: `DRAG_THRESHOLD = 5.0` px (screen space) before drag begins.

**Resize**:
- Left-side nodes: Drag from left edge
- Right-side nodes: Drag from right edge
- Minimum width: `40.0` px (hard floor, separate from style min_width)
- Multi-resize: All selected nodes change by the same width delta
- Resize handle width: `6.0` px (world space)

### 7.3 Mouse — Right Click

- Right-press + right-release shows context menu at click position
- Context menu is clamped to stay on screen
- Menu depends on what was clicked:

**Node context menu items**:
1. Add Child
2. Add Sibling
3. ─── (separator)
4. Insert Web Link
5. Attach Document
6. Attach Photo
7. ─── (separator)
8. Edit
9. Add Boundary
10. Collapse / Expand (depending on state)
11. ─── (separator)
12. Delete (highlighted in red)

**Boundary context menu items**:
1. Edit Label
2. Delete

### 7.4 Mouse — Middle Click

- Middle-press: Begin pan
- Middle-release: End pan
- Cursor movement while panning: Pan viewport by cursor delta

### 7.5 Mouse — Double Click

- On node: Enter text edit mode (start editing)
- On boundary: Enter boundary label edit mode

### 7.6 Scroll (Two-Finger Trackpad)

- **Normal scroll**: Pan canvas by `(dx, dy)` in screen pixels
- **Cmd + scroll**: Zoom by `delta_y` at cursor position
  - Scroll delta lines: `y` value directly
  - Scroll delta pixels: `y / 50.0` for normalization

### 7.7 Trackpad Pinch

- macOS magnification gesture: `factor = 1.0 + delta`
- Polled every 50ms via native Obj-C handler
- Zoom applied at cursor position

---

## 8. Keyboard Shortcuts

| Shortcut | Action | Notes |
|----------|--------|-------|
| **Tab** | Add child to selected node | Auto-enters edit mode on new node |
| **Enter** | Add sibling after selected node | Auto-enters edit mode; disabled for root |
| **Shift+Enter** | (Reserved for newline in editor) | Returns `None` — no action |
| **Delete / Backspace** | Delete selected node or boundary | Shows confirmation if node has children |
| **Escape** | Cancel current dialog/operation | Cancels edit, delete dialog, URL input, context menu |
| **Cmd+Z** | Undo | |
| **Cmd+Shift+Z** | Redo | Also triggered by `Cmd+Z` with shift |
| **Cmd+= / Cmd++** | Zoom in | Factor: `1.2`, from screen center |
| **Cmd+-** | Zoom out | Factor: `1/1.2`, from screen center |
| **Cmd+0** | Zoom to fit | |
| **Cmd+/** | Toggle fold/unfold | On all selected nodes that have children |
| **Cmd+Shift+B** or **Cmd+B** | Add boundary | Around selected node + its children |
| **Cmd+K** | Add URL attachment | Opens URL input dialog |
| **Cmd+Shift+K** | Add document attachment | Opens file picker |
| **Cmd+Shift+P** or **Cmd+P** | Add photo attachment | Opens image file picker |
| **Cmd+N** | New window | (NEW) Multi-document support |
| **Cmd+W** | Close window | (NEW) With save confirmation if dirty |
| **Cmd+,** | Open Settings | (NEW) Standard macOS preferences |

### 8.1 Customizable Shortcuts (NEW)

All application-specific shortcuts (i.e. not standard macOS shortcuts like Cmd+Q, Cmd+H, Cmd+M) are user-customizable via the Settings window (see §12.5). The table above shows the **defaults**.

**Customizable shortcuts** (can be rebound by user):
- Tab, Enter, Delete/Backspace, Escape
- Cmd+/, Cmd+B/Cmd+Shift+B, Cmd+K, Cmd+Shift+K, Cmd+Shift+P
- Cmd+=, Cmd+-, Cmd+0

**Non-customizable shortcuts** (standard macOS, always active):
- Cmd+Z, Cmd+Shift+Z (Undo/Redo)
- Cmd+N, Cmd+O, Cmd+S, Cmd+W, Cmd+Q
- Cmd+, (Settings)
- Cmd+H, Cmd+M (Hide, Minimize)

Customized shortcuts are persisted in a user settings file (e.g. `~/.config/yamindmap/settings.json` or Electron's `userData` directory) and apply across all windows.

### 8.2 Text Editor Shortcuts

| Shortcut | Action |
|----------|--------|
| Enter | Commit edit (not newline) |
| Shift+Enter | Insert newline |
| Escape | Cancel edit (restores original text, or undoes new node) |
| Tab | Commits edit + adds child (handled by global shortcut) |

---

## 9. Text Editing

### 9.1 Edit Mode Behavior

- Triggered by: double-click on node, or auto-focus on new node (Tab/Enter)
- All text is selected on entering edit mode (`SelectAll`)
- Text synced back to document on every keystroke
- Layout recomputed on every keystroke (for dynamic sizing)
- `text_editor::Content` appends trailing `\n` — stripped before saving

### 9.2 Commit vs Cancel

**Commit**:
- Clicking outside the edited node
- Pressing Enter
- If text changed from original: `EditTextCommand` pushed to history for undo
- If new node with non-empty text: command text updated via `update_last_text()`

**Cancel** (Escape):
- New node: Undo the add command entirely (removes node)
- Existing node: Restore original text

### 9.3 Text Editor Styling

| Property | Value |
|----------|-------|
| Background | `rgba(0.15, 0.15, 0.2, 0.95)` |
| Border | `2px` gold `rgb(1.0, 0.8, 0.0)` |
| Text color | WHITE |
| Selection highlight | `rgba(0.3, 0.5, 0.9, 0.5)` |

---

## 10. Command System (Undo/Redo)

### 10.1 Architecture

- `Command` trait: `execute(&mut Document)` + `undo(&mut Document)`
- `CommandHistory`: separate `undo_stack` and `redo_stack`
- Executing a new command clears the redo stack

### 10.2 Commands

| Command | Execute | Undo |
|---------|---------|------|
| **AddChildCommand** | Creates child with ID (reused on redo) | Removes child |
| **AddSiblingCommand** | Creates sibling after given node | Removes sibling |
| **DeleteNodeCommand** | Removes subtree, stores all removed nodes | Re-inserts subtree |
| **DeleteAndReparentCommand** | Removes node, promotes children to grandparent | Reverses reparenting |
| **EditTextCommand** | Sets node text, stores old text | Restores old text |
| **MoveNodeCommand** | Reparents/reorders node, stores old parent/index | Moves back |
| **AddAttachmentCommand** | Appends attachment to node | Removes last attachment |
| **RemoveAttachmentCommand** | Removes attachment at index, stores it | Re-inserts at index |
| **AddBoundaryCommand** | Creates boundary with auto-ID | Removes boundary |
| **DeleteBoundaryCommand** | Removes boundary, stores it | Re-inserts boundary |
| **EditBoundaryLabelCommand** | Sets label, stores old | Restores old label |

### 10.3 New Node Workflow

1. `AddChildCommand`/`AddSiblingCommand` executed with empty text `""`
2. Node ID stored for redo stability (reused on redo)
3. Auto-enter edit mode on new node
4. On commit: `update_last_text()` on history — updates the command's stored text
5. Single undo step removes the node (text edit is baked into the add command)

---

## 11. File Format

### 11.1 YaMindFile

```json
{
    "version": 1,
    "document": { ... },
    "view_state": {
        "translation": [tx, ty],
        "scale": 1.0,
        "window_size": [1200.0, 800.0],
        "window_position": [100.0, 100.0]   // optional
    }
}
```

- Format: Pretty-printed JSON (`.yamind` extension)
- `FORMAT_VERSION = 1`
- `view_state` is optional (`#[serde(default, skip_serializing_if = "Option::is_none")]`)
- Default window size: `1200 × 800`

### 11.2 Multi-Document Support (NEW — not in Rust app)

The Electron rewrite must support multiple documents open simultaneously, each in its own window within one application process:

- **Cmd+N**: Creates a new window with an untitled document (not a new process)
- **Cmd+O**: Opens file in a new window (or focuses existing window if already open)
- **Cmd+W**: Closes the current window (with save confirmation if dirty)
- **Independent state per window**: Each document has its own undo/redo history, selection, viewport (pan/zoom), editing state, and window size/position
- **Window title**: `{filename} — YaMindMap` or `Untitled — YaMindMap`
- **Finder double-click / drag-to-dock**: Opens file in a new window within the running app
- **Multiple files from argv**: Each opens as a separate window
- **Dirty indicator**: macOS window close button (red dot) shows unsaved indicator, or title shows edited marker

### 11.3 File Operations

| Operation | Trigger |
|-----------|---------|
| New | File → New / Cmd+N (new window in same app process) |
| Open | File → Open / Cmd+O (new window, or focus if already open) |
| Save | File → Save / Cmd+S (to current path, or Save As if untitled) |
| Save As | File → Save As (native save dialog) |
| Close | File → Close / Cmd+W (close window, with save confirmation if dirty) |
| Open from Finder | macOS Apple Event handler → new window in running app |
| Open from argv | Each file opens as a separate window |

### 11.4 Persistence

- Viewport state (translation, scale) saved per document in the `.yamind` file
- Window size and position saved per document in the `.yamind` file
- On load: viewport and window position/size restored from file
- If no view_state in file: zoom-to-fit, default window size `1200 × 800`
- Dirty state tracked per window — unsaved changes shown via macOS close-button indicator
- Save confirmation on close window / quit if any window has unsaved changes

### 11.5 Attachment Paths

- Document/Photo paths stored relative to document directory when possible
- Resolved to absolute path on open using document's directory as base

### 11.6 Photo File Filter

Supported extensions: `png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`

---

## 12. Dialogs & Overlays

### 12.1 Delete Confirmation Dialog

- Shown when deleting a node that has children
- Backdrop: semi-transparent `rgba(0, 0, 0, 0.5)`
- Shows: "Delete [node_name]? This node has [N] children."
- Buttons:
  - **Delete All** (red) — removes entire subtree
  - **Keep Children** (blue) — reparents children to grandparent
  - **Cancel** (gray)
- Root node cannot be deleted (action silently ignored)
- Nodes without children: deleted immediately, no dialog

### 12.2 URL Input Overlay

- Shown via Cmd+K or context menu "Insert Web Link"
- Fields:
  - URL text input
  - Auto-fill title checkbox (default: enabled)
  - "Fetch Title" button → HTTP GET, parse `<title>` tag
  - Preview area showing fetched title or "Loading..."
- Buttons: Insert, Remove (removes existing URL), Cancel
- On submit with auto-fill + fetched title: `EditTextCommand` to rename node, then `AddAttachmentCommand`

### 12.3 Boundary Label Edit

- Shown on double-click boundary or context menu "Edit Label"
- Text input pre-filled with current label
- Buttons: OK, Cancel
- Dark background, centered

### 12.4 Context Menu

- Positioned at right-click screen location
- Clamped to stay on screen (min 200px from edge)
- Dismissed by: clicking outside, Escape, or selecting an item
- While open: blocks all other interactions except scroll/cursor move

### 12.5 Settings Window (NEW)

Opened via **Cmd+,** (standard macOS preferences shortcut). This is a separate window, not a modal dialog — the user can keep it open while working.

**Tabs**:

1. **Shortcuts**
   - Lists all customizable application shortcuts (see §8.1)
   - Each row: action name, current key binding, click-to-record new binding
   - Conflict detection: warn if a binding is already used by another action
   - "Reset to Defaults" button to restore all default bindings
   - Changes take effect immediately (no "Apply" button needed)

2. *(Future tabs — placeholder for later settings like appearance, layout defaults, etc.)*

**Persistence**:
- Settings stored in Electron's `userData` directory (e.g. `~/Library/Application Support/YaMindMap/settings.json`)
- Loaded on app startup, applied to all windows
- Settings window is a singleton — Cmd+, focuses it if already open

---

## 13. Tree Operations

### 13.1 Document Methods

| Method | Behavior |
|--------|----------|
| `add_child(parent_id, text)` | Creates child, appends to parent's children list |
| `add_child_with_id(parent_id, child_id, text)` | Same but with specific ID (for redo) |
| `add_sibling(sibling_of, text)` | Creates node after given sibling in parent's children |
| `add_sibling_with_id(sibling_of, new_id, text)` | Same but with specific ID |
| `remove_subtree(id)` | Removes node + all descendants, removes from parent's children |
| `move_node(node_id, new_parent_id, insert_index)` | Reparents or reorders; returns old (parent, index) for undo |
| `depth_of(id)` | Walk parent chain, count steps |
| `is_ancestor_of(ancestor, descendant)` | Walk descendant's parent chain |
| `visible_node_ids()` | BFS from root, skip children of collapsed nodes |

### 13.2 Move Node Rules

- Cannot move root node
- Cannot move a node into its own subtree
- Adjust insert_index when moving within same parent (if removal shifts indices)

---

## 14. Spatial Indexing

- R-tree (rstar crate) for fast point-in-rect queries
- Rebuilt after every layout computation
- Stores `NodeHitBox { id: NodeId, bounds: Rect }`
- Used for: click detection, hover detection, rubber-band intersection

---

## 15. Canvas & Rendering Pipeline

### 15.1 Draw Order

1. Boundaries (behind everything)
2. Edges (cubic bezier curves)
3. Nodes (shape + text + attachment icons + fold badges)
4. Overlays (text editor, dialogs, context menu)

### 15.2 GPU Cache Layers

- `edge_cache` — cleared when edges change
- `node_cache` — cleared when nodes change
- `selection_cache` — cleared when selection changes
- `canvas_cache` — general cache cleared on zoom/pan/layout

### 15.3 Viewport Transform Application

```
frame.scale(viewport.scale)
frame.translate(viewport.translation)
```

All drawing happens in world coordinates after the transform is applied.

---

## 16. Window & Platform

### 16.1 Window

- Default size: `1200 × 800` px
- Title format: `{filename} — YaMindMap` or `Untitled — YaMindMap`
- Window position and size tracked and persisted

### 16.2 Native Menu (macOS)

- **YaMindMap**: About, Settings (Cmd+,), Hide, Quit
- **File**: New, Open, Close, Save, Save As
- **Edit**: Undo, Redo

### 16.3 macOS Integration

- App icon: `assets/icons/yamindmap_256.png`
- Apple Event file open handler (Finder double-click, drag-to-dock)
- Magnification gesture handler (polled every 50ms)
- `.yamind` file association

### 16.4 Subscription Polling

- Keyboard events: High priority, global listener
- Menu tick: Every `50ms` — polls native menu events, file open events, magnify gestures

---

## 17. Demo Document

Default document created when no file is loaded:

```
Central Topic (root, Ellipse)
├── Branch 1
│   ├── Sub-topic 1.1
│   └── Sub-topic 1.2
│   [URL attachment: https://example.com, label: "Example"]
├── Branch 2
│   └── Sub-topic 2.1
│   [Document attachment: /tmp/test.pdf, label: "Test Doc"]
│   [Photo attachment: /tmp/photo.png, label: "Photo"]
└── Branch 3                    ┐
    ├── Sub-topic 3.1           │ Boundary "Group"
    ├── Sub-topic 3.2           │
    └── Sub-topic 3.3           ┘
```

---

## 18. Constants Summary

| Constant | Value | Location |
|----------|-------|----------|
| `SIDE_COLUMN_WIDTH` | `22.0` px | node_renderer.rs |
| `DRAG_THRESHOLD` | `5.0` px | app.rs |
| Resize handle width | `6.0` px (world) | app.rs |
| Icon size | `14.0` px | node_renderer.rs |
| Icon spacing | `4.0` px | node_renderer.rs |
| Fold badge radius | `8.0` px | program.rs |
| Fold badge offset | `2.0` px | program.rs |
| Boundary corner radius | `8.0` px | boundary_renderer.rs |
| Boundary dash/gap | `8.0` / `8.0` px | boundary_renderer.rs |
| Boundary label font | `12.0` px | boundary_renderer.rs |
| Boundary label padding | `4.0` px | boundary_renderer.rs |
| Label bg color | `rgba(0.15, 0.15, 0.2, 0.9)` | boundary_renderer.rs |
| Zoom range | `0.1` – `5.0` | viewport.rs |
| Zoom-to-fit padding | `80.0` px | app.rs |
| Zoom in/out factor | `1.2` / `1/1.2` | app.rs |
| Line height | `1.3 × font_size` | text_measure.rs, node_renderer.rs |
| Ellipse/Diamond scale | `1.42` (≈√2) | app.rs |
| `h_gap` (default) | `60.0` px | document.rs |
| `v_gap` (default) | `20.0` px | document.rs |
| `FORMAT_VERSION` | `1` | format.rs |
| Default window size | `1200 × 800` | app.rs |
| Menu tick interval | `50ms` | app.rs |
| Bezier control offset | `50%` of dx | routing.rs |
| Bezier kappa | `0.5522848` | node_renderer.rs |
| Min resize width | `40.0` px | app.rs |

---

## 19. Crate Structure (Current Rust App)

| Crate | Lines | Purpose |
|-------|-------|---------|
| `yamind-core` | ~600 | Data model: Node, Document, Boundary, Style, Color, Geometry |
| `yamind-layout` | ~330 | Balanced layout algorithm, edge routing |
| `yamind-commands` | ~660 | Command pattern for all document mutations |
| `yamind-file` | ~52 | JSON file format serialization |
| `yamind-canvas` | ~600 | Canvas rendering: nodes, edges, boundaries, text measurement |
| `src/` (binary) | ~1200 | App shell: update loop, view, subscriptions, shortcuts, menus |
| Obj-C bridge | ~478 | macOS native: menus, file open handler, magnify gesture |

---

## 20. New Requirements (Electron Rewrite Only)

- **Multi-window documents**: The Rust app spawns a new process per document. The Electron rewrite must support multiple windows within a single app process (see §11.2).
- **Dirty state indicator**: macOS close-button dot or title marker for unsaved changes.
- **Close window with save prompt**: Cmd+W closes window; prompt to save if dirty.
- **Quit with save prompt**: Cmd+Q checks all windows for unsaved changes.
- **Per-document window state**: Each document's window size and position is saved in the `.yamind` file and restored on open.
- **Settings window (Cmd+,)**: Singleton preferences window with tabs for Theme and Shortcuts. Cmd+, toggles the window (opens if closed, closes if open). Esc also closes. Apply button saves changes, Cancel discards. Settings persisted at `~/.config/yamindmap/settings.json` (macOS/Linux) or `%APPDATA%/yamindmap/settings.json` (Windows).
- **Default theme setting**: Settings window includes a Theme tab to pick the default theme for new documents (Default Blue, Dark, Minimal, Colorful).
- **Theme system**: Right sidebar style panel (280px, toggled with Cmd+.) with theme presets. Applying a preset sets document-level styles (node styles by depth, edge style, boundary style, background color). Further edits create a "Custom" state. Themes are "baked in" — values are copied to the document on apply.
- **Background color**: Each document has a `background_color` field, editable in the style panel and set by theme presets. Background dots are hidden.
- **Per-boundary styling**: Each boundary has its own `BoundaryStyle` (fill color, stroke color, stroke width, padding). When a boundary is selected, the style panel shows its individual style editor. New boundaries inherit from `doc.default_boundary_style`.
- **Boundary styles in themes**: Each theme preset includes boundary defaults (fill/stroke colors matching the theme palette). Applying a theme updates all existing boundaries to the new theme's boundary colors.
- **All 4 edge line styles**: Bezier, Straight, Elbow, and Rounded edge rendering fully implemented with correct left-side mirroring for Rounded edges.
- **Per-node style overrides**: When a node is selected, the style panel shows checkbox-based toggles for each property. Unchecked = inherit from depth default, checked = custom value for that node.

---

## 21. Known Limitations / Unimplemented Features (from Rust App)

- **RoundedRect**: Actually drawn as plain rectangle (no corner radius in iced canvas)
- **Capsule / Underline shapes**: Render identically to RoundedRect
- **Rich text spans**: Data model exists but rendering not implemented
- **Notes field**: Exists in data model, no UI
- **Relationships**: Data model exists (`IndexMap<RelationshipId, Relationship>`), unused
- **Rubber-band selection**: Interaction state exists, visual rubber-band rect not yet drawn
- **Drag reorder**: State machine exists, visual drop target feedback partial
- **Line styles** (Straight, Elbow, Rounded): ~~Enum defined, only Bezier rendered~~ All 4 styles now implemented in Electron rewrite
