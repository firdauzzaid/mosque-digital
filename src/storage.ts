import { defaultConfig } from './defaults'
import type { AdminAccess, AgendaItem, AppConfig, MediaItem, PrayerSchedule, ScheduleMetadata, Slide, StoredMedia } from './types'

const configKey = 'mosque-display.config.v1'
const legacyKey = 'mosqueData'
const databaseName = 'mosque-display'
const mediaStore = 'media'
const portableMagic = 'MOSQUE-DISPLAY-PORTABLE\n'
const portableHeaderSize = 12
const maximumMediaBytes = 100 * 1024 * 1024

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback
const mosqueName = (value: unknown) => {
  const name = text(value, defaultConfig.mosqueName)
  return name.trim().toUpperCase() === 'MASJID RAYA AL-IKHLAS' ? defaultConfig.mosqueName : name
}
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback
const boundedNumber = (value: unknown, fallback: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, number(value, fallback)))
const color = (value: unknown) => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : undefined
const isTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const isDateKey = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

const slides = (value: unknown): Slide[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => {
    const mediaId = text(item.mediaId, '').slice(0, 120) || undefined
    return { id: text(item.id, String(index)), title: text(item.title, 'Pengumuman'), titleColor: color(item.titleColor), content: text(item.content, ''), mediaId, mediaMode: mediaId ? undefined : item.mediaMode === 'none' ? 'none' : 'playlist', durationSeconds: boundedNumber(item.durationSeconds, 10, 5, 60), showText: item.showText !== false }
  })
  : defaultConfig.slides

const agenda = (value: unknown): AgendaItem[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => ({ id: text(item.id, String(index)), day: text(item.day ?? item.hari, ''), activity: text(item.activity ?? item.kegiatan, ''), time: text(item.time ?? item.waktu, '') }))
  : defaultConfig.agenda

const media = (value: unknown): MediaItem[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => ({ id: text(item.id, String(index)), name: text(item.name, 'Media').slice(0, 120), type: text(item.type, 'application/octet-stream'), placement: item.placement === 'background' ? 'background' : 'slideshow', url: safeHttpsUrl(item.url), durationSeconds: boundedNumber(item.durationSeconds, 10, 1, 600) }))
  : []

const safeHttpsUrl = (value: unknown) => {
  if (typeof value !== 'string') return ''
  try { return new URL(value).protocol === 'https:' ? value : '' } catch { return '' }
}

const schedule = (value: unknown): Record<string, PrayerSchedule> => {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isDateKey(entry[0]) && isObject(entry[1]))
    .map(([date, row]) => [date, Object.fromEntries(Object.entries({ imsak: row.imsak, subuh: row.subuh, syuruq: row.syuruq, dzuhur: row.dzuhur, ashar: row.ashar, maghrib: row.maghrib, isya: row.isya }).filter((entry): entry is [string, string] => isTime(entry[1]))) as PrayerSchedule]))
}

const access = (value: unknown): AdminAccess => {
  if (!isObject(value)) return {}
  const pinHash = text(value.pinHash, '')
  const pinSalt = text(value.pinSalt, '')
  return pinHash && pinSalt ? { pinHash, pinSalt } : {}
}

const scheduleMetadata = (value: unknown): ScheduleMetadata => {
  if (!isObject(value)) return {}
  return {
    cityId: text(value.cityId, '').slice(0, 40) || undefined,
    cityName: text(value.cityName, '').slice(0, 120) || undefined,
    downloadedAt: text(value.downloadedAt, '') || undefined,
    coverageStart: text(value.coverageStart, '') || undefined,
    coverageEnd: text(value.coverageEnd, '') || undefined,
  }
}

