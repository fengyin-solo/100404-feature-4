<template>
  <section class="page" data-module="defect">
    <header class="page-head">
      <div>
        <h2>缺陷会诊</h2>
        <p class="page-desc">
          按严重等级、发现位置与所属管线生成会诊顺序；仅本管辖单位记录员可确认或忽略，跨单位只读；
          严重缺陷缺管线归属进入待定位队列，不得静默忽略。
        </p>
      </div>
      <div class="page-actions">
        <label class="rule-switch">
          <span>会诊口径</span>
          <select v-model="ruleMode" @change="onRuleModeChange">
            <option value="auto">跟随当前生效（{{ currentVersion }}）</option>
            <option value="v1">v1 等级→管线→位置</option>
            <option value="v2">v2 等级→位置→管线</option>
          </select>
        </label>
      </div>
    </header>

    <div class="rule-banner">
      <strong>当前排序口径：{{ board.ruleLabel }}</strong>
      <span>（{{ board.effectiveFrom }} 起生效）· 优先级：严重等级 → 发现位置 → 所属管线</span>
      <span class="banner-tip">规则调整不影响历史结论，历史结论始终带当时版本展示。</span>
    </div>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value" :class="{ warn: item.warn }">{{ item.value }}</strong>
      </article>
    </div>

    <!-- 待定位队列：严重缺陷缺管线归属，禁止确认/忽略 -->
    <section v-if="board.locating.length" class="queue-block locating-block">
      <h3>待定位队列（{{ board.locating.length }}）<small>严重缺陷缺少管线归属，须先补录定位，不得静默忽略</small></h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>缺陷编号</th>
            <th>严重等级</th>
            <th>发现位置</th>
            <th>所属管线</th>
            <th>初步归属</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in board.locating" :key="`loc-${String(item.row.id)}`">
            <td>{{ item.row['缺陷编号'] }}</td>
            <td class="severity-cell">{{ item.row['严重等级'] }}</td>
            <td>{{ item.row['发现位置'] }}</td>
            <td><em class="missing">未登记管线</em></td>
            <td>{{ item.unitName }}</td>
            <td class="row-actions">
              <button v-if="item.actionable" class="link" type="button" @click="openLocate(item)">
                补录管线定位
              </button>
              <span v-else class="readonly-reason">{{ item.blockingReason }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <form class="filter-bar" @submit.prevent="reload">
      <label class="filter-item">
        <span>检索缺陷编号 / 管线 / 位置</span>
        <input v-model="keyword" placeholder="输入关键字过滤会诊队列" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="keyword = ''">清空</button>
    </form>

    <!-- 会诊队列 -->
    <section class="queue-block">
      <h3>会诊队列（{{ filteredQueue.length }}）<small>顺位即处置优先级，序号越小越优先会诊</small></h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>会诊顺位</th>
            <th>缺陷编号</th>
            <th>所属管线</th>
            <th>发现位置</th>
            <th>严重等级</th>
            <th>归属单位</th>
            <th>优先级依据</th>
            <th>会诊结论</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in filteredQueue" :key="String(item.row.id)" :class="{ 'cross-row': !item.owned && !item.conclusion }">
            <td><strong>{{ item.order }}</strong></td>
            <td>{{ item.row['缺陷编号'] }}</td>
            <td>{{ item.row['所属管线'] || '—' }}</td>
            <td>{{ item.row['发现位置'] }}</td>
            <td class="severity-cell">{{ item.row['严重等级'] }}</td>
            <td>
              {{ item.unitName }}
              <span v-if="item.owned" class="tag tag-own">本单位</span>
            </td>
            <td class="muted-cell">{{ item.priorityText }}</td>
            <td>
              <template v-if="item.conclusion">
                <span :class="item.conclusion.verdict === '确认缺陷' ? 'verdict-ok' : 'verdict-ignore'">
                  {{ item.conclusion.verdict }}
                </span>
                <div class="conclusion-meta">
                  {{ item.conclusion.confirmer }} · {{ item.conclusion.ruleVersion }} 口径 · 顺位 {{ item.conclusion.order }}
                </div>
              </template>
              <span v-else class="muted-cell">待会诊</span>
            </td>
            <td class="row-actions">
              <template v-if="item.actionable">
                <button class="link" type="button" @click="openVerdict('确认缺陷', item)">确认</button>
                <button class="link danger" type="button" @click="openVerdict('忽略缺陷', item)">忽略</button>
              </template>
              <span v-else class="readonly-reason">{{ item.blockingReason }}</span>
            </td>
          </tr>
          <tr v-if="!filteredQueue.length">
            <td colspan="9" class="empty-state">会诊队列暂无匹配缺陷</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 历史结论：永远按结论当时的规则口径展示 -->
    <section class="queue-block history-block">
      <h3>会诊结论台账（{{ history.length }}）<small>每条结论快照当时规则版本，规则调整后仍按当时口径展示</small></h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>缺陷编号</th>
            <th>结论</th>
            <th>会诊意见</th>
            <th>会诊人 / 单位</th>
            <th>当时顺位</th>
            <th>口径版本</th>
            <th>会诊时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(item, index) in history" :key="`${item.defectCode}-${index}`">
            <td>{{ item.defectCode }}</td>
            <td :class="item.verdict === '确认缺陷' ? 'verdict-ok' : 'verdict-ignore'">{{ item.verdict }}</td>
            <td>{{ item.opinion || '—' }}</td>
            <td>{{ item.confirmer }} · {{ item.unitName }}</td>
            <td>{{ item.order }}</td>
            <td><span class="tag tag-rule">{{ item.ruleLabel }}</span></td>
            <td>{{ formatTime(item.concludedAt) }}</td>
          </tr>
          <tr v-if="!history.length">
            <td colspan="7" class="empty-state">暂无会诊结论</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 会诊结论弹窗 -->
    <div v-if="dialog.kind === 'verdict'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3>{{ dialog.verdict }}：{{ dialog.item?.row['缺陷编号'] }}</h3>
        <dl class="detail-list">
          <div><dt>所属管线</dt><dd>{{ dialog.item?.row['所属管线'] }}</dd></div>
          <div><dt>发现位置</dt><dd>{{ dialog.item?.row['发现位置'] }}</dd></div>
          <div><dt>严重等级</dt><dd>{{ dialog.item?.row['严重等级'] }}</dd></div>
          <div><dt>归属单位</dt><dd>{{ dialog.item?.unitName }}（本单位）</dd></div>
          <div><dt>会诊顺位</dt><dd>{{ dialog.item?.order }} · {{ board.ruleLabel }}</dd></div>
        </dl>
        <label class="opinion-box">
          <span>会诊意见（写入缺陷记录与维修验收单）</span>
          <textarea v-model="dialog.opinion" rows="3" placeholder="请填写确认/忽略依据"></textarea>
        </label>
        <p class="dialog-tip">提交以乐观锁校验：同一缺陷并发会诊仅保留首个有效结论。</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitVerdict">提交结论</button>
        </div>
      </div>
    </div>

    <!-- 补录管线弹窗 -->
    <div v-if="dialog.kind === 'locate'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3>补录管线定位：{{ dialog.item?.row['缺陷编号'] }}</h3>
        <p class="dialog-tip">
          严重缺陷缺少管线归属，不能确认或忽略。补录后按管线归属单位重新进入会诊队列。
        </p>
        <label class="opinion-box">
          <span>管线编号（须落在{{ store.unitName }}辖区）</span>
          <input v-model="dialog.pipeline" list="pipeline-options" placeholder="如 PIPE-CD-103" />
          <datalist id="pipeline-options">
            <option v-for="code in pipelineSuggestions" :key="code" :value="code" />
          </datalist>
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitLocate">确认定位</button>
        </div>
      </div>
    </div>

    <footer class="page-foot">
      <span v-if="store.isRecorder">
        当前身份：{{ store.operator }}（{{ store.unitName }}记录员）· 跨单位缺陷只读
      </span>
      <span v-else>当前身份：{{ store.operator }}（只读查看员）· 全部缺陷仅可查看</span>
      <span v-if="message" :class="messageOk ? 'ok-text' : 'error-text'">{{ message }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import { useSessionStore, IDENTITIES } from '@/stores/session'
import {
  defectVersion,
  loadBoard,
  loadHistory,
  loadRuleMode,
  locateDefect,
  saveRuleMode,
  submitConclusion,
  type ConsultationBoard,
  type HistoryItem,
} from '@/domain/consultation/service'
import type { ConsultationQueueItem, ConsultVerdict } from '@/domain/consultation/types'
import { JURISDICTION_UNITS } from '@/domain/consultation/rules'

const NOW = '2026-10-06T09:00:00'

const store = useSessionStore()
const keyword = ref('')
const ruleMode = ref(loadRuleMode())
const board = ref<ConsultationBoard>({
  ruleVersion: 'v2',
  ruleLabel: '',
  effectiveFrom: '',
  queue: [],
  locating: [],
})
const history = ref<HistoryItem[]>([])
const message = ref('')
const messageOk = ref(true)

const pipelineSuggestions = computed(() => {
  const unit = JURISDICTION_UNITS.find((item) => item.code === store.unitCode)
  if (!unit) {
    return []
  }
  // 已在 jurisdiction 台账登记的样例管线 + 前缀示例
  const registered = ['PIPE-CD-101', 'PIPE-CD-102', 'PIPE-CX-201', 'PIPE-CX-202', 'PIPE-CN-301']
  return [
    ...registered.filter((code) => unit.pipelinePrefixes.some((prefix) => code.startsWith(prefix))),
    `${unit.pipelinePrefixes[0]}-XXX`,
  ]
})

const currentVersion = computed(() => board.value.ruleVersion)

const filteredQueue = computed(() => {
  const key = keyword.value.trim()
  if (!key) {
    return board.value.queue
  }
  return board.value.queue.filter((item) =>
    [item.row['缺陷编号'], item.row['所属管线'], item.row['发现位置']]
      .map((value) => String(value ?? ''))
      .some((value) => value.includes(key)),
  )
})

const stats = computed(() => [
  {
    label: '待会诊缺陷',
    value: board.value.queue.filter((item) => !item.conclusion).length,
    warn: false,
  },
  { label: '待定位严重缺陷', value: board.value.locating.length, warn: board.value.locating.length > 0 },
  {
    label: '跨单位/只读',
    value: board.value.queue.filter((item) => !item.actionable && !item.conclusion).length,
    warn: false,
  },
  { label: '累计会诊结论', value: history.value.length, warn: false },
])

type DialogKind = 'none' | 'verdict' | 'locate'

const dialog = reactive<{
  kind: DialogKind
  verdict: ConsultVerdict
  item: ConsultationQueueItem | null
  opinion: string
  pipeline: string
  baseVersion: number
}>({
  kind: 'none',
  verdict: '确认缺陷',
  item: null,
  opinion: '',
  pipeline: '',
  baseVersion: 0,
})

function notify(text: string, ok = false) {
  message.value = text
  messageOk.value = ok
}

function reload() {
  board.value = loadBoard(NOW, ruleMode.value)
  history.value = loadHistory()
}

function onRuleModeChange() {
  saveRuleMode(ruleMode.value)
  reload()
  notify(
    ruleMode.value === 'auto'
      ? '已切回当前生效口径'
      : `预览 ${ruleMode.value.toUpperCase()} 口径：会诊顺位按该版本重排，历史结论展示不变`,
    true,
  )
}

function openVerdict(verdict: ConsultVerdict, item: ConsultationQueueItem) {
  dialog.kind = 'verdict'
  dialog.verdict = verdict
  dialog.item = item
  dialog.opinion = ''
  dialog.baseVersion = defectVersion(item.row)
}

function openLocate(item: ConsultationQueueItem) {
  dialog.kind = 'locate'
  dialog.item = item
  dialog.pipeline = ''
}

function closeDialog() {
  dialog.kind = 'none'
  dialog.item = null
}

function submitVerdict() {
  if (dialog.kind !== 'verdict' || !dialog.item) {
    return
  }
  const item = dialog.item
  const result = submitConclusion(
    {
      defectId: Number(item.row.id),
      verdict: dialog.verdict,
      opinion: dialog.opinion,
    },
    dialog.baseVersion,
    NOW,
    ruleMode.value,
  )
  notify(result.message, result.ok)
  if (result.ok) {
    closeDialog()
    reload()
  } else if (typeof result.baseVersion === 'number') {
    // 版本冲突：同步最新版本号，强制刷新后再会诊
    dialog.baseVersion = result.baseVersion
    reload()
  }
}

function submitLocate() {
  if (dialog.kind !== 'locate' || !dialog.item) {
    return
  }
  const item = dialog.item
  const result = locateDefect(Number(item.row.id), dialog.pipeline)
  notify(result.message, result.ok)
  if (result.ok) {
    closeDialog()
    reload()
  }
}

function formatTime(value: string): string {
  return value ? value.replace('T', ' ') : '—'
}

// 占位：确保身份清单参与构建（身份切换在顶部头部）
void IDENTITIES

onMounted(reload)
</script>

<style scoped>
.rule-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.rule-switch select {
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.rule-banner {
  background: #eef4ff;
  border: 1px solid #c6d9fb;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  margin-bottom: 12px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
.banner-tip {
  color: var(--muted);
}
.queue-block {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
}
.queue-block h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.queue-block h3 small {
  font-weight: 400;
  color: var(--muted);
  margin-left: 8px;
}
.locating-block {
  border-color: #f2c2bd;
  background: #fff7f6;
}
.locating-block h3 {
  color: #b42318;
}
.severity-cell {
  font-weight: 600;
}
.missing {
  color: #b42318;
}
.muted-cell {
  color: var(--muted);
  font-size: 12px;
}
.cross-row {
  background: #fafbfc;
}
.tag {
  display: inline-block;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  margin-left: 4px;
}
.tag-own {
  background: #dcfae6;
  color: #067647;
}
.tag-rule {
  background: #eef2f7;
  color: #475467;
}
.verdict-ok {
  color: #067647;
  font-weight: 600;
}
.verdict-ignore {
  color: #b42318;
  font-weight: 600;
}
.conclusion-meta {
  font-size: 11px;
  color: var(--muted);
}
.readonly-reason {
  color: var(--muted);
  font-size: 12px;
}
.link.danger {
  color: #b42318;
}
.warn {
  color: #b42318;
}
.ok-text {
  color: #067647;
}
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  width: 520px;
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
}
.modal h3 {
  margin: 0 0 12px;
  font-size: 15px;
}
.detail-list {
  margin: 0 0 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
  font-size: 13px;
}
.detail-list dt {
  color: var(--muted);
  display: inline;
}
.detail-list dd {
  display: inline;
  margin: 0 0 0 6px;
}
.opinion-box {
  display: block;
  font-size: 13px;
}
.opinion-box span {
  display: block;
  color: var(--muted);
  margin-bottom: 4px;
}
.opinion-box textarea,
.opinion-box input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  font: inherit;
}
.dialog-tip {
  color: var(--muted);
  font-size: 12px;
  margin: 8px 0;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.history-block {
  background: #fcfcfd;
}
</style>
