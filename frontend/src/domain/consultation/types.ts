import type { EntryRow } from '@/data/types'

/** 管辖单位：记录员只能处置本单位辖区内的缺陷，跨单位仅可查看。 */
export type JurisdictionUnit = {
  code: string
  name: string
  /** 管线编号前缀 -> 管辖单位 */
  pipelinePrefixes: string[]
  /** 发现位置关键字 -> 管辖单位（兜底归属用） */
  locationKeywords: string[]
}

/** 会诊结论类型：确认缺陷 / 忽略缺陷。 */
export type ConsultVerdict = '确认缺陷' | '忽略缺陷'

/**
 * 会诊规则按版本固化：规则调整后新发结论按新版本排序，
 * 历史结论保存当时的版本号，永远按当时口径展示。
 */
export type ConsultationRule = {
  version: string
  /** 生效时间（ISO 日期），早于该日期的会诊沿用上一版 */
  effectiveFrom: string
  label: string
  /** 会诊顺序的排序键优先级：越靠前权重越高 */
  priorityKeys: ConsultPriorityKey[]
  severityRank: Record<string, number>
}

export type ConsultPriorityKey = 'severity' | 'location' | 'pipeline'

/** 一条缺陷会诊的完整结论，落盘在缺陷记录上（快照，不随后续规则调整变化）。 */
export type ConsultationConclusion = {
  verdict: ConsultVerdict
  opinion: string
  confirmer: string
  unitCode: string
  unitName: string
  /** 结论生效时使用的规则版本 */
  ruleVersion: string
  /** 当时计算出的会诊顺位（1 起） */
  order: number
  concludedAt: string
}

/** 会诊队列表里的一行：缺陷 + 派生属性。 */
export type ConsultationQueueItem = {
  row: EntryRow
  priorityScore: number
  priorityText: string
  order: number
  unitCode: string
  unitName: string
  owned: boolean
  actionable: boolean
  blockingReason: string
  conclusion: ConsultationConclusion | null
}

export type SubmitConclusionInput = {
  defectId: number
  verdict: ConsultVerdict
  opinion: string
}

export type SubmitConclusionResult = {
  ok: boolean
  message: string
  /** 乐观锁：提交时持有的缺陷版本号，用于并发首结判定 */
  baseVersion?: number
  conclusion?: ConsultationConclusion
}
