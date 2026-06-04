import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

export default function StatsPanel() {
  const { itemResults, progress } = useBatchStore()

  if (!progress) return null

  const success = itemResults.filter((r) => r.addStatus === 'success').length
  const failed = itemResults.filter((r) => r.addStatus === 'failed').length
  const skipped = itemResults.filter((r) => r.addStatus === 'skipped').length

  return (
    <div className="stats-grid">
      <div className="stat-card total">
        <div className="stat-value">{progress.total}</div>
        <div className="stat-label">总计</div>
      </div>
      <div className="stat-card success">
        <div className="stat-value">{success}</div>
        <div className="stat-label">✅ 成功</div>
      </div>
      <div className="stat-card failed">
        <div className="stat-value">{failed}</div>
        <div className="stat-label">❌ 失败</div>
      </div>
      <div className="stat-card skipped">
        <div className="stat-value">{skipped}</div>
        <div className="stat-label">⏭️ 跳过</div>
      </div>
    </div>
  )
}
