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
  translateRoom,
  updateRoomDefaults,
  type WallDragAnchor,
} from '../utils/planModel'
import {
  createLocalPlan,
  deleteLocalPlan,
  loadLocalPlansSession,
  loadMasterNoteLocal,
  mirrorPlanLocally,
  nextDefaultPlanName,
  saveActivePlanIdLocal,
  saveMasterNoteLocal,
  savePlan,
  savePlanForId,
  loadPlanForId,
  type PlanSummary,
  updateLocalPlanName,
} from '../utils/storage'
import {
  addFurnitureFromCatalog,
  deleteFurniture,
  getFurniture,
  isFurnitureId,
  moveFurniture,
  rotateFurniture,
} from '../utils/furniture'
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
  saveMasterNoteToFirestore,
  savePlanToFirestore,
  setActivePlanIdInFirestore,
} from '../services/firestorePlans'
import { isFirebaseConfigured, getFirebaseProjectId } from '../lib/firebase'

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
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_PLAN'; plan: FloorPlan }
  | { type: 'SET_PLAN_NAME'; name: string }
  | { type: 'SET_PLAN_NOTES'; notes: string }
  | { type: 'RESTORE_PLAN'; plan: FloorPlan }
  | { type: 'ADD_ROOM'; point: { x: number; y: number } }
  | { type: 'UPDATE_ROOM'; id: string; patch: RoomPatch }
  | { type: 'DELETE_SELECTED' }
  | { type: 'DUPLICATE_ROOM'; id: string }
  | { type: 'MOVE_ROOM'; roomId: string; point: { x: number; y: number } }
  | { type: 'RESIZE_WALL'; wallId: string; point: { x: number; y: number }; anchor: WallDragAnchor }
  | { type: 'MOVE_VERTEX'; vertexId: string; point: { x: number; y: number } }
  | { type: 'ADD_WALL'; start: { x: number; y: number }; end: { x: number; y: number } }
  | { type: 'ADD_FURNITURE'; entry: FurnitureCatalogEntry; point: { x: number; y: number } }
  | { type: 'MOVE_FURNITURE'; id: string; point: { x: number; y: number } }
  | { type: 'ROTATE_ROOM'; roomId: string; deltaRadians: number }
  | { type: 'ROTATE_FURNITURE'; id: string; deltaRadians: number }
  | { type: 'SET_PLACEMENT_CATALOG_ID'; catalogId: string | null }
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
  'ADD_FURNITURE',
  'MOVE_FURNITURE',
  'ROTATE_ROOM',
  'ROTATE_FURNITURE',
])

const CONTINUOUS_UNDO_ACTIONS = new Set<Action['type']>([
  'MOVE_ROOM',
  'RESIZE_WALL',
  'MOVE_VERTEX',
  'MOVE_FURNITURE',
])

function snapPoint(point: { x: number; y: number }) {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) }
}

function reducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case 'SET_TOOL':
      return { ...state, tool: action.tool }
    case 'SET_VIEW_MODE':
      return { ...state, viewMode: action.viewMode }
    case 'SELECT':
      return { ...state, selectedId: action.id }
    case 'SET_PLAN':
      return { ...state, plan: action.plan, selectedId: null }
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
        nextState = { ...state, selectedId: null, plan: deleteFurniture(state.plan, id) }
      } else if (isPlanWallId(state.plan, id)) {
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
    case 'ADD_FURNITURE': {
      const plan = addFurnitureFromCatalog(state.plan, action.entry, snapPoint(action.point))
      const item = plan.furniture[plan.furniture.length - 1]
      return {
        ...state,
        plan,
        selectedId: item?.id ?? state.selectedId,
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
  select: (id: string | null) => void
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
  rotateSelected: (direction: 'cw' | 'ccw') => void
  addRoom: (point: { x: number; y: number }) => void
  updateRoom: (id: string, patch: RoomPatch) => void
  deleteSelected: () => void
  duplicateRoom: (id: string) => void
  moveRoom: (roomId: string, point: { x: number; y: number }) => void
  resizeWall: (wallId: string, point: { x: number; y: number }, anchor: WallDragAnchor) => void
  moveVertex: (vertexId: string, point: { x: number; y: number }) => void
  addWall: (start: { x: number; y: number }, end: { x: number; y: number }) => void
  finishGeometryEdit: () => void
  createNewPlan: () => Promise<void>
  switchPlan: (planId: string) => Promise<void>
  deleteCurrentPlan: () => Promise<void>
  recordUndoSnapshot: () => void
  undo: () => void
  selectedRoom: Room | null
  selectedFurniture: FurnitureItem | null
  planWalls: ReturnType<typeof resolveWalls>
  planReady: boolean
  syncError: string | null
  refreshFromCloud: () => Promise<void>
  firebaseProjectId: string | null
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
    placementCatalogId: null,
  })
  const [furnitureCatalog, setFurnitureCatalogState] = useState<FurnitureCatalogEntry[]>(
    () => loadFurnitureCatalog(),
  )
  const [syncError, setSyncError] = useState<string | null>(null)

  const undoStackRef = useRef<FloorPlan[]>([])
  const redoStackRef = useRef<FloorPlan[]>([])
  const planRef = useRef(state.plan)
  planRef.current = state.plan
  const activePlanIdRef = useRef<string | null>(null)
  activePlanIdRef.current = activePlanId
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const masterNoteCloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNextCloudSaveRef = useRef(false)
  const skipPlanPersistenceRef = useRef(false)
  const planSummariesRef = useRef(planSummaries)
  planSummariesRef.current = planSummaries

  const flushCloudSave = useCallback(async () => {
    const planId = activePlanIdRef.current
    if (!user || !planId || !isFirebaseConfigured()) return
    if (cloudSaveTimerRef.current) {
      clearTimeout(cloudSaveTimerRef.current)
      cloudSaveTimerRef.current = null
    }
    await savePlanToFirestore(user.uid, planId, planRef.current)
  }, [user])

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
          setSyncError(null)
          skipNextCloudSaveRef.current = true
          setPlanSummaries(session.plans)
          setActivePlanId(session.activePlanId)
          dispatch({ type: 'SET_PLAN', plan: session.plan })
        } else {
          const session = loadLocalPlansSession()
          if (cancelled) return
          skipNextCloudSaveRef.current = true
          setPlanSummaries(session.plans)
          setActivePlanId(session.activePlanId)
          dispatch({ type: 'SET_PLAN', plan: session.plan })
        }
        resetUndoStacks()
      } catch {
        if (!cancelled && user && isFirebaseConfigured()) {
          setSyncError('Could not load plans from the cloud. Use Account → Refresh from cloud.')
          setPlanReady(true)
          return
        }
        if (!cancelled) {
          const session = loadLocalPlansSession()
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
  }, [user, authReady, resetUndoStacks])

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
    if (!planReady || !activePlanId) return

    if (skipPlanPersistenceRef.current) {
      skipPlanPersistenceRef.current = false
      return
    }

    savePlan(state.plan)
    savePlanForId(activePlanId, state.plan)
    setPlanSummaries((prev) =>
      prev.map((p) => (p.id === activePlanId ? { ...p, name: state.plan.name } : p)),
    )
    updateLocalPlanName(activePlanId, state.plan.name)

    if (!user || !isFirebaseConfigured()) return

    if (skipNextCloudSaveRef.current) {
      skipNextCloudSaveRef.current = false
      return
    }

    if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current)
    cloudSaveTimerRef.current = setTimeout(() => {
      savePlanToFirestore(user.uid, activePlanId, planRef.current).catch(() => {
        setSyncError('Could not save to the cloud. Try Account → Refresh from cloud.')
      })
    }, 1500)
  }, [state.plan, user, planReady, activePlanId])

  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current)
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

  const selectedFurniture = useMemo(() => {
    if (!state.selectedId || !isFurnitureId(state.plan, state.selectedId)) return null
    return getFurniture(state.plan, state.selectedId) ?? null
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
      planId = createLocalPlan(plan)
    } else {
      mirrorPlanLocally(planId, plan)
    }

    skipPlanPersistenceRef.current = true
    skipNextCloudSaveRef.current = true
    setPlanSummaries((prev) =>
      prev.some((p) => p.id === planId) ? prev : [...prev, { id: planId!, name: plan.name }],
    )
    setActivePlanId(planId)
    dispatch({ type: 'SET_PLAN', plan })
    resetUndoStacks()
  }, [flushCloudSave, user, resetUndoStacks])

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

        if (cloudSaveTimerRef.current) {
          clearTimeout(cloudSaveTimerRef.current)
          cloudSaveTimerRef.current = null
        }
      }

      let plan: FloorPlan | null = null

      if (user && isFirebaseConfigured()) {
        try {
          plan = await loadPlanFromFirestoreServer(user.uid, planId)
          if (!plan) {
            setSyncError('That plan was not found in the cloud.')
            plan = createEmptyPlan(
              planSummariesRef.current.find((p) => p.id === planId)?.name ?? 'Untitled',
            )
          } else {
            mirrorPlanLocally(planId, plan)
            setSyncError(null)
          }
          await setActivePlanIdInFirestore(user.uid, planId)
        } catch {
          setSyncError('Could not load that plan from the cloud.')
          return
        }
      } else {
        plan = loadPlanForId(planId)
        saveActivePlanIdLocal(planId)
      }

      skipNextCloudSaveRef.current = true
      skipPlanPersistenceRef.current = true
      setActivePlanId(planId)
      dispatch({
        type: 'SET_PLAN',
        plan: plan ?? createEmptyPlan(planSummariesRef.current.find((p) => p.id === planId)?.name),
      })
      resetUndoStacks()
    },
    [flushCloudSave, user, resetUndoStacks],
  )

  const deleteCurrentPlan = useCallback(async () => {
    const currentId = activePlanIdRef.current
    const summaries = planSummariesRef.current
    if (!currentId || summaries.length <= 1) return

    try {
      await flushCloudSave()
    } catch {
      // Continue even if saving the current plan fails.
    }

    if (cloudSaveTimerRef.current) {
      clearTimeout(cloudSaveTimerRef.current)
      cloudSaveTimerRef.current = null
    }

    const remaining = summaries.filter((p) => p.id !== currentId)
    const nextId = remaining[0]?.id
    if (!nextId) return

    if (user && isFirebaseConfigured()) {
      try {
        await deletePlanFromFirestore(user.uid, currentId)
        await setActivePlanIdInFirestore(user.uid, nextId)
      } catch {
        // Fall back to local-only delete below.
      }
    }

    deleteLocalPlan(currentId)
    saveActivePlanIdLocal(nextId)

    let plan: FloorPlan | null = loadPlanForId(nextId)
    if (!plan && user && isFirebaseConfigured()) {
      try {
        plan = await loadPlanFromFirestore(user.uid, nextId)
        if (plan) mirrorPlanLocally(nextId, plan)
      } catch {
        plan = null
      }
    }

    skipPlanPersistenceRef.current = true
    skipNextCloudSaveRef.current = true
    setPlanSummaries(remaining)
    setActivePlanId(nextId)
    dispatch({ type: 'SET_PLAN', plan: plan ?? createEmptyPlan(remaining[0].name) })
    resetUndoStacks()
  }, [flushCloudSave, user, resetUndoStacks])

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

  const refreshFromCloud = useCallback(async () => {
    if (!user || !isFirebaseConfigured()) return
    setSyncError(null)
    setPlanReady(false)
    try {
      const session = await loadUserPlansSession(user.uid)
      skipNextCloudSaveRef.current = true
      skipPlanPersistenceRef.current = true
      setPlanSummaries(session.plans)
      setActivePlanId(session.activePlanId)
      dispatch({ type: 'SET_PLAN', plan: session.plan })
      resetUndoStacks()
    } catch {
      setSyncError('Could not load plans from the cloud. Check your connection and try again.')
    } finally {
      setPlanReady(true)
    }
  }, [user, resetUndoStacks])

  const rotateSelected = useCallback(
    (direction: 'cw' | 'ccw') => {
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
      select: (id) => dispatch({ type: 'SELECT', id }),
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
      rotateSelected,
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
      createNewPlan,
      switchPlan,
      deleteCurrentPlan,
      recordUndoSnapshot,
      undo,
      selectedRoom,
      selectedFurniture,
      planWalls,
      planReady,
      syncError,
      refreshFromCloud,
      firebaseProjectId: getFirebaseProjectId(),
    }),
    [
      state,
      planSummaries,
      activePlanId,
      masterNote,
      furnitureCatalog,
      planWalls,
      selectedRoom,
      selectedFurniture,
      recordUndoSnapshot,
      undo,
      planReady,
      createNewPlan,
      switchPlan,
      deleteCurrentPlan,
      dispatchAction,
      refreshFromCloud,
      setMasterNote,
      updateCatalogEntry,
      setPlacementCatalogId,
      placeFurniture,
      moveFurnitureOnPlan,
      rotateSelected,
      syncError,
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
