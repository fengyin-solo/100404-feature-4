import {
  RULE_VERSIONS,
  pipelineProfile,
  severityRank,
  unitOfPipeline,
  zoneOfLocation,
} from '@/data/consultation'
import type { ConsultationConclusion, ConsultationRecord } from '@/data/consultation'
import {
  appendConsultation,
  currentRuleVersion,
  listConsultations,
  saveRuleVersion,
} from '@/data/consultation-store'
import { listRows, reloadRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 会诊业务的唯一入口：排序、归属校验、下结论、写回缺陷记录都在这里，页面不做业务判断。

export type SessionIdentity = {
  operator: string
  unit: string
  role: string
}

export type QueueItem = {
  defect: EntryRow
  order: number
  unit: string
  priorityLabel: string
  concludable: boolean
  reason: string
}

export type PendingLocateItem = {
  defect: EntryRow
  reason: string
}

export type ConsultationView = {
  ruleVersion: string
  ruleNote: string
  queue: QueueItem[]
  pendingLocate: PendingLocateItem[]
  conclusions: ConsultationRecord[]
}

function ruleOf(version: string) {
  return RULE_VERSIONS.find((item) => item.version === version) ?? RULE_VERSIONS[RULE_VERSIONS.length - 1]
}

// 会诊顺序：按当前规则版本比较，严重等级、发现位置、所属管线依次参与排序。
function compareByRule(version: string) {
  return (a: EntryRow, b: EntryRow): number => {
    const severityDiff = severityRank(String(b.严重等级 ?? '')) - severityRank(String(a.严重等级 ?? ''))
    if (severityDiff !== 0) {
      return severityDiff
    }
    if (version !== 'v1.0') {
      const zoneDiff =
        zoneOfLocation(String(b.发现位置 ?? '')).riskRank - zoneOfLocation(String(a.发现位置 ?? '')).riskRank
      if (zoneDiff !== 0) {
        return zoneDiff
      }
      const pipeDiff =
        pipelineProfile(String(b.所属管线 ?? '')).rank - pipelineProfile(String(a.所属管线 ?? '')).rank
      if (pipeDiff !== 0) {
        return pipeDiff
      }
    }
    const dateDiff = String(a.发现日期 ?? '').localeCompare(String(b.发现日期 ?? ''))
    if (dateDiff !== 0) {
      return dateDiff
    }
    return Number(a.id) - Number(b.id)
  }
}

// 待会诊缺陷：还没下结论的记录；已确认/已忽略/已修复的不再进入队列。
function consultableDefects(): EntryRow[] {
  return listRows('defect').filter((row) => String(row.status) === '待确认' && !row.会诊结论)
}

// 归属限制：只有本管辖单位的记录员能确认或忽略，跨单位只能查看。
function concludePermission(
  session: Pick<SessionIdentity, 'unit' | 'role'>,
  unit: string,
): { ok: boolean; reason: string } {
  if (session.role !== '记录员') {
    return { ok: false, reason: '只有记录员能确认或忽略，当前角色只能查看' }
  }
  if (session.unit !== unit) {
    return { ok: false, reason: `该缺陷归属${unit}，跨单位只能查看` }
  }
  return { ok: true, reason: '' }
}

export function buildConsultationView(session: Pick<SessionIdentity, 'unit' | 'role'>): ConsultationView {
  const version = currentRuleVersion()
  const rule = ruleOf(version)
  const located: { defect: EntryRow; unit: string }[] = []
  const pendingLocate: PendingLocateItem[] = []
  for (const defect of consultableDefects()) {
    const unit = unitOfPipeline(String(defect.所属管线 ?? '').trim())
    if (!unit) {
      // 缺少管线归属的缺陷不得静默忽略：进待定位队列，严重的排在前面。
      const severe = String(defect.严重等级 ?? '') === '严重'
      pendingLocate.push({ defect, reason: severe ? '严重缺陷缺少管线归属' : '缺少管线归属' })
      continue
    }
    located.push({ defect, unit })
  }
  located.sort((a, b) => compareByRule(version)(a.defect, b.defect))
  const queue: QueueItem[] = located.map(({ defect, unit }, index) => {
    const zone = zoneOfLocation(String(defect.发现位置 ?? ''))
    const profile = pipelineProfile(String(defect.所属管线 ?? ''))
    const permission = concludePermission(session, unit)
    return {
      defect,
      order: index + 1,
      unit,
      priorityLabel: `${defect.严重等级} · ${zone.region} · ${profile.type}`,
      concludable: permission.ok,
      reason: permission.reason,
    }
  })
  pendingLocate.sort(
    (a, b) => severityRank(String(b.defect.严重等级 ?? '')) - severityRank(String(a.defect.严重等级 ?? '')),
  )
  const conclusions = [...listConsultations()].sort((a, b) => b.id - a.id)
  return { ruleVersion: rule.version, ruleNote: rule.note, queue, pendingLocate, conclusions }
}

export function concludeDefect(
  defectId: number,
  conclusion: ConsultationConclusion,
  session: SessionIdentity,
): ActionResult {
  // 并发会诊：落盘前重读最新数据，同一缺陷只保留首个有效结论。
  reloadRows()
  const rows = listRows('defect')
  const index = rows.findIndex((row) => Number(row.id) === defectId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${defectId} 的缺陷记录` }
  }
  const row = rows[index]
  const pipeline = String(row.所属管线 ?? '').trim()
  const unit = unitOfPipeline(pipeline)
  if (!unit) {
    return { ok: false, message: '该缺陷缺少管线归属，已列入待定位队列，补录归属前不能下结论' }
  }
  const permission = concludePermission(session, unit)
  if (!permission.ok) {
    return { ok: false, message: permission.reason }
  }
  if (String(row.status) !== '待确认' || row.会诊结论) {
    return { ok: false, message: '该缺陷已有会诊结论，首个有效结论已生效，本次操作被忽略' }
  }
  const rule = ruleOf(currentRuleVersion())
  const now = formatDateTime(new Date())
  // 会诊结论写回缺陷记录：状态、结论、单位、时间与规则版本一并落回。
  const updated: EntryRow = {
    ...row,
    status: conclusion === '确认' ? '已确认' : '已忽略',
    pending: conclusion === '确认',
    abnormal: conclusion === '忽略',
    记录状态: '已会诊',
    会诊结论: conclusion,
    会诊单位: session.unit,
    会诊时间: now,
    会诊规则版本: rule.version,
  }
  const next = [...rows]
  next[index] = updated
  saveRows('defect', next)
  appendConsultation({
    defectId,
    缺陷编号: String(row.缺陷编号 ?? ''),
    严重等级: String(row.严重等级 ?? ''),
    所属管线: pipeline,
    发现位置: String(row.发现位置 ?? ''),
    结论: conclusion,
    记录员: session.operator,
    管辖单位: session.unit,
    会诊时间: now,
    规则版本: rule.version,
    // 口径快照：规则调整后，历史结论仍按当时口径展示。
    规则口径: rule.note,
  })
  return { ok: true, message: `缺陷${String(row.缺陷编号)}已${conclusion}，结论已写回缺陷记录（规则 ${rule.version}）` }
}

// 调整会诊规则：切换到下一个版本，只影响新结论与队列排序，历史结论口径不变。
export function adjustRule(): ActionResult {
  const current = currentRuleVersion()
  const index = RULE_VERSIONS.findIndex((item) => item.version === current)
  const next = RULE_VERSIONS[(index + 1) % RULE_VERSIONS.length]
  saveRuleVersion(next.version)
  return {
    ok: true,
    message: `会诊规则已调整为 ${next.version}，新结论按新口径生成，历史结论仍按当时口径展示`,
  }
}

function formatDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
