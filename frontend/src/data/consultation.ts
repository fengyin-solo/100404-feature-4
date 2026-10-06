// 缺陷会诊的管辖与排序规则：单位、区域、管线归属、规则版本口径都集中在这里，页面不再各自写一遍。

export type ConsultationConclusion = '确认' | '忽略'

export type ConsultationRecord = {
  id: number
  defectId: number
  缺陷编号: string
  严重等级: string
  所属管线: string
  发现位置: string
  结论: ConsultationConclusion
  记录员: string
  管辖单位: string
  会诊时间: string
  规则版本: string
  /** 下结论时的规则口径快照：规则调整后，历史结论仍按当时口径展示。 */
  规则口径: string
}

// 管辖单位 → 管辖区域：维修验收页按区域决定记录是否可见。
export const JURISDICTIONS = [
  { unit: '城东运维所', region: '城东片区' },
  { unit: '城西运维所', region: '城西片区' },
] as const

// 管线 → 管辖单位：缺陷归属由所属管线决定；查不到归属的严重缺陷进待定位队列，不静默忽略。
export const PIPELINE_UNIT: Record<string, string> = {
  'PIPE-0001': '城东运维所',
  'PIPE-0002': '城西运维所',
  'PIPE-0003': '城东运维所',
}

// 发现位置 → 管辖区域与区域风险权重：参与会诊排序。
export const LOCATION_ZONES = [
  { keyword: '城东', region: '城东片区', riskRank: 2 },
  { keyword: '城西', region: '城西片区', riskRank: 1 },
] as const

// 管线档案：主干管优先于次干管、支管。
export const PIPELINE_PROFILE: Record<string, { type: string; rank: number }> = {
  'PIPE-0001': { type: '主干管', rank: 3 },
  'PIPE-0002': { type: '次干管', rank: 2 },
  'PIPE-0003': { type: '支管', rank: 1 },
}

export const SEVERITY_RANK: Record<string, number> = { 严重: 3, 一般: 2, 轻微: 1 }

// 规则版本：调整规则后新结论按新口径生成，历史结论仍按当时口径展示。
export const RULE_VERSIONS = [
  { version: 'v1.0', note: '口径v1.0：按严重等级排序，同级按发现日期先后，不区分区域与管线权重。' },
  { version: 'v1.1', note: '口径v1.1：严重等级优先，其次区域风险与管线等级，同级按发现日期先后。' },
] as const

export const DEFAULT_RULE_VERSION = 'v1.1'

// 示例历史结论：按 v1.0 口径下达，规则升级后仍按当时口径展示。
export const SEED_CONSULTATIONS: ConsultationRecord[] = [
  {
    id: 1,
    defectId: 2,
    缺陷编号: 'DEFE-0002',
    严重等级: '一般',
    所属管线: 'PIPE-0002',
    发现位置: '城西区高新大道K0+800',
    结论: '确认',
    记录员: '值班管理员',
    管辖单位: '城西运维所',
    会诊时间: '2026-09-02 10:30',
    规则版本: 'v1.0',
    规则口径: '口径v1.0：按严重等级排序，同级按发现日期先后，不区分区域与管线权重。',
  },
]

export function severityRank(level: string): number {
  return SEVERITY_RANK[level] ?? 0
}

/** 所属管线 → 管辖单位；空串表示缺少管线归属。 */
export function unitOfPipeline(pipeline: string): string {
  if (!pipeline) {
    return ''
  }
  return PIPELINE_UNIT[pipeline] ?? ''
}

export function regionOfUnit(unit: string): string {
  return JURISDICTIONS.find((item) => item.unit === unit)?.region ?? ''
}

export function zoneOfLocation(location: string): { region: string; riskRank: number } {
  for (const zone of LOCATION_ZONES) {
    if (location.includes(zone.keyword)) {
      return { region: zone.region, riskRank: zone.riskRank }
    }
  }
  return { region: '未划分区域', riskRank: 0 }
}

export function pipelineProfile(pipeline: string): { type: string; rank: number } {
  return PIPELINE_PROFILE[pipeline] ?? { type: '未知管线', rank: 0 }
}
