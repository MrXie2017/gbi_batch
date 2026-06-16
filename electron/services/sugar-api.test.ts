import { describe, it, expect } from 'vitest'
import { SugarApiClient } from './sugar-api'
import type { TableFieldSchema } from './sugar-api'
import type { FieldConfigMap } from './field-config'

/** 造一个字段 schema */
function field(id: string, name: string, type: string, typeInDB = type, comment = ''): TableFieldSchema {
  return { id, name, type, typeInDB, comment, nullable: true }
}

const DB = 'prod_db'
const TABLE = 't_order'

describe('buildModelSavePayload 字段覆盖', () => {
  it('无 fieldConfigMap → 保持自动归类（string=维度, 数值=度量）', () => {
    const schema = [field('f1', 'name', 'string'), field('f2', 'amount', 'float')]
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB)
    expect(Object.keys(payload.config.dimensions)).toContain('f1')
    expect(Object.keys(payload.config.measures)).toContain('f2')
    expect(payload.config.dimensions.f1.alias).toBe('name')
  })

  it('alias / comment / hidden 覆盖生效', () => {
    const schema = [field('f1', 'name', 'string', 'string', '原备注')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|name`]: { alias: '客户名', comment: '新备注', hidden: true },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    const dim = payload.config.dimensions.f1
    expect(dim.alias).toBe('客户名')
    expect(dim.comment).toBe('新备注')
    expect(dim.isHidden).toBe(true)
  })

  it('sheet2 把 string 字段配成「度量」→ 归入 measures 且挂度量属性', () => {
    const schema = [field('f1', 'code', 'string')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|code`]: { role: 'measure', unit: '个' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(Object.keys(payload.config.dimensions)).not.toContain('f1')
    expect(Object.keys(payload.config.measures)).toContain('f1')
    expect(payload.config.measures.f1.format.unit).toBe('个')
  })

  it('数值字段被配成「维度」→ 归入 dimensions', () => {
    const schema = [field('f1', 'level', 'int')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|level`]: { role: 'dimension' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(Object.keys(payload.config.dimensions)).toContain('f1')
    expect(Object.keys(payload.config.measures)).not.toContain('f1')
  })

  it('未匹配的字段走默认', () => {
    const schema = [field('f1', 'name', 'string')]
    const map: FieldConfigMap = { '其他库|其他表|name': { alias: '不应命中' } }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(payload.config.dimensions.f1.alias).toBe('name')
  })

  it('菜单 nodes 与归类一致（维度菜单含维度字段，度量菜单含度量字段）', () => {
    const schema = [field('f1', 'name', 'string'), field('f2', 'amt', 'int')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|amt`]: { role: 'dimension' }, // 把 amt 也配成维度
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    const dimNodes = payload.config.dimensionMenu[0].nodes as string[]
    expect(dimNodes).toEqual(expect.arrayContaining(['f1', 'f2']))
    expect(payload.config.measureMenu[0].nodes).toHaveLength(0)
  })

  it('维度字段的 unit 配置被忽略（unit 仅度量生效，不泄漏到 dimension 对象）', () => {
    const schema = [field('f1', 'name', 'string')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|name`]: { role: 'dimension', unit: '个' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(Object.keys(payload.config.dimensions)).toContain('f1')
    expect((payload.config.dimensions.f1 as any).format).toBeUndefined()
  })

  it('回归：匹配键第一段是 sheet1「数据库名」(databaseName)，不是「数据源名称」(datasourceName)', () => {
    // 模拟真实场景：数据源名称=多表数据库测试1，数据库名=baidu_ai；sheet2「数据库名」列填 baidu_ai
    const schema = [field('f1', 'region', 'string')]
    const map: FieldConfigMap = {
      [`baidu_ai|test|region`]: { alias: '行政区' },
    }
    // 传数据库名 baidu_ai → 命中
    const hit = SugarApiClient.buildModelSavePayload('hash', 'test', 'ds_hash', 0, schema, 'test', 'baidu_ai', map)
    expect(hit.config.dimensions.f1.alias).toBe('行政区')
    // 误传数据源名称 多表数据库测试1 → 不命中，走默认（alias 回退为字段名）
    const miss = SugarApiClient.buildModelSavePayload('hash', 'test', 'ds_hash', 0, schema, 'test', '多表数据库测试1', map)
    expect(miss.config.dimensions.f1.alias).toBe('region')
  })

  it('geo 标记写入 dimension.convert.label（地名/区域=geo）', () => {
    const schema = [field('f1', 'region', 'string')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|region`]: { geo: 'geo' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(payload.config.dimensions.f1.convert.label).toBe('geo')
  })

  it('geo=lng/lat 强制归维度并写入对应 label；未配 geo 的数值字段仍归度量', () => {
    // lng/lat 字段通常是 float，默认归度量；但有 geo → 强制维度（与源码 convertDataLabel 一致）
    const schema = [field('f1', 'lng', 'float'), field('f2', 'lat', 'float'), field('f3', 'amt', 'int')]
    const map: FieldConfigMap = {
      [`${DB}|${TABLE}|lng`]: { geo: 'lng' },
      [`${DB}|${TABLE}|lat`]: { geo: 'lat' },
    }
    const payload = SugarApiClient.buildModelSavePayload('hash', TABLE, DB, 0, schema, TABLE, DB, map)
    expect(payload.config.dimensions.f1.convert.label).toBe('lng')
    expect(payload.config.dimensions.f2.convert.label).toBe('lat')
    expect(Object.keys(payload.config.measures)).toContain('f3') // 未配 geo 的 int → 度量
    expect(payload.config.dimensions.f3).toBeUndefined()
  })
})
