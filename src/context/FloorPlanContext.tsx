import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  createEmptyPlan,
  type FloorPlan,
  type Room,
  type Door,
  type DoorStyle,
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
  reorderRoom,
  disconnectRoomsAtWall,
  connectRoomsAtWall,
  connectVertexCorner,
  disconnectRooms,
  disconnectWallFromVertex,
  disconnectVertexForRoom,
  findRoomByVertexId,
  findRoomByWallId,
  getRoom,
  isPlanWallId,
  isVertexId,
  lastCreatedRoom,
  moveVertex,
  resizeRoomBoundingBox,
  roomBoundingSize,
  roomCentroid,
  resolveWalls,
  rotateRoom,
  sanitizePlan,
  roomsGroupCentroid,
  translateRoom,
  translateRooms,
  updateRoomDefaults,
  type WallDragAnchor,
} from '../utils/planModel'
import {
  loadMasterNoteLocal,
  saveMasterNoteLocal,
  nextDefaultPlanName,
  type PlanSummary,
} from '../utils/storage'
import {
  createMemoryPlan,
  deleteMemoryPlan,
  getMemoryPlansSession,
  loadMemoryPlan,
  saveMemoryPlan,
  setMemoryActivePlanId,
} from '../utils/memoryPlans'
import {
  addFurnitureFromCatalog,
  deleteFurniture,
  duplicateFurniture,
  getFurniture,
  isFurnitureId,
  moveFurniture,
  rotateFurniture,
  updateFurnitureItem,
} from '../utils/furniture'
import {
  addDoorAtPoint,
  deleteDoor,
  isDoorId,
  moveDoor,
  rotateDoorSwing,
} from '../utils/doors'
import {
  loadFurnitureCatalog,
  saveFurnitureCatalog,
} from '../data/furnitureCatalog'
import type { FurnitureCatalogEntry, FurnitureItem } from '../types/furniture'
import { ROTATE_STEP_RADIANS } from '../utils/geometry'
import { snapToGrid } from '../utils/imperial'
import { useAuth } from './AuthContext'
import {
  createPlanInFirestore,
  deletePlanFromFirestore,
  loadPlanFromFirestore,
  loadPlanFromFirestoreServer,
  loadMasterNoteFromFirestore,
  loadUserPlansSession,
  listPlansFromFirestore,
  getPlanAccess,
  saveMasterNoteToFirestore,
  savePlanToFirestore,
  setActivePlanIdInFirestore,
  type PlanAccess,
} from '../services/firestorePlans'
import { listFriends, listMyPendingCollaborateRequests, sendCollaborateRequest } from '../services/firestoreFriends'
import { isFirebaseConfigured, getFirebaseProjectId } from '../lib/firebase'
import {
  logCloudError,
  parseFirebaseError,
  type CloudSyncAlert,
} from '../utils/cloudErrors'

const MAX_UNDO_HISTORY = 50

export interface FriendPlansGroup {
  ownerId: string
  ownerName: string
  plans: PlanSummary[]
}

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
  selectedRoomIds: string[]
  placementCatalogId: string | null
}

type RoomPatch = {
  name?: string
  wallHeight?: number
  wallThickness?: number
  width?: number
  depth?: number
}

