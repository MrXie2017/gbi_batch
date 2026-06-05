import React, { useState, useEffect, useRef } from 'react'
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
import ResultsSummary from './components/results/ResultsSummary'
import ExportButton from './components/results/ExportButton'

export type AppStep = 'login' | 'upload' | 'batch' | 'results'

const STEP_ORDER: AppStep[] = ['login', 'upload', 'batch', 'results']

function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>('login')
  const { isLoggedIn, selectedWorkspace } = useAuthStore()
  const { items, isCompleted, reset } = useBatchStore()

  // 用户手动回退时，暂时阻止自动推进
  const suppressAutoAdvance = useRef(false)

  // 步骤自动推进（仅在非手动回退时生效）
  useEffect(() => {
    if (suppressAutoAdvance.current) return
    if (isLoggedIn && selectedWorkspace && currentStep === 'login') {
      setCurrentStep('upload')
    }
  }, [isLoggedIn, selectedWorkspace, currentStep])

  useEffect(() => {
    if (suppressAutoAdvance.current) return
    if (items.length > 0 && currentStep === 'upload') {
      setCurrentStep('batch')
    }
  }, [items.length, currentStep])

  useEffect(() => {
    if (suppressAutoAdvance.current) return
    if (isCompleted && currentStep === 'batch') {
      setCurrentStep('results')
    }
  }, [isCompleted, currentStep])

  // 手动回退后，下一次渲染恢复自动推进
  useEffect(() => {
    if (suppressAutoAdvance.current) {
      suppressAutoAdvance.current = false
    }
  })

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(currentStep)
    if (idx > 0) {
      const prevStep = STEP_ORDER[idx - 1]
      // 回到上传步骤时清空已加载数据
      if (prevStep === 'upload') {
        reset()
      }
      // 回到批量步骤时重置执行状态（让执行按钮重新显示）
      if (prevStep === 'batch') {
        useBatchStore.setState({ isCompleted: false, isRunning: false, isStopped: false })
      }
      // 标记为手动回退，阻止 useEffect 自动推进
      suppressAutoAdvance.current = true
      setCurrentStep(prevStep)
    }
  }

  const handleRestart = () => {
    reset()
    setCurrentStep('upload')
  }

  const canGoBack = STEP_ORDER.indexOf(currentStep) > 0

  return (
    <div className="app-container">
      <Header />
      <StepIndicator currentStep={currentStep} onStepClick={setCurrentStep} />
      <div className="main-content">
        {/* 返回上一步按钮 */}
        {canGoBack && (
          <button className="btn btn-outline mb-4" onClick={goBack}>
            ← 返回上一步
          </button>
        )}

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
          </>
        )}
        {currentStep === 'results' && (
          <>
            <ResultsSummary />
            <ItemStatusList />
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
