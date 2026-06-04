import { create } from 'zustand'
import type { DatasourceItem, ItemResult, BatchProgress, BatchResult } from '../types'

interface BatchState {
  /** 已加载的数据源列表 */
  items: DatasourceItem[]
  /** 文件路径 */
  filePath: string | null
  /** 列名 */
  columns: string[]
  /** 是否正在执行 */
  isRunning: boolean
  /** 是否已停止 */
  isStopped: boolean
  /** 当前进度 */
  progress: BatchProgress | null
  /** 每条结果 */
  itemResults: ItemResult[]
  /** 最终结果 */
  result: BatchResult | null
  /** 是否跳过测试 */
  skipTest: boolean
  /** 请求间隔（秒） */
  delay: number
  /** 是否已完成 */
  isCompleted: boolean

  setItems: (items: DatasourceItem[], columns: string[]) => void
  setFilePath: (path: string | null) => void
  setRunning: (running: boolean) => void
  setStopped: (stopped: boolean) => void
  setProgress: (progress: BatchProgress) => void
  addItemResult: (result: ItemResult) => void
  setResult: (result: BatchResult) => void
  setSkipTest: (skip: boolean) => void
  setDelay: (delay: number) => void
  setCompleted: (completed: boolean) => void
  reset: () => void
}

const initialState = {
  items: [],
  filePath: null,
  columns: [],
  isRunning: false,
  isStopped: false,
  progress: null,
  itemResults: [],
  result: null,
  skipTest: false,
  delay: 1.0,
  isCompleted: false,
}

export const useBatchStore = create<BatchState>((set) => ({
  ...initialState,

  setItems: (items, columns) => set({ items, columns }),

  setFilePath: (path) => set({ filePath: path }),

  setRunning: (running) => set({ isRunning: running }),

  setStopped: (stopped) => set({ isStopped: stopped }),

  setProgress: (progress) => set({ progress }),

  addItemResult: (result) =>
    set((state) => ({
      itemResults: [...state.itemResults, result],
    })),

  setResult: (result) => set({ result, isRunning: false, isCompleted: true }),

  setSkipTest: (skip) => set({ skipTest: skip }),

  setDelay: (delay) => set({ delay }),

  setCompleted: (completed) => set({ isCompleted: completed }),

  reset: () => set({ ...initialState }),
}))
