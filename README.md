# 城市地下管网巡检养护管理系统

面向城市地下管线登记建档、巡检任务、缺陷记录、外出维修、修复验收与设施档案全流程的地下管网巡检养护管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/api/consultation-service.ts  缺陷会诊：优先级排序、归属校验、结论写回
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化（含会诊规则配置）
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 管线登记 | `pipeline` | 管线 | 管线编号、管线类型、起点位置 |
| 巡检任务 | `inspection` | 巡检任务 | 任务编号、巡检区域、巡检人员 |
| 缺陷记录 | `defect` | 缺陷记录 | 缺陷编号、所属管线、缺陷类型 |
| 缺陷会诊 | `consultation` | 会诊结论 | 缺陷编号、严重等级、所属管线 |
| 外出维修 | `out_repair` | 外出维修 | 派遣编号、缺陷来源、维修人员 |
| 维修验收 | `repair_accept` | 维修验收记录 | 验收编号、关联维修、验收人员 |
| 管道检测 | `pipe_detect` | 检测记录 | 检测编号、检测管段、检测方式 |
| 井盖设施 | `manhole` | 井盖设施 | 井盖编号、所属道路、井盖类型 |
| 泵站运行 | `pump_station` | 泵站 | 泵站编号、泵站名称、所在区域 |
| 排水管网 | `drain_network` | 排水管段 | 管段编号、上游节点、下游节点 |
| 水质监测 | `water_quality` | 水质监测记录 | 监测编号、取样点位、取样日期 |
| 流量监测 | `flow_monitor` | 流量监测点 | 监测点编号、监测点位、监测时段 |
| 应急事件 | `emergency` | 应急事件 | 事件编号、事件类型、事发地点 |
| 漏水检测 | `leak_detect` | 漏水检测记录 | 检测编号、检测管段、检测方法 |
| 非开挖修复 | `trenchless` | 非开挖修复记录 | 修复编号、修复管段、修复工艺 |
| 管道清洗 | `pipe_cleaning` | 管道清洗记录 | 清洗编号、清洗管段、清洗方式 |
| 设施档案 | `facility_archive` | 设施档案 | 档案编号、设施名称、设施类别 |
| 监测设备 | `monitor_device` | 监测设备 | 设备编号、设备类型、安装位置 |
| 施工队伍 | `contractor` | 施工队伍 | 队伍编号、队伍名称、资质等级 |

## 缺陷会诊规则

- **会诊顺序**：按严重等级、发现位置（区域风险）、所属管线（管线等级）生成，口径由当前规则版本决定，配置在 `frontend/src/data/consultation.ts`。
- **归属限制**：只有本管辖单位的记录员能确认或忽略，跨单位只能查看；页面右上角可切换管辖单位与角色。
- **结论写回**：会诊结论（确认/忽略）连同会诊单位、时间、规则版本写回缺陷记录；维修验收页按当前单位的管辖区域决定记录是否可见。
- **并发**：同一缺陷并发会诊只保留首个有效结论，后来的操作被拒绝。
- **待定位队列**：严重缺陷缺少管线归属时不静默忽略，进待定位队列，补录归属前不能下结论。
- **规则版本**：「调整会诊规则」切换口径版本，只影响新结论与队列排序；历史结论按下结论时的口径快照展示。

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`（缺陷会诊走 `frontend/src/api/consultation-service.ts`）。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` / `consultation-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `underground-pipeline-inspection:entries` 这一项，或调用 `resetModule(模块)`；
  会诊结论与规则版本分别在 `underground-pipeline-inspection:consultations`、
  `underground-pipeline-inspection:consultation-rule` 下。
