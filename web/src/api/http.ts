/**
 * 中间层：唯一的 HTTP 出口
 *
 * 页面与 stores 只依赖这里导出的 `http` / `ApiError` / `upload`，
 * 不知道背后是假后端（web/mock）还是真 FastAPI —— 换后端只改 VITE_API_BASE。
 *
 * 职责：
 *  1. 注入 Bearer
 *  2. 401 → 用 refresh_token 换新 token（并发只刷一次）→ 重放原请求
 *  3. 把后端的 {code,message,details,trace_id} 统一转成 ApiError
 */
import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import type { ApiErrorBody, LoginResp, UploadResp } from './types'
import { clearTokens, getAccessToken, getRefreshToken, notifyUnauthorized, setTokens } from './token'

export const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api/v1'

export class ApiError extends Error {
  code: string
  status: number
  details: unknown
  traceId: string
  fieldErrors: Record<string, string>

  constructor(message: string, opts: { code?: string; status?: number; details?: unknown; traceId?: string } = {}) {
    super(message)
    this.name = 'ApiError'
    this.code = opts.code ?? 'UNKNOWN'
    this.status = opts.status ?? 0
    this.details = opts.details ?? null
    this.traceId = opts.traceId ?? ''
    this.fieldErrors = {}
    if (Array.isArray(this.details)) {
      for (const d of this.details as { field?: string; message?: string }[]) {
        if (d?.field) this.fieldErrors[d.field] = d.message ?? '校验未通过'
      }
    }
  }
}

export const http: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  withCredentials: false,
})

http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refresh = getRefreshToken()
  if (!refresh) throw new ApiError('登录已过期，请重新登录', { code: 'AUTH_TOKEN_MISSING', status: 401 })
  if (!refreshing) {
    refreshing = axios
      .post<LoginResp>(`${API_BASE}/auth/refresh`, { refresh_token: refresh })
      .then((res) => {
        setTokens(res.data.access_token, res.data.refresh_token)
        return res.data.access_token
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

function toApiError(err: AxiosError<ApiErrorBody>): ApiError {
  const data = err.response?.data
  if (data && typeof data === 'object' && 'code' in data) {
    return new ApiError(data.message || '请求失败', {
      code: data.code,
      status: err.response?.status ?? 0,
      details: data.details,
      traceId: data.trace_id,
    })
  }
  const status = err.response?.status ?? 0
  if (status === 0) {
    return new ApiError(err.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : '网络异常，请检查网络或服务是否在运行', {
      code: 'NETWORK_ERROR',
      status: 0,
    })
  }
  return new ApiError(err.message || `请求失败（${status}）`, { code: 'HTTP_ERROR', status })
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as InternalAxiosRequestConfig & { __retried?: boolean }
    const status = error.response?.status ?? 0
    const url = config?.url ?? ''
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/refresh') || url.includes('/auth/register')

    if (status === 401 && config && !config.__retried && !isAuthCall) {
      config.__retried = true
      try {
        const token = await refreshAccessToken()
        config.headers.Authorization = `Bearer ${token}`
        return http.request(config)
      } catch {
        clearTokens()
        notifyUnauthorized()
        throw new ApiError('登录已过期，请重新登录', { code: 'AUTH_TOKEN_EXPIRED', status: 401 })
      }
    }
    if (status === 401 && !isAuthCall) {
      clearTokens()
      notifyUnauthorized()
    }
    throw toApiError(error)
  },
)

/** 统一断言：拿响应 data */
export async function request<T>(config: Parameters<AxiosInstance['request']>[0]): Promise<T> {
  const res = await http.request<T>(config)
  return res.data
}

/** 文件上传：multipart/form-data，字段名 file + type
 *  注意：不要手动设置 Content-Type —— 交给 axios 由 FormData 自动生成带 boundary 的头，
 *  否则后端拿不到 boundary，multipart 解析会失败。
 */
export async function upload(file: File, type: 'listing_image' | 'qualification'): Promise<UploadResp> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)
  return request<UploadResp>({ url: '/files', method: 'POST', data: form })
}
