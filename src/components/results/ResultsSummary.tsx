import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

export default function ResultsSummary() {
  const { result, itemResults } = useBatchStore()

  if (!result) return null

  const allSuccess = result.success === result.total && !result.stopped

  return (
    <div className="card results-summary">
      <div className="results-icon">
        {allSuccess ? '🎉' : result.stopped ? '⏹' : '📊'}
      </div>
      <div className="results-title">
        {allSuccess
          ? '全部执行成功！'
          : result.stopped
          ? '执行已停止'
          : '执行完成'}
      </div>
      {result.stopped && (
        <div className="text-muted mb-2">
          已处理 {result.success + result.failed + result.skipped} / {result.total} 条
        </div>
      )}
      <div className="results-stats">
        <div className="results-stat">
          <div className="results-stat-value" style={{ color: 'var(--success)' }}>
            {result.success}
          </div>
          <div className="results-stat-label">成功</div>
        </div>
        <div className="results-stat">
          <div className="results-stat-value" style={{ color: 'var(--danger)' }}>
            {result.failed}
          </div>
          <div className="results-stat-label">失败</div>
        </div>
        <div className="results-stat">
          <div className="results-stat-value" style={{ color: 'var(--warning)' }}>
            {result.skipped}
          </div>
          <div className="results-stat-label">跳过</div>
        </div>
      </div>
    </div>
  )
}
