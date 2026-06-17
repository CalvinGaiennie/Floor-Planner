export type FurnitureCategory =
  | 'bed'
  | 'sofa'
  | 'chair'
  | 'armchair'
  | 'sink'
  | 'toilet'
  | 'shower'
  | 'bathtub'
  | 'counter'
  | 'fridge'
  | 'stove'
  | 'island'

export interface FurnitureCatalogEntry {
  id: string
  label: string
  category: FurnitureCategory
  width: number
  depth: number
  height: number
  keywords: string[]
}

export interface FurnitureItem {
  id: string
  catalogId: string
  label: string
  category: FurnitureCategory
  x: number
  y: number
  width: number
  depth: number
  height: number
  rotation: number
}
