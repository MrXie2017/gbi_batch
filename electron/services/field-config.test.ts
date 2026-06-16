import { describe, it, expect } from 'vitest'
import * as xlsx from 'xlsx'
import { parseRole, parseHidden, buildFieldConfigMap, matchField } from './field-config'

describe('parseRole', () => {
  it('中文「维度」「维」→ dimension', () => {
    expect(parseRole('维度')).toBe('dimension')
    expect(parseRole('维')).toBe('dimension')
    expect(parseRole(' 维度 ')).toBe('dimension')
  })
  it('中文「度量」「度」→ measure', () => {
    expect(parseRole('度量')).toBe('measure')
    expect(parseRole('度')).toBe('measure')
  })
  it('英文 dimension/measure 不区分大小写', () => {
    expect(parseRole('dimension')).toBe('dimension')
    expect(parseRole('MEASURE')).toBe('measure')
    expect(parseRole('Dimension')).toBe('dimension')
  })
  it('空值/未知值 → null（表示不覆盖，走默认归类）', () => {
    expect(parseRole('')).toBeNull()
    expect(parseRole('   ')).toBeNull()
    expect(parseRole('未知')).toBeNull()
  })
})

describe('parseHidden', () => {
  it('是/Y/1/true → true', () => {
    expect(parseHidden('是')).toBe(true)
    expect(parseHidden('Y')).toBe(true)
    expect(parseHidden('1')).toBe(true)
    expect(parseHidden('true')).toBe(true)
    expect(parseHidden('TRUE')).toBe(true)
  })
  it('否/N/0/false/空 → false', () => {
    expect(parseHidden('否')).toBe(false)
    expect(parseHidden('N')).toBe(false)
    expect(parseHidden('0')).toBe(false)
    expect(parseHidden('')).toBe(false)
    expect(parseHidden('随便填的')).toBe(false)
  })
})

describe('buildFieldConfigMap', () => {
  const rows: string[][] = [
    ['库A', 't_user', 'name', '姓名', '用户名', '维度', '是', ''],
    ['库A', 't_user', 'amount', '金额', '订单金额', '度量', '否', '元'],
    ['库A', 't_user', 'name', '姓名2', '', '维度', '', ''], // 重复 key → 覆盖
    ['', '', 'orphan', '', '', '', '', ''],                  // 库/表空 → 跳过
    ['库B', 't_order', 'id', '', '', '', '', ''],            // 全空配置 → 跳过该行（无可覆盖项）
  ]

  it('按列序构建，重复 key 后者覆盖', () => {
    const map = buildFieldConfigMap(rows)
    const cfg = matchField(map, '库A', 't_user', 'name')
    expect(cfg).toBeDefined()
    expect(cfg!.alias).toBe('姓名2') // 被第 3 行覆盖
    expect(cfg!.role).toBe('dimension')
    expect(cfg!.hidden).toBe(false)
  })

  it('度量字段携带单位', () => {
    const map = buildFieldConfigMap(rows)
    const cfg = matchField(map, '库A', 't_user', 'amount')!
    expect(cfg.role).toBe('measure')
    expect(cfg.unit).toBe('元')
    expect(cfg.alias).toBe('金额')
    expect(cfg.comment).toBe('订单金额')
  })

  it('库/表为空的行被跳过', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '', '', 'orphan')).toBeUndefined()
  })

  it('全空配置行被跳过（不出现在 map）', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '库B', 't_order', 'id')).toBeUndefined()
  })

  it('未匹配返回 undefined', () => {
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '库A', 't_user', 'not_exist')).toBeUndefined()
  })

  it('空行数组 → 空 map', () => {
    expect(Object.keys(buildFieldConfigMap([]))).toHaveLength(0)
  })

  it('短行（不足 8 列）不崩溃，缺失列视为空', () => {
    const map = buildFieldConfigMap([['库A', 't', 'f', '别名']])
    const cfg = matchField(map, '库A', 't', 'f')
    expect(cfg).toBeDefined()
    expect(cfg!.alias).toBe('别名')
    expect(cfg!.hidden).toBe(false) // 缺失列 → parseHidden('') → false
    expect(cfg!.role).toBeUndefined()
  })

  it('超长行（多于 8 列）多余列被忽略', () => {
    const map = buildFieldConfigMap([['库A', 't', 'f', '别名', '', '维度', '', '', '多余1', '多余2']])
    const cfg = matchField(map, '库A', 't', 'f')!
    expect(cfg.alias).toBe('别名')
    expect(cfg.role).toBe('dimension')
  })

  it('查找参数带空格仍能命中（与 key 构建一致 trim）', () => {
    const map = buildFieldConfigMap([['库A', 't_user', 'name', '姓名', '', '维度', '', '']])
    expect(matchField(map, ' 库A ', ' t_user ', ' name ')).toBeDefined()
  })
})

describe('sheet2 矩阵解析（excel-parser 调用形态）', () => {
  it('xlsx sheet_to_json header:1 的矩阵经 buildFieldConfigMap 正确产出', () => {
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.aoa_to_sheet([
      ['数据库名', '表名', '字段名', '别名', '字段备注', '维度或度量', '是否隐藏', '字段单位'],
      ['库A', 't', 'price', '价格', '', '度量', '否', '元'],
    ])
    xlsx.utils.book_append_sheet(wb, ws, '字段配置')
    const matrix = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })
    const map = buildFieldConfigMap(matrix.slice(1).map((r) => r.map((c) => String(c ?? ''))))
    const cfg = matchField(map, '库A', 't', 'price')!
    expect(cfg.alias).toBe('价格')
    expect(cfg.role).toBe('measure')
    expect(cfg.unit).toBe('元')
  })
})
