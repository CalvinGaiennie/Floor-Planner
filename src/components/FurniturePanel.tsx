import { useEffect, useMemo, useState } from 'react'
import { FURNITURE_CATEGORY_LABELS } from '../data/furnitureCatalog'
import { useFloorPlan } from '../context/FloorPlanContext'
import type { FurnitureCategory } from '../types/furniture'
import { formatFeetInches } from '../utils/imperial'

const FURNITURE_OPEN_KEY = 'floor-planner-furniture-open'

const CATEGORY_ORDER: FurnitureCategory[] = [
  'bed',
  'sofa',
  'chair',
  'armchair',
  'sink',
  'toilet',
  'shower',
  'bathtub',
  'counter',
  'fridge',
  'stove',
  'island',
  'shelf',
]

function FurnitureIcon() {
  return (
    <svg
      className="furniture-panel-fab-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 10h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M4 10V7a2 2 0 0 1 2-2h3M20 10V7a2 2 0 0 0-2-2h-3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M9 5V3M15 5V3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

function parseDimension(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

export function FurniturePanel() {
  const {
    furnitureCatalog,
    updateCatalogEntry,
    placementCatalogId,
    setPlacementCatalogId,
  } = useFloorPlan()
  const [open, setOpen] = useState(() => localStorage.getItem(FURNITURE_OPEN_KEY) === '1')
  const [search, setSearch] = useState('')

  useEffect(() => {
    localStorage.setItem(FURNITURE_OPEN_KEY, open ? '1' : '0')
  }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return furnitureCatalog
    return furnitureCatalog.filter(
      (entry) =>
        entry.label.toLowerCase().includes(q) ||
        entry.keywords.some((kw: string) => kw.toLowerCase().includes(q)),
    )
  }, [furnitureCatalog, search])

  const grouped = useMemo(() => {
    const map = new Map<FurnitureCategory, typeof furnitureCatalog>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const entry of filtered) {
      const list = map.get(entry.category) ?? []
      list.push(entry)
      map.set(entry.category, list)
    }
    return map
  }, [filtered])

  return (
    <div className="furniture-panel-root">
      <button
        type="button"
        className={`furniture-panel-fab${open ? ' hidden' : ''}`}
        title="Furniture catalog"
        aria-label="Open furniture catalog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <FurnitureIcon />
      </button>

      {open && (
        <div className="furniture-panel" role="dialog" aria-label="Furniture catalog">
          <div className="furniture-panel-header">
            <h3>Furniture</h3>
            <button
              type="button"
              className="furniture-panel-close"
              aria-label="Close furniture catalog"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="furniture-panel-search">
            <input
              type="search"
              placeholder="Search beds, sofas, sinks, toilets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search furniture"
            />
          </div>

          <div className="furniture-panel-body">
            {filtered.length === 0 && (
              <p className="furniture-panel-empty">No items match your search.</p>
            )}

            {CATEGORY_ORDER.map((category) => {
              const entries = grouped.get(category) ?? []
              if (entries.length === 0) return null
              return (
                <section key={category} className="furniture-panel-section">
                  <h4>{FURNITURE_CATEGORY_LABELS[category]}</h4>
                  <table className="furniture-catalog-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>W</th>
                        <th>D</th>
                        <th>H</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry) => {
                        const placing = placementCatalogId === entry.id
                        return (
                          <tr key={entry.id} className={placing ? 'placing' : undefined}>
                            <td>
                              <input
                                type="text"
                                className="furniture-catalog-name"
                                value={entry.label}
                                onChange={(e) =>
                                  updateCatalogEntry(entry.id, { label: e.target.value })
                                }
                                aria-label={`${entry.label} name`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="furniture-catalog-dim"
                                min={0.5}
                                step={0.25}
                                value={entry.width}
                                onChange={(e) =>
                                  updateCatalogEntry(entry.id, {
                                    width: parseDimension(e.target.value, entry.width),
                                  })
                                }
                                aria-label={`${entry.label} width (ft)`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="furniture-catalog-dim"
                                min={0.5}
                                step={0.25}
                                value={entry.depth}
                                onChange={(e) =>
                                  updateCatalogEntry(entry.id, {
                                    depth: parseDimension(e.target.value, entry.depth),
                                  })
                                }
                                aria-label={`${entry.label} depth (ft)`}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="furniture-catalog-dim"
                                min={0.5}
                                step={0.25}
                                value={entry.height}
                                onChange={(e) =>
                                  updateCatalogEntry(entry.id, {
                                    height: parseDimension(e.target.value, entry.height),
                                  })
                                }
                                aria-label={`${entry.label} height (ft)`}
                              />
                            </td>
                            <td>
                              <button
                                type="button"
                                className={`furniture-place-btn${placing ? ' active' : ''}`}
                                title={`Place ${entry.label} (${formatFeetInches(entry.width)} × ${formatFeetInches(entry.depth)})`}
                                onClick={() =>
                                  setPlacementCatalogId(placing ? null : entry.id)
                                }
                              >
                                {placing ? 'Click plan…' : 'Place'}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </section>
              )
            })}
          </div>

          {placementCatalogId && (
            <div className="furniture-panel-hint">
              Click on the plan to place furniture. Press Esc or Place again to cancel.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
