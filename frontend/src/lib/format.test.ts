import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatIDR, formatNumber, relativeTime, todayISO } from './format'

const NOW = new Date('2026-10-21T12:00:00.000Z').getTime()
const isoAgo = (ms: number) => new Date(NOW - ms).toISOString()

describe('formatIDR', () => {
  it('formats rupiah with dot thousands separators and no decimals', () => {
    expect(formatIDR(1_249_900)).toBe('Rp 1.249.900')
    expect(formatIDR(124_900_000)).toBe('Rp 124.900.000')
    expect(formatIDR(0)).toBe('Rp 0')
  })

  it('rounds fractional input defensively', () => {
    expect(formatIDR(1500.7)).toBe('Rp 1.501')
  })

  it('never renders NaN', () => {
    expect(formatIDR(Number.NaN)).toBe('Rp 0')
  })
})

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(1_200)).toBe('1.200')
    expect(formatNumber(0)).toBe('0')
  })
})

describe('relativeTime', () => {
  it('returns a dash for missing timestamps', () => {
    expect(relativeTime(null, NOW)).toBe('—')
  })

  it('treats the last minute as "just now"', () => {
    expect(relativeTime(isoAgo(20_000), NOW)).toBe('just now')
  })

  it('formats minutes, hours and days', () => {
    expect(relativeTime(isoAgo(5 * 60_000), NOW)).toBe('5m ago')
    expect(relativeTime(isoAgo(2 * 3_600_000), NOW)).toBe('2h ago')
    expect(relativeTime(isoAgo(3 * 86_400_000), NOW)).toBe('3d ago')
  })

  it('falls back to an absolute date after 30 days', () => {
    const result = relativeTime(isoAgo(45 * 86_400_000), NOW)
    expect(result).not.toContain('ago')
    expect(result).toMatch(/\d{2} \w{3} \d{4}/)
  })

  it('does not produce negative relative times', () => {
    expect(relativeTime(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now')
  })
})

describe('date helpers', () => {
  it('formats a date and a date-time', () => {
    expect(formatDate('2026-09-12T08:00:00.000Z')).toMatch(/\d{2} Sep 2026/)
    expect(formatDateTime('2026-09-12T08:00:00.000Z')).toMatch(/\d{2} Sep 2026/)
  })

  it('renders a dash for invalid input', () => {
    expect(formatDate('not-a-date')).toBe('—')
    expect(formatDateTime('')).toBe('—')
  })

  it('produces a YYYY-MM-DD local date', () => {
    expect(todayISO(new Date(2026, 2, 5, 10, 30))).toBe('2026-03-05')
    expect(todayISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
  })
})
