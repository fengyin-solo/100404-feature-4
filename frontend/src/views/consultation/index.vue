<template>
  <section class="page" data-module="consultation">
    <header class="page-head">
      <div>
        <h2>缺陷会诊</h2>
        <p class="page-desc">
          按严重等级、发现位置与所属管线生成会诊顺序；只有本管辖单位的记录员能确认或忽略，跨单位只能查看。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="switchRule">调整会诊规则</button>
      </div>
    </header>

    <div class="session-bar">
      <label>
        管辖单位
        <select v-model="session.unit">
          <option v-for="item in jurisdictions" :key="item.unit" :value="item.unit">
            {{ item.unit }}
          </option>
        </select>
      </label>
      <label>
        角色
        <select v-model="session.role">
          <option v-for="role in roles" :key="role" :value="role">{{ role }}</option>
        </select>
      </label>
      <span class="legend-item">当前规则：{{ view.ruleVersion }}</span>
      <span class="info-text">{{ view.ruleNote }}</span>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <h3 class="queue-title">会诊队列（按当前规则排序）</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>会诊顺序</th>
          <th>缺陷编号</th>
          <th>严重等级</th>
          <th>发现位置</th>
          <th>所属管线</th>
          <th>管辖单位</th>
          <th>优先级依据</th>
          <th>发现日期</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in view.queue" :key="String(item.defect.id)">
          <td>{{ item.order }}</td>
          <td>{{ item.defect.缺陷编号 }}</td>
          <td>
            <span class="tag" :class="{ severe: item.defect.严重等级 === '严重' }">
              {{ item.defect.严重等级 }}
            </span>
          </td>
          <td>{{ item.defect.发现位置 }}</td>
          <td>{{ item.defect.所属管线 }}</td>
          <td>{{ item.unit }}</td>
          <td>{{ item.priorityLabel }}</td>
          <td>{{ item.defect.发现日期 }}</td>
          <td class="row-actions">
            <button
              class="link"
              type="button"
              :disabled="!item.concludable"
              :title="item.reason"
              @click="conclude(item, '确认')"
            >
              确认
            </button>
            <button
              class="link"
              type="button"
              :disabled="!item.concludable"
              :title="item.reason"
              @click="conclude(item, '忽略')"
            >
              忽略
            </button>
          </td>
        </tr>
        <tr v-if="!view.queue.length">
          <td colspan="9" class="empty-state">暂无待会诊缺陷</td>
        </tr>
      </tbody>
    </table>

    <h3 class="queue-title">待定位队列</h3>
    <p class="info-text">
      严重缺陷缺少管线归属时不得静默忽略：先进入待定位队列，补录所属管线后再参与会诊。
    </p>
    <table class="data-table">
      <thead>
        <tr>
          <th>缺陷编号</th>
          <th>严重等级</th>
          <th>发现位置</th>
          <th>所属管线</th>
          <th>待定位原因</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in view.pendingLocate" :key="String(item.defect.id)">
          <td>{{ item.defect.缺陷编号 }}</td>
          <td>
            <span class="tag" :class="{ severe: item.defect.严重等级 === '严重' }">
              {{ item.defect.严重等级 }}
            </span>
          </td>
          <td>{{ item.defect.发现位置 }}</td>
          <td>{{ item.defect.所属管线 || '—' }}</td>
          <td>{{ item.reason }}</td>
        </tr>
        <tr v-if="!view.pendingLocate.length">
          <td colspan="5" class="empty-state">暂无待定位缺陷</td>
        </tr>
      </tbody>
    </table>

    <h3 class="queue-title">会诊结论</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th>缺陷编号</th>
          <th>结论</th>
          <th>记录员</th>
          <th>管辖单位</th>
          <th>会诊时间</th>
          <th>规则版本</th>
          <th>当时口径</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in view.conclusions" :key="item.id">
          <td>{{ item.缺陷编号 }}</td>
          <td>{{ item.结论 }}</td>
          <td>{{ item.记录员 }}</td>
          <td>{{ item.管辖单位 }}</td>
          <td>{{ item.会诊时间 }}</td>
          <td>{{ item.规则版本 }}</td>
          <td>{{ item.规则口径 }}</td>
        </tr>
        <tr v-if="!view.conclusions.length">
          <td colspan="7" class="empty-state">暂无会诊结论</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>同一缺陷并发会诊只保留首个有效结论；规则调整后，历史结论仍按当时口径展示</span>
      <span v-if="message" :class="messageOk ? 'info-text' : 'error-text'">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  adjustRule,
  buildConsultationView,
  concludeDefect,
} from '@/api/consultation-service'
import type { QueueItem } from '@/api/consultation-service'
import { JURISDICTIONS } from '@/data/consultation'
import type { ConsultationConclusion } from '@/data/consultation'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const jurisdictions = JURISDICTIONS
const roles = ['记录员', '查看员']

// 数据层不是响应式的：每次下结论或调整规则后自增 tick，触发视图重算。
const tick = ref(0)
const message = ref('')
const messageOk = ref(true)

const view = computed(() => {
  void tick.value
  return buildConsultationView({ unit: session.unit, role: session.role })
})

const stats = computed(() => [
  { label: '待会诊缺陷', value: view.value.queue.length },
  { label: '待定位缺陷', value: view.value.pendingLocate.length },
  { label: '已出结论', value: view.value.conclusions.length },
  { label: '本单位可处置', value: view.value.queue.filter((item) => item.concludable).length },
])

function conclude(item: QueueItem, conclusion: ConsultationConclusion) {
  const result = concludeDefect(Number(item.defect.id), conclusion, {
    operator: session.operator,
    unit: session.unit,
    role: session.role,
  })
  message.value = result.message
  messageOk.value = result.ok
  tick.value += 1
}

function switchRule() {
  const result = adjustRule()
  message.value = result.message
  messageOk.value = result.ok
  tick.value += 1
}
</script>
