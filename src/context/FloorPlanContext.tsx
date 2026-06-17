import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import { v4 as uuid } from 'uuid'
import {
  createEmptyPlan,
  DEFAULT_ROOM_DEPTH,
  DEFAULT_ROOM_WIDTH,
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  MAX_ROOM_DIMENSION,
  MIN_ROOM_DIMENSION,
  type FloorPlan,
  type Room,
  type Tool,
  type ViewMode,
} from '../types/floorPlan'
import { snapToGrid } from '../utils/imperial'
import {
  findRoomByWallId,
  getPlanWalls,
  isWallId,
  nextRoomName,
  resizeRoomByWallDrag,
  type WallDragAnchor,
} from '../utils/rooms'
import { loadPlan, savePlan } from '../utils/storage'

interface EditorState {
  plan: FloorPlan
  tool: Tool
  viewMode: ViewMode
  selectedId: string | null
  walkMode: boolean
}

type RoomPatch = Partial<
  Pick<Room, 'name' | 'width' | 'depth' | 'wallHeight' | 'wallThickness' | 'position'>
>

type Action =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'SET_WALK_MODE'; walkMode: boolean }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_PLAN'; plan: FloorPlan }
  | { type: 'ADD_ROOM'; point: { x: number; y: number } }
  | { type: 'UPDATE_ROOM'; id: string; patch: RoomPatch }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DUPLICATE_ROOM'; id: string }
  | { type: 'MOVE_SELECTED'; point: { x: number; y: number } }
  | { type: 'RESIZE_WALL'; wallId: string; point: { x: number; y: number }; anchor: WallDragAnchor }

function snapPoint(point: { x: number; y: number }) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

function clampDimension(value: number): number {
  return Math.min(MAX_ROOM_DIMENSION, Math.max(MIN_ROOM_DIMENSION, snapToGrid(value)))
}

function createRoomAt(point: { x: number; y: number }, rooms: Room[]): Room {
  return {
    id: uuid(),
    name: nextRoomName(rooms),
    position: snapPoint(point),
    width: DEFAULT_ROOM_WIDTH,
    depth: DEFAULT_ROOM_DEPTH,
    wallHeight: DEFAULT_WALL_HEIGHT,
    wallThickness: DEFAULT_WALL_THICKNESS,
    rotation: 0,
  }
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
    case 'ADD_ROOM': {
      const room = createRoomAt(action.point, state.plan.rooms)
      return {
        ...state,
        plan: { ...state.plan, rooms: [...state.plan.rooms, room] },
        selectedId: room.id,
        tool: 'select',
      }
    }
    case 'UPDATE_ROOM': {
      const patch = { ...action.patch }
      if (patch.width !== undefined) patch.width = clampDimension(patch.width)
      if (patch.depth !== undefined) patch.depth = clampDimension(patch.depth)
      if (patch.wallHeight !== undefined) {
        patch.wallHeight = Math.min(20, Math.max(7, snapToGrid(patch.wallHeight)))
      }
      if (patch.position) patch.position = snapPoint(patch.position)
      return {
        ...state,
        plan: {
          ...state.plan,
          rooms: state.plan.rooms.map((room) =>
            room.id === action.id ? { ...room, ...patch } : room,
          ),
        },
      }
    }
    case 'DELETE_SELECTED': {
      if (!state.selectedId) return state
      const id = state.selectedId
      const room =
        state.plan.rooms.find((r) => r.id === id) ??
        (isWallId(id) ? findRoomByWallId(state.plan.rooms, id) : undefined)

      if (!room) return { ...state, selectedId: null }

      return {
        ...state,
        selectedId: null,
        plan: {
          ...state.plan,
          rooms: state.plan.rooms.filter((r) => r.id !== room.id),
        },
      }
    }
    case 'DUPLICATE_ROOM': {
      const source = state.plan.rooms.find((r) => r.id === action.id)
      if (!source) return state
      const duplicate: Room = {
        ...source,
        id: uuid(),
        name: nextRoomName(state.plan.rooms),
        position: snapPoint({
          x: source.position.x + source.width + 1,
          y: source.position.y,
        }),
      }
      return {
        ...state,
        plan: { ...state.plan, rooms: [...state.plan.rooms, duplicate] },
        selectedId: duplicate.id,
        tool: 'select',
      }
    }
    case 'MOVE_SELECTED': {
      if (!state.selectedId) return state
      const point = snapPoint(action.point)
      const id = state.selectedId
      return {
        ...state,
        plan: {
          ...state.plan,
          rooms: state.plan.rooms.map((r) => (r.id === id ? { ...r, position: point } : r)),
        },
      }
    }
    case 'RESIZE_WALL': {
      const roomId = action.wallId.replace(/-w\d+$/, '')
      const target = state.plan.rooms.find((r) => r.id === roomId)
      if (!target) return state

      const updated = resizeRoomByWallDrag(target, action.point, action.anchor)
      return {
        ...state,
        plan: {
          ...state.plan,
          rooms: state.plan.rooms.map((r) => (r.id === roomId ? updated : r)),
        },
      }
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
  moveSelected: (point: { x: number; y: number }) => void
  resizeWall: (wallId: string, point: { x: number; y: number }, anchor: WallDragAnchor) => void
  newPlan: () => void
  selectedRoom: Room | null
  planWalls: ReturnType<typeof getPlanWalls>
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

  useEffect(() => {
    savePlan(state.plan)
  }, [state.plan])

  const planWalls = useMemo(() => getPlanWalls(state.plan.rooms), [state.plan.rooms])
  const selectedRoom = useMemo(() => {
    const direct = state.plan.rooms.find((r) => r.id === state.selectedId)
    if (direct) return direct
    if (state.selectedId && isWallId(state.selectedId)) {
      return findRoomByWallId(state.plan.rooms, state.selectedId) ?? null
    }
    return null
  }, [state.plan.rooms, state.selectedId])

  const value = useMemo<FloorPlanContextValue>(
    () => ({
      state,
      planWalls,
      selectedRoom,
      setTool: (tool) => dispatch({ type: 'SET_TOOL', tool }),
      setViewMode: (viewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }),
      setWalkMode: (walkMode) => dispatch({ type: 'SET_WALK_MODE', walkMode }),
      select: (id) => dispatch({ type: 'SELECT', id }),
      setPlan: (plan) => dispatch({ type: 'SET_PLAN', plan }),
      addRoom: (point) => dispatch({ type: 'ADD_ROOM', point }),
      updateRoom: (id, patch) => dispatch({ type: 'UPDATE_ROOM', id, patch }),
      deleteSelected: () => dispatch({ type: 'DELETE_SELECTED' }),
      duplicateRoom: (id) => dispatch({ type: 'DUPLICATE_ROOM', id }),
      moveSelected: (point) => dispatch({ type: 'MOVE_SELECTED', point }),
      resizeWall: (wallId, point, anchor) =>
        dispatch({ type: 'RESIZE_WALL', wallId, point, anchor }),
      newPlan: () => dispatch({ type: 'SET_PLAN', plan: createEmptyPlan() }),
    }),
    [state, planWalls, selectedRoom],
  )

  return <FloorPlanContext.Provider value={value}>{children}</FloorPlanContext.Provider>
}

export function useFloorPlan() {
  const ctx = useContext(FloorPlanContext)
  if (!ctx) throw new Error('useFloorPlan must be used within FloorPlanProvider')
  return ctx
}

export type { RoomPatch }
