import type { FurnitureCatalogEntry } from '../types/furniture'

const CATALOG_STORAGE_KEY = 'floor-planner-furniture-catalog'

/** US standard mattress / furniture sizes in feet (width × depth on plan). */
export const DEFAULT_FURNITURE_CATALOG: FurnitureCatalogEntry[] = [
  // Beds (mattress sizes)
  { id: 'bed-twin', label: 'Twin bed', category: 'bed', width: 3.25, depth: 6.25, height: 2.5, keywords: ['twin', 'single', 'bed'] },
  { id: 'bed-twin-xl', label: 'Twin XL bed', category: 'bed', width: 3.25, depth: 6.67, height: 2.5, keywords: ['twin xl', 'bed'] },
  { id: 'bed-full', label: 'Full bed', category: 'bed', width: 4.5, depth: 6.25, height: 2.5, keywords: ['full', 'double', 'bed'] },
  { id: 'bed-queen', label: 'Queen bed', category: 'bed', width: 5, depth: 6.67, height: 2.5, keywords: ['queen', 'bed'] },
  { id: 'bed-king', label: 'King bed', category: 'bed', width: 6.33, depth: 6.67, height: 2.5, keywords: ['king', 'bed'] },
  { id: 'bed-cal-king', label: 'California King', category: 'bed', width: 6, depth: 7, height: 2.5, keywords: ['california', 'cal king', 'bed'] },
  // Sofas
  { id: 'sofa-loveseat', label: 'Loveseat', category: 'sofa', width: 5, depth: 3, height: 3, keywords: ['loveseat', 'sofa', 'couch'] },
  { id: 'sofa-standard', label: 'Standard sofa', category: 'sofa', width: 7, depth: 3, height: 3, keywords: ['sofa', 'couch', '3 seat'] },
  { id: 'sofa-large', label: 'Large sofa', category: 'sofa', width: 8, depth: 3.5, height: 3, keywords: ['large', 'sofa', 'couch'] },
  { id: 'sofa-sectional', label: 'Sectional', category: 'sofa', width: 9, depth: 4, height: 3, keywords: ['sectional', 'sofa', 'couch'] },
  // Chairs
  { id: 'chair-dining', label: 'Dining chair', category: 'chair', width: 2, depth: 2, height: 3, keywords: ['dining', 'chair'] },
  { id: 'chair-office', label: 'Office chair', category: 'chair', width: 2.5, depth: 2.5, height: 3.5, keywords: ['office', 'chair', 'desk'] },
  // Armchairs
  { id: 'armchair-standard', label: 'Armchair', category: 'armchair', width: 3, depth: 3, height: 3, keywords: ['armchair', 'chair'] },
  { id: 'armchair-recliner', label: 'Recliner', category: 'armchair', width: 3.5, depth: 3.5, height: 3.5, keywords: ['recliner', 'armchair'] },
  // Sinks (cabinet footprint)
  { id: 'sink-single', label: 'Single bowl sink', category: 'sink', width: 2.5, depth: 2, height: 3, keywords: ['sink', 'single', 'kitchen'] },
  { id: 'sink-double', label: 'Double bowl sink', category: 'sink', width: 2.75, depth: 2, height: 3, keywords: ['sink', 'double', 'kitchen'] },
  { id: 'sink-farm', label: 'Farmhouse sink', category: 'sink', width: 3, depth: 2.25, height: 3, keywords: ['sink', 'farmhouse', 'apron', 'kitchen'] },
  // Toilets (floor footprint)
  { id: 'toilet-standard', label: 'Standard toilet', category: 'toilet', width: 2, depth: 2.5, height: 2.5, keywords: ['toilet', 'bathroom', 'wc'] },
  { id: 'toilet-compact', label: 'Compact toilet', category: 'toilet', width: 1.5, depth: 2.25, height: 2.25, keywords: ['toilet', 'compact', 'bathroom', 'small'] },
  { id: 'toilet-elongated', label: 'Elongated toilet', category: 'toilet', width: 2, depth: 2.75, height: 2.5, keywords: ['toilet', 'elongated', 'bathroom', 'ada'] },
  // Showers
  { id: 'shower-standard', label: '3×3 shower', category: 'shower', width: 3, depth: 3, height: 7, keywords: ['shower', 'stall', 'bathroom', '3x3'] },
  { id: 'shower-alcove', label: '3×4 shower', category: 'shower', width: 3, depth: 4, height: 7, keywords: ['shower', 'alcove', 'bathroom', '3x4'] },
  { id: 'shower-walk-in', label: '4×4 walk-in shower', category: 'shower', width: 4, depth: 4, height: 7, keywords: ['shower', 'walk in', 'bathroom', '4x4'] },
  // Bathtubs
  { id: 'bathtub-standard', label: 'Standard tub (5×2.5)', category: 'bathtub', width: 5, depth: 2.5, height: 2, keywords: ['bathtub', 'tub', 'alcove', 'bathroom', '60'] },
  { id: 'bathtub-large', label: 'Large tub (6×3)', category: 'bathtub', width: 6, depth: 3, height: 2.5, keywords: ['bathtub', 'tub', 'soaking', 'bathroom', '72'] },
  { id: 'bathtub-corner', label: 'Corner tub (5×5)', category: 'bathtub', width: 5, depth: 5, height: 2.5, keywords: ['bathtub', 'tub', 'corner', 'bathroom'] },
  // Counters (24″ cabinet depth)
  { id: 'counter-base-2', label: '2′ base cabinet', category: 'counter', width: 2, depth: 2, height: 3, keywords: ['counter', 'cabinet', 'base', 'kitchen', '2'] },
  { id: 'counter-base-3', label: '3′ base cabinet', category: 'counter', width: 3, depth: 2, height: 3, keywords: ['counter', 'cabinet', 'base', 'kitchen', '3'] },
  { id: 'counter-base-4', label: '4′ base cabinet', category: 'counter', width: 4, depth: 2, height: 3, keywords: ['counter', 'cabinet', 'base', 'kitchen', '4'] },
  { id: 'counter-vanity', label: '5′ vanity', category: 'counter', width: 5, depth: 2, height: 3, keywords: ['counter', 'vanity', 'bathroom', '5'] },
  { id: 'counter-kitchen-6', label: '6′ counter run', category: 'counter', width: 6, depth: 2, height: 3, keywords: ['counter', 'kitchen', 'run', '6'] },
  // Fridges
  { id: 'fridge-standard', label: 'Standard fridge', category: 'fridge', width: 3, depth: 2.5, height: 6.5, keywords: ['fridge', 'refrigerator', 'kitchen'] },
  { id: 'fridge-counter-depth', label: 'Counter-depth fridge', category: 'fridge', width: 3, depth: 2, height: 6.5, keywords: ['fridge', 'counter depth', 'refrigerator'] },
  { id: 'fridge-compact', label: 'Compact fridge', category: 'fridge', width: 2, depth: 2, height: 5.5, keywords: ['fridge', 'compact', 'refrigerator'] },
  // Stoves / ranges
  { id: 'stove-30', label: '30″ range', category: 'stove', width: 2.5, depth: 2.5, height: 3, keywords: ['stove', 'range', 'oven', '30'] },
  { id: 'stove-36', label: '36″ pro range', category: 'stove', width: 3, depth: 2.5, height: 3.5, keywords: ['stove', 'range', 'pro', '36'] },
  // Islands
  { id: 'island-small', label: 'Small island', category: 'island', width: 4, depth: 2.5, height: 3, keywords: ['island', 'kitchen', 'small'] },
  { id: 'island-medium', label: 'Medium island', category: 'island', width: 5, depth: 3, height: 3, keywords: ['island', 'kitchen', 'medium'] },
  { id: 'island-large', label: 'Large island', category: 'island', width: 6, depth: 3.5, height: 3, keywords: ['island', 'kitchen', 'large'] },
  // Shelves
  { id: 'shelf-bookcase-2', label: '2′ bookcase', category: 'shelf', width: 2, depth: 1, height: 6, keywords: ['shelf', 'bookcase', 'storage', '2'] },
  { id: 'shelf-bookcase-3', label: '3′ bookcase', category: 'shelf', width: 3, depth: 1, height: 6, keywords: ['shelf', 'bookcase', 'storage', '3'] },
  { id: 'shelf-bookcase-4', label: '4′ bookcase', category: 'shelf', width: 4, depth: 1, height: 6, keywords: ['shelf', 'bookcase', 'storage', '4'] },
  { id: 'shelf-pantry', label: 'Pantry shelving', category: 'shelf', width: 2, depth: 2, height: 7, keywords: ['shelf', 'pantry', 'storage', 'kitchen'] },
  { id: 'shelf-closet-run', label: '6′ closet shelf run', category: 'shelf', width: 6, depth: 2, height: 2, keywords: ['shelf', 'closet', 'storage', '6'] },
  { id: 'shelf-floating-3', label: '3′ floating shelf', category: 'shelf', width: 3, depth: 1, height: 0.5, keywords: ['shelf', 'floating', 'wall'] },
  { id: 'shelf-garage', label: '4′ garage shelving', category: 'shelf', width: 4, depth: 1.5, height: 6, keywords: ['shelf', 'garage', 'storage', 'wire'] },
]

