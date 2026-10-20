import { describe, expect, it } from 'vitest'
import { defaultConfig } from './defaults'
import { dateKeyLocal, displayPhaseStatus, getPrayerPhase } from './timeline'

const config = { ...defaultConfig, timings: { preAdhanMinutes: 15, adhanMinutes: 3, iqamahMinutes: 10, blackoutMinutes: 15 } }
const schedules = { '2026-10-20': { subuh: '04:30' } }

describe('prayer timeline', () => {
  it('starts tarhim and murottal exactly 15 minutes before adhan', () => {
    expect(getPrayerPhase(new Date('2026-10-20T04:15:00'), schedules, config)).toMatchObject({ name: 'preAdhan', prayer: 'subuh' })
  })

  it('moves through adhan, iqamah, and blackout at their exact boundaries', () => {
    expect(getPrayerPhase(new Date('2026-10-20T04:30:00'), schedules, config).name).toBe('adhan')
    expect(getPrayerPhase(new Date('2026-10-20T04:33:00'), schedules, config).name).toBe('iqamah')
    expect(getPrayerPhase(new Date('2026-10-20T04:43:00'), schedules, config).name).toBe('blackout')
    expect(getPrayerPhase(new Date('2026-10-20T04:58:00'), schedules, config).name).toBe('normal')
  })

  it('keeps one occurrence key throughout a prayer phase and uses the local date', () => {
    const first = getPrayerPhase(new Date('2026-10-20T04:16:00'), schedules, config)
    const later = getPrayerPhase(new Date('2026-10-20T04:29:00'), schedules, config)
    expect(first.occurrenceKey).toBe('2026-10-20:subuh')
    expect(later.occurrenceKey).toBe(first.occurrenceKey)
    expect(dateKeyLocal(new Date(2026, 9, 20, 0, 5))).toBe('2026-10-20')
  })

  it('uses the most recently started phase when extreme timing settings overlap prayers', () => {
    const overlappingSchedules = { '2026-10-20': { subuh: '04:30', dzuhur: '05:00' } }
    const overlappingConfig = { ...config, timings: { preAdhanMinutes: 15, adhanMinutes: 3, iqamahMinutes: 10, blackoutMinutes: 30 } }

    expect(getPrayerPhase(new Date('2026-10-20T04:46:00'), overlappingSchedules, overlappingConfig)).toMatchObject({ name: 'preAdhan', prayer: 'dzuhur' })
  })

  it('explains an active blackout before the administrator returns to display', () => {
    const phase = getPrayerPhase(new Date('2026-10-20T04:43:00'), schedules, config)

    expect(displayPhaseStatus(phase)).toEqual({
      previewLabel: 'Tayangkan display — hitam hingga 04.58',
      notice: 'Display akan hitam hingga 04.58.',
    })
  })
})
