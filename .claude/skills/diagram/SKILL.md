---
name: diagram
description: Create or update a draw.io architecture diagram from a description or source file
---

# /diagram — Create draw.io Diagrams

## Usage

`/diagram <description or file path>`

Examples:
- `/diagram auth login flow`
- `/diagram docs/ARCHITECTURE.md`
- `/diagram the indexing pipeline`
- `/diagram update docs/architecture.drawio with new billing routes`

## Instructions

You create interactive draw.io diagrams (`.drawio` files) that render in VS Code with the Draw.io Integration extension.

### Step 1: Determine scope

- If the user provides a **file path** (e.g., `docs/ARCHITECTURE.md`), read it and diagram the full system described.
- If the user provides a **description** (e.g., "auth login flow"), use LENS context (`mcp__lens__get_context`) to find relevant source files, then diagram that subsystem.
- If the user says **update**, read the existing `.drawio` file first, then modify it.

### Step 2: Design the diagram

Choose the right diagram type:

| Diagram Type | Purpose | Layout |
|---|---|---|
| Architecture overview | System boundaries, layers | Top-to-bottom, swimlanes |
| Flow/sequence | Numbered steps, interactions | Left-to-right or top-to-bottom |
| Data model/ERD | Tables, columns, relationships | Grid layout, edges |
| Pipeline | Sequential stages | Left-to-right |
| Component diagram | Technical details, integration | Grouped boxes |
| Deployment diagram | Infrastructure config | Layered |

### Step 3: Generate the `.drawio` XML

Write valid `mxfile` XML following all rules below.

#### ID Rules (critical)

- Cell IDs **MUST be numeric integers** (2, 3, 4...). String IDs like "agent" or "cloud_proxy" cause `d.setId is not a function` errors in the VS Code extension.
- IDs 0 and 1 are reserved for root cells.
- Start custom cells at ID 2.

#### Color Palette (consistent across diagrams)

| Layer | Fill | Stroke | Use for |
|-------|------|--------|---------|
| Blue | `#dae8fc` | `#6c8ebf` | External clients, agents |
| Purple | `#e1d5e7` | `#9673a6` | CLI, user-facing tools |
| Yellow | `#fff2cc` | `#d6b656` | Daemon, runtime services |
| Green | `#d5e8d4` | `#82b366` | Engine, core logic |
| Red/Pink | `#f8cecc` | `#b85450` | Cloud, API services |
| Gray | `#e6e6e6` | `#999999` | External services (dashed) |
| Dark Gray | `#f5f5f5` | `#666666` | Databases (cylinder shape) |

#### File Template

```xml
<mxfile host="app.diagrams.net" agent="Claude Code" version="26.0.0">
  <diagram name="Diagram Title" id="1">
    <mxGraphModel dx="1200" dy="900" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="0" pageScale="1" pageWidth="800" pageHeight="900" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

Key settings: `page="0"` (no background, transparent — adapts to light/dark themes).

#### Element Ordering (layer control)

Declare elements in this order — earlier = behind, later = in front:

1. Title/heading cells
2. **Edges (arrows)** — always at the back layer
3. Container swimlanes/frames
4. Content cells (boxes, icons, labels)

#### Edges and Arrows

- Use `edgeStyle=orthogonalEdgeStyle;rounded=1` for clean routing.
- Label edges with protocol/method where useful.
- Prefer **2 unidirectional arrows** over 1 bidirectional arrow for clarity.
- Arrow start/end must be **at least 20px** from any label's bottom edge.

**Edge label offset** — distance label from the arrow line:
```xml
<mxPoint x="0" y="-40" as="offset"/>  (above arrow)
<mxPoint x="0" y="40" as="offset"/>   (below arrow)
```

**Text-to-text arrows** — `exitX`/`exitY` don't work on text cells. Use explicit coordinates:
```xml
<mxCell id="10" style="edgeStyle=orthogonalEdgeStyle;rounded=1;" edge="1" parent="1">
  <mxGeometry relative="1" as="geometry">
    <mxPoint x="300" y="100" as="sourcePoint"/>
    <mxPoint x="500" y="100" as="targetPoint"/>
  </mxGeometry>
</mxCell>
```

#### Containers and Margins

When placing elements inside frames/swimlanes:

- **Internal elements MUST have 30px+ margin** from the container boundary on all sides.
- Account for `rounded=1` corners and stroke width eating into space.
- Coordinate math:
  ```
  Container: y=20, height=400 → usable range y=50 to y=390
  Top margin:    element.y >= container.y + 30
  Bottom margin: element.y + element.height <= container.y + container.height - 30
  Left margin:   element.x >= container.x + 30 (or 20 for swimlane startSize)
  ```

#### Shapes

- `swimlane` — grouping containers (layers, subsystems). Set `collapsible=0`.
- `shape=cylinder3` — databases.
- `dashed=1` — external/third-party services.
- `rounded=1` — standard component boxes.

#### Font Sizes

| Element | Size |
|---------|------|
| Diagram title / swimlane header | 12-13 |
| Component labels | 10-11 |
| Edge labels, small annotations | 9-10 |

Use `&#xa;` for line breaks in `value` attributes. Use `<br>` inside HTML-enabled labels.

#### Legend

Include a color legend when 3+ colors are used in the diagram.

### Step 4: Write the file

- Default output: `docs/<name>.drawio` (e.g., `docs/architecture.drawio`, `docs/auth-flow.drawio`)
- If updating an existing file, preserve user edits where possible — only modify/add cells as needed.
- Tell the user: "Open with the Draw.io VS Code extension (`hediet.vscode-drawio`)."

### Rules

- Keep diagrams readable — max ~20 nodes per diagram. Split into multiple if needed.
- Prefer top-to-bottom for architecture, left-to-right for pipelines/sequences.
- Always use the consistent color palette above for LENS components.
- No XML comments with double hyphens (`--`) — invalid XML, breaks the parser.
- All `source`/`target` on edges must reference valid numeric cell IDs.
- Nested cells: set `parent` to the container cell ID, not "1".
- Arrows must not penetrate boxes or overlap with labels — verify mentally.
- Remove decorative elements that don't add information.

### Checklist

Before writing the file, verify:

- [ ] No background color set (`page="0"`)
- [ ] All cell IDs are numeric integers
- [ ] Font sizes appropriate (titles 12-13, components 10-11, labels 9-10)
- [ ] Arrows declared early in XML (back layer)
- [ ] Arrows not overlapping labels (20px+ clearance)
- [ ] 30px+ margin between containers and internal elements
- [ ] All edge `source`/`target` reference valid cell IDs
- [ ] No double hyphens in XML comments
- [ ] Color legend included (if 3+ colors)
