import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

export default function ProgressBar() {
  const { progress, isRunning } = useBatchStore()

  if (!progress) return null

  const percent = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0

  return (
    <div className="card">
      <div className="flex-between mb-2">
        <span className="text-muted">
          {isRunning ? '⏳ 执行中...' : progress.status === 'stopped' ? '⏹ 已停止' : '✅ 执行完成'}
        </span>
        <span className="text-muted">
          {progress.current} / {progress.total} ({percent}%)
        </span>
      </div>
      <div className="progress-bar-container">
        <div
          className={`progress-bar-fill ${!isRunning && percent === 100 ? 'success' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
