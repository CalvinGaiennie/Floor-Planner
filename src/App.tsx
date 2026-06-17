import { useEffect } from 'react'
import { FloorPlanProvider, useFloorPlan } from './context/FloorPlanContext'
import { FloorPlanEditor } from './components/FloorPlanEditor'
import { RoomBottomBar } from './components/RoomBottomBar'
import { Toolbar } from './components/Toolbar'
import { View3D } from './components/View3D'
import './App.css'

function AppContent() {
  const { state } = useFloorPlan()
  const { viewMode } = state

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      if (target.closest('input, select, textarea, .toolbar, .room-bottom-bar, .panel-zoom-bar')) return
      e.preventDefault()
    }

    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <main className="app-main">
        {viewMode === 'view3d' ? <View3D /> : <FloorPlanEditor />}
      </main>
      {viewMode === 'plan2d' && (
        <div className="app-footer">
          <RoomBottomBar />
        </div>
      )}
    </div>
  )
}

function App() {
  return (
    <FloorPlanProvider>
      <AppContent />
    </FloorPlanProvider>
  )
}

export default App
