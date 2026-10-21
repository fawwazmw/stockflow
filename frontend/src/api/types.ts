export type OrderStatus = 'CREATED' | 'CANCELLED'
export type StockMovementType = 'in' | 'out'
export type ProductStatusFilter = 'all' | 'active' | 'inactive' | 'low'

export interface Product {
  id: number
  sku: string
  name: string
  price: number
  stock: number
  is_active: boolean
  created_at: string
  last_movement_at: string | null
}

export interface StockMovement {
  id: number
  product_id: number
  type: StockMovementType
  qty: number
  note: string | null
  created_at: string
}

export interface OrderItem {
  id: number
  sku: string
  product_name: string
  qty: number
  unit_price: number
  subtotal: number
}

export interface Order {
  id: number
  customer: string
  status: OrderStatus
  total: number
  created_at: string
  cancelled_at: string | null
  items: OrderItem[]
}

export interface Summary {
  total_products: number
  active_products: number
  total_stock_value: number
  low_stock_count: number
}

export interface Paginated<T> {
  data: T[]
  page: number
  limit: number
  total: number
}

export interface DailySales {
  date: string
  orders_count: number
  items_sold: number
  revenue: number
}

export interface ProductInput {
  sku: string
  name: string
  price: number
  stock?: number
  is_active: boolean
}

export interface AdjustStockInput {
  type: StockMovementType
  qty: number
  note?: string
}

export interface CreateOrderItemInput {
  sku: string
  qty: number
}

export interface CreateOrderInput {
  customer: string
  items: CreateOrderItemInput[]
}

export interface ErrorDetail {
  field: string
  sku?: string
  message: string
}
