import { useEffect } from 'react'
import { AuthProvider } from './context/AuthContext'
import { FloorPlanProvider, useFloorPlan } from './context/FloorPlanContext'
import { FloorPlanEditor } from './components/FloorPlanEditor'
import { ProjectNotesPanel } from './components/ProjectNotesPanel'
import { FurniturePanel } from './components/FurniturePanel'
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
      if (target.closest('input, select, textarea, .toolbar, .room-bottom-bar, .room-list-panel, .room-list-fab, .plan-panel, .project-notes-panel, .project-notes-fab, .furniture-panel, .furniture-panel-fab')) return
      e.preventDefault()
    }

    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  return (
    <div className="app">
      <Toolbar />
      <main className="app-main">
        <div className="app-main-workspace">
          <div className={`workspace-pane${viewMode === 'plan2d' ? ' workspace-pane-active' : ''}`}>
            <FloorPlanEditor />
          </div>
          <View3D />
          <ProjectNotesPanel />
          <FurniturePanel />
        </div>
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
    <AuthProvider>
      <FloorPlanProvider>
        <AppContent />
      </FloorPlanProvider>
    </AuthProvider>
  )
}

export default App
