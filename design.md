# Design

Source of truth for look and motion across the three apps. Prototype: `02-prototypes/index.html` (variants A to F).
Not an official Parallel page: no Parallel logo or assets; proprietary fonts fall back to system fonts.

## 1. Decided by the user

- **Blast Radius: variant B (radial).** "B looks good for Blast Radius."
- **Webinator: variant E, Room Radar: variant F**, approved in general terms only ("all of them are pretty solid").
  Not yet ported into those apps.

## 2. Tokens (extracted from parallel.ai)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#101010` | page |
| `--surface` | `#181818` | cards, panels |
| `--line` / `--line2` | `#434343` / `#2a2a2a` | 1px borders, guide rings |
| `--fg` | `#f9f8f4` | text, nodes, edges |
| `--fg2` / `--fg3` | `#adadac` / `#858483` | secondary, tertiary text |
| `--accent` | `#96f1a7` | hubs, focus ring, key number. One accent only |
| `--red` | `#e14942` | incidents only, nowhere else |

- Fonts: `"FT System Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace` for everything in the apps;
  `"Gerstner Programm", "Helvetica Neue", sans-serif` available for long prose. Both Parallel faces are proprietary, so the fallbacks are what renders.
- Borders 1px, radius 2px (4px max). Labels uppercase, letter-spacing 0.06 to 0.18em.
- Sizes: node labels 16px minimum, company labels 18px, key number 68px, meta text 12 to 14px.
- Spacing: 4px base; 8 / 12 / 16 gaps; 52px header.
- Other Parallel colours seen, unused: off-white page `#f9f8f4`, stroke `#d6d6d6`, orange `#fb631b`, blue `#8fb6cc`, success `#69be78`.

## 3. Blast Radius map (as built in `blast-radius/`)

Variant B's language kept: radial, sector = vendor category, concentric guide rings with a dashed mid ring, 1px strokes.

Changed from B, because B has one company at the centre and the map has 12 or more:

- Companies sit on the rim (white squares, horizontal labels outside).
- Vendors sit inside, in category sectors. Distance from centre now means **share of companies depending on the vendor**
  (centre = everyone), not doubt for one company. Dashed ring = 50% of companies, inner ring = 100%.
- Doubt moved onto the edge: solid = p >= 0.8 with 2+ citations naming the vendor, dashed = unconfirmed (server rule, unchanged).
- Vendor size and green halo scale with dependents; vendors used by half or more are filled green.
- Vendor labels run along the radius, so each has its own angular slot and they cannot collide. Hubs get wider slots.
- Centre holds the readout: dependency count at rest, "N OF M AFFECTED" during an incident.

Behaviour:

- **Reveal:** edges queue and release one every 20ms, each drawing from company to vendor in 450ms; vendors drift inwards as their count grows.
- **Hover or keyboard focus a node:** it, its neighbours and their edges stay lit, the rest dims to about 16%. Card docked top-left: count or probability, strongest edge, top citation.
- **Hover an edge:** company to vendor, p, confirmed or unconfirmed, evidence excerpt.
- **Click or Enter on a vendor:** simulated incident. A red ring expands from the vendor at 520px/s and red lines travel each edge at the same speed, so companies turn red as the ring reaches them; the counter ticks up. SIMULATED badge always visible. Esc or the header button ends it.
- **Click or Enter on a company:** pins its neighbourhood. **Typing a company** adds it to the rim of the same map.
- Citations are untrusted: rendered with `textContent`, URLs shown as text, never linked.

## 4. Motion rules (all apps)

- Animate transform and opacity in HTML; in SVG, line endpoints and radius from one rAF loop that sleeps when nothing moves.
- Hover and dim: 120ms. Card enter: 120ms, 4px rise, `cubic-bezier(0.32, 0.72, 0, 1)`. Nothing in the UI over 300ms except data reveals.
- Enters ease out; never from scale 0. Transitions for interruptible state, keyframes for one-shots.
- Node settle: 16% of remaining distance per frame. Edge draw: 450ms cubic ease-out. Stagger: 20ms on the dense map.
- Prototype defaults for the sparser single-company views: answer interval 900ms, edge draw 500ms, spring stiffness 170 and damping 20, stagger 90ms, count-up 700ms, text scramble 500ms.
- `prefers-reduced-motion`: no transitions; edges, positions and the incident jump to their final state.
- Hover styles only under `(hover: hover) and (pointer: fine)`. Every node is focusable; Enter or Space activates.

## 5. Defaults that are the design engineer's calls, still open to the user

- Accent is green `#96f1a7`. Parallel orange `#fb631b` was rejected as the default because it reads too close to incident red.
- Black terminal theme, not Parallel's off-white.
- Scanline overlay on, faint.
- ASCII: mono type and uppercase tracked labels everywhere; scramble reveal only for short status text, not for the graph.
- Reveal timing: 20ms stagger on the full map instead of the real answer burst; the cached map would otherwise appear in one frame.
- Whether Webinator and Room Radar appear in the demo at all.

## 6. Rejected, and why

- **A, force layout:** labels collide and positions change every run; hubs do not land anywhere meaningful.
- **C, ASCII tree, and D, matrix:** both solid, not chosen for Blast Radius. D made chokepoints obvious but has no cascade; C has no room for 12 companies.
- **B unchanged for the full map:** one centre cannot hold 12 companies. See section 3.
- **ascii-reveal library:** ESM only (will not load from a double-clicked file) and repaints at about 30fps by design. Reimplemented in about 15 lines.
- **d3 from a CDN in Blast Radius:** removed; the layout is deterministic, so no force simulation and no network dependency on stage.
