import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RoomListPanel } from './RoomListPanel'
import { FriendsPanel } from './FriendsPanel'
import { WorkspaceAlerts } from './WorkspaceAlerts'
import { useFloorPlan } from '../context/FloorPlanContext'
import { GRID_SIZE, type FloorPlan, type Point2D } from '../types/floorPlan'
import {
  computeFitScale,
  computeFitScaleForBounds,
  computePlanContentBounds,
  MAX_ZOOM_SCALE,
  offsetToCenterPlanPoint,
  PIXELS_PER_FOOT,
  WORKSPACE_SIZE,
} from '../utils/workspace'
import { pointOnWall, wallLength, findWallAtPoint, findCoincidentWallIds } from '../utils/geometry'
import {
  createWallDragAnchor,
  findVertexNear,
  getRoom,
  getSharedWallRoomIds,
  getVertex,
  isPlanWallId,
  canConnectRoomsAtWall,
  isRoomsConnectedAtWall,
  isPointInsideRoom,
  isVertexId,
  roomBoundingSize,
  roomCentroid,
  roomClosedPolygon,
  roomVertexIds,
  VERTEX_SNAP_DISTANCE,
  wallDragCursor,
  type WallDragAnchor,
} from '../utils/planModel'
import {
  findFurnitureAtPoint,
  furnitureCorners,
  isFurnitureId,
} from '../utils/furniture'
import {
  doorSwingGeometries,
  findDoorAtPoint,
  findNearestWall,
  isDoorId,
  wallSolidSegments,
} from '../utils/doors'
import { formatFeetInches, snapToGrid } from '../utils/imperial'
import { DEFAULT_DOUBLE_DOOR_WIDTH, DEFAULT_DOOR_WIDTH } from '../types/floorPlan'
import type { FurnitureCategory } from '../types/furniture'

const FURNITURE_COLORS: Record<FurnitureCategory, { fill: string; stroke: string; label: string }> = {
  bed: { fill: 'rgba(180, 83, 9, 0.38)', stroke: '#b45309', label: '#92400e' },
  sofa: { fill: 'rgba(99, 102, 241, 0.38)', stroke: '#6366f1', label: '#4338ca' },
  chair: { fill: 'rgba(16, 185, 129, 0.38)', stroke: '#10b981', label: '#047857' },
  table: { fill: 'rgba(120, 53, 15, 0.38)', stroke: '#92400e', label: '#78350f' },
  armchair: { fill: 'rgba(249, 115, 22, 0.38)', stroke: '#f97316', label: '#c2410c' },
  sink: { fill: 'rgba(6, 182, 212, 0.38)', stroke: '#06b6d4', label: '#0e7490' },
  toilet: { fill: 'rgba(167, 139, 250, 0.38)', stroke: '#a78bfa', label: '#6d28d9' },
  shower: { fill: 'rgba(20, 184, 166, 0.38)', stroke: '#14b8a6', label: '#0f766e' },
  bathtub: { fill: 'rgba(59, 130, 246, 0.38)', stroke: '#3b82f6', label: '#1d4ed8' },
  counter: { fill: 'rgba(120, 113, 108, 0.38)', stroke: '#78716c', label: '#57534e' },
  fridge: { fill: 'rgba(148, 163, 184, 0.38)', stroke: '#94a3b8', label: '#475569' },
  stove: { fill: 'rgba(239, 68, 68, 0.38)', stroke: '#ef4444', label: '#b91c1c' },
  island: { fill: 'rgba(234, 179, 8, 0.38)', stroke: '#eab308', label: '#a16207' },
  shelf: { fill: 'rgba(168, 85, 247, 0.38)', stroke: '#a855f7', label: '#7e22ce' },
  tv: { fill: 'rgba(30, 41, 59, 0.42)', stroke: '#334155', label: '#1e293b' },
}

