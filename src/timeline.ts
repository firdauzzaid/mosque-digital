import { prayerNames, type AppConfig, type PrayerName, type PrayerSchedule } from './types'

export type PrayerPhaseName = 'normal' | 'preAdhan' | 'adhan' | 'iqamah' | 'blackout'
export type PrayerPhase = {
  name: PrayerPhaseName
  prayer?: PrayerName
  occurrenceKey?: string
  startsAt?: Date
  endsAt?: Date
}

const shortTime = (date: Date) => `${String(date.getHours()).padStart(2, '0')}.${String(date.getMinutes()).padStart(2, '0')}`
const emDash = String.fromCharCode(0x2014)

export const displayPhaseStatus = (phase: PrayerPhase) => {
  const prayer = phase.prayer ? ` ${phase.prayer}` : ''
  if (phase.name === 'blackout' && phase.endsAt) {
    const until = shortTime(phase.endsAt)
    return { previewLabel: `Tayangkan display ${emDash} hitam hingga ${until}`, notice: `Display akan hitam hingga ${until}.` }
  }
  if (phase.name === 'preAdhan') return { previewLabel: `Tayangkan display ${emDash} menjelang azan${prayer}`, notice: `Display berada pada fase menjelang azan${prayer}.` }
  if (phase.name === 'adhan') return { previewLabel: `Tayangkan display ${emDash} azan${prayer}`, notice: `Display berada pada fase azan${prayer}.` }
  if (phase.name === 'iqamah') return { previewLabel: `Tayangkan display ${emDash} menuju iqamah${prayer}`, notice: `Display berada pada fase menuju iqamah${prayer}.` }
  return { previewLabel: 'Tayangkan display', notice: 'Display siap ditayangkan.' }
}

export const dateKeyLocal = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const dayAtOffset = (date: Date, offset: number) => {
  const result = new Date(date)
  result.setDate(result.getDate() + offset)
  return result
}

const localTime = (day: Date, value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  const result = new Date(day)
  result.setHours(hours, minutes, 0, 0)
  return result
}

const phaseForPrayer = (now: Date, day: Date, prayer: PrayerName, time: string, config: AppConfig): PrayerPhase | undefined => {
  const adhanAt = localTime(day, time)
  const preAdhanAt = new Date(adhanAt.getTime() - config.timings.preAdhanMinutes * 60_000)
  const iqamahAt = new Date(adhanAt.getTime() + config.timings.adhanMinutes * 60_000)
  const blackoutAt = new Date(iqamahAt.getTime() + config.timings.iqamahMinutes * 60_000)
  const displayAt = new Date(blackoutAt.getTime() + config.timings.blackoutMinutes * 60_000)
  const occurrenceKey = `${dateKeyLocal(day)}:${prayer}`

  if (now >= preAdhanAt && now < adhanAt) return { name: 'preAdhan', prayer, occurrenceKey, startsAt: preAdhanAt, endsAt: adhanAt }
  if (now >= adhanAt && now < iqamahAt) return { name: 'adhan', prayer, occurrenceKey, startsAt: adhanAt, endsAt: iqamahAt }
  if (now >= iqamahAt && now < blackoutAt) return { name: 'iqamah', prayer, occurrenceKey, startsAt: iqamahAt, endsAt: blackoutAt }
  if (now >= blackoutAt && now < displayAt) return { name: 'blackout', prayer, occurrenceKey, startsAt: blackoutAt, endsAt: displayAt }
  return undefined
}

export const getPrayerPhase = (now: Date, schedules: Record<string, PrayerSchedule>, config: AppConfig): PrayerPhase => {
  const phases: PrayerPhase[] = []
  for (const offset of [-1, 0, 1]) {
    const day = dayAtOffset(now, offset)
    const schedule = schedules[dateKeyLocal(day)]
    if (!schedule) continue
    for (const prayer of prayerNames) {
      const time = schedule[prayer]
      if (!time) continue
      const phase = phaseForPrayer(now, day, prayer, time, config)
      if (phase) phases.push(phase)
    }
  }
  return phases.sort((left, right) => (right.startsAt?.getTime() ?? 0) - (left.startsAt?.getTime() ?? 0))[0] ?? { name: 'normal' }
}

export const nextPrayer = (now: Date, schedules: Record<string, PrayerSchedule>) => {
  for (const offset of [0, 1]) {
    const day = dayAtOffset(now, offset)
    const schedule = schedules[dateKeyLocal(day)]
    if (!schedule) continue
    for (const prayer of prayerNames) {
      const time = schedule[prayer]
      if (!time) continue
      const at = localTime(day, time)
      if (at > now) return { prayer, at }
    }
  }
  return undefined
}