export const normaliseConfig = (value: unknown): AppConfig => {
  if (!isObject(value)) return defaultConfig
  const settings = isObject(value.settings) ? value.settings : {}
  const timing = isObject(value.timings) ? value.timings : settings
  const finance = isObject(value.finance) ? value.finance : {}
  const friday = isObject(value.friday) ? value.friday : (isObject(value.khotib) ? value.khotib : {})
  const audio = isObject(value.audio) ? value.audio : {}
  const theme = value.theme ?? settings.theme
  const layoutId = value.layoutId ?? settings.layoutId
  const display = isObject(value.display) ? value.display : settings
  const backgroundMediaId = text(value.backgroundMediaId ?? value.backgroundVideoId, '').slice(0, 120) || undefined
  const restoredMedia = media(value.media).map((item) => item.id === backgroundMediaId ? { ...item, placement: 'background' as const } : item)

  return {
    schemaVersion: 2,
    mosqueName: mosqueName(value.mosqueName),
    mosqueAddress: text(value.mosqueAddress, defaultConfig.mosqueAddress),
    access: access(value.access),
    runningText: text(value.runningText, defaultConfig.runningText),
    logoUrl: text(value.logo ?? value.logoUrl, ''),
    backgroundUrl: text(display.bgUrl ?? value.backgroundUrl, ''),
    backgroundMode: display.bgType === 'image' || value.backgroundMode === 'image' ? 'image' : 'theme',
    backgroundMediaId,
    theme: theme === 'gold' || theme === 'blue' || theme === 'emerald' || theme === 'red' || theme === 'purple' || theme === 'cyan' || theme === 'slate' || theme === 'orange' ? theme : defaultConfig.theme,
    layoutId: Math.min(15, Math.max(1, number(layoutId, defaultConfig.layoutId))),
    widgetSize: value.widgetSize === 'small' || value.widgetSize === 'large' || value.widgetSize === 'extra' || settings.widgetSize === 'small' || settings.widgetSize === 'large' || settings.widgetSize === 'extra' ? (value.widgetSize ?? settings.widgetSize) as AppConfig['widgetSize'] : 'normal',
    display: { zoom: number(display.tvZoom ?? display.zoom, 100), paddingX: number(display.tvPaddingX ?? display.paddingX, 0), paddingY: number(display.tvPaddingY ?? display.paddingY, 0), runningTextSpeed: number(display.runningTextSpeed, 30), runningTextSize: number(display.runningTextSize, 32), showSlideshow: display.showSlideshow !== false },
    schedule: schedule(value.schedule),
    scheduleMetadata: scheduleMetadata(value.scheduleMetadata),
    slides: slides(value.slides),
    agenda: agenda(value.agenda),
    media: restoredMedia,
    friday: { khatib: text(friday.khatib, defaultConfig.friday.khatib), imam: text(friday.imam, defaultConfig.friday.imam), muadzin: text(friday.muadzin, defaultConfig.friday.muadzin) },
    finance: { balance: number(finance.balance, 0), income: number(finance.income, 0), expense: number(finance.expense, 0) },
    audio: { tarhimId: text(audio.tarhimId, ''), murottalId: text(audio.murottalId, ''), adhanId: text(audio.adhanId ?? value.audioAdzan, '') },
    timings: {
      preAdhanMinutes: boundedNumber(timing.preAdhanMinutes, defaultConfig.timings.preAdhanMinutes, 0, 60),
      adhanMinutes: boundedNumber(timing.adhanMinutes ?? timing.adzanDuration, defaultConfig.timings.adhanMinutes, 0, 20),
      iqamahMinutes: boundedNumber(timing.iqamahMinutes ?? timing.iqomahDelay, defaultConfig.timings.iqamahMinutes, 0, 120),
      fridayIqamahMinutes: boundedNumber(timing.fridayIqamahMinutes, defaultConfig.timings.fridayIqamahMinutes, 0, 120),
      blackoutMinutes: boundedNumber(timing.blackoutMinutes, defaultConfig.timings.blackoutMinutes, 0, 120),
    },
  }
}

export const loadConfig = (): AppConfig => {
  const stored = localStorage.getItem(configKey)
  if (stored) {
    try { return normaliseConfig(JSON.parse(stored)) } catch { return defaultConfig }
  }
  const legacy = localStorage.getItem(legacyKey)
  if (!legacy) return defaultConfig
  try {
    const imported = normaliseConfig(JSON.parse(legacy))
    saveConfig(imported)
    return imported
  } catch { return defaultConfig }
}

export const saveConfig = (config: AppConfig) => localStorage.setItem(configKey, JSON.stringify(config))

const isLegacyBackup = (value: Record<string, unknown>) => typeof value.mosqueName === 'string' && isObject(value.schedule)

