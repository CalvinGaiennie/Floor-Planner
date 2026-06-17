import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react'
import {
  createEmptyPlan,
  type FloorPlan,
  type Room,
  type Tool,
  type ViewMode,
} from '../types/floorPlan'
import {
  addWallBetweenPoints,
  createRectangleRoomAt,
  deleteRoom,
  deleteWall,
  dragWallPerpendicular,
  duplicateRoom,
  findRoomByVertexId,
  findRoomByWallId,
  isPlanWallId,
  isVertexId,
  lastCreatedRoom,
  moveVertex,
  roomCentroid,
  resolveWalls,
  sanitizePlan,
  translateRoom,
  updateRoomDefaults,
  type WallDragAnchor,
} from '../utils/planModel'
import { loadPlan, savePlan } from '../utils/storage'
import { snapToGrid } from '../utils/imperial'

const MAX_UNDO_HISTORY = 50

function clonePlan(plan: FloorPlan): FloorPlan {
  return structuredClone(plan)
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]') !== null
  )
}

interface EditorState {
  plan: FloorPlan
  tool: Tool
  viewMode: ViewMode
  selectedId: string | null
  walkMode: boolean
}

type RoomPatch = {
  name?: string
  wallHeight?: number
  wallThickness?: number
}

type Action =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'SET_WALK_MODE'; walkMode: boolean }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_PLAN'; plan: FloorPlan }
  | { type: 'RESTORE_PLAN'; plan: FloorPlan }
  | { type: 'ADD_ROOM'; point: { x: number; y: number } }
  | { type: 'UPDATE_ROOM'; id: string; patch: RoomPatch }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DUPLICATE_ROOM'; id: string }
  | { type: 'MOVE_ROOM'; roomId: string; point: { x: number; y: number } }
  | { type: 'RESIZE_WALL'; wallId: string; point: { x: number; y: number }; anchor: WallDragAnchor }
  | { type: 'MOVE_VERTEX'; vertexId: string; point: { x: number; y: number } }
  | { type: 'ADD_WALL'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { type: 'FINISH_GEOMETRY_EDIT' }

const PLAN_UNDO_ACTIONS = new Set<Action['type']>([
  'SET_PLAN',
  'ADD_ROOM',
  'UPDATE_ROOM',
  'DELETE_SELECTED',
  'DUPLICATE_ROOM',
  'MOVE_ROOM',
  'RESIZE_WALL',
  'MOVE_VERTEX',
  'ADD_WALL',
])

const CONTINUOUS_UNDO_ACTIONS = new Set<Action['type']>(['MOVE_ROOM', 'RESIZE_WALL', 'MOVE_VERTEX'])

function snapPoint(point: { x: number; y: number }) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode, walkMode: false }
    case 'SET_WALK_MODE':
      return { ...state, walkMode: action.walkMode }
    case 'SELECT':
      return { ...state, selectedId: action.id }
    case 'SET_PLAN':
      return { ...state, plan: action.plan, selectedId: null }
    case 'RESTORE_PLAN':
      return { ...state, plan: action.plan }
    case 'ADD_ROOM': {
      const plan = createRectangleRoomAt(state.plan, snapPoint(action.point))
      const room = lastCreatedRoom(plan)
      return {
        ...state,
        plan,
        selectedId: room?.id ?? null,
        tool: 'select',
      }
    }
    case 'UPDATE_ROOM': {
      return {
        ...state,
        plan: updateRoomDefaults(state.plan, action.id, action.patch),
      }
    }
    case 'DELETE_SELECTED': {
      if (!state.selectedId) return state
      const id = state.selectedId
      let nextState: EditorState
      if (isPlanWallId(state.plan, id)) {
        nextState = { ...state, selectedId: null, plan: deleteWall(state.plan, id) }
      } else {
        const room =
          state.plan.rooms.find((r) => r.id === id) ??
          findRoomByWallId(state.plan, id) ??
          findRoomByVertexId(state.plan, id)
        if (!room) return { ...state, selectedId: null }
        nextState = { ...state, selectedId: null, plan: deleteRoom(state.plan, room.id) }
      }
      return state.tool === 'delete' ? { ...nextState, tool: 'select' } : nextState
    }
    case 'DUPLICATE_ROOM': {
      const plan = duplicateRoom(state.plan, action.id)
      const room = lastCreatedRoom(plan)
      return {
        ...state,
        plan,
        selectedId: room?.id ?? null,
        tool: 'select',
      }
    }
    case 'MOVE_ROOM': {
      const room = state.plan.rooms.find((r) => r.id === action.roomId)
      if (!room) return state
      const target = snapPoint(action.point)
      const center = roomCentroid(state.plan, room)
      const delta = { x: target.x - center.x, y: target.y - center.y }
      return {
        ...state,
        plan: translateRoom(state.plan, action.roomId, delta),
      }
    }
    case 'RESIZE_WALL': {
      return {
        ...state,
        plan: dragWallPerpendicular(state.plan, action.wallId, action.point, action.anchor),
      }
    }
    case 'MOVE_VERTEX': {
      return {
        ...state,
        plan: moveVertex(state.plan, action.vertexId, action.point),
      }
    }
    case 'ADD_WALL': {
      const beforeCount = state.plan.walls.length
      const plan = addWallBetweenPoints(
        state.plan,
        snapPoint(action.start),
        snapPoint(action.end),
      )
      if (plan.walls.length === beforeCount) return state
      const wall = plan.walls[plan.walls.length - 1]
      return {
        ...state,
        plan,
        selectedId: wall?.id ?? state.selectedId,
        tool: 'select',
      }
    }
    case 'FINISH_GEOMETRY_EDIT': {
      return { ...state, plan: sanitizePlan(state.plan) }
    }
    default:
      return state
  }
}

