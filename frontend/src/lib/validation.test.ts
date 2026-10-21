import { describe, expect, it } from 'vitest'
import {
  toNonNegativeInt,
  toPositiveInt,
  validateNonNegativeInteger,
  validateOrderForm,
  validatePositiveInteger,
  validateProductForm,
  validateStockForm,
} from './validation'

describe('validatePositiveInteger', () => {
  it('accepts whole numbers greater than zero', () => {
    expect(validatePositiveInteger('1')).toBeNull()
    expect(validatePositiveInteger('42')).toBeNull()
    expect(validatePositiveInteger(' 7 ')).toBeNull()
  })

  it('rejects empty, zero, negative and fractional values', () => {
    expect(validatePositiveInteger('')).toBe('Quantity is required')
    expect(validatePositiveInteger('   ')).toBe('Quantity is required')
    expect(validatePositiveInteger('0')).toBe('Quantity must be greater than 0')
    expect(validatePositiveInteger('-3')).toBe('Quantity must be a whole number')
    expect(validatePositiveInteger('1.5')).toBe('Quantity must be a whole number')
    expect(validatePositiveInteger('abc')).toBe('Quantity must be a whole number')
    expect(validatePositiveInteger('1e3')).toBe('Quantity must be a whole number')
  })
})

describe('validateNonNegativeInteger', () => {
  it('allows zero for prices', () => {
    expect(validateNonNegativeInteger('0', 'Price')).toBeNull()
    expect(validateNonNegativeInteger('', 'Price')).toBe('Price is required')
    expect(validateNonNegativeInteger('-1', 'Price')).toBe('Price must be a whole number')
  })
})

describe('validateStockForm', () => {
  it('flags a bad quantity', () => {
    expect(validateStockForm({ type: 'in', qty: '0', note: '' })).toEqual({
      qty: 'Quantity must be greater than 0',
    })
  })

  it('flags an over-long note', () => {
    const errors = validateStockForm({ type: 'out', qty: '2', note: 'x'.repeat(501) })
    expect(errors.note).toBeDefined()
  })

  it('passes a valid form', () => {
    expect(validateStockForm({ type: 'out', qty: '3', note: 'Damaged' })).toEqual({})
  })
})

describe('validateProductForm', () => {
  const base = { sku: 'SKU-1', name: 'Keyboard', price: '150000', stock: '0', isActive: true }

  it('requires sku and name', () => {
    const errors = validateProductForm({ ...base, sku: '  ', name: '' })
    expect(errors.sku).toBe('SKU is required')
    expect(errors.name).toBe('Name is required')
  })

  it('requires a non-negative integer price', () => {
    expect(validateProductForm({ ...base, price: '' }).price).toBe('Price is required')
    expect(validateProductForm({ ...base, price: '-5' }).price).toBe('Price must be a whole number')
    expect(validateProductForm({ ...base, price: '0' }).price).toBeUndefined()
  })

  it('treats a blank initial stock as zero', () => {
    expect(validateProductForm({ ...base, stock: '' })).toEqual({})
  })

  it('passes a complete form', () => {
    expect(validateProductForm(base)).toEqual({})
  })
})

describe('validateOrderForm', () => {
  it('requires a customer name', () => {
    const result = validateOrderForm('', [{ rowId: 'r1', sku: 'SKU-1', qty: '1' }])
    expect(result.customer).toBe('Customer name is required')
    expect(result.hasErrors).toBe(true)
  })

  it('rejects an empty item list', () => {
    const result = validateOrderForm('Buyer', [])
    expect(result.hasErrors).toBe(true)
  })

  it('flags duplicate skus and bad quantities', () => {
    const result = validateOrderForm('Buyer', [
      { rowId: 'r1', sku: 'SKU-1', qty: '1' },
      { rowId: 'r2', sku: 'SKU-1', qty: '0' },
    ])
    expect(result.items.r2?.sku).toContain('already in the order')
    expect(result.items.r2?.qty).toBe('Quantity must be greater than 0')
    expect(result.hasErrors).toBe(true)
  })

  it('flags an unselected product', () => {
    const result = validateOrderForm('Buyer', [{ rowId: 'r1', sku: '  ', qty: '2' }])
    expect(result.items.r1?.sku).toBe('Choose a product')
  })

  it('passes a valid order', () => {
    const result = validateOrderForm('CV Sinar Abadi', [
      { rowId: 'r1', sku: 'SKU-1', qty: '2' },
      { rowId: 'r2', sku: 'SKU-2', qty: '1' },
    ])
    expect(result.hasErrors).toBe(false)
    expect(result.items).toEqual({})
  })
})

describe('parsers', () => {
  it('parses valid integers only', () => {
    expect(toPositiveInt('12')).toBe(12)
    expect(toPositiveInt('0')).toBeNull()
    expect(toPositiveInt('x')).toBeNull()
  })

  it('falls back for invalid non-negative integers', () => {
    expect(toNonNegativeInt('2500')).toBe(2500)
    expect(toNonNegativeInt('')).toBe(0)
    expect(toNonNegativeInt('abc', 7)).toBe(7)
  })
})
