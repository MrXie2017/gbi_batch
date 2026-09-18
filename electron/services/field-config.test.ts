import { describe, it, expect } from 'vitest'
import * as xlsx from 'xlsx'
import {
  parseRole, parseHidden, parseGeo, buildFieldConfigMap, matchField, buildModelNameMap, matchModelName,
  resolveSheet2Columns, fillDownSheet2Rows, buildSheet2Config, buildTableConfigMap, filterTablesByConfig,
  listConfiguredFields, DEFAULT_SHEET2_COLUMNS,
} from './field-config'

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

describe('parseGeo', () => {
  it('地名/区域/地名/区域/geo → geo', () => {
    expect(parseGeo('地名/区域')).toBe('geo')
    expect(parseGeo('地名')).toBe('geo')
    expect(parseGeo('区域')).toBe('geo')
    expect(parseGeo('geo')).toBe('geo')
    expect(parseGeo('GEO')).toBe('geo')
  })
  it('经度/lng/longitude → lng', () => {
    expect(parseGeo('经度')).toBe('lng')
    expect(parseGeo('lng')).toBe('lng')
    expect(parseGeo('longitude')).toBe('lng')
  })
  it('纬度/lat/latitude → lat', () => {
    expect(parseGeo('纬度')).toBe('lat')
    expect(parseGeo('lat')).toBe('lat')
    expect(parseGeo('latitude')).toBe('lat')
  })
  it('空/不标记/无/none/未知 → null（不覆盖）', () => {
    expect(parseGeo('')).toBeNull()
    expect(parseGeo('  ')).toBeNull()
    expect(parseGeo('不标记')).toBeNull()
    expect(parseGeo('无')).toBeNull()
    expect(parseGeo('none')).toBeNull()
    expect(parseGeo('随便')).toBeNull()
  })
})

