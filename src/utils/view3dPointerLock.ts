export function getView3dCanvas(): HTMLElement | null {
  const canvas = document.querySelector('#view3d-canvas-wrap canvas')
  return canvas instanceof HTMLElement ? canvas : null
}

export function requestView3dPointerLock(): Promise<void> {
  const canvas = getView3dCanvas()
  if (!canvas) return Promise.reject(new Error('3D canvas not ready'))
  return canvas.requestPointerLock() as Promise<void>
}
