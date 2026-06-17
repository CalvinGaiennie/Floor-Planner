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
}
