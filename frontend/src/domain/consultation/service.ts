import { listRows, saveRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'
import { resolveRule, ruleAt, UNIT_BY_CODE } from './rules'
import { hasPipeline, isSevere, needsLocation, resolveJurisdiction } from './jurisdiction'
import type {
  ConsultationConclusion,
  ConsultationQueueItem,
  ConsultVerdict,
  SubmitConclusionInput,
  SubmitConclusionResult,
} from './types'
import { useSessionStore } from '@/stores/session'

const DEFECT_KEY = 'defect'
const ACCEPT_KEY = 'repair_accept'
const LOG_KEY = 'consultation_log'
const RULE_MODE_KEY = 'underground-pipeline-inspection:rule-mode'

/** 缺陷记录上的乐观锁版本号：每次写回 +1，用于并发首结判定。 */
const VERSION_FIELD = '记录版本'

export const CONCLUSION_FIELDS = [
  '会诊结论',
  '会诊意见',
  '会诊人',
  '会诊单位',
  '会诊时间',
  '会诊规则版本',
  '会诊顺位',
] as const

export function loadRuleMode(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage.getItem(RULE_MODE_KEY) ?? 'auto'
  }
  return 'auto'
}

export function saveRuleMode(mode: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(RULE_MODE_KEY, mode)
  }
}

function rowVersion(row: EntryRow): number {
  const value = Number(row[VERSION_FIELD])
  return Number.isFinite(value) ? value : 0
}

function text(row: EntryRow, field: string): string {
  return String(row[field] ?? '').trim()
}

function readConclusion(row: EntryRow): ConsultationConclusion | null {
  const verdict = text(row, '会诊结论')
  if (verdict !== '确认缺陷' && verdict !== '忽略缺陷') {
    return null
  }
  return {
    verdict,
    opinion: text(row, '会诊意见'),
    confirmer: text(row, '会诊人'),
    unitCode: '',
    unitName: text(row, '会诊单位'),
    ruleVersion: text(row, '会诊规则版本'),
    order: Number(row['会诊顺位']) || 0,
    concludedAt: text(row, '会诊时间'),
  }
}

/**
 * 按当前口径给待会诊缺陷排序：严重等级 → 发现位置 → 所属管线，
 * 键的先后顺序由规则版本决定。顺位从 1 开始。
 */
function buildQueue(nowISO: string, mode: string): ConsultationQueueItem[] {
  const session = useSessionStore()
  const rule = resolveRule(mode, nowISO)
  const isRecorder = session.isRecorder

  const rankOf = (key: (typeof rule.priorityKeys)[number], row: EntryRow): number | string => {
    if (key === 'severity') {
      return rule.severityRank[text(row, '严重等级')] ?? 0
    }
    if (key === 'location') {
      return text(row, '发现位置')
    }
    return text(row, '所属管线')
  }

  const candidates = listRows(DEFECT_KEY)
    .filter((row) => !needsLocation(row))
    .map((row) => {
      const resolved = resolveJurisdiction(row)
      const owned = isRecorder && resolved !== null && resolved.unitCode === session.unitCode
      const conclusion = readConclusion(row)
      let blockingReason = ''
      if (conclusion) {
        blockingReason = `已有首个有效结论（${conclusion.ruleVersion} 口径），不可重复会诊`
      } else if (!isRecorder) {
        blockingReason = '当前身份为只读查看员，跨单位仅可查看'
      } else if (!resolved) {
        blockingReason = '归属单位无法判定，需先定位'
      } else if (!owned) {
        blockingReason = `归属${resolved.unitName}，跨单位仅可查看`
      }
      return {
        row,
        resolved,
        owned,
        actionable: blockingReason === '',
        blockingReason,
        conclusion,
        _rank: rule.priorityKeys.map((key) => rankOf(key, row)),
      }
    })

  candidates.sort((a, b) => {
    for (let i = 0; i < a._rank.length; i += 1) {
      const av = a._rank[i]
      const bv = b._rank[i]
      if (typeof av === 'number' && typeof bv === 'number') {
        if (av !== bv) {
          return bv - av
        }
      } else {
        const cmp = String(av).localeCompare(String(bv), 'zh-Hans-CN')
        if (cmp !== 0) {
          return cmp
        }
      }
    }
    return Number(a.row.id) - Number(b.row.id)
  })

  return candidates.map((item, index) => ({
    row: item.row,
    priorityScore: 0,
    priorityText: `${text(item.row, '严重等级')}｜${text(item.row, '发现位置')}｜${text(item.row, '所属管线')}`,
    order: index + 1,
    unitCode: item.resolved?.unitCode ?? '',
    unitName: item.resolved?.unitName ?? '待定位',
    owned: item.owned,
    actionable: item.actionable,
    blockingReason: item.blockingReason,
    conclusion: item.conclusion,
  }))
}

