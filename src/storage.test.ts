import { describe, expect, it } from 'vitest'
import { createBackup, parseBackup, parsePortableBackup, normaliseConfig } from './storage'

describe('legacy configuration migration', () => {
  it('updates the previous mosque name sample to Masjid Jami', () => {
    expect(normaliseConfig({ mosqueName: 'MASJID RAYA AL-IKHLAS' }).mosqueName).toBe('MASJID JAMI AL-IKHLAS')
  })

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
    expect(config.timings.fridayIqamahMinutes).toBe(20)
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

  it('keeps a slide media pairing and bounds its photo duration', () => {
    const config = normaliseConfig({
      slides: [{ id: 'kegiatan-1', title: 'Kerja bakti', content: 'Ahad pagi', mediaId: 'foto-1', durationSeconds: 90, showText: false, titleColor: '#1a2B3c' }],
    })

    expect(config.slides[0]).toMatchObject({ mediaId: 'foto-1', durationSeconds: 60, showText: false, titleColor: '#1a2B3c' })
  })

  it('migrates a selected background video into the dedicated background media', () => {
    const config = normaliseConfig({ backgroundVideoId: 'tawaf-mekkah', media: [{ id: 'tawaf-mekkah', name: 'Tawaf', type: 'video/mp4' }] })
    expect(config.backgroundMediaId).toBe('tawaf-mekkah')
    expect(config.media[0].placement).toBe('background')
  })

  it('keeps old unpaired slides in the general media playlist', () => {
    const config = normaliseConfig({ slides: [{ id: 'lama', title: 'Lama', content: 'Konten' }] })
    expect(config.slides[0].mediaMode).toBe('playlist')
  })

  it('reads a portable backup together with its media bytes', async () => {
    const config = normaliseConfig({ media: [{ id: 'foto-1', name: 'Kegiatan', type: 'image/jpeg' }] })
    const header = JSON.stringify({ format: 'mosque-display-portable-backup', version: 1, config, mediaSizes: { 'foto-1': 3 } })
    const headerBytes = new TextEncoder().encode(header)
    const file = new Blob([`MOSQUE-DISPLAY-PORTABLE\n${String(headerBytes.byteLength).padStart(12, '0')}\n`, headerBytes, 'img'])
    const restored = await parsePortableBackup(file)

    expect(restored?.config.media[0].id).toBe('foto-1')
    await expect(restored?.media[0].blob.text()).resolves.toBe('img')
  })
})
