import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup, normaliseConfig } from './storage'

describe('legacy configuration migration', () => {
  it('retains compatible legacy data without inventing a fallback prayer schedule', () => {
    const config = normaliseConfig({
      mosqueName: 'Masjid Lama',
      settings: { theme: 'gold', iqomahDelay: 8 },
      schedule: { '2026-10-20': { subuh: '04:31', maghrib: '18:01' } },
      agenda: [{ hari: 'Ahad', kegiatan: 'Kajian', waktu: '08:00' }],
    })
    expect(config.mosqueName).toBe('Masjid Lama')
    expect(config.theme).toBe('gold')
    expect(config.timings.iqamahMinutes).toBe(8)
    expect(config.schedule['2026-10-20']).toEqual(expect.objectContaining({ subuh: '04:31', maghrib: '18:01' }))
    expect(config.agenda[0]).toMatchObject({ day: 'Ahad', activity: 'Kajian', time: '08:00' })
  })
})

describe('backup validation', () => {
  it('creates a versioned backup and restores only a recognised document', () => {
    const backup = createBackup({ ...normaliseConfig({ mosqueName: 'Masjid Aman' }), mosqueName: 'Masjid Aman' })
    const restored = parseBackup(backup)

    expect(restored?.config.mosqueName).toBe('Masjid Aman')
    expect(parseBackup('{}')).toBeUndefined()
    expect(parseBackup('{"mosqueName":"Masjid Tanpa Format"}')).toBeUndefined()
  })

  it('migrates legacy configuration without retaining a plaintext default PIN or invalid prayer time', () => {
    const config = normaliseConfig({
      mosqueName: 'Masjid Lama',
      adminPin: '12345',
      schedule: { '2026-10-20': { subuh: '04:31', maghrib: 'malam' } },
    })

    expect(config.access).toEqual({})
    expect(config.schedule['2026-10-20']).toEqual({ subuh: '04:31' })
  })
})
