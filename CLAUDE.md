# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Conventions

Do not include a `Co-Authored-By` line in commit messages. Do not commit wihtout asking.

## Project Overview

Open Motorways is an open-source Mini Motorways clone built with TypeScript, Three.js, React, and Tone.js. Players draw roads to connect color-matched houses and businesses on a grid. Cars pathfind along roads to deliver goods; unmet demand causes game over.

## Commands

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — Type-check with `tsc` then build with Vite
- `npm run preview` — Preview production build

No test framework or linter is configured.

## Architecture

### App Shell & Routing (`src/app/`)

The app uses React Router (`HashRouter`) with two routes:

- `/` — **MapSelectPage**: Grid of map cards. Clicking one navigates to the play route.
- `/play/:mapId` — **PlayPage**: Looks up the map config and renders `<GameCanvas>`.

`src/main.tsx` renders the `<App />` component into `#app`. There is no splash screen — games auto-start when a map is selected. Audio initializes lazily on the first user interaction.

### Map System (`src/maps/`)

- **`types.ts`** — `MapConfig`, `ObstacleDefinition`, `GameConstants` types.
- **`index.ts`** — `allMaps` array and `getMapById()` lookup.
- **Map files** (`classic.ts`, `lakeland.ts`, `narrow-pass.ts`) — Each exports a `MapConfig` with optional predefined obstacles and constant overrides.

Maps can override any gameplay constant (demand rates, starting money, spawn intervals, obstacle counts, etc.) via `constants?: Partial<GameConstants>`. They can also define fixed terrain via `obstacles?: ObstacleDefinition[]` which bypasses random obstacle generation.

### Core Game Loop (`src/core/`)

- **Game** — Central orchestrator. Constructor accepts `(canvas, mapConfig?)`. Calls `buildConfig(mapConfig?.constants)` and passes resolved config to all systems. Owns all systems, handles input wiring, and manages `GameState` (Playing → Paused/GameOver). Has `dispose()` for full cleanup (WebGL, event listeners, audio) when navigating away. The `update(dt)` → `render(alpha)` cycle is driven by `GameLoop`.
- **GameLoop** — Fixed-timestep (60Hz) with accumulator pattern. Calls `onUpdate(FIXED_DT)` for simulation and `onRender(alpha)` for interpolated rendering.
- **Grid** — Flat array of `Cell` objects. Dimensions are configurable via constructor params (`cols`, `rows`), defaulting to 70×40. Each cell tracks its type (Empty/Road/House/Business/ParkingLot), road connections (8 directions including diagonals), bridge state, and color. All spatial lookups go through this class.

### Entity Model (`src/entities/`)

Entities (`House`, `Business`, `Car`) are plain data classes with an `id` field, grid position, and color. Cars have state machines (Idle → DrivingToBusiness → Unloading → DrivingHome → etc.) and track their path as `GridPos[]` arrays.

### Systems (`src/systems/`)

Systems are stateful classes instantiated by `Game`. Systems that use gameplay constants accept them via constructor params (falling back to module-level defaults):

- **SpawnSystem** — Spawns houses/businesses over time with increasing frequency. Colors unlock progressively (red → blue → yellow → green → purple → orange). Accepts config for spawn intervals, cluster radius, distances.
- **DemandSystem** — Adds demand pins to businesses; triggers game over when max demand exceeded. Accepts config for demand rates, cooldowns, max pins.
- **CarSystem** — Moves cars along paths, handles lane-based traffic with occupancy tracking, intersection yielding, and parking lot logic. The most complex system.
- **RoadSystem** — Manages road/bridge placement and deletion. Auto-connects adjacent road cells. Sets `isDirty` flag to trigger pathfinder cache clear and renderer updates.
- **ObstacleSystem** — Generates mountains and lakes. Accepts optional `ObstacleDefinition[]` for predefined terrain (skips random generation) and config for cluster counts/sizes.
- **MusicSystem / SoundEffectSystem** — Tone.js-based procedural audio. Music uses layered synth patterns; sound effects are one-shot samples.

### UI (`src/ui/`)

- **GameCanvas** — React component that creates a canvas element, instantiates `Game(canvas, mapConfig)`, and renders `GameUI` as an overlay. Handles cleanup on unmount via `Game.dispose()`.
- **GameUI** — HUD with score, money, time, back button (navigates to map select), pause, undo, settings. Toolbar for road/eraser tools. Game-over overlay.

### Pathfinding (`src/pathfinding/`)

A* pathfinder with octile distance heuristic. Supports ground and bridge traffic levels. Results are cached and invalidated when roads change (`clearCache()`).

### Rendering (`src/rendering/`)

Uses Three.js with an orthographic top-down camera:

- **Renderer** — Manages the Three.js scene, camera (zoom/pan with lerp smoothing), and coordinates render layers. Terrain is painted to an offscreen 2D canvas and used as a texture on a ground plane.
- **Layers** (`rendering/layers/`): TerrainLayer (2D canvas), RoadLayer (3D meshes from grid data), BuildingLayer (3D box meshes for houses/businesses), CarLayer (3D box meshes updated per frame). Road rendering is split into `CellRoadRenderer` and `DiagonalRoadRenderer`.

### Input (`src/input/`)

- **InputHandler** — Tracks mouse state (position, buttons, drag) and converts screen coords to world coords.
- **RoadDrawer** — Translates input gestures into road operations: left-drag draws, right-drag erases, shift-click builds L-shaped paths. Respects the active tool (Road vs Bridge) and money system.

### Key Patterns

- **Configurable constants**: `buildConfig(overrides?)` in `constants.ts` merges map-specific overrides over `DEFAULT_GAME_CONSTANTS`. Systems read from the config object passed to them rather than importing constants directly.
- **Dirty flags**: Systems set `isDirty` after mutations; `Game.update()` checks flags to trigger downstream updates (pathfinder cache clear, renderer rebuild).
- **Coordinate spaces**: Grid coords (`gx`, `gy`) for game logic, pixel coords for rendering (grid × `TILE_SIZE`), screen coords for input. Conversion helpers in `Grid` and `utils/math.ts`.
- **Enums as const objects**: Types like `GameState`, `CellType`, `Direction` use `as const` objects with companion type aliases (not TypeScript enums).
- **No dependency injection or ECS**: Systems are directly instantiated and wired in `Game`'s constructor. Entity references are passed through method calls.

### Configuration

Game balance constants (speeds, costs, intervals, colors) are centralized in `src/constants.ts` with a `GameConstants` type in `src/maps/types.ts`. Rendering constants (colors, sizes) remain as direct exports in `constants.ts`.

Vite config sets `base: '/Open-Motorways/'` for GitHub Pages deployment. Routing uses `HashRouter` for GitHub Pages compatibility.
