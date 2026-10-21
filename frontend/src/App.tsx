import { NavLink, Route, Routes } from 'react-router-dom'
import { CreateOrderPage } from './pages/CreateOrderPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductsPage } from './pages/ProductsPage'

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark">SF</span>
            <span>
              <strong>StockFlow</strong>
              <span className="brand-sub">Inventory &amp; Sales</span>
            </span>
          </NavLink>

          <nav className="nav">
            <NavLink
              to="/"
              end
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Products
            </NavLink>
            <NavLink
              to="/orders"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
            >
              Orders
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<CreateOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="app-footer">
        StockFlow — mini ERP demo · Go + PostgreSQL + React
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="page page-narrow">
      <section className="card">
        <div className="state-block">
          <div className="state-icon">?</div>
          <h3>Page not found</h3>
          <p>The page you are looking for does not exist.</p>
          <NavLink className="button button-primary" to="/">
            Back to products
          </NavLink>
        </div>
      </section>
    </div>
  )
}
