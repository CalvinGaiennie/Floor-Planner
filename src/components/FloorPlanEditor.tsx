import { useCallback, useEffect, useRef, useState } from 'react'
import { useFloorPlan } from '../context/FloorPlanContext'
import {
  FURNITURE_CATALOG,
  GRID_SIZE,
  type Point2D,
} from '../types/floorPlan'
import {
  computeFitScale,
  MAX_ZOOM_SCALE,
  PIXELS_PER_FOOT,
  WORKSPACE_SIZE,
} from '../utils/workspace'
import {
  findNearestWall,
  isPointInsideFurniture,
  pointOnWall,
  projectOntoWall,
  wallLength,
} from '../utils/geometry'
import { formatFeetInches } from '../utils/imperial'
import {
  createWallDragAnchor,
  findRoomByWallId,
  isPointInsideRoom,
  isWallId,
  parseWallId,
  roomCorners,
  wallDragCursor,
  type WallDragAnchor,
} from '../utils/rooms'

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
  const [altKeyHeld, setAltKeyHeld] = useState(false)

  const {
    state,
    planWalls,
    select,
    addRoom,
    addOpening,
    addFurniture,
    addStaircase,
    moveSelected,
    resizeWall,
    deleteSelected,
  } = useFloorPlan()

  const { plan, tool, selectedId } = state

  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const offsetRef = useRef(offset)
  offsetRef.current = offset
  const userAdjustedRef = useRef(false)
  const wallDragAnchorRef = useRef<WallDragAnchor | null>(null)

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
    const container = containerRef.current
    if (!container) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const currentOffset = offsetRef.current
      if (!currentOffset) return

      const rect = container.getBoundingClientRect()
      const currentScale = scaleRef.current
      const mouse = { x: e.clientX - rect.left, y: e.clientY - rect.top }
      const planBefore = screenToPlan(mouse, currentOffset, currentScale)
      const fitScale = computeFitScale(rect.width, rect.height)
      setFitScale(fitScale)
      const zoomFactor = Math.exp(-e.deltaY * 0.0018)
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

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
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
      for (const item of plan.furniture) {
        const cat = FURNITURE_CATALOG[item.type]
        if (isPointInsideFurniture(point, item.position, cat.width, cat.depth, item.rotation)) {
          return item.id
        }
      }
      for (const stair of plan.staircases) {
        if (
          isPointInsideFurniture(point, stair.position, stair.width, stair.length, stair.rotation)
        ) {
          return stair.id
        }
      }
      for (const opening of plan.openings) {
        const wall = planWalls.find((w) => w.id === opening.wallId)
        if (!wall) continue
        const center = pointOnWall(wall, opening.offset)
        if (Math.hypot(center.x - point.x, center.y - point.y) < 1.5) return opening.id
      }
      for (const wall of planWalls) {
        const { dist } = projectOntoWall(wall, point)
        if (dist < 0.75) return wall.id
      }
      for (const room of plan.rooms) {
        if (isPointInsideRoom(point, room)) return room.id
      }
      return null
    },
    [plan, planWalls],
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
      const corners = roomCorners(room)
      const screenCorners = corners.map((c) => planToScreen(c, offset, scale))
      const selected = room.id === selectedId

      ctx.beginPath()
      ctx.moveTo(screenCorners[0].x, screenCorners[0].y)
      for (let i = 1; i < screenCorners.length; i++) {
        ctx.lineTo(screenCorners[i].x, screenCorners[i].y)
      }
      ctx.closePath()
      ctx.fillStyle = selected ? 'rgba(59, 130, 246, 0.28)' : 'rgba(226, 232, 240, 0.72)'
      ctx.fill()
      ctx.strokeStyle = selected ? '#1d4ed8' : '#94a3b8'
      ctx.lineWidth = selected ? 2.5 : 1.5
      ctx.stroke()

      const center = planToScreen(room.position, offset, scale)
      const roomScreenW = room.width * PIXELS_PER_FOOT * scale
      const roomScreenH = room.depth * PIXELS_PER_FOOT * scale
      const minDim = Math.min(roomScreenW, roomScreenH)

      if (minDim >= 20) {
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
        ctx.fillStyle = selected ? '#1e3a8a' : '#0f172a'
        ctx.font = `${nameSize}px system-ui`

        let displayName = room.name
        const maxNameWidth = roomScreenW * 0.8
        while (displayName.length > 1 && ctx.measureText(displayName).width > maxNameWidth) {
          displayName = `${displayName.slice(0, -2)}…`
        }
        ctx.fillText(displayName, center.x, center.y - (minDim >= 36 ? lineGap : 0))

        if (minDim >= 36) {
          ctx.font = `${dimSize}px system-ui`
          ctx.fillStyle = selected ? '#2563eb' : '#64748b'
          ctx.fillText(
            `${formatFeetInches(room.width)} × ${formatFeetInches(room.depth)}`,
            center.x,
            center.y + lineGap,
          )
        }

        ctx.restore()
      }
    }

    for (const wall of planWalls) {
      const start = planToScreen(wall.start, offset, scale)
      const end = planToScreen(wall.end, offset, scale)
      const isSelected = wall.id === selectedId
      ctx.strokeStyle = isSelected ? '#1d4ed8' : '#d1d5db'
      ctx.lineWidth = isSelected
        ? Math.max(3, wall.thickness * PIXELS_PER_FOOT * scale)
        : Math.max(1.5, wall.thickness * PIXELS_PER_FOOT * scale)
      ctx.lineCap = 'square'
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()

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

    for (const opening of plan.openings) {
      const wall = planWalls.find((w) => w.id === opening.wallId)
      if (!wall) continue
      const center = pointOnWall(wall, opening.offset)
      const screen = planToScreen(center, offset, scale)
      const w = opening.width * PIXELS_PER_FOOT * scale
      ctx.fillStyle = opening.type === 'door' ? '#fbbf24' : '#38bdf8'
      ctx.strokeStyle = opening.id === selectedId ? '#2563eb' : '#0f172a'
      ctx.lineWidth = opening.id === selectedId ? 3 : 1
      ctx.fillRect(screen.x - w / 2, screen.y - 6, w, 12)
      ctx.strokeRect(screen.x - w / 2, screen.y - 6, w, 12)
      ctx.fillStyle = '#0f172a'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(opening.type, screen.x, screen.y + 20)
    }

    for (const item of plan.furniture) {
      const cat = FURNITURE_CATALOG[item.type]
      const w = cat.width * PIXELS_PER_FOOT * scale
      const d = cat.depth * PIXELS_PER_FOOT * scale
      const center = planToScreen(item.position, offset, scale)
      ctx.save()
      ctx.translate(center.x, center.y)
      ctx.rotate(item.rotation)
      ctx.fillStyle = cat.color
      ctx.strokeStyle = item.id === selectedId ? '#2563eb' : '#334155'
      ctx.lineWidth = item.id === selectedId ? 3 : 1
      ctx.fillRect(-w / 2, -d / 2, w, d)
      ctx.strokeRect(-w / 2, -d / 2, w, d)
      ctx.fillStyle = '#fff'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText(cat.label, 0, 4)
      ctx.restore()
    }

    for (const stair of plan.staircases) {
      const w = stair.width * PIXELS_PER_FOOT * scale
      const d = stair.length * PIXELS_PER_FOOT * scale
      const center = planToScreen(stair.position, offset, scale)
      ctx.save()
      ctx.translate(center.x, center.y)
      ctx.rotate(stair.rotation)
      ctx.fillStyle = '#cbd5e1'
      ctx.strokeStyle = stair.id === selectedId ? '#2563eb' : '#475569'
      ctx.lineWidth = stair.id === selectedId ? 3 : 1
      ctx.fillRect(-w / 2, -d / 2, w, d)
      ctx.strokeRect(-w / 2, -d / 2, w, d)
      for (let i = -d / 2 + 8; i < d / 2; i += 12) {
        ctx.beginPath()
        ctx.moveTo(-w / 2, i)
        ctx.lineTo(w / 2, i)
        ctx.stroke()
      }
      ctx.fillStyle = '#334155'
      ctx.font = '10px system-ui'
      ctx.textAlign = 'center'
      ctx.fillText('Stairs', 0, 4)
      ctx.restore()
    }

    if (cursorPlan && tool === 'room') {
      const preview = planToScreen(cursorPlan, offset, scale)
      ctx.strokeStyle = '#2563eb'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(preview.x - 20, preview.y - 16, 40, 32)
      ctx.setLineDash([])
    }
  }, [plan, planWalls, offset, scale, selectedId, cursorPlan, tool])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    const onResize = () => draw()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [draw])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteSelected, selectedId])

  const getPlanPoint = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    if (!offset) return { x: 0, y: 0 }
    return screenToPlan({ x: e.clientX - rect.left, y: e.clientY - rect.top }, offset, scale)
  }

  const isMovable = (id: string) =>
    plan.rooms.some((r) => r.id === id) ||
    plan.furniture.some((f) => f.id === id) ||
    plan.staircases.some((s) => s.id === id)

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!offset) return
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      userAdjustedRef.current = true
      setPanStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y })
      return
    }
    if (e.button !== 0) return

    const point = getPlanPoint(e)

    if (tool === 'select') {
      const id = hitTest(point)
      select(id)
      if (id && isWallId(id)) {
        const parsed = parseWallId(id)
        const room = parsed ? findRoomByWallId(plan.rooms, id) : undefined
        if (parsed && room) {
          wallDragAnchorRef.current = createWallDragAnchor(room, parsed.wallIndex, point)
        }
        setWallDragId(id)
        setDragging(true)
      } else if (id && isMovable(id)) {
        setMoveDragId(id)
        setDragging(true)
      }
      return
    }

    if (tool === 'room') {
      addRoom(point)
      return
    }

    if (tool === 'door') {
      addOpening(point, 'door')
      return
    }

    if (tool === 'window') {
      addOpening(point, 'window')
      return
    }

    if (tool === 'furniture') {
      addFurniture(point)
      return
    }

    if (tool === 'staircase') {
      addStaircase(point)
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
    setCursorPlan(point)

    if (dragging && wallDragId && wallDragAnchorRef.current) {
      resizeWall(wallDragId, point, wallDragAnchorRef.current)
      return
    }

    if (dragging && moveDragId) {
      moveSelected(point)
    }
  }

  const handleMouseUp = () => {
    setPanStart(null)
    setDragging(false)
    setMoveDragId(null)
    setWallDragId(null)
    wallDragAnchorRef.current = null
  }

  const getCanvasCursor = (): string => {
    if (panStart) return 'grabbing'
    if (dragging && wallDragId) {
      const parsed = parseWallId(wallDragId)
      const room = parsed ? findRoomByWallId(plan.rooms, wallDragId) : undefined
      if (parsed && room) return wallDragCursor(parsed.wallIndex, room.rotation)
    }
    if (dragging && moveDragId) return 'grabbing'

    if (tool === 'room' || tool === 'furniture' || tool === 'staircase') return 'crosshair'

    if (tool === 'door' || tool === 'window') {
      if (cursorPlan) {
        const nearest = findNearestWall(planWalls, cursorPlan)
        if (nearest && nearest.dist <= 2) return 'pointer'
      }
      return 'crosshair'
    }

    if (tool !== 'select') return 'default'

    if (altKeyHeld) return 'grab'

    if (cursorPlan) {
      const hoverId = hitTest(cursorPlan)

      if (hoverId && isWallId(hoverId)) {
        const parsed = parseWallId(hoverId)
        const room = parsed ? findRoomByWallId(plan.rooms, hoverId) : undefined
        if (parsed && room) return wallDragCursor(parsed.wallIndex, room.rotation)
      }

      if (hoverId && isMovable(hoverId)) return 'grab'
    }

    return 'default'
  }

  const nearestWallHint =
    cursorPlan && (tool === 'door' || tool === 'window')
      ? findNearestWall(planWalls, cursorPlan)
      : null

  return (
    <div className="panel plan-panel">
      <div className="panel-header">
        <h2>2D Floor Plan</h2>
        <span className="panel-meta">360' × 180' · Alt+drag to pan</span>
      </div>
      <div className="panel-zoom-bar">
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
            title="Fit workspace"
            onClick={() => applyZoomScale(fitScale)}
          >
            Fit
          </button>
        </div>
      </div>
      <div className="plan-canvas-area" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="plan-canvas"
          style={{ cursor: getCanvasCursor() }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        <div className="plan-status plan-status-overlay">
          {cursorPlan && (
            <span>
              Cursor: {formatFeetInches(cursorPlan.x)}, {formatFeetInches(cursorPlan.y)}
            </span>
          )}
          {nearestWallHint && (tool === 'door' || tool === 'window') && (
            <span className={nearestWallHint.dist <= 2 ? 'ok' : 'warn'}>
              {nearestWallHint.dist <= 2 ? 'Snap to wall' : 'Move closer to a wall'}
            </span>
          )}
          <span>
            {plan.rooms.length} rooms · {plan.openings.length} openings · {plan.furniture.length}{' '}
            items
          </span>
        </div>
      </div>
    </div>
  )
}
