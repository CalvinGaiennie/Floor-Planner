import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import { requestView3dPointerLock } from '../utils/view3dPointerLock'
import { useFloorPlan } from '../context/FloorPlanContext'
import type { Door, Wall } from '../types/floorPlan'
import type { FurnitureCategory, FurnitureItem } from '../types/furniture'
import { pointOnWall, wallAngle } from '../utils/geometry'
import { wallSolidSegments } from '../utils/doors'
import { WORKSPACE_SIZE } from '../utils/workspace'
import { WorkspaceAlerts } from './WorkspaceAlerts'

function walkSpawnFromWalls(walls: Wall[]): THREE.Vector3 {
  if (walls.length === 0) {
    return new THREE.Vector3(WORKSPACE_SIZE.width / 2, 1.6, WORKSPACE_SIZE.height / 2)
  }

  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const wall of walls) {
    for (const p of [wall.start, wall.end]) {
      minX = Math.min(minX, p.x)
      maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.y)
      maxZ = Math.max(maxZ, p.y)
    }
  }

  return new THREE.Vector3((minX + maxX) / 2, 1.6, (minZ + maxZ) / 2)
}

function WallMesh({
  wall,
  startOffset,
  endOffset,
  selected,
}: {
  wall: Wall
  startOffset: number
  endOffset: number
  selected: boolean
}) {
  const len = endOffset - startOffset
  if (len <= 0.05) return null

  const start = pointOnWall(wall, startOffset)
  const end = pointOnWall(wall, endOffset)
  const midX = (start.x + end.x) / 2
  const midZ = (start.y + end.y) / 2
  const angle = wallAngle(wall)

  return (
    <mesh position={[midX, wall.height / 2, midZ]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[len, wall.height, wall.thickness]} />
      <meshStandardMaterial color={selected ? '#64748b' : '#e5e7eb'} />
    </mesh>
  )
}

const FURNITURE_3D_COLORS: Record<FurnitureCategory, string> = {
  bed: '#d97706',
  sofa: '#818cf8',
  chair: '#34d399',
  table: '#b45309',
  armchair: '#fb923c',
  sink: '#22d3ee',
  toilet: '#c4b5fd',
  shower: '#2dd4bf',
  bathtub: '#60a5fa',
  counter: '#a8a29e',
  fridge: '#94a3b8',
  stove: '#f87171',
  island: '#facc15',
  shelf: '#c084fc',
  tv: '#475569',
}

