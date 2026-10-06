import type { ConsultationRule, JurisdictionUnit } from './types'

/**
 * 管辖单位台账：按管线编号前缀与发现位置关键字划分辖区。
 * 归属判定先看管线，管线缺失再看发现位置，都命中不了即「待定位」。
 */
export const JURISDICTION_UNITS: JurisdictionUnit[] = [
  {
    code: 'CD',
    name: '城东管网管理所',
    pipelinePrefixes: ['PIPE-CD', 'WS-CD'],
    locationKeywords: ['城东', '东城', '高新区'],
  },
  {
    code: 'CX',
    name: '城西管网管理所',
    pipelinePrefixes: ['PIPE-CX', 'WS-CX'],
    locationKeywords: ['城西', '西湖', '经开区'],
  },
  {
    code: 'CN',
    name: '城南管网管理所',
    pipelinePrefixes: ['PIPE-CN', 'WS-CN'],
    locationKeywords: ['城南', '滨江'],
  },
]

export const UNIT_BY_CODE = new Map(JURISDICTION_UNITS.map((unit) => [unit.code, unit]))

/** 严重等级集合：命中其一即按严重缺陷对待。 */
export const SEVERE_LEVELS = ['严重', '危急', '重大']

/**
 * 会诊规则版本表（按生效时间升序）。
 * v1：严重等级 > 所属管线 > 发现位置
 * v2（规则调整后）：严重等级 > 发现位置 > 所属管线，且严重等级分档细化
 * 结论快照 ruleVersion，历史结论不随新版本重算，仍按当时口径展示。
 */
export const CONSULTATION_RULES: ConsultationRule[] = [
  {
    version: 'v1',
    effectiveFrom: '2026-09-01',
    label: 'v1 · 等级→管线→位置',
    priorityKeys: ['severity', 'pipeline', 'location'],
    severityRank: { 轻微: 1, 中等: 2, 严重: 3, 危急: 3, 重大: 3 },
  },
  {
    version: 'v2',
    effectiveFrom: '2026-10-01',
    label: 'v2 · 等级→位置→管线',
    priorityKeys: ['severity', 'location', 'pipeline'],
    severityRank: { 轻微: 1, 中等: 2, 严重: 3, 危急: 4, 重大: 4 },
  },
]

/** 按日期取当时生效的规则版本（历史结论展示用）。 */
export function ruleAt(dateISO: string): ConsultationRule {
  let current = CONSULTATION_RULES[0]
  for (const rule of CONSULTATION_RULES) {
    if (dateISO >= rule.effectiveFrom) {
      current = rule
    }
  }
  return current
}

/** 当前生效规则（今天 2026-10-06，已切换到 v2）。 */
export function currentRule(nowISO: string): ConsultationRule {
  return ruleAt(nowISO)
}

/**
 * 可选的预览口径：页面允许手动切到历史版本验证「规则调整后历史结论仍按当时口径展示」。
 * auto 表示始终跟随当前日期生效版本。
 */
export function resolveRule(mode: string, nowISO: string): ConsultationRule {
  if (mode === 'v1' || mode === 'v2') {
    return CONSULTATION_RULES.find((rule) => rule.version === mode) ?? currentRule(nowISO)
  }
  return currentRule(nowISO)
}
