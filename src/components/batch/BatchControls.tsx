import React, { useEffect } from 'react'
import { useBatchStore } from '../../stores/batch-store'
import { useAuthStore } from '../../stores/auth-store'
import { useIpc, useIpcListener } from '../../hooks/useIpc'

export default function BatchControls() {
  const api = useIpc()
  const { cookie, csrfToken, baseUrl, selectedWorkspace } = useAuthStore()
  const {
    items, skipTest, delay, isRunning, isCompleted,
    setSkipTest, setDelay, setRunning, setStopped,
    addItemResult, setProgress, setResult,
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
        sugarCompany: (selectedWorkspace as any).companyId || '',
        items,
        skipTest,
        delay,
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

  return (
    <div className="card">
      <div className="card-title">⚙️ 操作控制</div>
      <div className="batch-controls">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={skipTest}
            onChange={(e) => setSkipTest(e.target.checked)}
            disabled={isRunning}
          />
          跳过测试连接
        </label>

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

        {!isRunning && !isCompleted && (
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
