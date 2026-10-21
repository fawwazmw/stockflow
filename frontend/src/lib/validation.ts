/**
 * Pure validation for the forms. Kept separate from components so the rules
 * are unit tested (Vitest) and reused by both modals and the order builder.
 */

export type FieldErrors = Record<string, string>

const DIGITS_ONLY = /^\d+$/

/** Whole number > 0, as required by both stock adjust and order lines. */
export function validatePositiveInteger(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return 'Quantity is required'
  if (!DIGITS_ONLY.test(trimmed)) return 'Quantity must be a whole number'
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return 'Quantity is too large'
  if (value <= 0) return 'Quantity must be greater than 0'
  return null
}

/** Money/stock: digits only, may be zero. */
export function validateNonNegativeInteger(raw: string, label = 'Value'): string | null {
  const trimmed = raw.trim()
  if (trimmed === '') return `${label} is required`
  if (!DIGITS_ONLY.test(trimmed)) return `${label} must be a whole number`
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return `${label} is too large`
  if (value < 0) return `${label} must be >= 0`
  return null
}

export interface StockFormValues {
  type: 'in' | 'out'
  qty: string
  note: string
}

export function validateStockForm(values: StockFormValues): FieldErrors {
  const errors: FieldErrors = {}
  const qtyError = validatePositiveInteger(values.qty)
  if (qtyError) errors.qty = qtyError
  if (values.note.trim().length > 500) errors.note = 'Note must be at most 500 characters'
  return errors
}

export interface ProductFormValues {
  sku: string
  name: string
  price: string
  stock: string
  isActive: boolean
}

export function validateProductForm(values: ProductFormValues): FieldErrors {
  const errors: FieldErrors = {}

  const sku = values.sku.trim()
  if (sku === '') errors.sku = 'SKU is required'
  else if (sku.length > 64) errors.sku = 'SKU must be at most 64 characters'

  const name = values.name.trim()
  if (name === '') errors.name = 'Name is required'
  else if (name.length > 200) errors.name = 'Name must be at most 200 characters'

  const priceError = validateNonNegativeInteger(values.price, 'Price')
  if (priceError) errors.price = priceError

  // Stock is optional on create; blank means zero.
  if (values.stock.trim() !== '') {
    const stockError = validateNonNegativeInteger(values.stock, 'Stock')
    if (stockError) errors.stock = stockError
  }

  return errors
}

export interface OrderLineValues {
  rowId: string
  sku: string
  qty: string
}

export interface OrderFormErrors {
  customer?: string
  items: Record<string, { sku?: string; qty?: string }>
  hasErrors: boolean
}

export function validateOrderForm(customer: string, lines: OrderLineValues[]): OrderFormErrors {
  const errors: OrderFormErrors = { items: {}, hasErrors: false }

  const trimmedCustomer = customer.trim()
  if (trimmedCustomer === '') {
    errors.customer = 'Customer name is required'
    errors.hasErrors = true
  } else if (trimmedCustomer.length > 200) {
    errors.customer = 'Customer name must be at most 200 characters'
    errors.hasErrors = true
  }

  if (lines.length === 0) {
    errors.hasErrors = true
    return errors
  }

  const seen = new Map<string, string>()
  for (const line of lines) {
    const lineErrors: { sku?: string; qty?: string } = {}
    const sku = line.sku.trim()

    if (sku === '') {
      lineErrors.sku = 'Choose a product'
    } else if (seen.has(sku)) {
      lineErrors.sku = 'This SKU is already in the order'
    } else {
      seen.set(sku, line.rowId)
    }

    const qtyError = validatePositiveInteger(line.qty)
    if (qtyError) lineErrors.qty = qtyError

    if (lineErrors.sku || lineErrors.qty) {
      errors.items[line.rowId] = lineErrors
      errors.hasErrors = true
    }
  }

  return errors
}

/** Parses a digits-only input, returning null when it is not usable. */
export function toPositiveInt(raw: string): number | null {
  if (validatePositiveInteger(raw) !== null) return null
  return Number(raw.trim())
}

export function toNonNegativeInt(raw: string, fallback = 0): number {
  if (validateNonNegativeInteger(raw) !== null) return fallback
  return Number(raw.trim())
}