function FurnitureMesh({ item, selected }: { item: FurnitureItem; selected: boolean }) {
  return (
    <mesh
      position={[item.x, item.height / 2, item.y]}
      rotation={[0, -item.rotation, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[item.width, item.height, item.depth]} />
      <meshStandardMaterial color={selected ? '#64748b' : FURNITURE_3D_COLORS[item.category]} />
    </mesh>
  )
}

function SceneContent({
  walls,
  doors,
  furniture,
  workspaceWidth,
  workspaceHeight,
  selectedId,
}: {
  walls: Wall[]
  doors: Door[]
  furniture: FurnitureItem[]
  workspaceWidth: number
  workspaceHeight: number
  selectedId: string | null
}) {
  return (
    <>
      <Sky sunPosition={[100, 40, 100]} />
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        intensity={0.9}
        position={[20, 30, 10]}
        shadow-mapSize={[2048, 2048]}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        position={[workspaceWidth / 2, 0, workspaceHeight / 2]}
      >
        <planeGeometry args={[workspaceWidth, workspaceHeight]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>

      <gridHelper
        args={[workspaceWidth, workspaceWidth, '#cbd5e1', '#e2e8f0']}
        position={[workspaceWidth / 2, 0.01, workspaceHeight / 2]}
      />

      {walls.map((wall) => {
        const segments = wallSolidSegments(wall, doors)
        return segments.map((segment, index) => (
          <WallMesh
            key={`${wall.id}-${index}`}
            wall={wall}
            startOffset={segment.start}
            endOffset={segment.end}
            selected={wall.id === selectedId}
          />
        ))
      })}

      {furniture.map((item) => (
        <FurnitureMesh key={item.id} item={item} selected={item.id === selectedId} />
      ))}
    </>
  )
}

const WALK_SPEED = 0.225
const MIN_ELEVATION = 0.5
const MAX_ELEVATION = 60

function WalkControls({ walls, active }: { walls: Wall[]; active: boolean }) {
  const { camera, gl } = useThree()
  const positionRef = useRef(new THREE.Vector3())
  const controlsRef = useRef<PointerLockControlsImpl | null>(null)
  const keys = useRef({ w: false, a: false, s: false, d: false, up: false, down: false })

  useEffect(() => {
    const spawn = walkSpawnFromWalls(walls)
    positionRef.current.copy(spawn)
    camera.position.copy(spawn)
  }, [camera, walls])

  useLayoutEffect(() => {
    const controls = new PointerLockControlsImpl(camera, gl.domElement)
    controlsRef.current = controls
    return () => {
      controls.disconnect()
      controlsRef.current = null
    }
  }, [camera, gl])

  useLayoutEffect(() => {
    const controls = controlsRef.current
    if (!controls || !active) return

    controls.connect(gl.domElement)
    if (document.pointerLockElement !== gl.domElement) {
      requestView3dPointerLock().catch(() => {})
    }

    return () => {
      if (document.pointerLockElement === gl.domElement) {
        document.exitPointerLock()
      }
      controls.disconnect()
    }
  }, [active, gl])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keys.current[key] = true
      }
      if (e.code === 'Space') {
        e.preventDefault()
        if (!e.shiftKey) keys.current.up = true
      }
      if (e.key === 'Shift') {
        keys.current.down = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        keys.current[key] = false
      }
      if (e.code === 'Space') {
        keys.current.up = false
      }
      if (e.key === 'Shift') {
        keys.current.down = false
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useFrame(() => {
    const dir = new THREE.Vector3()
    camera.getWorldDirection(dir)
    dir.y = 0

    if (dir.lengthSq() > 1e-6) {
      dir.normalize()
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
      const move = new THREE.Vector3()
      if (keys.current.w) move.add(dir)
      if (keys.current.s) move.sub(dir)
      if (keys.current.d) move.add(right)
      if (keys.current.a) move.sub(right)

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(WALK_SPEED)
        positionRef.current.x += move.x
        positionRef.current.z += move.z
      }
    }

    if (keys.current.up) positionRef.current.y += WALK_SPEED
    if (keys.current.down) positionRef.current.y -= WALK_SPEED
    positionRef.current.y = Math.min(
      MAX_ELEVATION,
      Math.max(MIN_ELEVATION, positionRef.current.y),
    )

    camera.position.x = positionRef.current.x
    camera.position.y = positionRef.current.y
    camera.position.z = positionRef.current.z
  })

  return null
}

function Scene({
  walls,
  doors,
  furniture,
  workspaceWidth,
  workspaceHeight,
  selectedId,
  active,
}: {
  walls: Wall[]
  doors: Door[]
  furniture: FurnitureItem[]
  workspaceWidth: number
  workspaceHeight: number
  selectedId: string | null
  active: boolean
}) {
  return (
    <>
      <WalkControls walls={walls} active={active} />
      <SceneContent
        walls={walls}
        doors={doors}
        furniture={furniture}
        workspaceWidth={workspaceWidth}
        workspaceHeight={workspaceHeight}
        selectedId={selectedId}
      />
    </>
  )
}

export function View3D() {
  const { state, planWalls, setViewMode } = useFloorPlan()
  const { selectedId, viewMode } = state
  const active = viewMode === 'view3d'
  const [pointerLocked, setPointerLocked] = useState(false)

  useEffect(() => {
    if (!active) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setViewMode('plan2d')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [active, setViewMode])

  useEffect(() => {
    const onLockChange = () => {
      setPointerLocked(document.pointerLockElement !== null)
    }
    document.addEventListener('pointerlockchange', onLockChange)
    onLockChange()
    return () => document.removeEventListener('pointerlockchange', onLockChange)
  }, [])

  return (
    <div className={`panel view3d-panel${active ? ' view3d-panel-active' : ''}`}>
      <div className="panel-header">
        <h2>3D View</h2>
        <span className="panel-meta">
          WASD move · Space up · Shift down · Esc → 2D
        </span>
      </div>
      <div className="view3d-canvas-wrap" id="view3d-canvas-wrap">
        <WorkspaceAlerts />
        <Canvas shadows camera={{ position: [15, 12, 15], fov: 50 }}>
          <Suspense fallback={null}>
            <Scene
              walls={planWalls}
              doors={state.plan.doors}
              furniture={state.plan.furniture}
              workspaceWidth={WORKSPACE_SIZE.width}
              workspaceHeight={WORKSPACE_SIZE.height}
              selectedId={selectedId}
              active={active}
            />
          </Suspense>
        </Canvas>
        {pointerLocked && <div className="view3d-crosshair" aria-hidden="true" />}
      </div>
    </div>
  )
}
