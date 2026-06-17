import { v4 as uuid } from 'uuid'
import type { FloorPlan, Point2D } from '../types/floorPlan'
import type { FurnitureCatalogEntry, FurnitureCategory, FurnitureItem } from '../types/furniture'
import { isPointInsideFurniture } from './geometry'
import { snapToGrid } from './imperial'

const FURNITURE_CATEGORIES = new Set<FurnitureCategory>([
  'bed',
  'sofa',
  'chair',
  'armchair',
  'sink',
  'fridge',
  'stove',
  'island',
])

function normalizeCategory(category: unknown): FurnitureCategory {
  if (typeof category === 'string' && FURNITURE_CATEGORIES.has(category as FurnitureCategory)) {
    return category as FurnitureCategory
  }
  return 'chair'
}

export function isFurnitureId(plan: FloorPlan, id: string): boolean {
  return plan.furniture.some((f) => f.id === id)
}

export function getFurniture(plan: FloorPlan, id: string): FurnitureItem | undefined {
  return plan.furniture.find((f) => f.id === id)
}

export function furnitureCorners(item: FurnitureItem): Point2D[] {
  const hw = item.width / 2
  const hd = item.depth / 2
  const cos = Math.cos(item.rotation)
  const sin = Math.sin(item.rotation)
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  return local.map((c) => ({
    x: item.x + c.x * cos - c.y * sin,
    y: item.y + c.x * sin + c.y * cos,
  }))
}

export function findFurnitureAtPoint(plan: FloorPlan, point: Point2D): FurnitureItem | null {
  for (let i = plan.furniture.length - 1; i >= 0; i--) {
    const item = plan.furniture[i]
    if (isPointInsideFurniture(point, { x: item.x, y: item.y }, item.width, item.depth, item.rotation)) {
      return item
    }
  }
  return null
}

export function addFurnitureFromCatalog(
  plan: FloorPlan,
  entry: FurnitureCatalogEntry,
  center: Point2D,
): FloorPlan {
  const item: FurnitureItem = {
    id: uuid(),
    catalogId: entry.id,
    label: entry.label,
    category: entry.category,
    x: snapToGrid(center.x),
    y: snapToGrid(center.y),
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    rotation: 0,
  }
  return { ...plan, furniture: [...plan.furniture, item] }
}

export function moveFurniture(plan: FloorPlan, id: string, center: Point2D): FloorPlan {
  return {
    ...plan,
    furniture: plan.furniture.map((f) =>
      f.id === id ? { ...f, x: snapToGrid(center.x), y: snapToGrid(center.y) } : f,
    ),
  }
}

export function updateFurnitureItem(
  plan: FloorPlan,
  id: string,
  patch: Partial<Pick<FurnitureItem, 'label' | 'width' | 'depth' | 'height' | 'rotation'>>,
): FloorPlan {
  return {
    ...plan,
    furniture: plan.furniture.map((f) => (f.id === id ? { ...f, ...patch } : f)),
  }
}

export function deleteFurniture(plan: FloorPlan, id: string): FloorPlan {
  return { ...plan, furniture: plan.furniture.filter((f) => f.id !== id) }
}

export function normalizeFurnitureList(raw: unknown): FurnitureItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is FurnitureItem => {
      return (
        item &&
        typeof item === 'object' &&
        typeof item.id === 'string' &&
        typeof item.x === 'number' &&
        typeof item.y === 'number' &&
        typeof item.width === 'number' &&
        typeof item.depth === 'number'
      )
    })
    .map((item) => ({
      id: item.id,
      catalogId: typeof item.catalogId === 'string' ? item.catalogId : 'custom',
      label: typeof item.label === 'string' ? item.label : 'Furniture',
      category: normalizeCategory(item.category),
      x: item.x,
      y: item.y,
      width: Math.max(0.5, item.width),
      depth: Math.max(0.5, item.depth),
      height: typeof item.height === 'number' && item.height > 0 ? item.height : 3,
      rotation: typeof item.rotation === 'number' ? item.rotation : 0,
    }))
}
