import { defineStore } from 'pinia'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '城市地下管网巡检养护管理系统',
    // 会诊归属限制用的身份：管辖单位决定能否下结论，角色决定是不是记录员。
    unit: '城东运维所',
    role: '记录员',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
  },
})
