import { DEFAULT_RULE_VERSION, SEED_CONSULTATIONS } from './consultation'
import type { ConsultationRecord } from './consultation'

// 会诊结论与当前规则版本单独持久化：和模块数据分开，调整规则不回写历史结论。
const RECORDS_KEY = 'underground-pipeline-inspection:consultations'
const RULE_KEY = 'underground-pipeline-inspection:consultation-rule'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readRecordsFresh(): ConsultationRecord[] {
  const fallback = clone(SEED_CONSULTATIONS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(RECORDS_KEY)
  if (!raw) {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as ConsultationRecord[]
  } catch {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: ConsultationRecord[] | null = null

export function listConsultations(): ConsultationRecord[] {
  if (cache === null) {
    cache = readRecordsFresh()
  }
  return cache
}

// 追加前强制重读：并发会诊时以先写入的结论为准，不覆盖其他页签已落盘的结论。
export function appendConsultation(record: Omit<ConsultationRecord, 'id'>): ConsultationRecord {
  const records = readRecordsFresh()
  const next: ConsultationRecord = {
    ...record,
    id: records.reduce((max, item) => Math.max(max, item.id), 0) + 1,
  }
  const all = [...records, next]
  cache = all
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(all))
  }
  return next
}

export function currentRuleVersion(): string {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_RULE_VERSION
  }
  return window.localStorage.getItem(RULE_KEY) ?? DEFAULT_RULE_VERSION
}

export function saveRuleVersion(version: string): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(RULE_KEY, version)
  }
}
