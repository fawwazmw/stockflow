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
          <NavLink to="/" className="brand" aria-label="StockFlow, go to products">
            <span className="brand-name">StockFlow</span>
            <span className="brand-sub">Inventory and sales</span>
          </NavLink>

          <nav className="nav" aria-label="Main">
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
        <div className="app-footer-inner">
          <span>StockFlow, a stock ledger for small warehouses</span>
          <span>Go API, PostgreSQL, React</span>
        </div>
      </footer>
    </div>
  )
}

function NotFound() {
  return (
    <div className="page page-narrow">
      <section className="card">
        <div className="state-block">
          <span className="state-kicker">404</span>
          <h3>This page does not exist</h3>
          <p>The address you followed is not part of StockFlow.</p>
          <NavLink className="button" to="/">
            Go to products
          </NavLink>
        </div>
      </section>
    </div>
  )
}
