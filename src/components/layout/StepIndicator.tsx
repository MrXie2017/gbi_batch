import React from 'react'
import type { AppStep } from '../../App'

const STEPS: { key: AppStep; label: string }[] = [
  { key: 'login', label: '登录' },
  { key: 'upload', label: '上传数据' },
  { key: 'batch', label: '批量执行' },
  { key: 'results', label: '查看结果' },
]

const STEP_ORDER: Record<AppStep, number> = {
  login: 0,
  upload: 1,
  batch: 2,
  results: 3,
}

interface Props {
  currentStep: AppStep
  onStepClick: (step: AppStep) => void
}

export default function StepIndicator({ currentStep, onStepClick }: Props) {
  const currentIndex = STEP_ORDER[currentStep]

  return (
    <div className="step-indicator">
      {STEPS.map((step, i) => {
        const isActive = step.key === currentStep
        const isCompleted = STEP_ORDER[step.key] < currentIndex

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`step-connector ${isCompleted ? 'completed' : ''}`} />
            )}
            <div
              className={`step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
              onClick={() => {
                // 只允许点击已完成的步骤
                if (isCompleted) onStepClick(step.key)
              }}
              style={{ cursor: isCompleted ? 'pointer' : 'default' }}
            >
              <span className="step-number">
                {isCompleted ? '✓' : i + 1}
              </span>
              <span>{step.label}</span>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}
