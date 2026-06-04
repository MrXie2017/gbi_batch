import React, { useState, useEffect } from 'react'
import { useAuthStore } from './stores/auth-store'
import { useBatchStore } from './stores/batch-store'
import Header from './components/layout/Header'
import StepIndicator from './components/layout/StepIndicator'
import LoginStep from './components/login/LoginStep'
import FileUpload from './components/upload/FileUpload'
import DataPreview from './components/upload/DataPreview'
import BatchControls from './components/batch/BatchControls'
import ProgressBar from './components/batch/ProgressBar'
import ItemStatusList from './components/batch/ItemStatusList'
import StatsPanel from './components/batch/StatsPanel'
import ResultsSummary from './components/results/ResultsSummary'
import ExportButton from './components/results/ExportButton'

export type AppStep = 'login' | 'upload' | 'batch' | 'results'

function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>('login')
  const { isLoggedIn, selectedWorkspace } = useAuthStore()
  const { items, isCompleted, result, reset } = useBatchStore()

  // 步骤自动推进
  useEffect(() => {
    if (isLoggedIn && selectedWorkspace && currentStep === 'login') {
      setCurrentStep('upload')
    }
  }, [isLoggedIn, selectedWorkspace, currentStep])

  useEffect(() => {
    if (items.length > 0 && currentStep === 'upload') {
      setCurrentStep('batch')
    }
  }, [items.length, currentStep])

  useEffect(() => {
    if (isCompleted && currentStep === 'batch') {
      setCurrentStep('results')
    }
  }, [isCompleted, currentStep])

  const handleRestart = () => {
    reset()
    setCurrentStep('upload')
  }

  return (
    <div className="app-container">
      <Header />
      <StepIndicator currentStep={currentStep} onStepClick={setCurrentStep} />
      <div className="main-content">
        {currentStep === 'login' && <LoginStep />}
        {currentStep === 'upload' && (
          <>
            <FileUpload />
            {items.length > 0 && <DataPreview />}
          </>
        )}
        {currentStep === 'batch' && (
          <>
            <BatchControls />
            <ProgressBar />
            <StatsPanel />
            <ItemStatusList />
          </>
        )}
        {currentStep === 'results' && (
          <>
            <ResultsSummary />
            <div className="flex-row mt-4" style={{ justifyContent: 'center' }}>
              <ExportButton />
              <button className="btn btn-outline" onClick={handleRestart}>
                🔄 继续添加
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default App
