# Physarum Netzplaner — CLAUDE.md

## Project Summary

**Physarum Netzplaner** is a browser-based network optimization tool that helps plan the expansion of utility distribution networks (e.g. district heating) using an algorithm inspired by the slime mold *Physarum polycephalum*. It takes three GeoJSON inputs — a supply source, an existing network, and user locations with demand values — and computes an optimal, demand-weighted network expansion connecting all users to the source.

**Version:** 0.05 (Prototype)  
**Target use case:** Urban infrastructure planning (district heating, utility rollout)  
**Stack:** Vanilla JavaScript, Leaflet.js (mapping), D3.js (charts), Turf.js (geometry), OpenStreetMap Nominatim (geocoding)  
**No build system** — runs directly as static HTML/JS in the browser.

---

## Architecture

```
index.html                  Entry point, UI shell
StartUp.Js                  Initialization on page load

Calculations/
  CalGeometry.js            Pipeline orchestrator; UI slider handler; export
  CalEntireEntwork.js       Core algorithm (Physarum-inspired greedy expansion)
  CalCompleteNetwork.js     Split network segments at user connection points
  ConnectPoints.js          Create snap lines from users to nearest network point
  NearestPoints.js          Snap users/source to nearest point on network
  NewLineNetwork.js         Fragment LineStrings into individual 2-node segments

LoadData/
  LoadGeoJson.js            Load .geojson / .csv / .phy files
  CsvLoading.js             Geocode CSV addresses via Nominatim
  ShowDataLoading.js        UI state management during calculation
  LoadingMessages.js        Progress text updates

Map/
  Map.js                    Leaflet map init (default center: Berlin 52.52, 13.40)
  AddRemoveFromMap.js       Layer add/remove with semantic color coding

Grafics/
  BarPlot.js                Three-panel D3 chart (overview / zoom detail / win-loss)
  Slider.js                 Interactive step slider with keyboard nav

css/
  Structure.css             Dark industrial theme, flexbox layout
  Grafics.css               D3 chart styling
```

---

## Core Algorithm (CalEntireEntwork.js)

Greedy iterative expansion mimicking slime-mold behavior:

1. **Accumulate weights:** For each unconnected user, run Dijkstra across all available + already-built segments. Sum `user_value / distance` onto each reachable segment.
2. **Select best:** Pick highest-weighted available segment (fallback to geometrically nearest if below `heatCutoff`).
3. **Expand:** Add segment to built network; connect any users now touched.
4. **Repeat** until all users are connected.

Key performance optimizations (v5):
- Pre-allocated `Float64Array` buffers (no GC churn)
- Reusable binary MinHeap with `clear()`
- In-place mutation of stable feature collection; batch rendering
- **Frontier Distance Skip-Guard:** skip Dijkstra if user is farther than `value / heatCutoff`

Output: ordered segment array with cumulative metrics (path length, cumulative value, profit ratio kWh/m).

---

## Data Formats

**Input (three required files):**
| File | Content | Format |
|------|---------|--------|
| Source | Supply node(s) | Point or LineString GeoJSON |
| Network | Existing infrastructure | LineString/MultiLineString GeoJSON |
| Users | Demand points with `properties.value` | Point GeoJSON or CSV (address, postcode, area, value) |

**Export formats:** `Network.geojson`, `Houses.geojson`, `Source.geojson`, `UserId.txt`, `Model.phy` (full state, re-importable)

---

## UI Layout (vh-based)

```
header  (4vh)   — title, file loaders, buttons
chart   (12vh)  — D3 three-panel bar chart
slider  (2vh)   — step slider
results (3vh)   — kWh/m, total usage, total length
map     (~79vh) — Leaflet map
```

---

## Key Variables & Parameters

| Name | Location | Role |
|------|----------|------|
| `heatCutoff` | CalEntireEntwork.js | Min weight threshold; also controls skip-guard max distance |
| `_connIndices[]` | BarPlot.js | Segment indices at each connection event |
| `_connProfit[]` | BarPlot.js | Cumulative profit per connection event |
| `_connMarginal[]` | BarPlot.js | Marginal kWh/m per connection event |
| `SourceGeometry` | global | Loaded source GeoJSON |
| `NetworkGeometry` | global | Loaded network GeoJSON |
| `UserGeometry` | global | Loaded users GeoJSON |

---

## Known Issues / Technical Debt

- `LoadingMessages.js` references `titelMeassage` element that may not exist in the DOM
- Map defaults to Berlin hardcoded — no auto-fit to loaded data center
- CSV geocoding uses Nominatim without rate-limiting or retry logic
- No error handling for invalid/mismatched coordinate systems
- `CalCompleteNetwork.js` / split logic can produce degenerate zero-length segments on edge cases
