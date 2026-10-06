import { SEED_ROWS } from './seed'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'underground-pipeline-inspection:entries'
const VERSION_KEY = 'underground-pipeline-inspection:schema-version'
// 结构调整（新增会诊字段、验收管辖区域等）时递增：旧缓存自动回到新示例数据。
const SCHEMA_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isSchemaCurrent(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) {
    return true
  }
  return window.localStorage.getItem(VERSION_KEY) === String(SCHEMA_VERSION)
}

function writeFallback(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    window.localStorage.setItem(VERSION_KEY, String(SCHEMA_VERSION))
  }
  return fallback
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  if (!isSchemaCurrent()) {
    // 结构升级：丢弃旧口径缓存，按新示例重新播种。
    return writeFallback()
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return writeFallback()
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    return writeFallback()
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