export const createBackup = (config: AppConfig) => JSON.stringify({
  format: 'mosque-display-backup',
  version: 2,
  exportedAt: new Date().toISOString(),
  includesMedia: false,
  config,
})

export const parseBackup = (backup: string): { config: AppConfig; legacy: boolean } | undefined => {
  try {
    const parsed: unknown = JSON.parse(backup)
    if (!isObject(parsed)) return undefined
    if (parsed.format === 'mosque-display-backup' && parsed.version === 2 && isObject(parsed.config)) return { config: normaliseConfig(parsed.config), legacy: false }
    if (isLegacyBackup(parsed)) return { config: normaliseConfig(parsed), legacy: true }
    return undefined
  } catch { return undefined }
}

const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(databaseName, 1)
  request.onupgradeneeded = () => request.result.createObjectStore(mediaStore, { keyPath: 'id' })
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

const withStore = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) => {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const request = operation(db.transaction(mediaStore, mode).objectStore(mediaStore))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const saveMedia = (item: StoredMedia) => withStore('readwrite', (store) => store.put(item))
export const getMedia = (id: string) => withStore<StoredMedia | undefined>('readonly', (store) => store.get(id))
export const deleteMedia = (id: string) => withStore<undefined>('readwrite', (store) => store.delete(id))

type PortableHeader = { format: 'mosque-display-portable-backup'; version: 1; config: AppConfig; mediaSizes: Record<string, number> }

export const createPortableBackup = async (config: AppConfig) => {
  const entries = await Promise.all(config.media.map(async (item) => {
    if (item.url) return { item, size: 0, blob: undefined }
    const stored = await getMedia(item.id)
    if (!stored || stored.blob.size > maximumMediaBytes) throw new Error('Media tidak tersedia atau terlalu besar untuk dipindahkan.')
    return { item, size: stored.blob.size, blob: stored.blob }
  }))
  const header: PortableHeader = { format: 'mosque-display-portable-backup', version: 1, config, mediaSizes: Object.fromEntries(entries.map(({ item, size }) => [item.id, size])) }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const prefix = `${portableMagic}${String(headerBytes.byteLength).padStart(portableHeaderSize, '0')}\n`
  return new Blob([prefix, headerBytes, ...entries.flatMap(({ blob }) => blob ? [blob] : [])], { type: 'application/octet-stream' })
}

export const parsePortableBackup = async (file: Blob): Promise<{ config: AppConfig; media: StoredMedia[] } | undefined> => {
  const prefixLength = portableMagic.length + portableHeaderSize + 1
  const prefix = await file.slice(0, prefixLength).text()
  if (!prefix.startsWith(portableMagic)) return undefined
  const headerLength = Number(prefix.slice(portableMagic.length, portableMagic.length + portableHeaderSize))
  if (!Number.isSafeInteger(headerLength) || headerLength < 2 || headerLength > 5 * 1024 * 1024) return undefined
  try {
    const parsed: unknown = JSON.parse(await file.slice(prefixLength, prefixLength + headerLength).text())
    if (!isObject(parsed) || parsed.format !== 'mosque-display-portable-backup' || parsed.version !== 1 || !isObject(parsed.config) || !isObject(parsed.mediaSizes)) return undefined
    const config = normaliseConfig(parsed.config)
    let offset = prefixLength + headerLength
    const media: StoredMedia[] = []
    for (const item of config.media) {
      const size = parsed.mediaSizes[item.id]
      if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0 || size > maximumMediaBytes || offset + size > file.size) return undefined
      if (size) media.push({ ...item, blob: file.slice(offset, offset + size, item.type) })
      offset += size
    }
    return offset === file.size ? { config, media } : undefined
  } catch { return undefined }
}

export const restorePortableBackup = async (file: Blob) => {
  const restored = await parsePortableBackup(file)
  if (!restored) return undefined
  const saved: string[] = []
  try {
    for (const item of restored.media) {
      await saveMedia(item)
      saved.push(item.id)
    }
    return restored.config
  } catch (error) {
    await Promise.all(saved.map((id) => deleteMedia(id).catch(() => undefined)))
    throw error
  }
}