describe('buildFieldConfigMap', () => {
  const rows: string[][] = [
    ['库A', 't_user', '', 'name', '姓名', '用户名', '维度', '是', ''],
    ['库A', 't_user', '', 'amount', '金额', '订单金额', '度量', '否', '元'],
    ['库A', 't_user', '', 'name', '姓名2', '', '维度', '', ''], // 重复 key → 覆盖
    ['', '', '', 'orphan', '', '', '', '', ''],                  // 库/表空 → 跳过
    ['库B', 't_order', '', 'id', '', '', '', '', ''],            // 全空配置 → 跳过该行（无可覆盖项）
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

  it('短行（不足 10 列）不崩溃，缺失列视为空', () => {
    const map = buildFieldConfigMap([['库A', 't', '', 'f', '别名']])
    const cfg = matchField(map, '库A', 't', 'f')
    expect(cfg).toBeDefined()
    expect(cfg!.alias).toBe('别名')
    expect(cfg!.hidden).toBe(false) // 缺失列 → parseHidden('') → false
    expect(cfg!.role).toBeUndefined()
  })

  it('超长行（多于 9 列）多余列被忽略', () => {
    const map = buildFieldConfigMap([['库A', 't', '', 'f', '别名', '', '维度', '', '', '', '多余1', '多余2']])
    const cfg = matchField(map, '库A', 't', 'f')!
    expect(cfg.alias).toBe('别名')
    expect(cfg.role).toBe('dimension')
    expect(cfg.geo).toBeUndefined()
  })

  it('geo 列（第 9 列）解析为 geo/lng/lat；不标记 → 不设', () => {
    const rows: string[][] = [
      ['库A', 't', '', 'region', '', '', '维度', '', '', '地名/区域'],
      ['库A', 't', '', 'lng', '', '', '维度', '', '', '经度'],
      ['库A', 't', '', 'lat', '', '', '维度', '', '', '纬度'],
      ['库A', 't', '', 'plain', '', '', '维度', '', '', '不标记'],
    ]
    const map = buildFieldConfigMap(rows)
    expect(matchField(map, '库A', 't', 'region')!.geo).toBe('geo')
    expect(matchField(map, '库A', 't', 'lng')!.geo).toBe('lng')
    expect(matchField(map, '库A', 't', 'lat')!.geo).toBe('lat')
    expect(matchField(map, '库A', 't', 'plain')!.geo).toBeUndefined()
  })

  it('查找参数带空格仍能命中（与 key 构建一致 trim）', () => {
    const map = buildFieldConfigMap([['库A', 't_user', '', 'name', '姓名', '', '维度', '', '', '']])
    expect(matchField(map, ' 库A ', ' t_user ', ' name ')).toBeDefined()
  })
})

describe('sheet2 矩阵解析（excel-parser 调用形态）', () => {
  it('xlsx sheet_to_json header:1 的矩阵经 buildFieldConfigMap 正确产出', () => {
    const wb = xlsx.utils.book_new()
    const ws = xlsx.utils.aoa_to_sheet([
      ['数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注', '维度或度量', '是否隐藏', '字段单位'],
      ['库A', 't', '', 'price', '价格', '', '度量', '否', '元'],
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

describe('buildModelNameMap / matchModelName（表级模型名：第 3 列「中文名」）', () => {
  it('按「数据库名|表名」取第 3 列中文名作为模型名', () => {
    const rows: string[][] = [
      ['dbA', 't_user', '用户表', 'name', '', '', '维度', '', '', ''],
      ['dbA', 't_user', '用户表', 'amount', '', '', '度量', '', '', ''],
      ['dbA', 't_order', '订单表', 'id', '', '', '维度', '', '', ''],
    ]
    const map = buildModelNameMap(rows)
    expect(matchModelName(map, 'dbA', 't_user')).toBe('用户表')
    expect(matchModelName(map, 'dbA', 't_order')).toBe('订单表')
  })

  it('同一表多行中文名不一致 → 第一个非空胜出', () => {
    const rows: string[][] = [
      ['dbA', 't', '第一个', 'f1', '', '', '', '', '', ''],
      ['dbA', 't', '第二个', 'f2', '', '', '', '', '', ''],
    ]
    expect(matchModelName(buildModelNameMap(rows), 'dbA', 't')).toBe('第一个')
  })

  it('中文名为空的行不写入（查找回退）', () => {
    const rows: string[][] = [
      ['dbA', 't', '', 'f1', '', '', '', '', '', ''],
    ]
    expect(matchModelName(buildModelNameMap(rows), 'dbA', 't')).toBeUndefined()
  })

  it('库/表为空的行跳过', () => {
    expect(Object.keys(buildModelNameMap([['', '', '中文名', 'f1', '', '', '', '', '', '']]))).toHaveLength(0)
  })

  it('短行不崩溃，中文名列缺失视为空', () => {
    expect(matchModelName(buildModelNameMap([['dbA', 't']]), 'dbA', 't')).toBeUndefined()
  })

  it('查找参数带空格仍命中（与 key 构建一致 trim）', () => {
    const rows: string[][] = [['dbA', 't', '中文名', 'f1', '', '', '', '', '', '']]
    expect(matchModelName(buildModelNameMap(rows), ' dbA ', ' t ')).toBe('中文名')
  })

  it('空行数组 → 空 map', () => {
    expect(Object.keys(buildModelNameMap([]))).toHaveLength(0)
  })
})

describe('resolveSheet2Columns（表头识别）', () => {
  it('标准模板表头 → 默认列序', () => {
    const cols = resolveSheet2Columns([
      '数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注',
      '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息',
    ])
    expect(cols).toEqual(DEFAULT_SHEET2_COLUMNS)
  })

  it('插入「序号」列并调整列序仍能识别；未识别的可选列置 -1 而非默认索引', () => {
    const cols = resolveSheet2Columns(['序号', '表名', '数据库名', '字段名', '中文名(问数模型名称)', '别名'])
    expect(cols.db).toBe(2)
    expect(cols.table).toBe(1)
    expect(cols.field).toBe(3)
    expect(cols.modelName).toBe(4)
    expect(cols.alias).toBe(5)
    expect(cols.comment).toBe(-1) // 表头未出现 → 禁用，防止读错列
  })

  it('缺少关键列（库名/表名/字段名）→ 整体回退默认列序', () => {
    expect(resolveSheet2Columns(['随便写写', '表名'])).toEqual(DEFAULT_SHEET2_COLUMNS)
    expect(resolveSheet2Columns([])).toEqual(DEFAULT_SHEET2_COLUMNS)
  })

  it('旧 9 列模板（无中文名列）：modelName 禁用，模型名不再错读为字段名', () => {
    const legacyHeader = ['数据库名', '表名', '字段名', '别名', '字段备注', '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息']
    const cols = resolveSheet2Columns(legacyHeader)
    expect(cols.db).toBe(0)
    expect(cols.table).toBe(1)
    expect(cols.field).toBe(2)
    expect(cols.modelName).toBe(-1) // 关键：不能回退默认索引 2（那是字段名列）

    const cfg = buildSheet2Config([
      legacyHeader,
      ['dbA', 't_user', 'name', '姓名', '', '维度', '', '', ''],
      ['dbA', 't_user', 'amount', '金额', '订单金额', '度量', '否', '元', ''],
    ])
    expect(Object.keys(cfg.modelNameMap)).toHaveLength(0) // 回退「数据源名_表名」，而非「数据源名_name」
    expect(matchField(cfg.fieldConfig, 'dbA', 't_user', 'name')!.alias).toBe('姓名')
    expect(cfg.tableConfigMap['dba']).toEqual(['t_user'])
  })
})

describe('fillDownSheet2Rows（合并单元格/按组只填一次）', () => {
  it('库名/表名/中文名向下填充，字段名等其余列不填充', () => {
    const filled = fillDownSheet2Rows([
      ['dbA', 't1', '表一', 'f1', '别名1'],
      ['', '', '', 'f2', '别名2'],
      ['', '', '', 'f3', ''],
    ])
    expect(filled[1]).toEqual(['dbA', 't1', '表一', 'f2', '别名2'])
    expect(filled[2][0]).toBe('dbA')
    expect(filled[2][2]).toBe('表一')
  })

  it('新组首行（库名/表名齐全）中文名为空 → 不继承上一组的中文名', () => {
    const filled = fillDownSheet2Rows([
      ['dbA', 't1', '表一', 'f1', ''],
      ['dbA', 't2', '', 'f1', ''],
    ])
    expect(filled[1][2]).toBe('') // t2 未命名，不能泄漏「表一」
  })

  it('db 列合并单元格 + 表名每行填写：新表中文名留空同样不泄漏上一组名', () => {
    const filled = fillDownSheet2Rows([
      ['dbA', 't1', '表一', 'f1', ''],
      ['', 't2', '', 'f1', ''], // db 空 = 合并单元格延续，但 t2 是新表
    ])
    expect(filled[1][0]).toBe('dbA') // db 继承
    expect(filled[1][2]).toBe('')    // 中文名不继承「表一」
  })
})

describe('buildSheet2Config（总入口：表头识别 + 向下填充）', () => {
  const matrix = [
    ['序号', '数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名', '字段备注', '维度或度量', '在分析中隐藏', '字段单位', '标记地理信息'],
    ['1', 'DB_A', 'T_USER', '用户表', 'NAME', '姓名', '', '维度', '', '', ''],
    ['', '', '', '', 'AMOUNT', '金额', '订单金额', '度量', '否', '元', ''],
    ['', '', '', '', 'CREATED_AT', '创建时间', '', '维度', '', '', ''],
  ]

  it('合并单元格 + 列漂移 + 大小写漂移下三个映射全部命中', () => {
    const cfg = buildSheet2Config(matrix)
    expect(matchField(cfg.fieldConfig, 'db_a', 't_user', 'name')!.alias).toBe('姓名')
    expect(matchField(cfg.fieldConfig, 'DB_A', 'T_USER', 'amount')!.unit).toBe('元')
    expect(matchField(cfg.fieldConfig, 'db_a', 't_user', 'created_at')!.alias).toBe('创建时间')
    expect(matchModelName(cfg.modelNameMap, 'db_a', 't_user')).toBe('用户表')
    expect(cfg.tableConfigMap['db_a']).toEqual(['T_USER'])
  })

  it('顶部标题/说明行不干扰：向下扫描定位真实表头', () => {
    const cfg = buildSheet2Config([
      ['智能问数批量连接数据库模板'],
      ['数据库名', '表名', '中文名(问数模型名称)', '字段名', '别名'],
      ['dbA', 't', '表A', 'f1', '别名1'],
    ])
    expect(matchModelName(cfg.modelNameMap, 'dbA', 't')).toBe('表A')
    expect(matchField(cfg.fieldConfig, 'dbA', 't', 'f1')!.alias).toBe('别名1')
    expect(cfg.tableConfigMap['dba']).toEqual(['t'])
  })
})

describe('大小写归一化（构建与查找两侧统一）', () => {
  it('大小写不同仍命中', () => {
    const map = buildFieldConfigMap([['DBA', 'T_USER', '', 'Name', '姓名', '', '', '', '', '']])
    expect(matchField(map, 'dba', 't_user', 'name')).toBeDefined()
    const names = buildModelNameMap([['DBA', 'T_USER', '用户表', 'f', '', '', '', '', '', '']])
    expect(matchModelName(names, 'dba', 't_user')).toBe('用户表')
  })
})

describe('库名为空的兜底匹配（JDBC 等类型无「数据库名」列）', () => {
  it('表名+字段名全局唯一 → 命中', () => {
    const map = buildFieldConfigMap([
      ['db1', 't_user', '', 'name', '姓名', '', '', '', '', ''],
      ['db2', 't_order', '', 'id', '订单号', '', '', '', '', ''],
    ])
    expect(matchField(map, '', 't_order', 'id')!.alias).toBe('订单号')
    expect(matchModelName(
      buildModelNameMap([['db2', 't_order', '订单表', 'id', '', '', '', '', '', '']]),
      '', 't_order',
    )).toBe('订单表')
  })

  it('多个库存在同名表 → 放弃匹配（避免误配）', () => {
    const map = buildFieldConfigMap([
      ['db1', 't_user', '', 'name', '姓名1', '', '', '', '', ''],
      ['db2', 't_user', '', 'name', '姓名2', '', '', '', '', ''],
    ])
    expect(matchField(map, '', 't_user', 'name')).toBeUndefined()
  })
})

describe('buildTableConfigMap / filterTablesByConfig（按 sheet2 过滤建模表）', () => {
  const rows = [
    ['dbA', 't_user', '用户表', 'name', '', '', '', '', '', ''],
    ['dbA', 't_order', '订单表', 'id', '', '', '', '', '', ''],
    ['dbB', 't_log', '', 'id', '', '', '', '', '', ''],
  ]
  const map = buildTableConfigMap(rows)

  it('构建「库 → 表」清单（键小写、去重）', () => {
    expect(map['dba']).toEqual(['t_user', 't_order'])
    expect(map['dbb']).toEqual(['t_log'])
  })

  it('只保留清单内的表并保持输入顺序；missing 报告清单内不存在的表；大小写不敏感', () => {
    const r = filterTablesByConfig(['T_ORDER', 't_other', 't_user'], map, 'DBA')!
    expect(r.note).toBe('')
    expect(r.kept).toEqual(['T_ORDER', 't_user'])
    expect(r.missing).toEqual([]) // 清单里的表都在
  })

  it('清单内配置了但数据源不存在的表 → missing（去重）', () => {
    const r = filterTablesByConfig(['t_order'], map, 'dbA')!
    expect(r.kept).toEqual(['t_order'])
    expect(r.missing).toEqual(['t_user'])
  })

  it('未配置该库 → note=db-miss（调用方显式提示，而非静默全量）', () => {
    const r = filterTablesByConfig(['t1'], map, 'dbC')!
    expect(r.note).toBe('db-miss')
    expect(r.kept).toEqual(['t1'])
    expect(r.missing).toEqual([])
  })

  it('空 map / undefined → null（不过滤，保持全量）', () => {
    expect(filterTablesByConfig(['t1'], {}, 'dbA')).toBeNull()
    expect(filterTablesByConfig(['t1'], undefined, 'dbA')).toBeNull()
  })

  it('库名为空 → 以全部配置表的并集兜底', () => {
    const r = filterTablesByConfig(['t_log', 't_user', 't_x'], map, '')!
    expect(r.kept).toEqual(['t_log', 't_user'])
  })
})

describe('listConfiguredFields（诊断辅助）', () => {
  it('列出为某表配置过的字段', () => {
    const map = buildFieldConfigMap([
      ['db1', 't_user', '', 'name', '姓名', '', '', '', '', ''],
      ['db1', 't_user', '', 'age', '年龄', '', '', '', '', ''],
      ['db1', 't_other', '', 'id', '', '', '', '', '', 'x'],
    ])
    expect(listConfiguredFields(map, 'db1', 't_user').sort()).toEqual(['age', 'name'])
  })

  it('库名为空（JDBC）时按表名中段兜底收集（与 matchField 后缀兜底同口径）', () => {
    const map = buildFieldConfigMap([
      ['db1', 't_user', '', 'name', '姓名', '', '', '', '', ''],
      ['db1', 't_user', '', 'age', '年龄', '', '', '', '', ''],
    ])
    expect(listConfiguredFields(map, '', 't_user').sort()).toEqual(['age', 'name'])
  })
})