type Action =
  | { type: 'SET_TOOL'; tool: Tool }
  | { type: 'SET_VIEW_MODE'; viewMode: ViewMode }
  | { type: 'SELECT'; id: string | null; additive?: boolean; preserveRoomSelection?: boolean }
  | { type: 'SET_PLAN'; plan: FloorPlan }
  | { type: 'SET_PLAN_NAME'; name: string }
  | { type: 'SET_PLAN_NOTES'; notes: string }
  | { type: 'RESTORE_PLAN'; plan: FloorPlan }
  | { type: 'ADD_ROOM'; point: { x: number; y: number } }
  | { type: 'UPDATE_ROOM'; id: string; patch: RoomPatch }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DUPLICATE_ROOM'; id: string }
  | { type: 'DUPLICATE_FURNITURE'; id: string }
  | { type: 'REORDER_ROOM'; activeId: string; overId: string }
  | { type: 'DISCONNECT_SHARED_WALL'; wallId: string }
  | { type: 'CONNECT_SHARED_WALL'; wallId: string }
  | { type: 'CONNECT_VERTEX'; vertexId: string }
  | { type: 'DISCONNECT_ROOMS'; roomId: string; otherRoomId: string }
  | { type: 'DISCONNECT_WALL_FROM_VERTEX'; wallId: string; vertexId: string }
  | { type: 'DISCONNECT_VERTEX_ROOM'; vertexId: string; roomId: string }
  | { type: 'MOVE_ROOM'; roomId: string; point: { x: number; y: number } }
  | { type: 'MOVE_ROOMS'; roomIds: string[]; point: { x: number; y: number } }
  | { type: 'RESIZE_WALL'; wallId: string; point: { x: number; y: number }; anchor: WallDragAnchor }
  | { type: 'MOVE_VERTEX'; vertexId: string; point: { x: number; y: number } }
  | { type: 'ADD_WALL'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { type: 'ADD_FURNITURE'; entry: FurnitureCatalogEntry; point: { x: number; y: number } }
  | { type: 'MOVE_FURNITURE'; id: string; point: { x: number; y: number } }
  | {
      type: 'UPDATE_FURNITURE'
      id: string
      patch: Partial<Pick<FurnitureItem, 'label' | 'width' | 'depth' | 'height'>>
    }
  | { type: 'ADD_DOOR'; point: { x: number; y: number }; style?: DoorStyle }
  | { type: 'MOVE_DOOR'; id: string; point: { x: number; y: number } }
  | { type: 'ROTATE_ROOM'; roomId: string; deltaRadians: number }
  | { type: 'ROTATE_FURNITURE'; id: string; deltaRadians: number }
  | { type: 'ROTATE_DOOR'; id: string; direction: 'cw' | 'ccw' }
  | { type: 'SET_PLACEMENT_CATALOG_ID'; catalogId: string | null }
  | { type: 'FINISH_GEOMETRY_EDIT' }

const PLAN_UNDO_ACTIONS = new Set<Action['type']>([
  'SET_PLAN',
  'ADD_ROOM',
  'UPDATE_ROOM',
  'DELETE_SELECTED',
  'DUPLICATE_ROOM',
  'DUPLICATE_FURNITURE',
  'REORDER_ROOM',
  'DISCONNECT_SHARED_WALL',
  'CONNECT_SHARED_WALL',
  'CONNECT_VERTEX',
  'DISCONNECT_ROOMS',
  'DISCONNECT_WALL_FROM_VERTEX',
  'DISCONNECT_VERTEX_ROOM',
  'MOVE_ROOM',
  'MOVE_ROOMS',
  'RESIZE_WALL',
  'MOVE_VERTEX',
  'ADD_WALL',
  'ADD_FURNITURE',
  'MOVE_FURNITURE',
  'UPDATE_FURNITURE',
  'ADD_DOOR',
  'MOVE_DOOR',
  'ROTATE_ROOM',
  'ROTATE_FURNITURE',
  'ROTATE_DOOR',
])

const CONTINUOUS_UNDO_ACTIONS = new Set<Action['type']>([
  'MOVE_ROOM',
  'MOVE_ROOMS',
  'RESIZE_WALL',
  'MOVE_VERTEX',
  'MOVE_FURNITURE',
  'MOVE_DOOR',
])

const CLOUD_SAVE_CHANGE_ACTIONS = new Set<Action['type']>([
  ...PLAN_UNDO_ACTIONS,
  'SET_PLAN_NAME',
  'SET_PLAN_NOTES',
])

function snapPoint(point: { x: number; y: number }) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

function isRoomId(plan: FloorPlan, id: string) {
  return plan.rooms.some((r) => r.id === id)
}

function applySelect(
  state: EditorState,
  id: string | null,
  additive?: boolean,
  preserveRoomSelection?: boolean,
): EditorState {
  if (id === null) {
    return { ...state, selectedId: null, selectedRoomIds: [] }
  }
  if (isRoomId(state.plan, id)) {
    if (additive) {
      const selectedRoomIds = state.selectedRoomIds.includes(id)
        ? state.selectedRoomIds.filter((rid) => rid !== id)
        : [...state.selectedRoomIds, id]
      return { ...state, selectedId: id, selectedRoomIds }
    }
    if (preserveRoomSelection && state.selectedRoomIds.includes(id)) {
      return { ...state, selectedId: id }
    }
    return { ...state, selectedId: id, selectedRoomIds: [id] }
  }
  return { ...state, selectedId: id, selectedRoomIds: [] }
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode }
    case 'SELECT':
      return applySelect(state, action.id, action.additive, action.preserveRoomSelection)
    case 'SET_PLAN':
      return { ...state, plan: action.plan, selectedId: null, selectedRoomIds: [] }
    case 'SET_PLAN_NAME':
      return { ...state, plan: { ...state.plan, name: action.name } }
    case 'SET_PLAN_NOTES':
      return { ...state, plan: { ...state.plan, notes: action.notes } }
    case 'RESTORE_PLAN':
      return { ...state, plan: action.plan }
    case 'ADD_ROOM': {
      const plan = createRectangleRoomAt(state.plan, snapPoint(action.point))
      const room = lastCreatedRoom(plan)
      return {
        ...state,
        plan,
        selectedId: room?.id ?? null,
        selectedRoomIds: room ? [room.id] : [],
        tool: 'select',
      }
    }
    case 'UPDATE_ROOM': {
      const { width, depth, ...meta } = action.patch
      let plan = state.plan
      if (width !== undefined || depth !== undefined) {
        const room = getRoom(plan, action.id)
        if (room) {
          const size = roomBoundingSize(plan, room)
          plan = resizeRoomBoundingBox(
            plan,
            action.id,
            width ?? size.width,
            depth ?? size.depth,
          )
        }
      }
      return {
        ...state,
        plan: updateRoomDefaults(plan, action.id, meta),
      }
    }
    case 'DELETE_SELECTED': {
      if (!state.selectedId) return state
      const id = state.selectedId
      let nextState: EditorState
      if (isFurnitureId(state.plan, id)) {
        nextState = {
          ...state,
          selectedId: null,
          selectedRoomIds: [],
          plan: deleteFurniture(state.plan, id),
        }
      } else if (isDoorId(state.plan, id)) {
        nextState = {
          ...state,
          selectedId: null,
          selectedRoomIds: [],
          plan: deleteDoor(state.plan, id),
        }
      } else if (isPlanWallId(state.plan, id)) {
        nextState = {
          ...state,
          selectedId: null,
          selectedRoomIds: [],
          plan: deleteWall(state.plan, id),
        }
      } else {
        const room =
          state.plan.rooms.find((r) => r.id === id) ??
          findRoomByWallId(state.plan, id) ??
          findRoomByVertexId(state.plan, id)
        if (!room) return { ...state, selectedId: null, selectedRoomIds: [] }
        nextState = {
          ...state,
          selectedId: null,
          selectedRoomIds: [],
          plan: deleteRoom(state.plan, room.id),
        }
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
        selectedRoomIds: room ? [room.id] : [],
        tool: 'select',
      }
    }
    case 'DUPLICATE_FURNITURE': {
      const { plan, newId } = duplicateFurniture(state.plan, action.id)
      if (!newId) return state
      return {
        ...state,
        plan,
        selectedId: newId,
        selectedRoomIds: [],
        tool: 'select',
      }
    }
    case 'REORDER_ROOM': {
      return {
        ...state,
        plan: reorderRoom(state.plan, action.activeId, action.overId),
      }
    }
    case 'DISCONNECT_SHARED_WALL': {
      const plan = disconnectRoomsAtWall(state.plan, action.wallId)
      if (plan === state.plan) return state
      return { ...state, plan }
    }
    case 'CONNECT_SHARED_WALL': {
      const plan = connectRoomsAtWall(state.plan, action.wallId)
      if (plan === state.plan) return state
      return { ...state, plan }
    }
    case 'CONNECT_VERTEX': {
      const plan = connectVertexCorner(state.plan, action.vertexId)
      if (plan === state.plan) return state
      return { ...state, plan }
    }
    case 'DISCONNECT_ROOMS': {
      const plan = disconnectRooms(state.plan, action.roomId, action.otherRoomId)
      if (plan === state.plan) return state
      return { ...state, plan }
    }
    case 'DISCONNECT_WALL_FROM_VERTEX': {
      const plan = disconnectWallFromVertex(state.plan, action.wallId, action.vertexId)
      if (plan === state.plan) return state
      return { ...state, plan }
    }
    case 'DISCONNECT_VERTEX_ROOM': {
      const plan = disconnectVertexForRoom(state.plan, action.vertexId, action.roomId)
      if (plan === state.plan) return state
      return { ...state, plan }
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
    case 'MOVE_ROOMS': {
      const roomIds = action.roomIds.filter((id) => state.plan.rooms.some((r) => r.id === id))
      if (roomIds.length === 0) return state
      const target = snapPoint(action.point)
      const center = roomsGroupCentroid(state.plan, roomIds)
      const delta = { x: target.x - center.x, y: target.y - center.y }
      return {
        ...state,
        plan: translateRooms(state.plan, roomIds, delta),
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
        selectedRoomIds: [],
        tool: 'select',
      }
    }
    case 'ADD_FURNITURE': {
      const plan = addFurnitureFromCatalog(state.plan, action.entry, snapPoint(action.point))
      const item = plan.furniture[plan.furniture.length - 1]
      return {
        ...state,
        plan,
        selectedId: item?.id ?? state.selectedId,
        selectedRoomIds: [],
        placementCatalogId: null,
        tool: 'select',
      }
    }
    case 'MOVE_FURNITURE': {
      return {
        ...state,
        plan: moveFurniture(state.plan, action.id, snapPoint(action.point)),
      }
    }
    case 'UPDATE_FURNITURE': {
      return {
        ...state,
        plan: updateFurnitureItem(state.plan, action.id, action.patch),
      }
    }
    case 'ADD_DOOR': {
      const walls = resolveWalls(state.plan)
      const before = state.plan.doors.length
      const plan = addDoorAtPoint(state.plan, walls, action.point, {
        style: action.style,
      })
      if (plan.doors.length === before) return state
      const door = plan.doors[plan.doors.length - 1]
      return {
        ...state,
        plan,
        selectedId: door.id,
        selectedRoomIds: [],
        tool: 'select',
      }
    }
    case 'MOVE_DOOR': {
      return {
        ...state,
        plan: moveDoor(state.plan, resolveWalls(state.plan), action.id, action.point),
      }
    }
    case 'ROTATE_ROOM': {
      return {
        ...state,
        plan: rotateRoom(state.plan, action.roomId, action.deltaRadians),
      }
    }
    case 'ROTATE_FURNITURE': {
      return {
        ...state,
        plan: rotateFurniture(state.plan, action.id, action.deltaRadians),
      }
    }
    case 'ROTATE_DOOR': {
      return {
        ...state,
        plan: rotateDoorSwing(state.plan, action.id, action.direction),
      }
    }
    case 'SET_PLACEMENT_CATALOG_ID': {
      return { ...state, placementCatalogId: action.catalogId, tool: 'select' }
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
  planSummaries: PlanSummary[]
  activePlanId: string | null
  setTool: (tool: Tool) => void
  setViewMode: (mode: ViewMode) => void
  select: (id: string | null, options?: { additive?: boolean; preserveRoomSelection?: boolean }) => void
  setPlan: (plan: FloorPlan) => void
  setPlanName: (name: string) => void
  setPlanNotes: (notes: string) => void
  masterNote: string
  setMasterNote: (note: string) => void
  furnitureCatalog: FurnitureCatalogEntry[]
  updateCatalogEntry: (
    id: string,
    patch: Partial<Pick<FurnitureCatalogEntry, 'label' | 'width' | 'depth' | 'height'>>,
  ) => void
  placementCatalogId: string | null
  setPlacementCatalogId: (catalogId: string | null) => void
  placeFurniture: (catalogId: string, point: { x: number; y: number }) => void
  moveFurnitureOnPlan: (id: string, point: { x: number; y: number }) => void
  updateFurniture: (
    id: string,
    patch: Partial<Pick<FurnitureItem, 'label' | 'width' | 'depth' | 'height'>>,
  ) => void
  addDoor: (point: { x: number; y: number }, style?: DoorStyle) => void
  moveDoorOnPlan: (id: string, point: { x: number; y: number }) => void
  rotateSelected: (direction: 'cw' | 'ccw') => void
  addRoom: (point: { x: number; y: number }) => void
  updateRoom: (id: string, patch: RoomPatch) => void
  deleteSelected: () => void
  duplicateRoom: (id: string) => void
  duplicateFurniture: (id: string) => void
  reorderRoomInList: (activeId: string, overId: string) => void
  disconnectSharedWall: (wallId: string) => void
  connectSharedWall: (wallId: string) => void
  connectCorner: (vertexId: string) => void
  disconnectFromRoom: (roomId: string, otherRoomId: string) => void
  disconnectWallFromCorner: (wallId: string, vertexId: string) => void
  disconnectCornerFromRoom: (vertexId: string, roomId: string) => void
  moveRoom: (roomId: string, point: { x: number; y: number }) => void
  moveRooms: (roomIds: string[], point: { x: number; y: number }) => void
  resizeWall: (wallId: string, point: { x: number; y: number }, anchor: WallDragAnchor) => void
  moveVertex: (vertexId: string, point: { x: number; y: number }) => void
  addWall: (start: { x: number; y: number }, end: { x: number; y: number }) => void
  finishGeometryEdit: () => void
  createNewPlan: () => Promise<void>
  switchPlan: (planId: string) => Promise<void>
  openFriendPlan: (ownerId: string, planId: string) => Promise<void>
  refreshFriendPlans: () => Promise<void>
  deleteCurrentPlan: () => Promise<void>
  recordUndoSnapshot: () => void
  undo: () => void
  selectedRoom: Room | null
  selectedRoomIds: string[]
  selectedRooms: Room[]
  selectedFurniture: FurnitureItem | null
  selectedDoor: Door | null
  planWalls: ReturnType<typeof resolveWalls>
  planReady: boolean
  cloudAlert: CloudSyncAlert | null
  firebaseProjectId: string | null
  cloudSyncActive: boolean
  unsavedCloudChanges: number
  cloudSaveInFlight: boolean
  forceCloudSave: () => Promise<boolean>
  planOwnerId: string | null
  planOwnerName: string | null
  planAccess: PlanAccess
  readOnlyMode: boolean
  friendPlansGroups: FriendPlansGroup[]
  requestCollaborateOnCurrentPlan: () => Promise<void>
  pendingCollaborateOnCurrentPlan: boolean
}

const FloorPlanContext = createContext<FloorPlanContextValue | null>(null)

export function FloorPlanProvider({ children }: { children: ReactNode }) {
  const { user, authReady } = useAuth()
  const [planReady, setPlanReady] = useState(false)
  const [planSummaries, setPlanSummaries] = useState<PlanSummary[]>([])
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const [masterNote, setMasterNoteState] = useState(() => loadMasterNoteLocal())
  const [state, dispatch] = useReducer(reducer, {
    plan: createEmptyPlan(),
    tool: 'select',
    viewMode: 'plan2d',
    selectedId: null,
    selectedRoomIds: [],
    placementCatalogId: null,
  })
  const [furnitureCatalog, setFurnitureCatalogState] = useState<FurnitureCatalogEntry[]>(
    () => loadFurnitureCatalog(),
  )
  const [cloudAlert, setCloudAlert] = useState<CloudSyncAlert | null>(null)
  const [unsavedCloudChanges, setUnsavedCloudChanges] = useState(0)
  const [cloudSaveInFlight, setCloudSaveInFlight] = useState(false)
  const [planOwnerId, setPlanOwnerId] = useState<string | null>(null)
  const [planOwnerName, setPlanOwnerName] = useState<string | null>(null)
  const [planAccess, setPlanAccess] = useState<PlanAccess>('owner')
  const [friendPlansGroups, setFriendPlansGroups] = useState<FriendPlansGroup[]>([])
  const [pendingCollaborateOnCurrentPlan, setPendingCollaborateOnCurrentPlan] = useState(false)

  const readOnlyMode = planAccess === 'view'
  const cloudSyncActive = Boolean(
    user &&
      isFirebaseConfigured() &&
      (planAccess === 'owner' || planAccess === 'edit'),
  )

  const reportCloudError = useCallback(
    (
      operation: CloudSyncAlert['operation'],
      message: string,
      err?: unknown,
      planId?: string,
    ) => {
      const parsed = err !== undefined ? parseFirebaseError(err) : undefined
      if (err !== undefined) {
        logCloudError(operation, err, { planId })
      }
      setCloudAlert({
        operation,
        message,
        firebaseCode: parsed?.code,
        firebaseMessage: parsed?.message,
        timestamp: Date.now(),
        planId,
      })
    },
    [],
  )

  const undoStackRef = useRef<FloorPlan[]>([])
  const redoStackRef = useRef<FloorPlan[]>([])
  const planRef = useRef(state.plan)
  planRef.current = state.plan
  const activePlanIdRef = useRef<string | null>(null)
  activePlanIdRef.current = activePlanId
  const masterNoteCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextCloudSaveRef = useRef(false)
  const consecutiveSaveFailuresRef = useRef(0)
  const saveGenerationRef = useRef(0)
  const planSummariesRef = useRef(planSummaries)
  planSummariesRef.current = planSummaries
  const planOwnerIdRef = useRef<string | null>(null)
  planOwnerIdRef.current = planOwnerId
  const continuousGestureRef = useRef(false)

  const resetUnsavedCloudChanges = useCallback(() => {
    setUnsavedCloudChanges(0)
  }, [])

  const bumpUnsavedCloudChanges = useCallback(() => {
    if (!user || !isFirebaseConfigured()) return
    setUnsavedCloudChanges((count) => count + 1)
  }, [user])

  const persistPlanToCloud = useCallback(
    async (
      plan: FloorPlan,
      planId: string,
      options?: { force?: boolean },
    ): Promise<boolean> => {
      if (!user || !planId || !isFirebaseConfigured()) return true

      const ownerId = planOwnerIdRef.current ?? user.uid
      const generation = ++saveGenerationRef.current
      setCloudSaveInFlight(true)
      try {
        await savePlanToFirestore(ownerId, planId, plan)
        if (generation === saveGenerationRef.current) {
          consecutiveSaveFailuresRef.current = 0
          setCloudAlert(null)
          resetUnsavedCloudChanges()
        }
        return true
      } catch (err) {
        if (generation === saveGenerationRef.current) {
          consecutiveSaveFailuresRef.current += 1
          if (options?.force || consecutiveSaveFailuresRef.current >= 2) {
            reportCloudError(
              'save',
              options?.force
                ? 'Force save failed — your plan could not be saved to the cloud.'
                : 'Your last two changes could not be saved to the cloud.',
              err,
              planId,
            )
          }
        }
        return false
      } finally {
        if (generation === saveGenerationRef.current) {
          setCloudSaveInFlight(false)
        }
      }
    },
    [user, reportCloudError, resetUnsavedCloudChanges],
  )

  const flushCloudSave = useCallback(async () => {
    const planId = activePlanIdRef.current
    if (!planId) return false
    return await persistPlanToCloud(planRef.current, planId)
  }, [persistPlanToCloud])

  const forceCloudSave = useCallback(async (): Promise<boolean> => {
    const planId = activePlanIdRef.current
    if (!user || !planId || !isFirebaseConfigured()) return false
    return await persistPlanToCloud(planRef.current, planId, { force: true })
  }, [user, persistPlanToCloud])

  const resetUndoStacks = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
  }, [])

  const setMasterNote = useCallback(
    (note: string) => {
      setMasterNoteState(note)
      saveMasterNoteLocal(note)
      if (!user || !isFirebaseConfigured()) return

      if (masterNoteCloudSaveTimerRef.current) {
        clearTimeout(masterNoteCloudSaveTimerRef.current)
      }
      masterNoteCloudSaveTimerRef.current = setTimeout(() => {
        saveMasterNoteToFirestore(user.uid, note).catch(() => {})
      }, 1500)
    },
    [user],
  )

  useEffect(() => {
    if (!authReady) return

    let cancelled = false

    async function loadMasterNote() {
      const localNote = loadMasterNoteLocal()
      if (!cancelled) setMasterNoteState(localNote)

      if (!user || !isFirebaseConfigured()) return

      try {
        const cloudNote = await loadMasterNoteFromFirestore(user.uid)
        if (!cancelled) {
          setMasterNoteState(cloudNote)
          saveMasterNoteLocal(cloudNote)
        }
      } catch {
        // Keep local copy.
      }
    }

    loadMasterNote()
    return () => {
      cancelled = true
    }
  }, [user, authReady])

  useEffect(() => {
    if (!authReady) return

    let cancelled = false

    async function loadInitialPlan() {
      setPlanReady(false)

      try {
        if (user && isFirebaseConfigured()) {
          const session = await loadUserPlansSession(user.uid)
          if (cancelled) return
          consecutiveSaveFailuresRef.current = 0
          saveGenerationRef.current = 0
          setCloudAlert(null)
          resetUnsavedCloudChanges()
          continuousGestureRef.current = false
          skipNextCloudSaveRef.current = true
          setPlanSummaries(session.plans)
          setActivePlanId(session.activePlanId)
          setPlanOwnerId(user.uid)
          setPlanOwnerName(null)
          setPlanAccess('owner')
          setPendingCollaborateOnCurrentPlan(false)
          dispatch({ type: 'SET_PLAN', plan: session.plan })
        } else {
          const session = getMemoryPlansSession()
          if (cancelled) return
          resetUnsavedCloudChanges()
          continuousGestureRef.current = false
          skipNextCloudSaveRef.current = true
          setPlanSummaries(session.plans)
          setActivePlanId(session.activePlanId)
          setPlanOwnerId(null)
          setPlanOwnerName(null)
          setPlanAccess('owner')
          setPendingCollaborateOnCurrentPlan(false)
          dispatch({ type: 'SET_PLAN', plan: session.plan })
        }
        resetUndoStacks()
      } catch (err) {
        if (!cancelled && user && isFirebaseConfigured()) {
          reportCloudError(
            'load-session',
            'Could not load plans from the cloud.',
            err,
          )
          setPlanReady(true)
          return
        }
        if (!cancelled) {
          const session = getMemoryPlansSession()
          resetUnsavedCloudChanges()
          continuousGestureRef.current = false
          skipNextCloudSaveRef.current = true
          setPlanSummaries(session.plans)
          setActivePlanId(session.activePlanId)
          dispatch({ type: 'SET_PLAN', plan: session.plan })
        }
      }

      if (!cancelled) setPlanReady(true)
    }

    loadInitialPlan()
    return () => {
      cancelled = true
    }
  }, [user, authReady, resetUndoStacks, reportCloudError, resetUnsavedCloudChanges])

  const recordUndoSnapshot = useCallback(() => {
    undoStackRef.current.push(clonePlan(planRef.current))
    redoStackRef.current = []
    if (undoStackRef.current.length > MAX_UNDO_HISTORY) {
      undoStackRef.current.shift()
    }
  }, [])

  const dispatchAction = useCallback(
    (action: Action) => {
      if (readOnlyMode) return
      if (cloudSyncActive && CLOUD_SAVE_CHANGE_ACTIONS.has(action.type)) {
        if (CONTINUOUS_UNDO_ACTIONS.has(action.type)) {
          if (!continuousGestureRef.current) {
            continuousGestureRef.current = true
            bumpUnsavedCloudChanges()
          }
        } else {
          continuousGestureRef.current = false
          bumpUnsavedCloudChanges()
        }
      }
      if (PLAN_UNDO_ACTIONS.has(action.type) && !CONTINUOUS_UNDO_ACTIONS.has(action.type)) {
        recordUndoSnapshot()
      }
      dispatch(action)
    },
    [readOnlyMode, cloudSyncActive, bumpUnsavedCloudChanges, recordUndoSnapshot],
  )

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const previous = stack.pop()!
    redoStackRef.current.push(clonePlan(planRef.current))
    continuousGestureRef.current = false
    bumpUnsavedCloudChanges()
    dispatch({ type: 'RESTORE_PLAN', plan: previous })
  }, [bumpUnsavedCloudChanges])

  useEffect(() => {
    if (!planReady || !activePlanId) return

    if (planAccess === 'owner' && planOwnerId === user?.uid) {
      setPlanSummaries((prev) =>
        prev.map((p) => (p.id === activePlanId ? { ...p, name: state.plan.name } : p)),
      )
    }

    if (!user || !isFirebaseConfigured()) {
      saveMemoryPlan(activePlanId, state.plan)
      return
    }

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false
      resetUnsavedCloudChanges()
      continuousGestureRef.current = false
      return
    }

    persistPlanToCloud(planRef.current, activePlanId)
  }, [state.plan, user, planReady, activePlanId, planAccess, planOwnerId, persistPlanToCloud, resetUnsavedCloudChanges])

  useEffect(() => {
    const onPageHide = () => {
      const planId = activePlanIdRef.current
      const uid = user?.uid
      const ownerId = planOwnerIdRef.current
      if (!planId || !uid || !ownerId || !isFirebaseConfigured()) return
      if (planAccess !== 'owner' && planAccess !== 'edit') return
      savePlanToFirestore(ownerId, planId, planRef.current).catch(() => {})
    }

    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [user, planAccess])

  useEffect(() => {
    return () => {
      if (masterNoteCloudSaveTimerRef.current) clearTimeout(masterNoteCloudSaveTimerRef.current)
    }
  }, [])

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
        continuousGestureRef.current = false
        bumpUnsavedCloudChanges()
        dispatch({ type: 'RESTORE_PLAN', plan: next })
      } else {
        undo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, bumpUnsavedCloudChanges])

  const planWalls = useMemo(() => resolveWalls(state.plan), [state.plan])
  const selectedRoomIds = state.selectedRoomIds
  const selectedRooms = useMemo(
    () =>
      selectedRoomIds
        .map((id) => getRoom(state.plan, id))
        .filter((room): room is Room => room !== undefined),
    [state.plan, selectedRoomIds],
  )
  const selectedRoom = useMemo(() => {
    const direct = state.plan.rooms.find((r) => r.id === state.selectedId)
    if (direct) return direct
    if (state.selectedRoomIds.length > 0) {
      return getRoom(state.plan, state.selectedRoomIds[0]) ?? null
    }
    if (state.selectedId && isPlanWallId(state.plan, state.selectedId)) {
      return findRoomByWallId(state.plan, state.selectedId) ?? null
    }
    if (state.selectedId && isVertexId(state.plan, state.selectedId)) {
      return findRoomByVertexId(state.plan, state.selectedId) ?? null
    }
    return null
  }, [state.plan, state.selectedId, state.selectedRoomIds])

  const selectedFurniture = useMemo(() => {
    if (!state.selectedId || !isFurnitureId(state.plan, state.selectedId)) return null
    return getFurniture(state.plan, state.selectedId) ?? null
  }, [state.plan, state.selectedId])

  const selectedDoor = useMemo(() => {
    if (!state.selectedId || !isDoorId(state.plan, state.selectedId)) return null
    return state.plan.doors.find((d) => d.id === state.selectedId) ?? null
  }, [state.plan, state.selectedId])

  const createNewPlan = useCallback(async () => {
    try {
      await flushCloudSave()
    } catch {
      // Don't block creating a new plan if the current one fails to save.
    }

    const summaries = planSummariesRef.current
    const name = nextDefaultPlanName(summaries)
    const plan = createEmptyPlan(name)
    let planId: string | null = null

    if (user && isFirebaseConfigured()) {
      try {
        planId = await createPlanInFirestore(user.uid, plan)
      } catch {
        planId = null
      }
    }

    if (!planId) {
      planId = createMemoryPlan(plan)
    }

    skipNextCloudSaveRef.current = true
    resetUnsavedCloudChanges()
    continuousGestureRef.current = false
    setPlanSummaries((prev) =>
      prev.some((p) => p.id === planId) ? prev : [...prev, { id: planId!, name: plan.name }],
    )
    setActivePlanId(planId)
    setPlanOwnerId(user?.uid ?? null)
    setPlanOwnerName(null)
    setPlanAccess('owner')
    setPendingCollaborateOnCurrentPlan(false)
    dispatch({ type: 'SET_PLAN', plan })
    resetUndoStacks()
  }, [flushCloudSave, user, resetUndoStacks, resetUnsavedCloudChanges])

  const switchPlan = useCallback(
    async (planId: string) => {
      if (!planId) return

      const currentId = activePlanIdRef.current
      if (planId !== currentId) {
        try {
          await flushCloudSave()
        } catch {
          // Continue switching even if saving the current plan fails.
        }
      }

      let plan: FloorPlan | null = null

      if (user && isFirebaseConfigured()) {
        try {
          plan = await loadPlanFromFirestoreServer(user.uid, planId)
          if (!plan) {
            setCloudAlert({
              operation: 'missing-plan',
              message: 'That plan was not found in the cloud.',
              timestamp: Date.now(),
              planId,
            })
            plan = createEmptyPlan(
              planSummariesRef.current.find((p) => p.id === planId)?.name ?? 'Untitled',
            )
          } else {
            setCloudAlert(null)
          }
          await setActivePlanIdInFirestore(user.uid, planId)
        } catch (err) {
          reportCloudError('switch-plan', 'Could not load that plan from the cloud.', err, planId)
          return
        }
      } else {
        plan = loadMemoryPlan(planId)
        setMemoryActivePlanId(planId)
      }

      skipNextCloudSaveRef.current = true
      resetUnsavedCloudChanges()
      continuousGestureRef.current = false
      setActivePlanId(planId)
      setPlanOwnerId(user?.uid ?? null)
      setPlanOwnerName(null)
      setPlanAccess('owner')
      setPendingCollaborateOnCurrentPlan(false)
      dispatch({
        type: 'SET_PLAN',
        plan: plan ?? createEmptyPlan(planSummariesRef.current.find((p) => p.id === planId)?.name),
      })
      resetUndoStacks()
    },
    [flushCloudSave, user, resetUndoStacks, reportCloudError, resetUnsavedCloudChanges],
  )

  const refreshFriendPlans = useCallback(async () => {
    if (!user || !isFirebaseConfigured()) {
      setFriendPlansGroups([])
      return
    }

    try {
      const friends = await listFriends(user.uid)
      const groups = await Promise.all(
        friends.map(async (friend) => {
          const plans = await listPlansFromFirestore(friend.friendUid)
          const withAccess = await Promise.all(
            plans.map(async (p) => {
              const access = await getPlanAccess(friend.friendUid, p.id, user.uid)
              return {
                ...p,
                ownerId: friend.friendUid,
                ownerName: friend.friendDisplayName,
                access: access ?? 'view',
              }
            }),
          )
          return {
            ownerId: friend.friendUid,
            ownerName: friend.friendDisplayName,
            plans: withAccess,
          }
        }),
      )
      setFriendPlansGroups(groups)
    } catch {
      setFriendPlansGroups([])
    }
  }, [user])

  const openFriendPlan = useCallback(
    async (ownerId: string, planId: string) => {
      if (!user || !isFirebaseConfigured()) return

      const currentId = activePlanIdRef.current
      if (planId !== currentId) {
        try {
          await flushCloudSave()
        } catch {
          // Continue switching even if saving fails.
        }
      }

      try {
        const access = await getPlanAccess(ownerId, planId, user.uid)
        if (!access || access === 'owner') return

        const plan = await loadPlanFromFirestoreServer(ownerId, planId)
        if (!plan) {
          reportCloudError('switch-plan', 'Could not load that shared plan.', undefined, planId)
          return
        }

        const ownerGroup = friendPlansGroups.find((g) => g.ownerId === ownerId)
        const ownerName = ownerGroup?.ownerName ?? 'Friend'

        const pending = await listMyPendingCollaborateRequests(ownerId, user.uid)
        const hasPending = pending.some((r) => r.planId === planId)

        skipNextCloudSaveRef.current = true
        resetUnsavedCloudChanges()
        continuousGestureRef.current = false
        setActivePlanId(planId)
        setPlanOwnerId(ownerId)
        setPlanOwnerName(ownerName)
        setPlanAccess(access)
        setPendingCollaborateOnCurrentPlan(hasPending)
        setCloudAlert(null)
        dispatch({ type: 'SET_PLAN', plan })
        resetUndoStacks()
      } catch (err) {
        reportCloudError('switch-plan', 'Could not open that shared plan.', err, planId)
      }
    },
    [
      user,
      flushCloudSave,
      friendPlansGroups,
      resetUnsavedCloudChanges,
      reportCloudError,
      resetUndoStacks,
    ],
  )

  const requestCollaborateOnCurrentPlan = useCallback(async () => {
    if (!user || !planOwnerId || !activePlanId || planAccess !== 'view') return

    await sendCollaborateRequest(
      planOwnerId,
      activePlanId,
      state.plan.name,
      user.uid,
      user.displayName ?? user.email ?? 'User',
    )
    setPendingCollaborateOnCurrentPlan(true)
  }, [user, planOwnerId, activePlanId, planAccess, state.plan.name])

  useEffect(() => {
    if (user && isFirebaseConfigured()) {
      refreshFriendPlans()
    } else {
      setFriendPlansGroups([])
    }
  }, [user, refreshFriendPlans])

  const deleteCurrentPlan = useCallback(async () => {
    if (planAccess !== 'owner') return
    const currentId = activePlanIdRef.current
    const summaries = planSummariesRef.current
    if (!currentId || summaries.length <= 1) return

    try {
      await flushCloudSave()
    } catch {
      // Continue even if saving the current plan fails.
    }

    const remaining = summaries.filter((p) => p.id !== currentId)
    const nextId = remaining[0]?.id
    if (!nextId) return

    if (user && isFirebaseConfigured()) {
      try {
        await deletePlanFromFirestore(user.uid, currentId)
        await setActivePlanIdInFirestore(user.uid, nextId)
      } catch (err) {
        reportCloudError('delete-plan', 'Could not delete that plan in the cloud.', err, currentId)
        return
      }
    } else {
      deleteMemoryPlan(currentId)
    }

    let plan: FloorPlan | null = loadMemoryPlan(nextId)
    if (!plan && user && isFirebaseConfigured()) {
      try {
        plan = await loadPlanFromFirestore(user.uid, nextId)
      } catch {
        plan = null
      }
    }

    skipNextCloudSaveRef.current = true
    resetUnsavedCloudChanges()
    continuousGestureRef.current = false
    setPlanSummaries(remaining)
    setActivePlanId(nextId)
    if (!user || !isFirebaseConfigured()) {
      setMemoryActivePlanId(nextId)
    }
    dispatch({ type: 'SET_PLAN', plan: plan ?? createEmptyPlan(remaining[0].name) })
    resetUndoStacks()
  }, [flushCloudSave, user, resetUndoStacks, resetUnsavedCloudChanges])

  const updateCatalogEntry = useCallback(
    (
      id: string,
      patch: Partial<Pick<FurnitureCatalogEntry, 'label' | 'width' | 'depth' | 'height'>>,
    ) => {
      setFurnitureCatalogState((prev) => {
        const next = prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry))
        saveFurnitureCatalog(next)
        return next
      })
    },
    [],
  )

  const setPlacementCatalogId = useCallback((catalogId: string | null) => {
    dispatch({ type: 'SET_PLACEMENT_CATALOG_ID', catalogId })
  }, [])

  const placeFurniture = useCallback(
    (catalogId: string, point: { x: number; y: number }) => {
      const entry = furnitureCatalog.find((e) => e.id === catalogId)
      if (!entry) return
      dispatchAction({ type: 'ADD_FURNITURE', entry, point })
    },
    [furnitureCatalog, dispatchAction],
  )

  const moveFurnitureOnPlan = useCallback(
    (id: string, point: { x: number; y: number }) => {
      dispatchAction({ type: 'MOVE_FURNITURE', id, point })
    },
    [dispatchAction],
  )

  const addDoor = useCallback(
    (point: { x: number; y: number }, style?: DoorStyle) => {
      dispatchAction({ type: 'ADD_DOOR', point, style })
    },
    [dispatchAction],
  )

  const moveDoorOnPlan = useCallback(
    (id: string, point: { x: number; y: number }) => {
      dispatchAction({ type: 'MOVE_DOOR', id, point })
    },
    [dispatchAction],
  )

  const rotateSelected = useCallback(
    (direction: 'cw' | 'ccw') => {
      if (state.selectedId && isDoorId(state.plan, state.selectedId)) {
        dispatchAction({ type: 'ROTATE_DOOR', id: state.selectedId, direction })
        return
      }
      const delta = direction === 'cw' ? ROTATE_STEP_RADIANS : -ROTATE_STEP_RADIANS
      if (state.selectedId && isFurnitureId(state.plan, state.selectedId)) {
        dispatchAction({ type: 'ROTATE_FURNITURE', id: state.selectedId, deltaRadians: delta })
        return
      }
      const room =
        state.plan.rooms.find((r) => r.id === state.selectedId) ??
        (state.selectedId && isPlanWallId(state.plan, state.selectedId)
          ? findRoomByWallId(state.plan, state.selectedId)
          : null) ??
        (state.selectedId && isVertexId(state.plan, state.selectedId)
          ? findRoomByVertexId(state.plan, state.selectedId)
          : null)
      if (room) {
        dispatchAction({ type: 'ROTATE_ROOM', roomId: room.id, deltaRadians: delta })
      }
    },
    [state.plan, state.selectedId, dispatchAction],
  )

  const value = useMemo<FloorPlanContextValue>(
    () => ({
      state,
      planSummaries,
      activePlanId,
      setTool: (tool) => dispatch({ type: 'SET_TOOL', tool }),
      setViewMode: (viewMode) => dispatch({ type: 'SET_VIEW_MODE', viewMode }),
      select: (id, options) =>
        dispatch({
          type: 'SELECT',
          id,
          additive: options?.additive,
          preserveRoomSelection: options?.preserveRoomSelection,
        }),
      setPlan: (plan) => dispatchAction({ type: 'SET_PLAN', plan }),
      setPlanName: (name) => dispatchAction({ type: 'SET_PLAN_NAME', name }),
      setPlanNotes: (notes) => dispatchAction({ type: 'SET_PLAN_NOTES', notes }),
      masterNote,
      setMasterNote,
      furnitureCatalog,
      updateCatalogEntry,
      placementCatalogId: state.placementCatalogId,
      setPlacementCatalogId,
      placeFurniture,
      moveFurnitureOnPlan,
      updateFurniture: (id, patch) => dispatchAction({ type: 'UPDATE_FURNITURE', id, patch }),
      addDoor,
      moveDoorOnPlan,
      rotateSelected,
      addRoom: (point) => dispatchAction({ type: 'ADD_ROOM', point }),
      updateRoom: (id, patch) => dispatchAction({ type: 'UPDATE_ROOM', id, patch }),
      deleteSelected: () => dispatchAction({ type: 'DELETE_SELECTED' }),
      duplicateRoom: (id) => dispatchAction({ type: 'DUPLICATE_ROOM', id }),
      duplicateFurniture: (id) => dispatchAction({ type: 'DUPLICATE_FURNITURE', id }),
      reorderRoomInList: (activeId, overId) =>
        dispatchAction({ type: 'REORDER_ROOM', activeId, overId }),
      disconnectSharedWall: (wallId) =>
        dispatchAction({ type: 'DISCONNECT_SHARED_WALL', wallId }),
      connectSharedWall: (wallId) =>
        dispatchAction({ type: 'CONNECT_SHARED_WALL', wallId }),
      connectCorner: (vertexId) => dispatchAction({ type: 'CONNECT_VERTEX', vertexId }),
      disconnectFromRoom: (roomId, otherRoomId) =>
        dispatchAction({ type: 'DISCONNECT_ROOMS', roomId, otherRoomId }),
      disconnectWallFromCorner: (wallId, vertexId) =>
        dispatchAction({ type: 'DISCONNECT_WALL_FROM_VERTEX', wallId, vertexId }),
      disconnectCornerFromRoom: (vertexId, roomId) =>
        dispatchAction({ type: 'DISCONNECT_VERTEX_ROOM', vertexId, roomId }),
      moveRoom: (roomId, point) => dispatchAction({ type: 'MOVE_ROOM', roomId, point }),
      moveRooms: (roomIds, point) => dispatchAction({ type: 'MOVE_ROOMS', roomIds, point }),
      resizeWall: (wallId, point, anchor) =>
        dispatchAction({ type: 'RESIZE_WALL', wallId, point, anchor }),
      moveVertex: (vertexId, point) =>
        dispatchAction({ type: 'MOVE_VERTEX', vertexId, point }),
      addWall: (start, end) => dispatchAction({ type: 'ADD_WALL', start, end }),
      finishGeometryEdit: () => {
        continuousGestureRef.current = false
        dispatch({ type: 'FINISH_GEOMETRY_EDIT' })
      },
      createNewPlan,
      switchPlan,
      openFriendPlan,
      refreshFriendPlans,
      deleteCurrentPlan,
      recordUndoSnapshot,
      undo,
      selectedRoom,
      selectedRoomIds,
      selectedRooms,
      selectedFurniture,
      selectedDoor,
      planWalls,
      planReady,
      cloudAlert,
      firebaseProjectId: getFirebaseProjectId(),
      cloudSyncActive,
      unsavedCloudChanges,
      cloudSaveInFlight,
      forceCloudSave,
      planOwnerId,
      planOwnerName,
      planAccess,
      readOnlyMode,
      friendPlansGroups,
      requestCollaborateOnCurrentPlan,
      pendingCollaborateOnCurrentPlan,
    }),
    [
      state,
      planSummaries,
      activePlanId,
      masterNote,
      furnitureCatalog,
      planWalls,
      selectedRoom,
      selectedRoomIds,
      selectedRooms,
      selectedFurniture,
      selectedDoor,
      recordUndoSnapshot,
      undo,
      planReady,
      createNewPlan,
      switchPlan,
      openFriendPlan,
      refreshFriendPlans,
      deleteCurrentPlan,
      dispatchAction,
      setMasterNote,
      updateCatalogEntry,
      setPlacementCatalogId,
      placeFurniture,
      moveFurnitureOnPlan,
      addDoor,
      moveDoorOnPlan,
      rotateSelected,
      cloudAlert,
      cloudSyncActive,
      unsavedCloudChanges,
      cloudSaveInFlight,
      forceCloudSave,
      planOwnerId,
      planOwnerName,
      planAccess,
      readOnlyMode,
      friendPlansGroups,
      requestCollaborateOnCurrentPlan,
      pendingCollaborateOnCurrentPlan,
    ],
  )

  if (!authReady || !planReady) {
    return (
      <div className="app-loading">
        <p>Loading your plan…</p>
      </div>
    )
  }

  return <FloorPlanContext.Provider value={value}>{children}</FloorPlanContext.Provider>
}

export function useFloorPlan() {
  const ctx = useContext(FloorPlanContext)
  if (!ctx) throw new Error('useFloorPlan must be used within FloorPlanProvider')
  return ctx
}

export type { RoomPatch }
