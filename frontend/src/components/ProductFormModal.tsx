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
  /** null means "add" mode */
  product: Product | null
  open: boolean
  onClose: () => void
  onSaved: (product: Product) => void
  onRequestDelete?: (product: Product) => void
}

const EMPTY: ProductFormValues = { sku: '', name: '', price: '', stock: '', isActive: true }

export function ProductFormModal({
  product,
  open,
  onClose,
  onSaved,
  onRequestDelete,
}: ProductFormModalProps) {
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
      const saved = isEdit ? await updateProduct(product.id, payload) : await createProduct(payload)
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError) {
        setServerError(error)
        if (Object.keys(error.fields).length > 0) {
          setErrors((prev) => ({ ...prev, ...error.fields }))
        }
        if (error.code === 'SKU_ALREADY_EXISTS') {
          setErrors((prev) => ({ ...prev, sku: `${payload.sku} is already used by another product` }))
        }
      } else {
        setServerError(
          new ApiError(0, { code: 'UNKNOWN_ERROR', message: 'The product could not be saved.' }),
        )
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${product.sku}` : 'Add product'}
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="product-form" className="button button-primary" disabled={saving}>
            {saving ? 'Saving' : isEdit ? 'Save changes' : 'Add product'}
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
            placeholder="KEY-001"
            autoFocus
          />
          {errors.sku ? <span className="field-error">{errors.sku}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Product name</span>
          <input
            className={errors.name ? 'input input-error' : 'input'}
            value={values.name}
            onChange={(event) => setField('name', event.target.value)}
            placeholder="Keyboard Logitech K380"
          />
          {errors.name ? <span className="field-error">{errors.name}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">Price in IDR</span>
          <input
            className={errors.price ? 'input input-error' : 'input'}
            inputMode="numeric"
            value={values.price}
            onChange={(event) => setField('price', event.target.value)}
            placeholder="499000"
          />
          {errors.price ? <span className="field-error">{errors.price}</span> : null}
        </label>

        {isEdit ? null : (
          <label className="field">
            <span className="field-label">
              Opening stock <span className="field-hint">optional</span>
            </span>
            <input
              className={errors.stock ? 'input input-error' : 'input'}
              inputMode="numeric"
              value={values.stock}
              onChange={(event) => setField('stock', event.target.value)}
              placeholder="0"
            />
            {errors.stock ? <span className="field-error">{errors.stock}</span> : null}
            <span className="field-hint">Recorded as an opening movement in the ledger.</span>
          </label>
        )}

        <label className="field field-inline">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => setField('isActive', event.target.checked)}
          />
          <span className="field-label">Active, available for sale</span>
        </label>

        {isEdit ? (
          <p className="field-hint">
            Stock is changed through movements only, so every unit is accounted for.
          </p>
        ) : null}

        {serverError && Object.keys(serverError.fields).length === 0 ? (
          <Alert tone="error" title="Product rejected">
            {serverError.message}
          </Alert>
        ) : null}
      </form>

      {isEdit && product && onRequestDelete ? (
        <div className="danger-zone">
          <div>
            <span className="field-label">Delete this product</span>
            <p className="field-hint">
              Only products without stock or order history can be deleted.
            </p>
          </div>
          <button
            type="button"
            className="button button-sm button-danger-text"
            onClick={() => onRequestDelete(product)}
            disabled={saving}
          >
            Delete
          </button>
        </div>
      ) : null}
    </Modal>
  )
}
