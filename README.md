# MAHA Chart

Browser-based chart maker for offshore survey alignment sheets and North-Up charts, in the spirit of AutoChart. Input is survey software exports (.dig, .dxf, CSV/TXT listings, VisualWorks cross profiles, NaviModel / Visual Edit events); output will be DXF and PDF in any paper size.

## Status

Step 1 of 4: **template designer**.

- Start page with a template dropdown (built-in and saved templates) and paper size choice.
- Built-in 5-panel A1 1:5,000 alignment sheet measured from `33DJ100160_Base_5Panel_5k.dxf`, a 4-panel variant without cathodic protection, and a North-Up sheet.
- Panels can be added, removed, moved, resized and split. Dragging an edge moves the divider: neighbours that share it, the gutter between columns and the sections of Chart Information all follow. Hold Alt to resize one panel only.
- The plan view width, horizontal scale and KP per sheet are linked. Choose which one stays fixed; the profile, events and CP panels follow the plan view, and the Chart Information scale bars, scale text and title block KP range update by themselves.
- Windows-style editing: click to select, click again (slow double-click) or F2 to rename, double-click to edit text, right-click for the context menu, Ctrl+Z / Ctrl+Y, Ctrl+C / X / V / D, Delete, arrow keys to nudge.
- Templates save to the browser library and export / import as files.

Next: data import (step 2), panel drawing and sheeting (step 3), DXF / PDF export and team server (step 4).

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm test          # unit tests for layout and scale linking
npm run build
```

All geometry is in millimetres on paper (origin top-left). Text can use `{TOKENS}` such as `{H_SCALE}`, `{V_SCALE_LONG}`, `{KP_START}`, `{KP_END}` or any template field.
