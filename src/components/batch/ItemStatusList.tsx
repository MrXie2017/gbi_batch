import React from 'react'
import { useBatchStore } from '../../stores/batch-store'

export default function ItemStatusList() {
  const { itemResults } = useBatchStore()

  if (itemResults.length === 0) return null

  return (
    <div className="card">
      <div className="card-title">📋 执行详情</div>
      <div className="item-list">
        {itemResults.map((item) => (
          <div className="item-row" key={item.index}>
            <span className="item-index">{item.index}</span>
            <span className="item-name">{item.name}</span>
            <span className="item-host">{item.host}</span>
            {item.testStatus !== 'skipped' && (
              <span className={`item-status ${item.testStatus}`}>
                {item.testStatus === 'success' ? '✅ 连接成功' : '❌ 连接失败'}
              </span>
            )}
            <span className={`item-status ${item.addStatus}`}>
              {item.addStatus === 'success' && '✅ 已添加'}
              {item.addStatus === 'failed' && '❌ 添加失败'}
              {item.addStatus === 'skipped' && '⏭️ 已跳过'}
              {item.addStatus === 'pending' && '⏳ 待执行'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
