/**
 * SSE 客户端（AI 找房流式对话）
 *
 * axios 不支持流式读取，这里用 fetch + ReadableStream 手写 SSE 解析，
 * 仍走同一份 /api/v1 契约，因此假后端与真后端（FastAPI EventSourceResponse）通用。
 */
import { API_BASE, ApiError } from './http'
import { getAccessToken } from './token'
import type { ListingCard } from './types'

export interface ChatRequest {
  session_id?: number
  scene: 'find_house' | 'merchant_copy'
  message: string
  listing_id?: number
}

/**
 * 发起一次对话，按事件回调消费流。
 * @returns done 事件的 data（session_id / message_id）
 */
export async function streamChat(
  body: ChatRequest,
  handlers: {
    onDelta?: (text: string) => void
    onConditions?: (conditions: Record<string, unknown>) => void
    onOptions?: (group: string, items: { label: string; value: string }[]) => void
    onCards?: (items: ListingCard[]) => void
    onError?: (err: ApiError) => void
  } = {},
  signal?: AbortSignal,
): Promise<{ session_id: number; message_id: number } | null> {
  const token = getAccessToken()
  const res = await fetch(`${API_BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok || !res.body) {
    let detail = `对话请求失败（${res.status}）`
    let code = 'HTTP_ERROR'
    let traceId = ''
    try {
      const data = (await res.json()) as { code?: string; message?: string; trace_id?: string }
      if (data.message) detail = data.message
      if (data.code) code = data.code
      if (data.trace_id) traceId = data.trace_id
    } catch {
      /* 非 JSON 响应 */
    }
    const err = new ApiError(detail, { code, status: res.status, traceId })
    handlers.onError?.(err)
    throw err
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let done: { session_id: number; message_id: number } | null = null

  const dispatch = (raw: string) => {
    let event = 'message'
    const dataLines: string[] = []
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
    if (!dataLines.length) return
    let payload: unknown
    try {
      payload = JSON.parse(dataLines.join('\n'))
    } catch {
      return
    }
    switch (event) {
      case 'delta':
        handlers.onDelta?.((payload as { text: string }).text)
        break
      case 'conditions':
        handlers.onConditions?.(payload as Record<string, unknown>)
        break
      case 'options': {
        const p = payload as { group: string; items: { label: string; value: string }[] }
        handlers.onOptions?.(p.group, p.items)
        break
      }
      case 'cards':
        handlers.onCards?.((payload as { items: ListingCard[] }).items)
        break
      case 'error': {
        const p = payload as { code: string; message: string }
        handlers.onError?.(new ApiError(p.message, { code: p.code }))
        break
      }
      case 'done':
        done = payload as { session_id: number; message_id: number }
        break
      default:
        break
    }
  }

  for (;;) {
    const { done: finished, value } = await reader.read()
    if (finished) break
    buffer += decoder.decode(value, { stream: true })
    let idx = buffer.indexOf('\n\n')
    while (idx >= 0) {
      dispatch(buffer.slice(0, idx))
      buffer = buffer.slice(idx + 2)
      idx = buffer.indexOf('\n\n')
    }
  }
  if (buffer.trim()) dispatch(buffer)
  return done
}
