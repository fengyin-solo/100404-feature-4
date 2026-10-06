<template>
  <div class="app-shell">
    <aside class="app-side">
      <h1 class="app-title">城市地下管网巡检养护管理系统</h1>
      <nav class="nav-list">
        <RouterLink v-for="item in navItems" :key="item.path" :to="item.path" class="nav-item">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="app-main">
      <header class="app-head">
        <span class="head-desc">面向城市地下管线登记建档、巡检任务、缺陷记录、外出维修、修复验收与设施档案全流程的地下管网巡检养护管理平台。</span>
        <span class="head-user">
          当前值班：{{ store.operator }}
          <em v-if="store.isRecorder" class="unit-badge">{{ store.unitName }} · 记录员</em>
          <em v-else class="unit-badge guest">只读查看员</em>
          · {{ store.shiftLabel }}
          <label class="identity-switch">
            切换身份
            <select :value="store.identityId" @change="onIdentityChange">
              <option v-for="item in identities" :key="item.id" :value="item.id">
                {{ item.operator }}（{{ item.role === 'recorder' ? item.unitName : '查看员' }}）
              </option>
            </select>
          </label>
        </span>
      </header>
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useSessionStore, IDENTITIES } from '@/stores/session'

const store = useSessionStore()
const identities = IDENTITIES

function onIdentityChange(event: Event) {
  store.switchIdentity((event.target as HTMLSelectElement).value)
}

const navItems = [{ label: "运营概览", path: "/" }, { label: "管线登记", path: "/pipeline" }, { label: "巡检任务", path: "/inspection" }, { label: "缺陷会诊", path: "/defect" }, { label: "外出维修", path: "/out_repair" }, { label: "维修验收", path: "/repair_accept" }, { label: "管道检测", path: "/pipe_detect" }, { label: "井盖设施", path: "/manhole" }, { label: "泵站运行", path: "/pump_station" }, { label: "排水管网", path: "/drain_network" }, { label: "水质监测", path: "/water_quality" }, { label: "流量监测", path: "/flow_monitor" }, { label: "应急事件", path: "/emergency" }, { label: "漏水检测", path: "/leak_detect" }, { label: "非开挖修复", path: "/trenchless" }, { label: "管道清洗", path: "/pipe_cleaning" }, { label: "设施档案", path: "/facility_archive" }, { label: "监测设备", path: "/monitor_device" }, { label: "施工队伍", path: "/contractor" }]
</script>

<style scoped>
.unit-badge {
  font-style: normal;
  background: #dcfae6;
  color: #067647;
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 12px;
  margin: 0 2px;
}
.unit-badge.guest {
  background: #eef2f7;
  color: #475467;
}
.identity-switch {
  margin-left: 10px;
  font-style: normal;
}
.identity-switch select {
  margin-left: 4px;
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
</style>
