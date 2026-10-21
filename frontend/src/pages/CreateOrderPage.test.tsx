// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Product } from '../api/types'
import { CreateOrderPage } from './CreateOrderPage'

const { listProducts, createOrder } = vi.hoisted(() => ({
  listProducts: vi.fn(),
  createOrder: vi.fn(),
}))

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, listProducts, createOrder }
})

const chair: Product = {
  id: 11,
  sku: 'CHR-001',
  name: 'Ergotec Ergonomic Chair',
  price: 2_450_000,
  stock: 3,
  is_active: true,
  created_at: '2026-10-01T00:00:00.000Z',
  last_movement_at: null,
}

function renderPage() {
  render(
    <MemoryRouter>
      <CreateOrderPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listProducts.mockReset()
  listProducts.mockResolvedValue({ data: [chair], page: 1, limit: 100, total: 1 })
  createOrder.mockReset()
})

describe('CreateOrderPage', () => {
  it('points at the exact SKU the server rejected with 409', async () => {
    createOrder.mockRejectedValueOnce(
      new ApiError(409, {
        code: 'INSUFFICIENT_STOCK',
        message: 'not enough stock for sku CHR-001',
        sku: 'CHR-001',
        available: 3,
        requested: 99,
      }),
    )
    renderPage()

    await screen.findByRole('option', { name: /CHR-001/ })
    await userEvent.selectOptions(screen.getByLabelText('Product for item 1'), 'CHR-001')
    await userEvent.type(screen.getByLabelText('Customer'), 'Katong Components')

    const qty = screen.getByLabelText('Quantity for item 1')
    await userEvent.clear(qty)
    await userEvent.type(qty, '99')
    await userEvent.click(screen.getByRole('button', { name: 'Create order' }))

    expect(await screen.findByText('Only 3 units in stock')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'CHR-001 has only 3 units in stock, so nothing was deducted.',
    )
    expect(createOrder).toHaveBeenCalledTimes(1)
    expect(createOrder.mock.calls[0][0]).toEqual({
      customer: 'Katong Components',
      items: [{ sku: 'CHR-001', qty: 99 }],
    })
  })

  it('shows the server validation details on the row that failed', async () => {
    createOrder.mockRejectedValueOnce(
      new ApiError(400, {
        code: 'VALIDATION_FAILED',
        message: 'order validation failed',
        details: [{ field: 'items[0].qty', sku: 'CHR-001', message: 'qty must be greater than 0' }],
      }),
    )
    renderPage()

    await screen.findByRole('option', { name: /CHR-001/ })
    await userEvent.selectOptions(screen.getByLabelText('Product for item 1'), 'CHR-001')
    await userEvent.type(screen.getByLabelText('Customer'), 'Katong Components')
    await userEvent.click(screen.getByRole('button', { name: 'Create order' }))

    expect(await screen.findByText('qty must be greater than 0')).toBeInTheDocument()
  })
})
