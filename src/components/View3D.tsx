import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import { requestView3dPointerLock } from '../utils/view3dPointerLock'
import { useFloorPlan } from '../context/FloorPlanContext'
import { resolveWalls } from '../utils/planModel'
import { planFromFloor, DEFAULT_WALL_HEIGHT, type Floor, type Door, type Wall } from '../types/floorPlan'
import type { FurnitureItem } from '../types/furniture'
import { pointOnWall, wallAngle } from '../utils/geometry'
import { wallSolidSegments } from '../utils/doors'
import { WORKSPACE_SIZE } from '../utils/workspace'
import { WorkspaceAlerts } from './WorkspaceAlerts'
import { FurnitureMesh } from './FurnitureMeshes'

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
  yOffset = 0,
  opacity = 1,
}: {
  wall: Wall
  startOffset: number
  endOffset: number
  selected: boolean
  yOffset?: number
  opacity?: number
}) {
  const len = endOffset - startOffset
  if (len <= 0.05) return null

  const start = pointOnWall(wall, startOffset)
  const end = pointOnWall(wall, endOffset)
  const midX = (start.x + end.x) / 2
  const midZ = (start.y + end.y) / 2
  const angle = wallAngle(wall)

  return (
    <mesh
      position={[midX, yOffset + wall.height / 2, midZ]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[len, wall.height, wall.thickness]} />
      <meshStandardMaterial
        color={selected ? '#64748b' : '#e5e7eb'}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

function FloorSlab({
  yOffset,
  workspaceWidth,
  workspaceHeight,
  opacity = 1,
}: {
  yOffset: number
  workspaceWidth: number
  workspaceHeight: number
  opacity?: number
}) {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      position={[workspaceWidth / 2, yOffset, workspaceHeight / 2]}
    >
      <planeGeometry args={[workspaceWidth, workspaceHeight]} />
      <meshStandardMaterial
        color="#f1f5f9"
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  )
}

function FloorLevelContent({
  walls,
  doors,
  furniture,
  selectedId,
  yOffset,
  opacity = 1,
  isActive,
}: {
  walls: Wall[]
  doors: Door[]
  furniture: FurnitureItem[]
  selectedId: string | null
  yOffset: number
  opacity?: number
  isActive: boolean
}) {
  return (
    <>
      {walls.map((wall) => {
        const segments = wallSolidSegments(wall, doors)
        return segments.map((segment, index) => (
          <WallMesh
            key={`${wall.id}-${index}`}
            wall={wall}
            startOffset={segment.start}
            endOffset={segment.end}
            selected={isActive && wall.id === selectedId}
            yOffset={yOffset}
            opacity={opacity}
          />
        ))
      })}

      {furniture.map((item) => (
        <FurnitureMesh
          key={item.id}
          item={item}
          selected={isActive && item.id === selectedId}
          yOffset={yOffset}
          opacity={opacity}
        />
      ))}
    </>
  )
}

function maxWallHeightForFloor(floor: Floor): number {
  if (floor.walls.length === 0) return DEFAULT_WALL_HEIGHT
  return Math.max(...floor.walls.map((w) => w.height))
}

function SceneContent({
  floors,
  activeFloorIndex,
  workspaceWidth,
  workspaceHeight,
  selectedId,
}: {
  floors: Floor[]
  activeFloorIndex: number
  workspaceWidth: number
  workspaceHeight: number
  selectedId: string | null
}) {
  const floorData = useMemo(() => {
    const offsets: number[] = []
    floors.reduce((acc, floor) => {
      offsets.push(acc)
      return acc + maxWallHeightForFloor(floor) + 0.3
    }, 0)

    return floors.map((floor, i) => {
      const tempPlan = planFromFloor(floor, '', '')
      const walls = resolveWalls(tempPlan)
      return {
        floor,
        walls,
        doors: floor.doors,
        furniture: floor.furniture,
        yOffset: offsets[i],
        isActive: i === activeFloorIndex,
        opacity: i === activeFloorIndex ? 1 : 0.25,
      }
    })
  }, [floors, activeFloorIndex])

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

      {floorData.map((fd, i) => (
        <group key={i}>
          <FloorSlab
            yOffset={fd.yOffset}
            workspaceWidth={workspaceWidth}
            workspaceHeight={workspaceHeight}
            opacity={fd.opacity}
          />
          {fd.yOffset > 0 && (
            <gridHelper
              args={[workspaceWidth, workspaceWidth, '#cbd5e1', '#e2e8f0']}
              position={[workspaceWidth / 2, fd.yOffset + 0.01, workspaceHeight / 2]}
            />
          )}
          <FloorLevelContent
            walls={fd.walls}
            doors={fd.doors}
            furniture={fd.furniture}
            selectedId={selectedId}
            yOffset={fd.yOffset}
            opacity={fd.opacity}
            isActive={fd.isActive}
          />
        </group>
      ))}

      <gridHelper
        args={[workspaceWidth, workspaceWidth, '#cbd5e1', '#e2e8f0']}
        position={[workspaceWidth / 2, 0.01, workspaceHeight / 2]}
      />
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
  floors,
  activeFloorIndex,
  activeWalls,
  workspaceWidth,
  workspaceHeight,
  selectedId,
  active,
}: {
  floors: Floor[]
  activeFloorIndex: number
  activeWalls: Wall[]
  workspaceWidth: number
  workspaceHeight: number
  selectedId: string | null
  active: boolean
}) {
  return (
    <>
      <WalkControls walls={activeWalls} active={active} />
      <SceneContent
        floors={floors}
        activeFloorIndex={activeFloorIndex}
        workspaceWidth={workspaceWidth}
        workspaceHeight={workspaceHeight}
        selectedId={selectedId}
      />
    </>
  )
}

export function View3D() {
  const { state, planWalls, setViewMode, floors, activeFloorIndex } = useFloorPlan()
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
          {floors.length > 1 ? ` · ${floors.length} floors` : ''}
        </span>
      </div>
      <div className="view3d-canvas-wrap" id="view3d-canvas-wrap">
        <WorkspaceAlerts />
        <Canvas shadows camera={{ position: [15, 12, 15], fov: 50 }}>
          <Suspense fallback={null}>
            <Scene
              floors={floors}
              activeFloorIndex={activeFloorIndex}
              activeWalls={planWalls}
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
