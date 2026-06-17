import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PointerLockControls, Sky } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFloorPlan } from '../context/FloorPlanContext'
import type { Wall } from '../types/floorPlan'
import { pointOnWall, wallAngle, wallLength } from '../utils/geometry'
import { WORKSPACE_SIZE } from '../utils/workspace'

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

function SceneContent({
  walls,
  workspaceWidth,
  workspaceHeight,
  selectedWallId,
}: {
  walls: Wall[]
  workspaceWidth: number
  workspaceHeight: number
  selectedWallId: string | null
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

      {walls.map((wall) => (
        <WallMesh
          key={wall.id}
          wall={wall}
          startOffset={0}
          endOffset={wallLength(wall)}
          selected={wall.id === selectedWallId}
        />
      ))}
    </>
  )
}

function OrbitCamera({ walls }: { walls: Wall[] }) {
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (walls.length === 0) {
      target.set(0, 0, 0)
      camera.position.set(15, 12, 15)
      camera.lookAt(target)
      return
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
    const cx = (minX + maxX) / 2
    const cz = (minZ + maxZ) / 2
    const size = Math.max(maxX - minX, maxZ - minZ, 10)
    target.set(cx, 0, cz)
    camera.position.set(cx + size, size * 0.75, cz + size)
    camera.lookAt(target)
  }, [camera, target, walls])

  return <OrbitControls makeDefault target={target} maxPolarAngle={Math.PI / 2.1} />
}

function WalkControls({ walls }: { walls: Wall[] }) {
  const { camera } = useThree()
  const positionRef = useRef(new THREE.Vector3())
  const keys = useRef({ w: false, a: false, s: false, d: false })

  useEffect(() => {
    const spawn = walkSpawnFromWalls(walls)
    positionRef.current.copy(spawn)
    camera.position.copy(spawn)
  }, [camera, walls])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keys.current) {
        keys.current[key as keyof typeof keys.current] = true
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keys.current) keys.current[key as keyof typeof keys.current] = false
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
    if (dir.lengthSq() < 1e-6) return
    dir.normalize()

    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()
    const move = new THREE.Vector3()
    if (keys.current.w) move.add(dir)
    if (keys.current.s) move.sub(dir)
    if (keys.current.d) move.add(right)
    if (keys.current.a) move.sub(right)

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(0.15)
      positionRef.current.x += move.x
      positionRef.current.z += move.z
    }

    camera.position.x = positionRef.current.x
    camera.position.y = positionRef.current.y
    camera.position.z = positionRef.current.z
  })

  return <PointerLockControls />
}

function CameraRig({
  walkMode,
  walls,
  workspaceWidth,
  workspaceHeight,
  selectedWallId,
}: {
  walkMode: boolean
  walls: Wall[]
  workspaceWidth: number
  workspaceHeight: number
  selectedWallId: string | null
}) {
  if (walkMode) {
    return (
      <>
        <WalkControls walls={walls} />
        <SceneContent
          walls={walls}
          workspaceWidth={workspaceWidth}
          workspaceHeight={workspaceHeight}
          selectedWallId={selectedWallId}
        />
      </>
    )
  }

  return (
    <>
      <OrbitCamera walls={walls} />
      <SceneContent
        walls={walls}
        workspaceWidth={workspaceWidth}
        workspaceHeight={workspaceHeight}
        selectedWallId={selectedWallId}
      />
    </>
  )
}

export function View3D() {
  const { state, setWalkMode, planWalls } = useFloorPlan()
  const { walkMode, selectedId } = state

  return (
    <div className={`panel view3d-panel ${walkMode ? 'walk-active' : ''}`}>
      <div className="panel-header">
        <h2>3D View</h2>
        <span className="panel-meta">
          {walkMode ? 'Click to capture mouse · Esc releases' : 'Drag to orbit · scroll to zoom'}
        </span>
      </div>
      <div className="view3d-canvas-wrap">
        <Canvas shadows camera={{ position: [15, 12, 15], fov: 50 }}>
          <Suspense fallback={null}>
            <CameraRig
              walkMode={walkMode}
              walls={planWalls}
              workspaceWidth={WORKSPACE_SIZE.width}
              workspaceHeight={WORKSPACE_SIZE.height}
              selectedWallId={selectedId}
            />
          </Suspense>
        </Canvas>
        {walkMode && (
          <button type="button" className="walk-overlay-btn" onClick={() => setWalkMode(false)}>
            Exit walk mode
          </button>
        )}
      </div>
    </div>
  )
}
