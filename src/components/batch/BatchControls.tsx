import React from 'react'
import { useBatchStore } from '../../stores/batch-store'
import { useAuthStore } from '../../stores/auth-store'
import { useIpc, useIpcListener } from '../../hooks/useIpc'

/** 根据 dbTypeKey 获取预览列 */
function getPreviewColumns(dbTypeKey: string) {
  const base = [
    { key: 'name', label: '数据源名称' },
  ]
  if (dbTypeKey === 'jdbc') {
    return [...base, { key: 'url', label: 'JDBC URL' }, { key: 'username', label: '用户名' }]
  }
  if (dbTypeKey === 'http') {
    return [...base, { key: 'host', label: '服务地址' }, { key: 'port', label: '端口' }, { key: 'username', label: '用户名' }]
  }
  // sql / nosql
  return [
    ...base,
    { key: 'host', label: '数据库地址' },
    { key: 'port', label: '端口' },
    { key: 'database', label: '数据库名' },
    { key: 'username', label: '用户名' },
  ]
}

export default function BatchControls() {
  const api = useIpc()
  const { cookie, csrfToken, baseUrl, selectedWorkspace } = useAuthStore()
  const {
    items, delay, isRunning, isCompleted,
    selectedDbType, dbTypeKey, fieldConfigMap,
    setDelay, setRunning, setStopped,
    addItemResult, setProgress, setResult,
    itemResults,
  } = useBatchStore()

  // 注册 IPC 事件
  useIpcListener(api.batch.onProgress, setProgress)
  useIpcListener(api.batch.onItemResult, addItemResult)
  useIpcListener(api.batch.onCompleted, (data) => {
    setResult(data)
    setRunning(false)
  })

  const handleStart = async () => {
    if (!selectedWorkspace) return

    setRunning(true)
    setStopped(false)
    useBatchStore.setState({ itemResults: [], result: null, isCompleted: false })

    try {
      await api.batch.start({
        baseUrl,
        cookie,
        csrfToken,
        groupId: selectedWorkspace.id,
        sugarCompany: selectedWorkspace.companyId || '',
        items,
        delay,
        dbTypeName: selectedDbType,
        dbTypeKey,
        fieldConfigMap: fieldConfigMap || undefined,
      })
    } catch (err: any) {
      setRunning(false)
      alert('执行失败: ' + err.message)
    }
  }

  const handleStop = async () => {
    await api.batch.stop()
    setStopped(true)
  }

  const columns = getPreviewColumns(dbTypeKey)
  const showPreview = !isRunning && !isCompleted

  return (
    <div className="card">
      <div className="card-title">
        📋 {showPreview ? '数据预览' : '执行中'} · {selectedDbType} · {items.length} 条
      </div>

      {/* 数据预览 / 执行状态列表 */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
              {(isRunning || isCompleted) && (
                <>
                  <th>连接测试</th>
                  <th>添加状态</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => {
              const result = itemResults.find((r) => r.index === i + 1)
              return (
                <tr key={i}>
                  <td>{i + 1}</td>
                  {columns.map((col) => (
                    <td key={col.key}>{(item as any)[col.key] || '-'}</td>
                  ))}
                  {(isRunning || isCompleted) && (
                    <>
                      <td>
                        {!result ? '⏳' : result.testStatus === 'success' ? '✅ 成功'
                          : result.testStatus === 'failed' ? `❌ ${result.testMsg}`
                          : '⏭️ 跳过'}
                      </td>
                      <td>
                        {!result ? '⏳' : result.addStatus === 'success' ? '✅ 已添加'
                          : result.addStatus === 'failed' ? `❌ ${result.addMsg}`
                          : result.addStatus === 'skipped' ? '⏭️ 已跳过'
                          : '⏳'}
                      </td>
                    </>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 操作控制栏 */}
      <div className="batch-controls mt-4">
        <div className="control-group">
          <span>请求间隔:</span>
          <input
            className="form-input"
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            disabled={isRunning}
            style={{ width: 70 }}
          />
          <span>秒</span>
        </div>

        <div style={{ flex: 1 }} />

        {showPreview && (
          <button className="btn btn-primary btn-lg" onClick={handleStart}>
            ▶ 开始执行 ({items.length} 条)
          </button>
        )}
        {isRunning && (
          <button className="btn btn-danger btn-lg" onClick={handleStop}>
            ⏹ 停止
          </button>
        )}
      </div>
    </div>
  )
}
