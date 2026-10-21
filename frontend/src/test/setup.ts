import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Most suites are pure logic and run in the node environment, where there is no
// DOM to clean up.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup()
})