function snapPlanPoint(plan: FloorPlan, point: Point2D): Point2D {
  const near = findVertexNear(plan, point)
  if (near) return { x: near.x, y: near.y }
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

function planToScreen(point: Point2D, offset: Point2D, scale: number): Point2D {
  return {
    x: offset.x + point.x * PIXELS_PER_FOOT * scale,
    y: offset.y + point.y * PIXELS_PER_FOOT * scale,
  }
}

function screenToPlan(point: Point2D, offset: Point2D, scale: number): Point2D {
  return {
    x: (point.x - offset.x) / (PIXELS_PER_FOOT * scale),
    y: (point.y - offset.y) / (PIXELS_PER_FOOT * scale),
  }
}

export function FloorPlanEditor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState<Point2D | null>(null)
  const [scale, setScale] = useState(1)
  const [fitScale, setFitScale] = useState(1)
  const [cursorPlan, setCursorPlan] = useState<Point2D | null>(null)
  const [dragging, setDragging] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  )
  const [moveDragId, setMoveDragId] = useState<string | null>(null)
  const [wallDragId, setWallDragId] = useState<string | null>(null)
  const [vertexDragId, setVertexDragId] = useState<string | null>(null)
  const [altKeyHeld, setAltKeyHeld] = useState(false)
  const [spaceKeyHeld, setSpaceKeyHeld] = useState(false)
  const [wallPlaceStart, setWallPlaceStart] = useState<Point2D | null>(null)

  const {
    state,
    planWalls,
    select,
    addRoom,
    moveRoom,
    moveRooms,
    resizeWall,
    moveVertex,
    addWall,
    deleteSelected,
    disconnectSharedWall,
    connectSharedWall,
    recordUndoSnapshot,
    finishGeometryEdit,
    selectedRoom,
    selectedRoomIds,
    setPlanName,
    readOnlyMode,
    placementCatalogId,
    setPlacementCatalogId,
    placeFurniture,
    moveFurnitureOnPlan,
    addDoor,
    moveDoorOnPlan,
    furnitureCatalog,
    rotateSelected,
  } = useFloorPlan()

  const { plan, tool, selectedId } = state

  const sharedWallActions = useMemo(() => {
    if (!selectedId || !offset || !isPlanWallId(plan, selectedId)) return null

    const canConnect = canConnectRoomsAtWall(plan, selectedId)
    const canDisconnect = isRoomsConnectedAtWall(plan, selectedId)
    if (!canConnect && !canDisconnect) return null

    const coincidentIds = findCoincidentWallIds(planWalls, selectedId)
    const wall =
      planWalls.find((w) => w.id === selectedId) ??
      planWalls.find((w) => coincidentIds.includes(w.id))
    if (!wall) return null

    const roomNames = getSharedWallRoomIds(plan, selectedId)
      .map((id) => getRoom(plan, id)?.name ?? 'Room')
    const mid = planToScreen(
      { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 },
      offset,
      scale,
    )

    return {
      x: mid.x,
      y: mid.y - 14,
      canConnect,
      canDisconnect,
      roomNames,
    }
  }, [selectedId, offset, scale, plan, planWalls])

  const placementEntry = placementCatalogId
    ? furnitureCatalog.find((e) => e.id === placementCatalogId)
    : null

  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const userAdjustedRef = useRef(false)
  const wallDragAnchorRef = useRef<WallDragAnchor | null>(null)
  const spaceKeyHeldRef = useRef(false)
  const moveDragStartRef = useRef<Point2D | null>(null)
  const wallDragIdRef = useRef<string | null>(null)
  const vertexDragIdRef = useRef<string | null>(null)
  const moveDragIdRef = useRef<string | null>(null)
  const moveDragRoomIdsRef = useRef<string[]>([])
  const MOVE_DRAG_THRESHOLD_PX = 4

  const isSelectionAdditive = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) =>
    e.shiftKey || e.metaKey || e.ctrlKey

  const startPan = useCallback((clientX: number, clientY: number) => {
    const currentOffset = offsetRef.current
    if (!currentOffset) return
    userAdjustedRef.current = true
    setPanStart({ x: clientX, y: clientY, ox: currentOffset.x, oy: currentOffset.y })
  }, [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width <= 0 || height <= 0) return

      if (!userAdjustedRef.current) {
        // Keep the workspace fitted and centered until the user zooms or pans.
        const nextFitScale = computeFitScale(width, height)
        setFitScale(nextFitScale)
        const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT * nextFitScale
        const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT * nextFitScale
        setScale(nextFitScale)
        setOffset({
          x: (width - workspacePxW) / 2,
          y: (height - workspacePxH) / 2,
        })
      } else {
        const nextFitScale = computeFitScale(width, height)
        setFitScale(nextFitScale)
        // Preserve the user's zoom but re-center so margins stay balanced.
        const currentScale = scaleRef.current
        const currentOffset = offsetRef.current
        if (!currentOffset) return
        const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT * currentScale
        const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT * currentScale
        setOffset({
          x: workspacePxW <= width ? (width - workspacePxW) / 2 : currentOffset.x,
          y: workspacePxH <= height ? (height - workspacePxH) / 2 : currentOffset.y,
        })
      }
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const panel = panelRef.current
    const container = containerRef.current
    if (!panel || !container) return

    const onWheel = (e: WheelEvent) => {
      const target = e.target
      if (target instanceof Element && target.closest('.panel-plan-name, .furniture-panel')) return

      e.preventDefault()
      if (wallDragIdRef.current || vertexDragIdRef.current || moveDragIdRef.current) return

      const currentOffset = offsetRef.current
      if (!currentOffset) return

      const rect = container.getBoundingClientRect()

      // Pinch-to-zoom on trackpad sets ctrlKey (or metaKey on some browsers).
      const isPinchZoom = e.ctrlKey || e.metaKey || e.deltaZ !== 0

      // Two-finger trackpad scroll — pan without changing zoom.
      if (!isPinchZoom && e.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        userAdjustedRef.current = true
        setOffset({
          x: currentOffset.x - e.deltaX,
          y: currentOffset.y - e.deltaY,
        })
        return
      }

      const currentScale = scaleRef.current
      const mouse = {
        x: Math.min(rect.width, Math.max(0, e.clientX - rect.left)),
        y: Math.min(rect.height, Math.max(0, e.clientY - rect.top)),
      }
      const planBefore = screenToPlan(mouse, currentOffset, currentScale)
      const fitScale = computeFitScale(rect.width, rect.height)
      setFitScale(fitScale)
      const zoomRate = isPinchZoom ? 0.0032 : 0.0024
      const zoomFactor = Math.exp(-e.deltaY * zoomRate)
      const nextScale = Math.min(MAX_ZOOM_SCALE, Math.max(fitScale, currentScale * zoomFactor))

      // Back at (or below) fit scale: snap to a clean fitted + centered view.
      if (nextScale <= fitScale + 1e-6) {
        userAdjustedRef.current = false
        const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT * fitScale
        const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT * fitScale
        setScale(fitScale)
        setOffset({
          x: (rect.width - workspacePxW) / 2,
          y: (rect.height - workspacePxH) / 2,
        })
        return
      }

      userAdjustedRef.current = true
      const planAfter = screenToPlan(mouse, currentOffset, nextScale)
      setScale(nextScale)
      setOffset({
        x: currentOffset.x + (planAfter.x - planBefore.x) * PIXELS_PER_FOOT * nextScale,
        y: currentOffset.y + (planAfter.y - planBefore.y) * PIXELS_PER_FOOT * nextScale,
      })
    }

    panel.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => panel.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  const applyZoomScale = useCallback((nextScale: number) => {
    const container = containerRef.current
    const currentOffset = offsetRef.current
    if (!container || !currentOffset) return

    const rect = container.getBoundingClientRect()
    const minScale = computeFitScale(rect.width, rect.height)
    setFitScale(minScale)
    const clamped = Math.min(MAX_ZOOM_SCALE, Math.max(minScale, nextScale))

    if (clamped <= minScale + 1e-6) {
      userAdjustedRef.current = false
      const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT * minScale
      const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT * minScale
      setScale(minScale)
      setOffset({
        x: (rect.width - workspacePxW) / 2,
        y: (rect.height - workspacePxH) / 2,
      })
      return
    }

    userAdjustedRef.current = true
    const anchor = { x: rect.width / 2, y: rect.height / 2 }
    const currentScale = scaleRef.current
    const planBefore = screenToPlan(anchor, currentOffset, currentScale)
    const planAfter = screenToPlan(anchor, currentOffset, clamped)
    setScale(clamped)
    setOffset({
      x: currentOffset.x + (planAfter.x - planBefore.x) * PIXELS_PER_FOOT * clamped,
      y: currentOffset.y + (planAfter.y - planBefore.y) * PIXELS_PER_FOOT * clamped,
    })
  }, [])

  const fitToView = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const workspaceFit = computeFitScale(rect.width, rect.height)
    setFitScale(workspaceFit)

    const bounds = computePlanContentBounds(plan)
    if (!bounds) {
      userAdjustedRef.current = false
      const workspacePxW = WORKSPACE_SIZE.width * PIXELS_PER_FOOT * workspaceFit
      const workspacePxH = WORKSPACE_SIZE.height * PIXELS_PER_FOOT * workspaceFit
      setScale(workspaceFit)
      setOffset({
        x: (rect.width - workspacePxW) / 2,
        y: (rect.height - workspacePxH) / 2,
      })
      return
    }

    userAdjustedRef.current = true
    const contentFit = computeFitScaleForBounds(rect.width, rect.height, bounds)
    const nextScale = Math.min(MAX_ZOOM_SCALE, Math.max(workspaceFit, contentFit))
    const center = {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    }
    setScale(nextScale)
    setOffset(offsetToCenterPlanPoint(rect.width, rect.height, center, nextScale))
  }, [plan])

  const zoomSliderValue =
    MAX_ZOOM_SCALE > fitScale
      ? Math.round(((scale - fitScale) / (MAX_ZOOM_SCALE - fitScale)) * 100)
      : 0

  const handleZoomSlider = (value: number) => {
    const nextScale = fitScale + (MAX_ZOOM_SCALE - fitScale) * (value / 100)
    applyZoomScale(nextScale)
  }

  const hitTest = useCallback(
    (point: Point2D): string | null => {
      const containingRoomIds = plan.rooms
        .filter((room) => isPointInsideRoom(plan, point, room))
        .map((room) => room.id)

      const door = findDoorAtPoint(plan, planWalls, point)
      if (door) return door.id

      const vertexHitFt = Math.max(VERTEX_SNAP_DISTANCE, 12 / (PIXELS_PER_FOOT * scale))

      for (const v of plan.vertices) {
        if (Math.hypot(v.x - point.x, v.y - point.y) < vertexHitFt) return v.id
      }

      const wallId = findWallAtPoint(planWalls, point, containingRoomIds)
      if (wallId) return wallId

      if (selectedRoomIds.length > 0) {
        for (const roomId of selectedRoomIds) {
          const room = getRoom(plan, roomId)
          if (!room) continue
          for (const vid of roomVertexIds(plan, room)) {
            const v = getVertex(plan, vid)
            if (v && Math.hypot(v.x - point.x, v.y - point.y) < vertexHitFt) return vid
          }
        }
      } else if (selectedRoom) {
        for (const vid of roomVertexIds(plan, selectedRoom)) {
          const v = getVertex(plan, vid)
          if (v && Math.hypot(v.x - point.x, v.y - point.y) < vertexHitFt) return vid
        }
      }

      const furniture = findFurnitureAtPoint(plan, point)
      if (furniture) return furniture.id

      for (const room of plan.rooms) {
        if (isPointInsideRoom(plan, point, room)) return room.id
      }
      return null
    },
    [plan, planWalls, selectedRoom, selectedRoomIds, scale],
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !offset) return

    const rect = container.getBoundingClientRect()
    canvas.width = rect.width * devicePixelRatio
    canvas.height = rect.height * devicePixelRatio
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
    ctx.clearRect(0, 0, rect.width, rect.height)

    ctx.fillStyle = '#e2e8f0'
    ctx.fillRect(0, 0, rect.width, rect.height)

    const { width: areaW, height: areaH } = WORKSPACE_SIZE

    const workspaceTopLeft = planToScreen({ x: 0, y: 0 }, offset, scale)
    const workspaceBottomRight = planToScreen({ x: areaW, y: areaH }, offset, scale)
    const workspaceWidth = workspaceBottomRight.x - workspaceTopLeft.x
    const workspaceHeight = workspaceBottomRight.y - workspaceTopLeft.y

    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(workspaceTopLeft.x, workspaceTopLeft.y, workspaceWidth, workspaceHeight)

    ctx.save()
    ctx.beginPath()
    ctx.rect(workspaceTopLeft.x, workspaceTopLeft.y, workspaceWidth, workspaceHeight)
    ctx.clip()

    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    for (let planX = 0; planX <= areaW + 0.001; planX += GRID_SIZE) {
      const screenX = planToScreen({ x: planX, y: 0 }, offset, scale).x
      ctx.beginPath()
      ctx.moveTo(screenX, workspaceTopLeft.y)
      ctx.lineTo(screenX, workspaceBottomRight.y)
      ctx.stroke()
    }
    for (let planY = 0; planY <= areaH + 0.001; planY += GRID_SIZE) {
      const screenY = planToScreen({ x: 0, y: planY }, offset, scale).y
      ctx.beginPath()
      ctx.moveTo(workspaceTopLeft.x, screenY)
      ctx.lineTo(workspaceBottomRight.x, screenY)
      ctx.stroke()
    }
    ctx.restore()

    ctx.strokeStyle = '#94a3b8'
    ctx.lineWidth = 2
    ctx.strokeRect(workspaceTopLeft.x, workspaceTopLeft.y, workspaceWidth, workspaceHeight)

    const markerSize = Math.max(5, scale * 5)
    const centerRadius = Math.max(4, scale * 4)
    const cornerMarkers: { point: Point2D; align: 'tl' | 'tr' | 'br' | 'bl' }[] = [
      { point: { x: 0, y: 0 }, align: 'tl' },
      { point: { x: areaW, y: 0 }, align: 'tr' },
      { point: { x: areaW, y: areaH }, align: 'br' },
      { point: { x: 0, y: areaH }, align: 'bl' },
    ]

    for (const { point, align } of cornerMarkers) {
      const screen = planToScreen(point, offset, scale)
      ctx.fillStyle = '#475569'
      const x =
        align === 'tr' || align === 'br' ? screen.x - markerSize : screen.x
      const y =
        align === 'bl' || align === 'br' ? screen.y - markerSize : screen.y
      ctx.fillRect(x, y, markerSize, markerSize)
    }

    const centerScreen = planToScreen({ x: areaW / 2, y: areaH / 2 }, offset, scale)
    ctx.fillStyle = '#475569'
    ctx.beginPath()
    ctx.arc(centerScreen.x, centerScreen.y, centerRadius, 0, Math.PI * 2)
    ctx.fill()

    for (const room of plan.rooms) {
      const closedPolygon = roomClosedPolygon(plan, room)
      const closed = closedPolygon !== null
      const selected = selectedRoomIds.includes(room.id)

      if (closedPolygon) {
        const screenCorners = closedPolygon.map((c) => planToScreen(c, offset, scale))
        ctx.beginPath()
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
        for (let i = 1; i < screenCorners.length; i++) {
          ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
        }
        ctx.closePath()
        ctx.fillStyle = selected ? 'rgba(59, 130, 246, 0.28)' : 'rgba(226, 232, 240, 0.72)'
        ctx.fill()
      }

      const center = planToScreen(roomCentroid(plan, room), offset, scale)
      const { width: roomW, depth: roomD } = roomBoundingSize(plan, room)
      const roomScreenW = roomW * PIXELS_PER_FOOT * scale
      const roomScreenH = roomD * PIXELS_PER_FOOT * scale
      const minDim = Math.min(roomScreenW, roomScreenH)

      if (minDim < 20) continue

      const nameSize = Math.min(9, Math.max(6, minDim * 0.1))
      const dimSize = Math.min(7, Math.max(5, minDim * 0.07))
      const lineGap = Math.max(2, nameSize * 0.35)

      ctx.save()
      if (closedPolygon) {
        const screenCorners = closedPolygon.map((c) => planToScreen(c, offset, scale))
        ctx.beginPath()
        ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
        for (let i = 1; i < screenCorners.length; i++) {
          ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
        }
        ctx.closePath()
        ctx.clip()
      }

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = selected ? '#1e3a8a' : '#0f172a'
      ctx.font = `${nameSize}px system-ui`

      let displayName = closed ? room.name : `${room.name} (open)`
      const maxNameWidth = roomScreenW * 0.8
      while (displayName.length > 1 && ctx.measureText(displayName).width > maxNameWidth) {
        displayName = `${displayName.slice(0, -2)}…`
      }
      ctx.fillText(displayName, center.x, center.y - (minDim >= 36 ? lineGap : 0))

      if (minDim >= 36 && closed) {
        ctx.font = `${dimSize}px system-ui`
        ctx.fillStyle = selected ? '#2563eb' : '#64748b'
        ctx.fillText(
          `${formatFeetInches(roomW)} × ${formatFeetInches(roomD)}`,
          center.x,
          center.y + lineGap,
        )
      }

      ctx.restore()
    }

    for (const item of plan.furniture) {
      const corners = furnitureCorners(item)
      const screenCorners = corners.map((c) => planToScreen(c, offset, scale))
      const selected = item.id === selectedId
      const colors = FURNITURE_COLORS[item.category]

      ctx.beginPath()
      ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
      for (let i = 1; i < screenCorners.length; i++) {
        ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
      }
      ctx.closePath()
      ctx.fillStyle = selected ? 'rgba(59, 130, 246, 0.42)' : colors.fill
      ctx.fill()
      ctx.strokeStyle = selected ? '#1d4ed8' : colors.stroke
      ctx.lineWidth = selected ? 2.5 : 1.5
      ctx.stroke()

      const center = planToScreen({ x: item.x, y: item.y }, offset, scale)
      const screenW = item.width * PIXELS_PER_FOOT * scale
      const screenD = item.depth * PIXELS_PER_FOOT * scale
      const minDim = Math.min(screenW, screenD)
      if (minDim < 20) continue

      const nameSize = Math.min(9, Math.max(6, minDim * 0.1))
      const dimSize = Math.min(7, Math.max(5, minDim * 0.07))
      const lineGap = Math.max(2, nameSize * 0.35)

      ctx.save()
      ctx.beginPath()
      ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
      for (let i = 1; i < screenCorners.length; i++) {
        ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
      }
      ctx.closePath()
      ctx.clip()

      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = selected ? '#1e3a8a' : colors.label
      ctx.font = `${nameSize}px system-ui`

      let label = item.label
      const maxNameWidth = screenW * 0.85
      while (label.length > 1 && ctx.measureText(label).width > maxNameWidth) {
        label = `${label.slice(0, -2)}…`
      }
      ctx.fillText(label, center.x, center.y - (minDim >= 36 ? lineGap : 0))

      if (minDim >= 36) {
        ctx.font = `${dimSize}px system-ui`
        ctx.fillStyle = selected ? '#2563eb' : '#64748b'
        ctx.fillText(
          `${formatFeetInches(item.width)} × ${formatFeetInches(item.depth)}`,
          center.x,
          center.y + lineGap,
        )
      }

      ctx.restore()
    }

    const selectedWallIds =
      selectedId && isPlanWallId(plan, selectedId)
        ? new Set(findCoincidentWallIds(planWalls, selectedId))
        : null

    for (const wall of planWalls) {
      const segments = wallSolidSegments(wall, plan.doors)
      const isSelected = selectedWallIds?.has(wall.id) ?? false
      const lineWidth = isSelected
        ? Math.max(3, wall.thickness * PIXELS_PER_FOOT * scale)
        : Math.max(1.5, wall.thickness * PIXELS_PER_FOOT * scale)

      ctx.strokeStyle = isSelected ? '#1d4ed8' : '#d1d5db'
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'square'

      for (const segment of segments) {
        const segStart = planToScreen(pointOnWall(wall, segment.start), offset, scale)
        const segEnd = planToScreen(pointOnWall(wall, segment.end), offset, scale)
        ctx.beginPath()
        ctx.moveTo(segStart.x, segStart.y)
        ctx.lineTo(segEnd.x, segEnd.y)
        ctx.stroke()
      }

      if (isSelected) {
        const len = wallLength(wall)
        const mid = planToScreen(
          { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 },
          offset,
          scale,
        )
        ctx.fillStyle = '#64748b'
        ctx.font = '10px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(formatFeetInches(len), mid.x, mid.y - 6)
      }
    }

    for (const door of plan.doors) {
      const wall = planWalls.find((w) => w.id === door.wallId)
      if (!wall) continue

      const isSelected = door.id === selectedId
      const openStart = planToScreen(pointOnWall(wall, door.offset - door.width / 2), offset, scale)
      const openEnd = planToScreen(pointOnWall(wall, door.offset + door.width / 2), offset, scale)
      const swings = doorSwingGeometries(wall, door)

      for (const swing of swings) {
        const hingeScreen = planToScreen(swing.hinge, offset, scale)
        const leafScreen = planToScreen(swing.leafEnd, offset, scale)

        ctx.strokeStyle = isSelected ? '#1d4ed8' : '#64748b'
        ctx.lineWidth = isSelected ? 2.5 : 1.5
        ctx.beginPath()
        ctx.moveTo(hingeScreen.x, hingeScreen.y)
        ctx.lineTo(leafScreen.x, leafScreen.y)
        ctx.stroke()

        const arcRadius = Math.hypot(leafScreen.x - hingeScreen.x, leafScreen.y - hingeScreen.y)
        if (arcRadius > 2) {
          let sweep = swing.arcEnd - swing.arcStart
          while (sweep > Math.PI) sweep -= 2 * Math.PI
          while (sweep < -Math.PI) sweep += 2 * Math.PI
          ctx.beginPath()
          ctx.arc(hingeScreen.x, hingeScreen.y, arcRadius, swing.arcStart, swing.arcEnd, sweep < 0)
          ctx.stroke()
        }
      }

      ctx.strokeStyle = isSelected ? '#2563eb' : '#94a3b8'
      ctx.lineWidth = isSelected ? 2 : 1
      ctx.beginPath()
      ctx.moveTo(openStart.x, openStart.y)
      ctx.lineTo(openEnd.x, openEnd.y)
      ctx.stroke()

      if (isSelected) {
        const center = planToScreen(pointOnWall(wall, door.offset), offset, scale)
        ctx.fillStyle = '#64748b'
        ctx.font = '10px system-ui'
        ctx.textAlign = 'center'
        ctx.fillText(formatFeetInches(door.width), center.x, center.y - 8)
      }
    }

    if (selectedId && isVertexId(plan, selectedId)) {
      const v = getVertex(plan, selectedId)
      if (v) {
        const screen = planToScreen(v, offset, scale)
        ctx.fillStyle = '#2563eb'
        ctx.strokeStyle = '#1d4ed8'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, 8, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    const roomsToShowVertices =
      selectedRoomIds.length > 0
        ? selectedRoomIds
            .map((id) => getRoom(plan, id))
            .filter((room): room is NonNullable<typeof room> => room !== undefined)
        : selectedRoom
          ? [selectedRoom]
          : []

    for (const room of roomsToShowVertices) {
      for (const vid of roomVertexIds(plan, room)) {
        const v = getVertex(plan, vid)
        if (!v) continue
        const screen = planToScreen(v, offset, scale)
        const isVertexSelected = selectedId === vid
        const radius = isVertexSelected ? 7 : 5
        ctx.fillStyle = isVertexSelected ? '#2563eb' : '#ffffff'
        ctx.strokeStyle = '#1d4ed8'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }

    if (wallPlaceStart && tool === 'wall') {
      const start = planToScreen(wallPlaceStart, offset, scale)
      const end = cursorPlan
        ? planToScreen(cursorPlan, offset, scale)
        : start
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = '#2563eb'
      ctx.beginPath()
      ctx.arc(start.x, start.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }

    if (cursorPlan && tool === 'room') {
      const preview = planToScreen(cursorPlan, offset, scale)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(preview.x - 20, preview.y - 16, 40, 32)
      ctx.setLineDash([])
    }

    if (placementEntry && cursorPlan) {
      const hw = (placementEntry.width * PIXELS_PER_FOOT * scale) / 2
      const hd = (placementEntry.depth * PIXELS_PER_FOOT * scale) / 2
      const center = planToScreen(cursorPlan, offset, scale)
      const colors = FURNITURE_COLORS[placementEntry.category]
      ctx.strokeStyle = colors.stroke
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(center.x - hw, center.y - hd, hw * 2, hd * 2)
      ctx.setLineDash([])
    }

    if ((tool === 'door' || tool === 'double-door') && cursorPlan) {
      const nearest = findNearestWall(planWalls, cursorPlan)
      if (nearest) {
        const previewWidth = tool === 'double-door' ? DEFAULT_DOUBLE_DOOR_WIDTH : DEFAULT_DOOR_WIDTH
        const openStart = planToScreen(
          pointOnWall(nearest.wall, nearest.offset - previewWidth / 2),
          offset,
          scale,
        )
        const openEnd = planToScreen(
          pointOnWall(nearest.wall, nearest.offset + previewWidth / 2),
          offset,
          scale,
        )
        ctx.strokeStyle = '#2563eb'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 4])
        ctx.beginPath()
        ctx.moveTo(openStart.x, openStart.y)
        ctx.lineTo(openEnd.x, openEnd.y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }, [plan, planWalls, offset, scale, selectedId, selectedRoom, selectedRoomIds, cursorPlan, tool, wallPlaceStart, placementEntry])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  useEffect(() => {
    setWallPlaceStart(null)
  }, [tool])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest('input, textarea, select, [contenteditable="true"]') !== null

    const arrowPan: Record<string, { dx: number; dy: number }> = {
      ArrowUp: { dx: 0, dy: 1 },
      ArrowDown: { dx: 0, dy: -1 },
      ArrowLeft: { dx: 1, dy: 0 },
      ArrowRight: { dx: -1, dy: 0 },
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isEditableTarget(e.target)) {
        e.preventDefault()
        spaceKeyHeldRef.current = true
        setSpaceKeyHeld(true)
        return
      }

      if (e.key === 'Escape' && !isEditableTarget(e.target)) {
        setWallPlaceStart(null)
        if (placementCatalogId) setPlacementCatalogId(null)
        return
      }

      const pan = arrowPan[e.key]
      if (pan && !isEditableTarget(e.target)) {
        if (wallDragIdRef.current || vertexDragIdRef.current || moveDragIdRef.current) return
        const currentOffset = offsetRef.current
        if (!currentOffset) return
        e.preventDefault()
        userAdjustedRef.current = true
        const step = e.shiftKey ? 96 : 32
        setOffset({
          x: currentOffset.x + pan.dx * step,
          y: currentOffset.y + pan.dy * step,
        })
        return
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId &&
        !isEditableTarget(e.target)
      ) {
        e.preventDefault()
        deleteSelected()
        return
      }

      if (
        (e.key === 'r' || e.key === 'R') &&
        selectedId &&
        !isEditableTarget(e.target) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault()
        rotateSelected(e.shiftKey ? 'ccw' : 'cw')
      }
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceKeyHeldRef.current = false
        setSpaceKeyHeld(false)
      }
    }

    const onBlur = () => {
      spaceKeyHeldRef.current = false
      setSpaceKeyHeld(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [deleteSelected, selectedId, placementCatalogId, setPlacementCatalogId, rotateSelected])

  const getPlanPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    if (!offset) return { x: 0, y: 0 }
    return screenToPlan({ x: e.clientX - rect.left, y: e.clientY - rect.top }, offset, scale)
  }

  const isRoomMovable = (id: string) => plan.rooms.some((r) => r.id === id)

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!offset) return
    if (
      e.button === 1 ||
      (e.button === 0 && (e.altKey || spaceKeyHeldRef.current))
    ) {
      startPan(e.clientX, e.clientY)
      return
    }
    if (e.button !== 0) return

    const point = getPlanPoint(e)

    if (placementCatalogId) {
      placeFurniture(placementCatalogId, point)
      return
    }

    if (tool === 'select') {
      const id = hitTest(point)
      const additive = isSelectionAdditive(e)

      if (additive && id && isRoomMovable(id)) {
        select(id, { additive: true })
        return
      }

      if (id && isRoomMovable(id)) {
        const inSelection = selectedRoomIds.includes(id)
        select(id, { preserveRoomSelection: inSelection })
        recordUndoSnapshot()
        moveDragIdRef.current = id
        setMoveDragId(id)
        moveDragRoomIdsRef.current = inSelection ? selectedRoomIds : [id]
        moveDragStartRef.current = point
        return
      }

      select(id)
      if (id && isVertexId(plan, id)) {
        recordUndoSnapshot()
        vertexDragIdRef.current = id
        setVertexDragId(id)
        setDragging(true)
      } else if (id && isPlanWallId(plan, id)) {
        recordUndoSnapshot()
        wallDragAnchorRef.current = createWallDragAnchor(plan, id, point)
        wallDragIdRef.current = id
        setWallDragId(id)
        setDragging(true)
      } else if (id && isFurnitureId(plan, id)) {
        recordUndoSnapshot()
        moveDragIdRef.current = id
        setMoveDragId(id)
        moveDragStartRef.current = point
      } else if (id && isDoorId(plan, id)) {
        recordUndoSnapshot()
        moveDragIdRef.current = id
        setMoveDragId(id)
        moveDragStartRef.current = point
      }
      return
    }

    if (tool === 'wall') {
      const snapped = snapPlanPoint(plan, point)
      if (!wallPlaceStart) {
        setWallPlaceStart(snapped)
        return
      }
      addWall(wallPlaceStart, snapped)
      return
    }

    if (tool === 'door') {
      addDoor(point, 'single')
      return
    }

    if (tool === 'double-door') {
      addDoor(point, 'double')
      return
    }

    if (tool === 'delete') {
      const id = hitTest(point)
      if (id) {
        select(id)
        deleteSelected()
      }
      return
    }

    if (tool === 'room') {
      addRoom(point)
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setAltKeyHeld(e.altKey)

    if (panStart) {
      setOffset({
        x: panStart.ox + (e.clientX - panStart.x),
        y: panStart.oy + (e.clientY - panStart.y),
      })
      return
    }

    const point = getPlanPoint(e)
    if (tool === 'wall') {
      setCursorPlan(snapPlanPoint(plan, point))
      return
    }
    setCursorPlan(point)

    if (dragging && vertexDragId) {
      moveVertex(vertexDragId, point)
      return
    }

    if (dragging && wallDragId && wallDragAnchorRef.current) {
      resizeWall(wallDragId, point, wallDragAnchorRef.current)
      return
    }

    if (moveDragId && moveDragStartRef.current && offset) {
      const rect = canvasRef.current!.getBoundingClientRect()
      const startScreen = planToScreen(moveDragStartRef.current, offset, scale)
      const dx = e.clientX - rect.left - startScreen.x
      const dy = e.clientY - rect.top - startScreen.y
      let moveActive = dragging
      if (!moveActive && Math.hypot(dx, dy) >= MOVE_DRAG_THRESHOLD_PX) {
        setDragging(true)
        moveActive = true
      }
      if (moveActive) {
        if (isFurnitureId(plan, moveDragId)) {
          moveFurnitureOnPlan(moveDragId, point)
        } else if (isDoorId(plan, moveDragId)) {
          moveDoorOnPlan(moveDragId, point)
        } else if (moveDragRoomIdsRef.current.length > 1) {
          moveRooms(moveDragRoomIdsRef.current, point)
        } else {
          moveRoom(moveDragId, point)
        }
      }
    }
  }

  const handleMouseUp = () => {
    const hadGeometryDrag = wallDragIdRef.current || vertexDragIdRef.current
    setPanStart(null)
    setDragging(false)
    moveDragIdRef.current = null
    moveDragRoomIdsRef.current = []
    setMoveDragId(null)
    wallDragIdRef.current = null
    setWallDragId(null)
    vertexDragIdRef.current = null
    setVertexDragId(null)
    wallDragAnchorRef.current = null
    moveDragStartRef.current = null
    if (hadGeometryDrag) finishGeometryEdit()
  }

  const getCanvasCursor = (): string => {
    if (panStart) return 'grabbing'
    if (dragging && vertexDragId) return 'grabbing'
    if (dragging && wallDragId) {
      const wall = planWalls.find((w) => w.id === wallDragId)
      if (wall) return wallDragCursor(wall)
    }
    if (dragging && moveDragId) return 'grabbing'

    if (tool === 'room' || tool === 'wall' || placementCatalogId) return 'crosshair'

    if (tool !== 'select') return 'default'

    if (altKeyHeld || spaceKeyHeld) return 'grab'

    if (cursorPlan) {
      const hoverId = hitTest(cursorPlan)

      if (hoverId && isVertexId(plan, hoverId)) return 'grab'

      if (hoverId && isPlanWallId(plan, hoverId)) {
        const wall = planWalls.find((w) => w.id === hoverId)
        if (wall) return wallDragCursor(wall)
      }

      if (hoverId && (isRoomMovable(hoverId) || isFurnitureId(plan, hoverId))) return 'grab'
    }

    if (placementCatalogId) return 'crosshair'

    return 'default'
  }

  return (
    <div className="panel plan-panel" ref={panelRef}>
      <div className="panel-header">
        <input
          type="text"
          className="panel-plan-name"
          value={plan.name}
          onChange={(e) => setPlanName(e.target.value)}
          readOnly={readOnlyMode}
          aria-label="Plan name"
          placeholder="Plan name"
        />
        <div className="panel-header-zoom">
          <span className="zoom-label">Zoom</span>
          <div className="zoom-controls">
            <button
              type="button"
              className="zoom-btn"
              title="Zoom out"
              onClick={() => applyZoomScale(scale / 1.25)}
            >
              −
            </button>
            <input
              type="range"
              className="zoom-slider"
              min={0}
              max={100}
              value={zoomSliderValue}
              onChange={(e) => handleZoomSlider(Number(e.target.value))}
              aria-label="Zoom level"
            />
            <button
              type="button"
              className="zoom-btn"
              title="Zoom in"
              onClick={() => applyZoomScale(scale * 1.25)}
            >
              +
            </button>
            <button
              type="button"
              className="zoom-fit-btn"
              title="Fit view to your plan (rooms and items); empty plans show full workspace"
              onClick={fitToView}
            >
              Fit
            </button>
          </div>
        </div>
      </div>
      <div className="plan-canvas-area" ref={containerRef}>
        <WorkspaceAlerts />
        <RoomListPanel />
        <FriendsPanel />
        <canvas
          ref={canvasRef}
          className="plan-canvas"
          style={{ cursor: getCanvasCursor() }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {sharedWallActions && (
          <div
            className="shared-wall-action-group"
            style={{ left: sharedWallActions.x, top: sharedWallActions.y }}
          >
            {sharedWallActions.canConnect && (
              <button
                type="button"
                className="shared-wall-connect-btn"
                title={`Connect ${sharedWallActions.roomNames.join(' and ')}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (selectedId) connectSharedWall(selectedId)
                }}
              >
                Connect
              </button>
            )}
            {sharedWallActions.canDisconnect && (
              <button
                type="button"
                className="shared-wall-disconnect-btn"
                title={`Disconnect ${sharedWallActions.roomNames.join(' and ')}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  if (selectedId) disconnectSharedWall(selectedId)
                }}
              >
                Disconnect
              </button>
            )}
          </div>
        )}
        <div className="plan-status plan-status-overlay">
          {cursorPlan && (
            <span>
              Cursor: {formatFeetInches(cursorPlan.x)}, {formatFeetInches(cursorPlan.y)}
            </span>
          )}
          <span>{plan.rooms.length} rooms</span>
        </div>
      </div>
    </div>
  )
}
