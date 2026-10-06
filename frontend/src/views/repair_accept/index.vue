<template>
  <section class="page" data-module="repair_accept">
    <header class="page-head">
      <div>
        <h2>维修验收管理</h2>
        <p class="page-desc">
          会诊确认的缺陷自动派单到本页；记录员仅可见本管辖区域的验收记录，跨区域记录与查看员按规则只读或受限展示。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记维修验收记录</button>
        <button class="btn" type="button" @click="exportRows">导出维修验收清单</button>
      </div>
    </header>

    <div v-if="store.isRecorder" class="scope-banner">
      当前管辖区域：<strong>{{ store.unitName }}</strong>
      · 共 {{ allCount }} 条验收记录，本区域可见 {{ rows.length }} 条<span v-if="hiddenCount">，已隐藏跨区域 {{ hiddenCount }} 条</span>
    </div>
    <div v-else class="scope-banner guest">
      当前为只读查看员：各单位维修验收记录按管辖区域隔离，仅 {{ rows.length }} 条未划分区域的记录可浏览。
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">
            {{ row[column] ?? '—' }}
            <span v-if="column === '管辖区域' && !row[column]" class="tag-unassigned">未划分</span>
          </td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">本管辖区域暂无可验收记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条本区域维修验收记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import { listRows } from '@/data/local-store'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'
import { visibleAcceptance } from '@/domain/consultation/service'
import { filterRows } from '@/api/local-service'

const store = useSessionStore()
const meta = moduleMeta('repair_accept')
const columns = ["验收编号", "关联维修", "管辖区域", "验收人员", "验收日期", "维修质量", "验收结论", "复修要求", "验收状态"]
const actions = ["发起验收", "确认通过", "退回返修"]
const statuses = ["待验收", "验收中", "已通过", "需返修"]
const stats = computed(() => [
  { label: "待验收记录", value: countByStatus("待验收") },
  { label: "已通过记录", value: countByStatus("已通过") },
  { label: "需返修记录", value: countByStatus("需返修") },
])

const rows = ref<EntryRow[]>([])
const total = ref(0)
const allCount = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ["验收编号", "关联维修", "验收人员"]

const hiddenCount = computed(() => Math.max(0, allCount.value - rows.value.length))
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

function countByStatus(status: string): number {
  return rows.value.filter((row) => String(row.status) === status).length
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '维修验收记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  if (!store.isRecorder) {
    errorMessage.value = '只读查看员仅可浏览，不能执行验收操作'
    return
  }
  const area = String(row['管辖区域'] ?? '')
  if (store.unitName && area && area !== store.unitName) {
    errorMessage.value = `该记录归属${area}，跨管辖区域不可操作`
    return
  }
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    // 先按管辖区域决定可见集合，再在可见集合内做检索过滤。
    const scoped = visibleAcceptance(listRows(meta.key), store.unitCode, store.isRecorder)
    allCount.value = listRows(meta.key).length
    const matched = filterRows(scoped, filters.value)
    rows.value = matched
    total.value = matched.length
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '维修验收列表读取失败'
  }
}

onMounted(reload)
</script>

<style scoped>
.scope-banner {
  background: #eef4ff;
  border: 1px solid #c6d9fb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
}
.scope-banner.guest {
  background: #f2f4f7;
  border-color: var(--border);
  color: var(--muted);
}
.tag-unassigned {
  margin-left: 6px;
  font-size: 11px;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 999px;
  padding: 1px 8px;
}
</style>
