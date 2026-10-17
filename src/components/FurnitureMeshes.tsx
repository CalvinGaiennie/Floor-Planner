import * as THREE from 'three'
import type { FurnitureCategory, FurnitureItem } from '../types/furniture'

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
  misc: '#94a3b8',
}

function darken(hex: string, amount = 0.25): string {
  const c = new THREE.Color(hex)
  c.multiplyScalar(1 - amount)
  return '#' + c.getHexString()
}

function lighten(hex: string, amount = 0.3): string {
  const c = new THREE.Color(hex)
  c.lerp(new THREE.Color('#ffffff'), amount)
  return '#' + c.getHexString()
}

function BedMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const mattressH = item.height * 0.5
  const frameH = item.height * 0.25
  const headH = item.height
  const headThick = 0.2
  const pillowW = Math.min(item.width * 0.35, 1.8)
  const pillowCount = item.width > 4.5 ? 2 : 1
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, frameH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, frameH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.35)} />
      </mesh>
      <mesh position={[0, frameH + mattressH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width - 0.15, mattressH, item.depth - 0.15]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>
      <mesh position={[0, headH / 2, -item.depth / 2 + headThick / 2]} castShadow receiveShadow>
        <boxGeometry args={[item.width, headH, headThick]} />
        <meshStandardMaterial color={darken(color, 0.4)} />
      </mesh>
      {Array.from({ length: pillowCount }).map((_, i) => {
        const px = pillowCount === 1 ? 0 : (i === 0 ? -pillowW * 0.55 : pillowW * 0.55)
        return (
          <mesh key={i} position={[px, frameH + mattressH + 0.15, -item.depth / 2 + 1]} castShadow>
            <boxGeometry args={[pillowW, 0.3, 0.9]} />
            <meshStandardMaterial color="#e2e8f0" />
          </mesh>
        )
      })}
    </group>
  )
}

function SofaMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const seatH = item.height * 0.38
  const backH = item.height
  const armW = Math.min(0.4, item.width * 0.06)
  const backD = 0.35
  const armH = item.height * 0.6
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, seatH / 2, backD / 4]} castShadow receiveShadow>
        <boxGeometry args={[item.width - armW * 2, seatH, item.depth - backD]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, backH / 2, -item.depth / 2 + backD / 2]} castShadow receiveShadow>
        <boxGeometry args={[item.width, backH, backD]} />
        <meshStandardMaterial color={darken(color, 0.15)} />
      </mesh>
      <mesh position={[-item.width / 2 + armW / 2, armH / 2, 0]} castShadow>
        <boxGeometry args={[armW, armH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.15)} />
      </mesh>
      <mesh position={[item.width / 2 - armW / 2, armH / 2, 0]} castShadow>
        <boxGeometry args={[armW, armH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.15)} />
      </mesh>
    </group>
  )
}

function ChairMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const legH = item.height * 0.5
  const seatH = 0.15
  const backH = item.height - legH
  const legSize = 0.12
  const seatInset = 0.08
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (item.width / 2 - legSize), legH / 2, sz * (item.depth / 2 - legSize)]} castShadow>
          <boxGeometry args={[legSize, legH, legSize]} />
          <meshStandardMaterial color={darken(color, 0.3)} />
        </mesh>
      ))}
      <mesh position={[0, legH + seatH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width - seatInset, seatH, item.depth - seatInset]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, legH + seatH + backH / 2, -item.depth / 2 + legSize / 2]} castShadow>
        <boxGeometry args={[item.width - seatInset, backH, legSize]} />
        <meshStandardMaterial color={darken(color, 0.15)} />
      </mesh>
    </group>
  )
}

function TableMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const topH = 0.15
  const legH = item.height - topH
  const legSize = 0.15
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, item.height - topH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, topH, item.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (item.width / 2 - legSize * 1.5), legH / 2, sz * (item.depth / 2 - legSize * 1.5)]} castShadow>
          <boxGeometry args={[legSize, legH, legSize]} />
          <meshStandardMaterial color={darken(color, 0.3)} />
        </mesh>
      ))}
    </group>
  )
}

function ArmchairMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const seatH = item.height * 0.35
  const backH = item.height
  const armW = 0.35
  const backD = 0.35
  const armH = item.height * 0.55
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, seatH / 2, backD / 4]} castShadow receiveShadow>
        <boxGeometry args={[item.width - armW * 2, seatH, item.depth - backD]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, backH / 2, -item.depth / 2 + backD / 2]} castShadow>
        <boxGeometry args={[item.width, backH, backD]} />
        <meshStandardMaterial color={darken(color, 0.12)} />
      </mesh>
      <mesh position={[-item.width / 2 + armW / 2, armH / 2, 0]} castShadow>
        <boxGeometry args={[armW, armH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.12)} />
      </mesh>
      <mesh position={[item.width / 2 - armW / 2, armH / 2, 0]} castShadow>
        <boxGeometry args={[armW, armH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.12)} />
      </mesh>
    </group>
  )
}

function ToiletMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const bowlH = item.height * 0.55
  const tankH = item.height
  const tankD = item.depth * 0.3
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, bowlH / 2, tankD / 2]} castShadow receiveShadow>
        <boxGeometry args={[item.width * 0.85, bowlH, item.depth - tankD]} />
        <meshStandardMaterial color={lighten(color, 0.6)} />
      </mesh>
      <mesh position={[0, tankH / 2, -item.depth / 2 + tankD / 2]} castShadow receiveShadow>
        <boxGeometry args={[item.width, tankH, tankD]} />
        <meshStandardMaterial color={lighten(color, 0.5)} />
      </mesh>
    </group>
  )
}

function SinkMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const cabinetH = item.height * 0.85
  const basinH = item.height - cabinetH
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, cabinetH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, cabinetH, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.1)} />
      </mesh>
      <mesh position={[0, cabinetH + basinH / 2, 0]} castShadow>
        <boxGeometry args={[item.width, basinH, item.depth]} />
        <meshStandardMaterial color={lighten(color, 0.5)} />
      </mesh>
    </group>
  )
}

function ShowerMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const baseH = 0.3
  const glassH = item.height
  const glassThick = 0.08
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, baseH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, baseH, item.depth]} />
        <meshStandardMaterial color="#e2e8f0" />
      </mesh>
      <mesh position={[-item.width / 2 + glassThick / 2, glassH / 2, 0]}>
        <boxGeometry args={[glassThick, glassH, item.depth]} />
        <meshStandardMaterial color={lighten(color, 0.5)} transparent opacity={0.35} />
      </mesh>
      <mesh position={[0, glassH / 2, -item.depth / 2 + glassThick / 2]}>
        <boxGeometry args={[item.width, glassH, glassThick]} />
        <meshStandardMaterial color={lighten(color, 0.5)} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

function BathtubMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const wallThick = 0.15
  const rimH = item.height
  const innerH = item.height * 0.6
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, rimH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, rimH, item.depth]} />
        <meshStandardMaterial color="#f1f5f9" />
      </mesh>
      <mesh position={[0, rimH - innerH / 2 + 0.01, 0]}>
        <boxGeometry args={[item.width - wallThick * 2, innerH, item.depth - wallThick * 2]} />
        <meshStandardMaterial color={lighten(color, 0.4)} />
      </mesh>
    </group>
  )
}

function FridgeMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const gapY = item.height * 0.55
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, item.height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, item.height, item.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, gapY, item.depth / 2 + 0.005]}>
        <boxGeometry args={[item.width * 0.92, 0.04, 0.01]} />
        <meshStandardMaterial color={darken(color, 0.4)} />
      </mesh>
    </group>
  )
}

function StoveMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const bodyH = item.height
  const burnerR = Math.min(item.width, item.depth) * 0.12
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[0, bodyH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, bodyH, item.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
      {[[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]].map(([fx, fz], i) => (
        <mesh key={i} position={[item.width * fx, bodyH + 0.02, item.depth * fz]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[burnerR * 0.5, burnerR, 16]} />
          <meshStandardMaterial color={darken(color, 0.5)} />
        </mesh>
      ))}
    </group>
  )
}

function ShelfMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const sideThick = 0.1
  const shelfThick = 0.08
  const shelfCount = Math.max(2, Math.round(item.height / 1.5))
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      <mesh position={[-item.width / 2 + sideThick / 2, item.height / 2, 0]} castShadow>
        <boxGeometry args={[sideThick, item.height, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.2)} />
      </mesh>
      <mesh position={[item.width / 2 - sideThick / 2, item.height / 2, 0]} castShadow>
        <boxGeometry args={[sideThick, item.height, item.depth]} />
        <meshStandardMaterial color={darken(color, 0.2)} />
      </mesh>
      {Array.from({ length: shelfCount }).map((_, i) => {
        const y = ((i + 1) / (shelfCount + 1)) * item.height
        return (
          <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
            <boxGeometry args={[item.width - sideThick * 2, shelfThick, item.depth]} />
            <meshStandardMaterial color={color} />
          </mesh>
        )
      })}
      <mesh position={[0, item.height - shelfThick / 2, 0]} castShadow>
        <boxGeometry args={[item.width, shelfThick, item.depth]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  )
}

function TvMesh({ item, color }: { item: FurnitureItem; color: string }) {
  const isMounted = item.depth <= 0.5
  const screenH = isMounted ? item.height : item.height * 0.7
  const screenThick = 0.12
  const standH = isMounted ? 0 : item.height - screenH
  return (
    <group position={[item.x, 0, item.y]} rotation={[0, -item.rotation, 0]}>
      {!isMounted && (
        <mesh position={[0, standH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[item.width, standH, item.depth]} />
          <meshStandardMaterial color={darken(color, 0.1)} />
        </mesh>
      )}
      <mesh position={[0, (isMounted ? item.height : item.height) - screenH / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[item.width, screenH, screenThick]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, (isMounted ? item.height : item.height) - screenH / 2, screenThick / 2 + 0.005]}>
        <boxGeometry args={[item.width * 0.92, screenH * 0.88, 0.01]} />
        <meshStandardMaterial color="#0f172a" emissive="#1e3a5f" emissiveIntensity={0.3} />
      </mesh>
    </group>
  )
}

function BoxMesh({ item, color }: { item: FurnitureItem; color: string }) {
  return (
    <mesh position={[item.x, item.height / 2, item.y]} rotation={[0, -item.rotation, 0]} castShadow receiveShadow>
      <boxGeometry args={[item.width, item.height, item.depth]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

export function FurnitureMesh({
  item,
  selected,
  yOffset = 0,
  opacity = 1,
}: {
  item: FurnitureItem
  selected: boolean
  yOffset?: number
  opacity?: number
}) {
  const baseColor = selected ? '#64748b' : FURNITURE_3D_COLORS[item.category]
  const offsetItem = yOffset !== 0 ? { ...item, y: item.y } : item

  const meshMap: Partial<Record<FurnitureCategory, typeof BedMesh>> = {
    bed: BedMesh,
    sofa: SofaMesh,
    chair: ChairMesh,
    table: TableMesh,
    armchair: ArmchairMesh,
    sink: SinkMesh,
    toilet: ToiletMesh,
    shower: ShowerMesh,
    bathtub: BathtubMesh,
    fridge: FridgeMesh,
    stove: StoveMesh,
    shelf: ShelfMesh,
    tv: TvMesh,
  }

  const Mesh = meshMap[item.category]

  if (opacity < 1) {
    return (
      <group position={[0, yOffset, 0]}>
        <mesh position={[offsetItem.x, offsetItem.height / 2, offsetItem.y]} rotation={[0, -offsetItem.rotation, 0]}>
          <boxGeometry args={[offsetItem.width, offsetItem.height, offsetItem.depth]} />
          <meshStandardMaterial color={baseColor} transparent opacity={opacity} />
        </mesh>
      </group>
    )
  }

  if (Mesh) {
    return (
      <group position={[0, yOffset, 0]}>
        <Mesh item={offsetItem} color={baseColor} />
      </group>
    )
  }

  return (
    <group position={[0, yOffset, 0]}>
      <BoxMesh item={offsetItem} color={baseColor} />
    </group>
  )
}

export { FURNITURE_3D_COLORS }
