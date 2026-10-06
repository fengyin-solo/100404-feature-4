import { JURISDICTION_UNITS, SEVERE_LEVELS } from './rules'
import type { EntryRow } from '@/data/types'

export type ResolvedJurisdiction = {
  unitCode: string
  unitName: string
  /** 归属依据，便于页面解释「为什么归这个单位」 */
  reason: string
}

/** 已知管线编号 -> 管辖单位的显式登记（样例数据里的管线在这里建档）。 */
const PIPELINE_REGISTRY: Record<string, string> = {
  'PIPE-CD-101': 'CD',
  'PIPE-CD-102': 'CD',
  'PIPE-CX-201': 'CX',
  'PIPE-CX-202': 'CX',
  'PIPE-CN-301': 'CN',
}

function text(row: EntryRow, field: string): string {
  return String(row[field] ?? '').trim()
}

/**
 * 判定缺陷归属：先查管线登记台账，再按管线编号前缀，
 * 最后用发现位置关键字兜底；都判定不出则归属为空（待定位）。
 */
export function resolveJurisdiction(row: EntryRow): ResolvedJurisdiction | null {
  const pipeline = text(row, '所属管线')
  if (pipeline) {
    const registered = PIPELINE_REGISTRY[pipeline]
    if (registered) {
      const unit = JURISDICTION_UNITS.find((item) => item.code === registered)
      if (unit) {
        return { unitCode: unit.code, unitName: unit.name, reason: `管线 ${pipeline} 已登记` }
      }
    }
    const byPrefix = JURISDICTION_UNITS.find((unit) =>
      unit.pipelinePrefixes.some((prefix) => pipeline.startsWith(prefix)),
    )
    if (byPrefix) {
      return { unitCode: byPrefix.code, unitName: byPrefix.name, reason: `管线编号前缀 ${pipeline}` }
    }
  }

  const location = text(row, '发现位置')
  if (location) {
    const byKeyword = JURISDICTION_UNITS.find((unit) =>
      unit.locationKeywords.some((keyword) => location.includes(keyword)),
    )
    if (byKeyword) {
      return { unitCode: byKeyword.code, unitName: byKeyword.name, reason: `发现位置含「${location}」` }
    }
  }
  return null
}

export function isSevere(row: EntryRow): boolean {
  return SEVERE_LEVELS.includes(text(row, '严重等级'))
}

export function hasPipeline(row: EntryRow): boolean {
  return text(row, '所属管线') !== ''
}

/**
 * 严重缺陷缺少管线归属时不得静默忽略：进入待定位队列。
 * 非严重缺陷即使缺管线，也可由发现位置兜底归属后正常会诊。
 */
export function needsLocation(row: EntryRow): boolean {
  return isSevere(row) && !hasPipeline(row)
}
