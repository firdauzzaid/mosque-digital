import { defaultConfig } from './defaults'
import type { AgendaItem, AppConfig, MediaItem, PrayerSchedule, Slide, StoredMedia } from './types'

const configKey = 'mosque-display.config.v1'
const legacyKey = 'mosqueData'
const databaseName = 'mosque-display'
const mediaStore = 'media'

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown, fallback: string) => typeof value === 'string' ? value : fallback
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback

const slides = (value: unknown): Slide[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => ({ id: text(item.id, String(index)), title: text(item.title, 'Pengumuman'), content: text(item.content, '') }))
  : defaultConfig.slides

const agenda = (value: unknown): AgendaItem[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => ({ id: text(item.id, String(index)), day: text(item.day ?? item.hari, ''), activity: text(item.activity ?? item.kegiatan, ''), time: text(item.time ?? item.waktu, '') }))
  : defaultConfig.agenda

const media = (value: unknown): MediaItem[] => Array.isArray(value)
  ? value.filter(isObject).map((item, index) => ({ id: text(item.id, String(index)), name: text(item.name, 'Media'), type: text(item.type, 'image/*'), url: text(item.url, ''), durationSeconds: number(item.durationSeconds, 10) }))
  : []

const schedule = (value: unknown): Record<string, PrayerSchedule> => {
  if (!isObject(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, Record<string, unknown>] => isObject(entry[1])).map(([date, row]) => [date, {
    imsak: typeof row.imsak === 'string' ? row.imsak : undefined,
    subuh: typeof row.subuh === 'string' ? row.subuh : undefined,
    syuruq: typeof row.syuruq === 'string' ? row.syuruq : undefined,
    dzuhur: typeof row.dzuhur === 'string' ? row.dzuhur : undefined,
    ashar: typeof row.ashar === 'string' ? row.ashar : undefined,
    maghrib: typeof row.maghrib === 'string' ? row.maghrib : undefined,
    isya: typeof row.isya === 'string' ? row.isya : undefined,
  }]))
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

  return {
    mosqueName: text(value.mosqueName, defaultConfig.mosqueName),
    mosqueAddress: text(value.mosqueAddress, defaultConfig.mosqueAddress),
    adminPin: text(value.adminPin, defaultConfig.adminPin),
    runningText: text(value.runningText, defaultConfig.runningText),
    logoUrl: text(value.logo ?? value.logoUrl, ''),
    backgroundUrl: text(display.bgUrl ?? value.backgroundUrl, ''),
    backgroundMode: display.bgType === 'image' || value.backgroundMode === 'image' ? 'image' : 'theme',
    theme: theme === 'gold' || theme === 'blue' || theme === 'emerald' || theme === 'red' || theme === 'purple' || theme === 'cyan' || theme === 'slate' || theme === 'orange' ? theme : defaultConfig.theme,
    layoutId: Math.min(15, Math.max(1, number(layoutId, defaultConfig.layoutId))),
    widgetSize: value.widgetSize === 'small' || value.widgetSize === 'large' || value.widgetSize === 'extra' || settings.widgetSize === 'small' || settings.widgetSize === 'large' || settings.widgetSize === 'extra' ? (value.widgetSize ?? settings.widgetSize) as AppConfig['widgetSize'] : 'normal',
    display: { zoom: number(display.tvZoom ?? display.zoom, 100), paddingX: number(display.tvPaddingX ?? display.paddingX, 0), paddingY: number(display.tvPaddingY ?? display.paddingY, 0), runningTextSpeed: number(display.runningTextSpeed, 30), runningTextSize: number(display.runningTextSize, 32) },
    schedule: schedule(value.schedule),
    slides: slides(value.slides),
    agenda: agenda(value.agenda),
    media: media(value.media),
    friday: { khatib: text(friday.khatib, defaultConfig.friday.khatib), imam: text(friday.imam, defaultConfig.friday.imam), muadzin: text(friday.muadzin, defaultConfig.friday.muadzin) },
    finance: { balance: number(finance.balance, 0), income: number(finance.income, 0), expense: number(finance.expense, 0) },
    audio: { tarhimId: text(audio.tarhimId, ''), murottalId: text(audio.murottalId, ''), adhanId: text(audio.adhanId ?? value.audioAdzan, '') },
    timings: {
      preAdhanMinutes: number(timing.preAdhanMinutes, defaultConfig.timings.preAdhanMinutes),
      adhanMinutes: number(timing.adhanMinutes ?? timing.adzanDuration, defaultConfig.timings.adhanMinutes),
      iqamahMinutes: number(timing.iqamahMinutes ?? timing.iqomahDelay, defaultConfig.timings.iqamahMinutes),
      blackoutMinutes: number(timing.blackoutMinutes, defaultConfig.timings.blackoutMinutes),
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

export const importConfig = (backup: string): AppConfig | undefined => {
  try {
    const imported = normaliseConfig(JSON.parse(backup))
    if (!imported.mosqueName.trim()) return undefined
    return imported
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