/** 待定位队列：严重缺陷缺少管线归属，禁止确认/忽略，必须先补录。 */
function buildLocatingQueue(): ConsultationQueueItem[] {
  const session = useSessionStore()
  return listRows(DEFECT_KEY)
    .filter((row) => needsLocation(row))
    .map((row) => {
      const resolved = resolveJurisdiction(row)
      const canLocate =
        session.isRecorder &&
        (resolved === null || resolved.unitCode === session.unitCode)
      return {
        row,
        priorityScore: 0,
        priorityText: `${text(row, '严重等级')}｜${text(row, '发现位置')}｜缺管线归属`,
        order: 0,
        unitCode: resolved?.unitCode ?? '',
        unitName: resolved ? resolved.unitName : '归属待定',
        owned: canLocate,
        actionable: canLocate,
        blockingReason: canLocate ? '' : '严重缺陷缺管线归属：仅可查看，需归属单位记录员补录定位',
        conclusion: null,
      }
    })
}

export type ConsultationBoard = {
  ruleVersion: string
  ruleLabel: string
  effectiveFrom: string
  queue: ConsultationQueueItem[]
  locating: ConsultationQueueItem[]
}

export function loadBoard(nowISO: string, mode = loadRuleMode()): ConsultationBoard {
  const rule = resolveRule(mode, nowISO)
  return {
    ruleVersion: rule.version,
    ruleLabel: rule.label,
    effectiveFrom: rule.effectiveFrom,
    queue: buildQueue(nowISO, mode),
    locating: buildLocatingQueue(),
  }
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

/** 补录管线归属：把待定位的严重缺陷送回会诊队列。管线必须落在本单位辖区。 */
export function locateDefect(defectId: number, pipeline: string): SubmitConclusionResult {
  const session = useSessionStore()
  if (!session.isRecorder) {
    return { ok: false, message: '只有管辖单位记录员可以补录管线归属' }
  }
  const code = pipeline.trim()
  if (!code) {
    return { ok: false, message: '请填写管线编号后再提交定位' }
  }

  const rows = listRows(DEFECT_KEY)
  const index = rows.findIndex((row) => Number(row.id) === defectId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${defectId} 的缺陷记录` }
  }
  const target = rows[index]
  if (!needsLocation(target)) {
    return { ok: false, message: '该缺陷不缺管线归属，不在待定位队列' }
  }

  // 用一条临时行试算新管线的归属，校验是否落在本单位辖区。
  const probe = { ...target, 所属管线: code }
  const resolved = resolveJurisdiction(probe)
  if (!resolved) {
    return { ok: false, message: `管线 ${code} 未建档且无法按前缀判定归属，请先在管线登记中建档` }
  }
  const byLocation = resolveJurisdiction(target)
  if (byLocation && byLocation.unitCode !== resolved.unitCode) {
    return {
      ok: false,
      message: `发现位置指向${byLocation.unitName}，不能定位到${resolved.unitName}的管线`,
    }
  }
  if (resolved.unitCode !== session.unitCode) {
    return { ok: false, message: `管线 ${code} 归属${resolved.unitName}，不在本单位辖区` }
  }

  const updated: EntryRow = {
    ...target,
    所属管线: code,
    [VERSION_FIELD]: rowVersion(target) + 1,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(DEFECT_KEY, next)
  return { ok: true, message: `已补录管线 ${code}，缺陷回到${resolved.unitName}会诊队列` }
}

function appendAcceptance(row: EntryRow, conclusion: ConsultationConclusion): void {
  // 仅「确认缺陷」进入维修验收页；忽略的缺陷不派单。
  if (conclusion.verdict !== '确认缺陷') {
    return
  }
  const rows = listRows(ACCEPT_KEY)
  const unit = UNIT_BY_CODE.get(conclusion.unitCode)
  rows.push({
    id: nextId(rows),
    status: '待验收',
    pending: true,
    abnormal: false,
    验收编号: `REPA-${String(Date.now()).slice(-6)}`,
    关联维修: text(row, '缺陷编号'),
    管辖区域: unit?.name ?? conclusion.unitName,
    验收人员: '',
    验收日期: conclusion.concludedAt.slice(0, 10),
    维修质量: '',
    验收结论: `会诊确认（${conclusion.ruleVersion}）：${conclusion.opinion || '按缺陷记录安排维修'}`,
    复修要求: '',
    验收状态: '待验收',
  })
  saveRows(ACCEPT_KEY, rows)
}

function appendLog(row: EntryRow, conclusion: ConsultationConclusion): void {
  const rows = listRows(LOG_KEY)
  rows.push({
    id: nextId(rows),
    status: '有效',
    pending: false,
    abnormal: false,
    缺陷编号: text(row, '缺陷编号'),
    会诊结论: conclusion.verdict,
    会诊意见: conclusion.opinion,
    会诊人: conclusion.confirmer,
    会诊单位: conclusion.unitName,
    会诊顺位: conclusion.order,
    规则版本: conclusion.ruleVersion,
    会诊时间: conclusion.concludedAt,
  })
  saveRows(LOG_KEY, rows)
}

/**
 * 提交会诊结论。
 * 归属限制：仅本管辖单位记录员可确认/忽略；跨单位与查看员只读。
 * 并发：CAS 比对版本号 + 结论占位检查，同一缺陷只保留首个有效结论。
 * 结论快照当前规则版本写回缺陷记录，并联动生成维修验收记录。
 */
export function submitConclusion(
  input: SubmitConclusionInput,
  expectedVersion: number,
  nowISO: string,
  mode = loadRuleMode(),
): SubmitConclusionResult {
  const session = useSessionStore()
  if (!session.isRecorder) {
    return { ok: false, message: '当前身份为只读查看员，仅可查看会诊信息' }
  }

  const rows = listRows(DEFECT_KEY)
  const index = rows.findIndex((row) => Number(row.id) === input.defectId)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${input.defectId} 的缺陷记录` }
  }
  const target = rows[index]

  if (needsLocation(target)) {
    return { ok: false, message: '严重缺陷缺少管线归属，已进入待定位队列，不得确认或忽略' }
  }

  const currentVersion = rowVersion(target)
  if (currentVersion !== expectedVersion) {
    return {
      ok: false,
      message: `该缺陷刚被其他记录员更新（版本 ${expectedVersion} → ${currentVersion}），请刷新后按最新数据会诊`,
      baseVersion: currentVersion,
    }
  }
  if (readConclusion(target)) {
    return { ok: false, message: '该缺陷已有首个有效会诊结论，并发提交仅保留首个结论' }
  }

  const resolved = resolveJurisdiction(target)
  if (!resolved) {
    return { ok: false, message: '归属单位无法判定，需先进入待定位流程补录管线' }
  }
  if (resolved.unitCode !== session.unitCode) {
    return { ok: false, message: `该缺陷归属${resolved.unitName}，跨单位只能查看，不能确认或忽略` }
  }

  const verdict: ConsultVerdict = input.verdict
  const rule = resolveRule(mode, nowISO)
  const order = loadBoard(nowISO, mode).queue.find(
    (item) => Number(item.row.id) === input.defectId,
  )?.order ?? 0

  const conclusion: ConsultationConclusion = {
    verdict,
    opinion: input.opinion.trim(),
    confirmer: session.operator,
    unitCode: resolved.unitCode,
    unitName: resolved.unitName,
    ruleVersion: rule.version,
    order,
    concludedAt: nowISO,
  }

  const updated: EntryRow = {
    ...target,
    status: verdict === '确认缺陷' ? '已确认' : '已忽略',
    pending: verdict === '确认缺陷',
    abnormal: verdict === '忽略缺陷',
    会诊结论: verdict,
    会诊意见: conclusion.opinion,
    会诊人: conclusion.confirmer,
    会诊单位: conclusion.unitName,
    会诊时间: conclusion.concludedAt,
    会诊规则版本: conclusion.ruleVersion,
    会诊顺位: conclusion.order,
    [VERSION_FIELD]: currentVersion + 1,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(DEFECT_KEY, next)

  appendLog(updated, conclusion)
  appendAcceptance(updated, conclusion)

  return {
    ok: true,
    message:
      verdict === '确认缺陷'
        ? `已按顺位 ${order} 确认缺陷，结论已写回并派发维修验收（${conclusion.unitName}）`
        : `已按顺位 ${order} 忽略缺陷，结论已写回缺陷记录`,
    baseVersion: currentVersion + 1,
    conclusion,
  }
}

export type HistoryItem = {
  defectCode: string
  verdict: string
  opinion: string
  confirmer: string
  unitName: string
  order: number
  ruleVersion: string
  /** 结论当时生效的口径说明 */
  ruleLabel: string
  concludedAt: string
}

/** 会诊历史：每条都带结论当时的规则版本，按当时口径展示，不随后续规则调整重算。 */
export function loadHistory(): HistoryItem[] {
  return listRows(LOG_KEY)
    .map((row) => {
      const version = text(row, '规则版本') || 'v1'
      const at = text(row, '会诊时间')
      return {
        defectCode: text(row, '缺陷编号'),
        verdict: text(row, '会诊结论'),
        opinion: text(row, '会诊意见'),
        confirmer: text(row, '会诊人'),
        unitName: text(row, '会诊单位'),
        order: Number(row['会诊顺位']) || 0,
        ruleVersion: version,
        ruleLabel: ruleAt(at).version === version
          ? `${version}（当时口径）`
          : `${version}（历史口径）`,
        concludedAt: at,
      }
    })
    .sort((a, b) => b.concludedAt.localeCompare(a.concludedAt))
}

/**
 * 维修验收页按管辖区域决定可见性：
 * - 记录员：本管辖区域 + 尚未划分区域的记录可见，跨单位记录隐藏；
 * - 只读查看员（无管辖单位）：仅可见尚未划分区域的记录，各单位记录不外露。
 */
export function visibleAcceptance(rows: EntryRow[], unitCode: string, isRecorder: boolean): EntryRow[] {
  if (isRecorder) {
    const unit = UNIT_BY_CODE.get(unitCode)
    if (!unit) {
      return rows
    }
    return rows.filter((row) => {
      const area = text(row, '管辖区域')
      return area === '' || area === unit.name
    })
  }
  return rows.filter((row) => text(row, '管辖区域') === '')
}

export function defectVersion(row: EntryRow): number {
  return rowVersion(row)
}

export { hasPipeline, isSevere }
