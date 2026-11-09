/**
 * 令牌存取（localStorage 持久化 + 内存缓存）
 *
 * 技术文档第 5.1 节：access 30 分钟、refresh 勾选「记住我」7 天。
 * 这里只负责存取；刷新逻辑在 http.ts 的中间层里（单飞 + 重放）。
 */

const ACCESS_KEY = 'renthub.access_token'
const REFRESH_KEY = 'renthub.refresh_token'

let accessToken = ''
let refreshToken = ''
let handler: (() => void) | null = null

export function loadTokens(): void {
  try {
    accessToken = localStorage.getItem(ACCESS_KEY) ?? ''
    refreshToken = localStorage.getItem(REFRESH_KEY) ?? ''
  } catch {
    accessToken = ''
    refreshToken = ''
  }
}

export function getAccessToken(): string {
  return accessToken
}

export function getRefreshToken(): string {
  return refreshToken
}

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
  try {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  } catch {
    /* 隐私模式忽略 */
  }
}

export function clearTokens(): void {
  accessToken = ''
  refreshToken = ''
  try {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* 忽略 */
  }
}

/** 由 router 注册：刷新失败时跳登录 */
export function onUnauthorized(fn: () => void): void {
  handler = fn
}

export function notifyUnauthorized(): void {
  handler?.()
}
