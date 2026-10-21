// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { Product, StockMovement } from '../api/types'
import { StockAdjustModal } from './StockAdjustModal'

const { adjustStock } = vi.hoisted(() => ({ adjustStock: vi.fn() }))

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, adjustStock }
})

const product: Product = {
  id: 11,
  sku: 'CHR-001',
  name: 'Ergotec Ergonomic Chair',
  price: 2_450_000,
  stock: 3,
  is_active: true,
  created_at: '2026-10-01T00:00:00.000Z',
  last_movement_at: null,
}

function renderModal() {
  const onSaved = vi.fn()
  render(<StockAdjustModal product={product} onClose={() => {}} onSaved={onSaved} />)
  return onSaved
}

async function submitQuantity(qty: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Stock out' }))
  await userEvent.clear(screen.getByLabelText('Quantity'))
  await userEvent.type(screen.getByLabelText('Quantity'), qty)
  await userEvent.click(screen.getByRole('button', { name: 'Record movement' }))
}

describe('StockAdjustModal', () => {
  beforeEach(() => {
    adjustStock.mockReset()
  })

  it('renders the 409 with the available quantity instead of failing silently', async () => {
    adjustStock.mockRejectedValueOnce(
      new ApiError(409, {
        code: 'INSUFFICIENT_STOCK',
        message: 'not enough stock for sku CHR-001',
        sku: 'CHR-001',
        available: 3,
        requested: 99,
      }),
    )
    const onSaved = renderModal()

    await submitQuantity('99')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Only 3 units of CHR-001 are in stock')
    expect(alert).toHaveTextContent('You tried to remove 99')
    expect(adjustStock).toHaveBeenCalledWith(11, { type: 'out', qty: 99, note: undefined })
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Record movement' })).toBeEnabled()
  })

  it('reports the updated product on success', async () => {
    const updated: Product = { ...product, stock: 6 }
    const movement: StockMovement = {
      id: 1,
      product_id: 11,
      type: 'in',
      qty: 3,
      note: null,
      created_at: '2026-10-02T00:00:00.000Z',
    }
    adjustStock.mockResolvedValueOnce({ product: updated, movement })
    const onSaved = renderModal()

    await userEvent.clear(screen.getByLabelText('Quantity'))
    await userEvent.type(screen.getByLabelText('Quantity'), '3')
    await userEvent.click(screen.getByRole('button', { name: 'Record movement' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(updated))
    expect(adjustStock).toHaveBeenCalledWith(11, { type: 'in', qty: 3, note: undefined })
  })

  it('refuses zero before it reaches the API', async () => {
    renderModal()

    await submitQuantity('0')

    expect(await screen.findByText('Quantity must be greater than 0')).toBeInTheDocument()
    expect(adjustStock).not.toHaveBeenCalled()
  })
})
