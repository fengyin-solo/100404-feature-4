import { defineStore } from 'pinia'

export type SessionRole = 'recorder' | 'viewer'

export type Identity = {
  id: string
  operator: string
  role: SessionRole
  /** 管辖单位编码；查看员可跨单位，留空 */
  unitCode: string
  unitName: string
}

/** 演示用身份：覆盖本单位记录员、跨单位记录员、只读查看员三种场景。 */
export const IDENTITIES: Identity[] = [
  { id: 'cd', operator: '王记录', role: 'recorder', unitCode: 'CD', unitName: '城东管网管理所' },
  { id: 'cx', operator: '李记录', role: 'recorder', unitCode: 'CX', unitName: '城西管网管理所' },
  { id: 'cn', operator: '赵记录', role: 'recorder', unitCode: 'CN', unitName: '城南管网管理所' },
  { id: 'guest', operator: '巡查访客', role: 'viewer', unitCode: '', unitName: '无管辖单位' },
]

const IDENTITY_KEY = 'underground-pipeline-inspection:identity'

function loadIdentity(): Identity {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = window.localStorage.getItem(IDENTITY_KEY)
    const found = IDENTITIES.find((item) => item.id === saved)
    if (found) {
      return found
    }
  }
  return IDENTITIES[0]
}

export const useSessionStore = defineStore('session', {
  state: () => {
    const identity = loadIdentity()
    return {
      identityId: identity.id,
      operator: identity.operator,
      role: identity.role,
      unitCode: identity.unitCode,
      unitName: identity.unitName,
      shiftLabel: '白班 08:00-20:00',
      scope: '城市地下管网巡检养护管理系统',
    }
  },
  getters: {
    canOperate: (state) => state.operator.length > 0,
    /** 记录员才有确认/忽略入口，查看员跨单位只读。 */
    isRecorder: (state) => state.role === 'recorder',
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    switchIdentity(id: string) {
      const identity = IDENTITIES.find((item) => item.id === id) ?? IDENTITIES[0]
      this.identityId = identity.id
      this.operator = identity.operator
      this.role = identity.role
      this.unitCode = identity.unitCode
      this.unitName = identity.unitName
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(IDENTITY_KEY, identity.id)
      }
    },
  },
})