interface FloorPlanContextValue {
  state: EditorState
  setTool: (tool: Tool) => void
  setViewMode: (mode: ViewMode) => void
  setWalkMode: (walk: boolean) => void
  select: (id: string | null) => void
  setPlan: (plan: FloorPlan) => void
  addRoom: (point: { x: number; y: number }) => void
  updateRoom: (id: string, patch: RoomPatch) => void
  deleteSelected: () => void
  duplicateRoom: (id: string) => void
  moveRoom: (roomId: string, point: { x: number; y: number }) => void
  resizeWall: (wallId: string, point: { x: number; y: number }, anchor: WallDragAnchor) => void
  moveVertex: (vertexId: string, point: { x: number; y: number }) => void
  addWall: (start: { x: number; y: number }, end: { x: number; y: number }) => void
  finishGeometryEdit: () => void
  newPlan: () => void
  recordUndoSnapshot: () => void
  undo: () => void
  selectedRoom: Room | null
  planWalls: ReturnType<typeof resolveWalls>
}

const FloorPlanContext = createContext<FloorPlanContextValue | null>(null)

export function FloorPlanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    plan: loadPlan(),
    tool: 'select',
    viewMode: 'plan2d',
    selectedId: null,
    walkMode: false,
  })

  const undoStackRef = useRef<FloorPlan[]>([])
  const redoStackRef = useRef<FloorPlan[]>([])
  const planRef = useRef(state.plan)
  planRef.current = state.plan

  const recordUndoSnapshot = useCallback(() => {
    undoStackRef.current.push(clonePlan(planRef.current))
    redoStackRef.current = []
    if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
      undoStackRef.current.shift()
    }
  }, [])

  const dispatchAction = useCallback(
    (action: Action) => {
      if (PLAN_UNDO_ACTIONS.has(action.type) && !CONTINUOUS_UNDO_ACTIONS.has(action.type)) {
        recordUndoSnapshot()
      }
      dispatch(action)
    },
    [recordUndoSnapshot],
  )

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const previous = stack.pop()!
    redoStackRef.current.push(clonePlan(planRef.current))
    dispatch({ type: 'RESTORE_PLAN', plan: previous })
  }, [])

  useEffect(() => {
    savePlan(state.plan)
  }, [state.plan])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      if (e.shiftKey) {
        const stack = redoStackRef.current
        if (stack.length === 0) return
        const next = stack.pop()!
        undoStackRef.current.push(clonePlan(planRef.current))
        dispatch({ type: 'RESTORE_PLAN', plan: next })
      } else {
        undo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo])

  const planWalls = useMemo(() => resolveWalls(state.plan), [state.plan])
  const selectedRoom = useMemo(() => {
    const direct = state.plan.rooms.find((r) => r.id === state.selectedId)
    if (direct) return direct
    if (state.selectedId && isPlanWallId(state.plan, state.selectedId)) {
      return findRoomByWallId(state.plan, state.selectedId) ?? null
    }
    if (state.selectedId && isVertexId(state.plan, state.selectedId)) {
      return findRoomByVertexId(state.plan, state.selectedId) ?? null
    }
    return null
  }, [state.plan, state.selectedId])

  const value = useMemo<FloorPlanContextValue>(
    () => ({
      state,
      planWalls,
      selectedRoom,
      setTool: (tool) => dispatch({ type: 'SET_TOOL', tool }),
      setViewMode: (viewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }),
      setWalkMode: (walkMode) => dispatch({ type: 'SET_WALK_MODE', walkMode }),
      select: (id) => dispatch({ type: 'SELECT', id }),
      setPlan: (plan) => dispatchAction({ type: 'SET_PLAN', plan }),
      addRoom: (point) => dispatchAction({ type: 'ADD_ROOM', point }),
      updateRoom: (id, patch) => dispatchAction({ type: 'UPDATE_ROOM', id, patch }),
      deleteSelected: () => dispatchAction({ type: 'DELETE_SELECTED' }),
      duplicateRoom: (id) => dispatchAction({ type: 'DUPLICATE_ROOM', id }),
      moveRoom: (roomId, point) => dispatchAction({ type: 'MOVE_ROOM', roomId, point }),
      resizeWall: (wallId, point, anchor) =>
        dispatchAction({ type: 'RESIZE_WALL', wallId, point, anchor }),
      moveVertex: (vertexId, point) =>
        dispatchAction({ type: 'MOVE_VERTEX', vertexId, point }),
      addWall: (start, end) => dispatchAction({ type: 'ADD_WALL', start, end }),
      finishGeometryEdit: () => dispatch({ type: 'FINISH_GEOMETRY_EDIT' }),
      newPlan: () => dispatchAction({ type: 'SET_PLAN', plan: createEmptyPlan() }),
      recordUndoSnapshot,
      undo,
    }),
    [state, planWalls, selectedRoom, recordUndoSnapshot, undo],
  )

  return <FloorPlanContext.Provider value={value}>{children}</FloorPlanContext.Provider>
}

export function useFloorPlan() {
  const ctx = useContext(FloorPlanContext)
  if (!ctx) throw new Error('useFloorPlan must be used within FloorPlanProvider')
  return ctx
}

export type { RoomPatch }
