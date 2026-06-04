import Store from 'electron-store'

interface AppConfig {
  baseUrl: string
  groupId: string
  sugarCompany: string
  skipTest: boolean
  delay: number
}

const defaults: AppConfig = {
  baseUrl: 'http://200.1.1.97:8001',
  groupId: '',
  sugarCompany: '',
  skipTest: false,
  delay: 1.0,
}

const store = new Store<AppConfig>({
  defaults,
})

export function getConfig(): AppConfig {
  return {
    baseUrl: store.get('baseUrl', defaults.baseUrl),
    groupId: store.get('groupId', defaults.groupId),
    sugarCompany: store.get('sugarCompany', defaults.sugarCompany),
    skipTest: store.get('skipTest', defaults.skipTest),
    delay: store.get('delay', defaults.delay),
  }
}

export function setConfig(partial: Partial<AppConfig>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppConfig, value)
  }
}

export function resetConfig(): void {
  store.clear()
}
