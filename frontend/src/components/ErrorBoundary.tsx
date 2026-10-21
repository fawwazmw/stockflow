import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * A render error in one screen should not leave the operator with a blank page.
 * The boundary is keyed by pathname in App, so navigating away also clears it.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error', error, info.componentStack)
  }

  private reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="page page-narrow">
        <section className="card">
          <div className="state-block state-error">
            <span className="state-kicker">Something broke</span>
            <h3>This screen failed to render</h3>
            <p>{error.message || 'An unexpected error stopped this page.'}</p>
            <button type="button" className="button" onClick={this.reset}>
              Try again
            </button>
          </div>
        </section>
      </div>
    )
  }
}
