import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, PointerLockControls, Sky } from '@react-three/drei'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFloorPlan } from '../context/FloorPlanContext'
import {
  FURNITURE_CATALOG,
  type FloorPlan,
  type Opening,
  type Wall,
} from '../types/floorPlan'
import { canWalkTo, pointOnWall, splitWallSegments, wallAngle } from '../utils/geometry'
import { WORKSPACE_SIZE } from '../utils/workspace'

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

function OpeningFrame({ wall, opening }: { wall: Wall; opening: Opening }) {
  const center = pointOnWall(wall, opening.offset)
  const angle = wallAngle(wall)
  const color = opening.type === 'door' ? '#92400e' : '#7dd3fc'

  return (
    <group
      position={[center.x, opening.sillHeight + opening.height / 2, center.y]}
      rotation={[0, -angle, 0]}
    >
      <mesh castShadow>
        <boxGeometry args={[opening.width, opening.height, 0.15]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={opening.type === 'window' ? 0.45 : 0.85}
        />
      </mesh>
    </group>
  )
}

function FurnitureMesh({
  type,
  position,
  rotation,
}: {
  type: keyof typeof FURNITURE_CATALOG
  position: { x: number; y: number }
  rotation: number
}) {
  const cat = FURNITURE_CATALOG[type]
  return (
    <mesh
      position={[position.x, cat.height / 2, position.y]}
      rotation={[0, -rotation, 0]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[cat.width, cat.height, cat.depth]} />
      <meshStandardMaterial color={cat.color} />
    </mesh>
  )
}

function StaircaseMesh({
  position,
  rotation,
  width,
  length,
  rise,
}: {
  position: { x: number; y: number }
  rotation: number
  width: number
  length: number
  rise: number
}) {
  const steps = 10
  const stepHeight = rise / steps
  const stepDepth = length / steps

  return (
    <group position={[position.x, 0, position.y]} rotation={[0, -rotation, 0]}>
      {Array.from({ length: steps }, (_, i) => (
        <mesh
          key={i}
          position={[0, stepHeight * (i + 0.5), -length / 2 + stepDepth * (i + 0.5)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[width, stepHeight, stepDepth]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}
    </group>
  )
}

function SceneContent({
  plan,
  walls,
  workspaceWidth,
  workspaceHeight,
  selectedWallId,
}: {
  plan: FloorPlan
  walls: Wall[]
  workspaceWidth: number
  workspaceHeight: number
  selectedWallId: string | null
}) {
  const wallSegments = useMemo(
    () => walls.flatMap((wall) => splitWallSegments(wall, plan.openings)),
    [walls, plan.openings],
  )

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

      {wallSegments.map((segment, i) => (
        <WallMesh
          key={`${segment.wall.id}-${segment.startOffset}-${i}`}
          wall={segment.wall}
          startOffset={segment.startOffset}
          endOffset={segment.endOffset}
          selected={segment.wall.id === selectedWallId}
        />
      ))}

      {plan.openings.map((opening) => {
        const wall = walls.find((w) => w.id === opening.wallId)
        if (!wall) return null
        return <OpeningFrame key={opening.id} wall={wall} opening={opening} />
      })}

      {plan.furniture.map((item) => (
        <FurnitureMesh
          key={item.id}
          type={item.type}
          position={item.position}
          rotation={item.rotation}
        />
      ))}

      {plan.staircases.map((stair) => (
        <StaircaseMesh key={stair.id} {...stair} />
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
  const controlsRef = useRef<THREE.EventDispatcher | null>(null)
  const positionRef = useRef(new THREE.Vector3(5, 1.6, 5))
  const keys = useRef({ w: false, a: false, s: false, d: false })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key in keys.current) keys.current[key as keyof typeof keys.current] = true
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

  useEffect(() => {
    let frame = 0
    const tick = () => {
      const controls = controlsRef.current as unknown as {
        object: THREE.Camera
        getDirection: (target: THREE.Vector3) => THREE.Vector3
      } | null

      if (controls?.object) {
        const speed = 0.12
        const dir = new THREE.Vector3()
        controls.getDirection(dir)
        dir.y = 0
        dir.normalize()
        const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize()

        const move = new THREE.Vector3()
        if (keys.current.w) move.add(dir)
        if (keys.current.s) move.sub(dir)
        if (keys.current.d) move.add(right)
        if (keys.current.a) move.sub(right)

        if (move.lengthSq() > 0) {
          move.normalize().multiplyScalar(speed)
          const from = { x: positionRef.current.x, y: positionRef.current.z }
          const to = { x: from.x + move.x, y: from.y + move.z }
          if (canWalkTo(from, to, walls)) {
            positionRef.current.x = to.x
            positionRef.current.z = to.y
          }
        }

        controls.object.position.copy(positionRef.current)
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [walls])

  return <PointerLockControls ref={controlsRef as never} />
}

function CameraRig({
  walkMode,
  plan,
  walls,
  workspaceWidth,
  workspaceHeight,
  selectedWallId,
}: {
  walkMode: boolean
  plan: FloorPlan
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
          plan={plan}
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
        plan={plan}
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
  const { plan, walkMode, selectedId } = state

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
              plan={plan}
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
