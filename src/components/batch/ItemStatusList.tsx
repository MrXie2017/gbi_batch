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
            {/* 测试连接状态 */}
            <span className={`item-status ${item.testStatus}`}>
              {item.testStatus === 'success' && '✅ 连接成功'}
              {item.testStatus === 'failed' && `❌ 连接失败: ${item.testMsg}`}
              {item.testStatus === 'skipped' && '⏭️ 跳过测试'}
            </span>
            {/* 添加状态 */}
            <span className={`item-status ${item.addStatus}`}>
              {item.addStatus === 'success' && '✅ 已添加'}
              {item.addStatus === 'failed' && `❌ 添加失败: ${item.addMsg}`}
              {item.addStatus === 'skipped' && '⏭️ 添加已跳过'}
              {item.addStatus === 'pending' && '⏳ 待执行'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
