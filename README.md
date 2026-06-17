# Floor Planner

Web-based home floor plan editor with synchronized 2D and 3D views and first-person walkthrough.

## Features

- **2D plan editor** — insert rectangular rooms and edit dimensions (imperial)
- **Live 3D preview** — walls, doors, windows, furniture, and staircases extruded in Three.js
- **Walk through** — first-person mode with WASD + mouse look and basic wall collision
- **Furnishings** — sofa, bed, tables, appliances, bathroom fixtures, and more
- **Save/load** — auto-saves to browser storage; export/import JSON plans

## Getting started

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal (usually `http://localhost:5173`).

## How to use

1. Click **+ Insert Room** or use **Insert Room** tool and click the plan.
2. Select the room and edit **width**, **depth**, and **wall height** in the properties panel.
3. Use **Door** / **Window** and click near a wall to place openings.
4. Add **Furniture** from the catalog.
5. Switch to **3D View** to walk through your plan (WASD, mouse look, Space up / Shift down for elevation).

## Units

All dimensions are in **feet** internally (displayed as feet and inches). Default wall height is 8', thickness 6".

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Roadmap

- Multi-floor support
- Metric units toggle
- Room labels and area calculations
- Material/finish picker
- GLB furniture models
