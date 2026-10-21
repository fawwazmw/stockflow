import { useEffect, useState, type FormEvent } from 'react'
import { ApiError, createProduct, updateProduct } from '../api/client'
import type { Product } from '../api/types'
import {
  toNonNegativeInt,
  validateProductForm,
  type FieldErrors,
  type ProductFormValues,
} from '../lib/validation'
import { Alert } from './Feedback'
import { Modal } from './Modal'

interface ProductFormModalProps {
  /** null = create mode */
  product: Product | null
  open: boolean
  onClose: () => void
  onSaved: (product: Product) => void
}

const EMPTY: ProductFormValues = { sku: '', name: '', price: '', stock: '', isActive: true }

export function ProductFormModal({ product, open, onClose, onSaved }: ProductFormModalProps) {
  const isEdit = product !== null
  const [values, setValues] = useState<ProductFormValues>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setValues(
      product
        ? {
            sku: product.sku,
            name: product.name,
            price: String(product.price),
            stock: String(product.stock),
            isActive: product.is_active,
          }
        : EMPTY,
    )
    setErrors({})
    setServerError(null)
    setSaving(false)
  }, [open, product])

  const setField = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const formErrors = validateProductForm(values)
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      return
    }

    setErrors({})
    setServerError(null)
    setSaving(true)

    const payload = {
      sku: values.sku.trim(),
      name: values.name.trim(),
      price: toNonNegativeInt(values.price),
      stock: values.stock.trim() === '' ? 0 : toNonNegativeInt(values.stock),
      is_active: values.isActive,
    }

    try {
      const saved = isEdit
        ? await updateProduct(product.id, payload)
        : await createProduct(payload)
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error)
        if (Object.keys(error.fields).length > 0) {
          setErrors((prev) => ({ ...prev, ...error.fields }))
        }
        if (error.code === 'SKU_ALREADY_EXISTS') {
          setErrors((prev) => ({ ...prev, sku: `SKU ${payload.sku} is already in use` }))
        }
      } else {
        setServerError(new ApiError(0, { code: 'UNKNOWN_ERROR', message: 'Could not save the product' }))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit product — ${product.sku}` : 'New product'}
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="button button-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
          </button>
        </>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} noValidate className="form-grid">
        <label className="field">
          <span className="field-label">SKU</span>
          <input
            className={errors.sku ? 'input input-error' : 'input'}
            value={values.sku}
            onChange={(event) => setField('sku', event.target.value)}
            placeholder="SKU-001"
            autoFocus
          />
          {errors.sku ? <span className="field-error">{errors.sku}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Name</span>
          <input
            className={errors.name ? 'input input-error' : 'input'}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="Product name"
          />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Price (IDR)</span>
          <input
            className={errors.price ? 'input input-error' : 'input'}
            inputMode="numeric"
            value={values.price}
            onChange={(event) => setField('price', event.target.value)}
            placeholder="150000"
          />
          {errors.price ? <span className="field-error">{errors.price}</span> : null}
        </label>

        {isEdit ? null : (
          <label className="field">
            <span className="field-label">
              Initial stock <span className="field-hint">(optional)</span>
            </span>
            <input
              className={errors.stock ? 'input input-error' : 'input'}
              inputMode="numeric"
              value={values.stock}
              onChange={(event) => setField('stock', event.target.value)}
              placeholder="0"
            />
            {errors.stock ? <span className="field-error">{errors.stock}</span> : null}
          </label>
        )}

        <label className="field field-inline">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => setField('isActive', event.target.checked)}
          />
          <span className="field-label">Active (can be sold)</span>
        </label>

        {isEdit ? (
          <p className="field-hint">
            Stock is only changed through stock movements, so the ledger stays complete.
          </p>
        ) : null}

        {serverError && Object.keys(serverError.fields).length === 0 ? (
          <Alert tone="error" title="Could not save">
            {serverError.message}
          </Alert>
        ) : null}
      </form>
    </Modal>
  )
}
