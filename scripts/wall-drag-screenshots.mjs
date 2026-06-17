/**
 * Browser automation: calibrate via footer cursor readout, drag walls, capture screenshots.
 * Run: node scripts/wall-drag-screenshots.mjs
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'screenshots', 'wall-drag-test')
const BASE_URL = 'http://localhost:5173'

async function readCursor(page) {
  const text = await page.locator('.plan-status-overlay span').first().textContent()
  const rest = text?.match(/Cursor:\s*(.+)/)?.[1]
  if (!rest) return null
  const comma = rest.indexOf(',')
  if (comma < 0) return null

  function parseFeetInches(s) {
    const trimmed = s.trim()
    const parts = trimmed.match(/^(\d+(?:\.\d+)?)'(?:\s*(\d+(?:\.\d+)?)")?$/)
    if (!parts) return null
    const ft = parseFloat(parts[1])
    const inches = parts[2] ? parseFloat(parts[2]) : 0
    return ft + inches / 12
  }

  const x = parseFeetInches(rest.slice(0, comma))
  const y = parseFeetInches(rest.slice(comma + 1))
  if (x == null || y == null) return null
  return { x, y }
}

async function calibrateCanvas(page, canvasBox) {
  // Sample two points with different X and Y to derive screen -> plan mapping
  const points = [
    { px: 0.35, py: 0.4 },
    { px: 0.65, py: 0.6 },
  ]
  const samples = []
  for (const { px, py } of points) {
    const sx = canvasBox.x + canvasBox.width * px
    const sy = canvasBox.y + canvasBox.height * py
    await page.mouse.move(sx, sy)
    await page.waitForTimeout(80)
    const plan = await readCursor(page)
    if (plan) samples.push({ sx: sx - canvasBox.x, sy: sy - canvasBox.y, ...plan })
  }

  if (samples.length < 2) throw new Error('Could not calibrate cursor readout')

  const planPerPxX = (samples[1].x - samples[0].x) / (samples[1].sx - samples[0].sx)
  const planPerPxY = (samples[1].y - samples[0].y) / (samples[1].sy - samples[0].sy)

  const originPlanX = samples[0].x - samples[0].sx * planPerPxX
  const originPlanY = samples[0].y - samples[0].sy * planPerPxY

  return { planPerPxX, planPerPxY, originPlanX, originPlanY }
}

async function moveToPlanPoint(page, map, box, planX, planY) {
  let sx = (planX - map.originPlanX) / map.planPerPxX
  let sy = (planY - map.originPlanY) / map.planPerPxY
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(box.x + sx, box.y + sy)
    await page.waitForTimeout(60)
    const cursor = await readCursor(page)
    if (!cursor) break
    sx += (planX - cursor.x) / map.planPerPxX
    sy += (planY - cursor.y) / map.planPerPxY
  }
  return { x: box.x + sx, y: box.y + sy }
}

function roomCorners(room) {
  const hw = room.width / 2
  const hd = room.depth / 2
  const cos = Math.cos(room.rotation)
  const sin = Math.sin(room.rotation)
  const local = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ]
  return local.map((p) => ({
    x: room.position.x + p.x * cos - p.y * sin,
    y: room.position.y + p.x * sin + p.y * cos,
  }))
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('floor-planner-plan-v2'))
  await page.reload({ waitUntil: 'networkidle' })

  await page.getByRole('button', { name: '+ Insert Room' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Select', exact: true }).click()

  const canvas = page.locator('canvas.plan-canvas')
  await canvas.waitFor({ state: 'visible' })
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Canvas not found')

  const map = await calibrateCanvas(page, box)

  const room = {
    position: { x: 180, y: 90 },
    width: 12,
    depth: 10,
    rotation: 0,
  }
  const corners = roomCorners(room)
  const topMid = {
    x: (corners[0].x + corners[1].x) / 2,
    y: (corners[0].y + corners[1].y) / 2,
  }
  const bottomLeft = corners[3]
  const bottomRight = corners[2]

  const topPage = await moveToPlanPoint(page, map, box, topMid.x, topMid.y)
  const dragDownPage = await moveToPlanPoint(page, map, box, topMid.x, topMid.y + 3)
  const dragUpPage = await moveToPlanPoint(page, map, box, topMid.x, topMid.y - 4)

  await page.screenshot({ path: path.join(OUT_DIR, '01-room-inserted.png') })

  await page.mouse.move(topPage.x, topPage.y)
  await page.mouse.down()
  await page.waitForTimeout(100)
  await page.screenshot({ path: path.join(OUT_DIR, '02-wall-selected-mousedown.png') })

  await page.mouse.move(dragDownPage.x, dragDownPage.y, { steps: 10 })
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(OUT_DIR, '03-dragging-top-wall-down.png') })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT_DIR, '04-after-drag-down.png') })

  const afterDown = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('floor-planner-plan-v2') ?? '{}'),
  )
  const roomAfterDown = afterDown.rooms?.[0]
  const cDown = roomAfterDown ? roomCorners(roomAfterDown) : null

  // Second drag: expand upward from current top wall
  const topMid2 = cDown
    ? { x: (cDown[0].x + cDown[1].x) / 2, y: (cDown[0].y + cDown[1].y) / 2 }
    : topMid
  const topPage2 = await moveToPlanPoint(page, map, box, topMid2.x, topMid2.y)
  const dragUpPage2 = await moveToPlanPoint(page, map, box, topMid2.x, topMid2.y - 4)

  await page.mouse.move(topPage2.x, topPage2.y)
  await page.mouse.down()
  await page.mouse.move(dragUpPage2.x, dragUpPage2.y, { steps: 10 })
  await page.waitForTimeout(120)
  await page.screenshot({ path: path.join(OUT_DIR, '05-dragging-top-wall-up.png') })
  await page.mouse.up()
  await page.waitForTimeout(200)
  await page.screenshot({ path: path.join(OUT_DIR, '06-after-drag-up.png') })

  const afterUp = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('floor-planner-plan-v2') ?? '{}'),
  )
  const roomAfterUp = afterUp.rooms?.[0]
  const cUp = roomAfterUp ? roomCorners(roomAfterUp) : null

  const report = {
    calibration: {
      planPerPxX: map.planPerPxX,
      planPerPxY: map.planPerPxY,
      originPlanX: map.originPlanX,
      originPlanY: map.originPlanY,
    },
    roomBefore: room,
    roomAfterDown: roomAfterDown
      ? { position: roomAfterDown.position, width: roomAfterDown.width, depth: roomAfterDown.depth }
      : null,
    bottomCornerDeltaAfterDown: cDown
      ? {
          left: { x: cDown[3].x - bottomLeft.x, y: cDown[3].y - bottomLeft.y },
          right: { x: cDown[2].x - bottomRight.x, y: cDown[2].y - bottomRight.y },
        }
      : null,
    roomAfterUp: roomAfterUp
      ? { position: roomAfterUp.position, width: roomAfterUp.width, depth: roomAfterUp.depth }
      : null,
    bottomCornerDeltaAfterUp: cUp
      ? {
          left: { x: cUp[3].x - bottomLeft.x, y: cUp[3].y - bottomLeft.y },
          right: { x: cUp[2].x - bottomRight.x, y: cUp[2].y - bottomRight.y },
        }
      : null,
  }

  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2))
  await browser.close()

  console.log('Screenshots saved to', OUT_DIR)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
