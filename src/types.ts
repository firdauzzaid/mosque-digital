export const prayerNames = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'] as const
export type PrayerName = (typeof prayerNames)[number]
export type PrayerSchedule = Partial<Record<PrayerName | 'imsak' | 'syuruq', string>>

export type MediaItem = {
  id: string
  name: string
  type: string
  url?: string
  durationSeconds?: number
}

export type Slide = { id: string; title: string; content: string }
export type AgendaItem = { id: string; day: string; activity: string; time: string }

export type AdminAccess = { pinHash?: string; pinSalt?: string }
export type ScheduleMetadata = { cityId?: string; cityName?: string; downloadedAt?: string; coverageStart?: string; coverageEnd?: string }

export type AppConfig = {
  schemaVersion: 2
  mosqueName: string
  mosqueAddress: string
  access: AdminAccess
  runningText: string
  logoUrl: string
  backgroundUrl: string
  backgroundMode: 'theme' | 'image'
  theme: 'emerald' | 'gold' | 'blue' | 'red' | 'purple' | 'cyan' | 'slate' | 'orange'
  layoutId: number
  widgetSize: 'small' | 'normal' | 'large' | 'extra'
  display: { zoom: number; paddingX: number; paddingY: number; runningTextSpeed: number; runningTextSize: number }
  schedule: Record<string, PrayerSchedule>
  scheduleMetadata: ScheduleMetadata
  slides: Slide[]
  agenda: AgendaItem[]
  media: MediaItem[]
  friday: { khatib: string; imam: string; muadzin: string }
  finance: { balance: number; income: number; expense: number }
  audio: { tarhimId?: string; murottalId?: string; adhanId?: string }
  timings: { preAdhanMinutes: number; adhanMinutes: number; iqamahMinutes: number; blackoutMinutes: number }
}

export type StoredMedia = MediaItem & { blob: Blob }
