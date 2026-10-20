import { describe, expect, it } from 'vitest'
import { normaliseConfig } from './storage'

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
