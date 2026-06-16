import { describe, it, expect } from 'vitest'
import { parseRole, parseHidden } from './field-config'

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