function cloneCatalog(entries: FurnitureCatalogEntry[]): FurnitureCatalogEntry[] {
  return entries.map((e) => ({ ...e, keywords: [...e.keywords] }))
}

export function loadFurnitureCatalog(): FurnitureCatalogEntry[] {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY)
    if (!raw) return cloneCatalog(DEFAULT_FURNITURE_CATALOG)

    const parsed = JSON.parse(raw) as FurnitureCatalogEntry[]
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return cloneCatalog(DEFAULT_FURNITURE_CATALOG)
    }

    const defaultsById = new Map(DEFAULT_FURNITURE_CATALOG.map((e) => [e.id, e]))
    const merged = parsed.map((entry) => {
      const base = defaultsById.get(entry.id)
      if (!base) return entry
      return {
        ...base,
        ...entry,
        keywords: entry.keywords?.length ? entry.keywords : base.keywords,
      }
    })

    for (const base of DEFAULT_FURNITURE_CATALOG) {
      if (!merged.some((e) => e.id === base.id)) merged.push({ ...base, keywords: [...base.keywords] })
    }

    return merged
  } catch {
    return cloneCatalog(DEFAULT_FURNITURE_CATALOG)
  }
}

export function saveFurnitureCatalog(catalog: FurnitureCatalogEntry[]): void {
  localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog))
}

export const FURNITURE_CATEGORY_LABELS: Record<FurnitureCatalogEntry['category'], string> = {
  bed: 'Beds',
  sofa: 'Sofas',
  chair: 'Chairs',
  armchair: 'Armchairs',
  sink: 'Sinks',
  toilet: 'Toilets',
  shower: 'Showers',
  bathtub: 'Bathtubs',
  counter: 'Counters',
  fridge: 'Fridges',
  stove: 'Stoves',
  island: 'Islands',
  shelf: 'Shelves',
}
