import type {
  AdjustStockInput,
  CreateOrderInput,
  DailySales,
  Order,
  OrderStatusFilter,
  Paginated,
  Product,
  ProductInput,
  ProductStatusFilter,
  StockMovement,
  Summary,
} from './types'

/**
 * The only module that talks HTTP. Every component goes through these
 * functions, so URL building and error-envelope parsing live in one place.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const

export interface ApiErrorBody {
  code: string
  message: string
  fields?: Record<string, string>
  details?: { field: string; sku?: string; message: string }[]
  sku?: string
  available?: number
  requested?: number
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>
  readonly details: { field: string; sku?: string; message: string }[]
  readonly sku?: string
  readonly available?: number
  readonly requested?: number

  constructor(status: number, body: ApiErrorBody) {
    super(body.message)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
    this.fields = body.fields ?? {}
    this.details = body.details ?? []
    this.sku = body.sku
    this.available = body.available
    this.requested = body.requested
  }

  get isInsufficientStock(): boolean {
    return this.code === 'INSUFFICIENT_STOCK'
  }

  get isProductHasHistory(): boolean {
    return this.code === 'PRODUCT_HAS_HISTORY'
  }

  /** Message to show for a specific form field, if the server blamed it. */
  fieldError(field: string): string | undefined {
    return this.fields[field]
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) {
    return new ApiError(0, { code: 'UNKNOWN_ERROR', message: error.message })
  }
  return new ApiError(0, { code: 'UNKNOWN_ERROR', message: 'Something went wrong' })
}

interface ErrorEnvelope {
  error: ApiErrorBody
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false
  const candidate = (value as { error?: unknown }).error
  if (typeof candidate !== 'object' || candidate === null) return false
  const body = candidate as { code?: unknown; message?: unknown }
  return typeof body.code === 'string' && typeof body.message === 'string'
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the API. Check that the backend is running.',
    })
  }

  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (isErrorEnvelope(payload)) {
      throw new ApiError(response.status, payload.error)
    }
    const message =
      response.status >= 500
        ? 'The API is not responding. Check that the backend is running, then retry.'
        : response.statusText || 'Request failed'
    throw new ApiError(response.status, { code: `HTTP_${response.status}`, message })
  }

  return payload as T
}

interface DataEnvelope<T> {
  data: T
}

async function requestData<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await request<DataEnvelope<T>>(path, init)
  return body.data
}

export interface ProductListQuery {
  search?: string
  status?: ProductStatusFilter
  page?: number
  limit?: number
}

export function listProducts(query: ProductListQuery): Promise<Paginated<Product>> {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  params.set('status', query.status ?? 'all')
  params.set('page', String(query.page ?? 1))
  params.set('limit', String(query.limit ?? 20))
  return request<Paginated<Product>>(`/api/products?${params.toString()}`)
}

export function getSummary(): Promise<Summary> {
  return requestData<Summary>('/api/products/summary')
}

export function getProduct(id: number): Promise<Product> {
  return requestData<Product>(`/api/products/${id}`)
}

export function createProduct(input: ProductInput): Promise<Product> {
  return requestData<Product>('/api/products', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

export function updateProduct(id: number, input: ProductInput): Promise<Product> {
  return requestData<Product>(`/api/products/${id}`, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

export function deleteProduct(id: number): Promise<void> {
  return request<void>(`/api/products/${id}`, { method: 'DELETE' })
}

export function adjustStock(
  id: number,
  input: AdjustStockInput,
): Promise<{ product: Product; movement: StockMovement }> {
  return requestData<{ product: Product; movement: StockMovement }>(`/api/products/${id}/stock`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

export function listMovements(id: number): Promise<StockMovement[]> {
  return requestData<StockMovement[]>(`/api/products/${id}/movements`)
}

export interface OrderListQuery {
  search?: string
  status?: OrderStatusFilter
  page?: number
  limit?: number
}

export function listOrders(query: OrderListQuery = {}): Promise<Paginated<Order>> {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  params.set('status', query.status ?? 'all')
  params.set('page', String(query.page ?? 1))
  params.set('limit', String(query.limit ?? 20))
  return request<Paginated<Order>>(`/api/orders?${params.toString()}`)
}

export function createOrder(input: CreateOrderInput, idempotencyKey?: string): Promise<Order> {
  const headers: Record<string, string> = { ...JSON_HEADERS }
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey
  }
  return requestData<Order>('/api/orders', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}

export function getOrder(id: number): Promise<Order> {
  return requestData<Order>(`/api/orders/${id}`)
}

export function cancelOrder(id: number): Promise<Order> {
  return requestData<Order>(`/api/orders/${id}/cancel`, { method: 'POST' })
}

export function getDailySales(date: string): Promise<DailySales> {
  return requestData<DailySales>(`/api/reports/daily-sales?date=${encodeURIComponent(date)}`)
}
