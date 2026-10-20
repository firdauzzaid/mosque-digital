import type { AppConfig } from './types'

export const defaultConfig: AppConfig = {
  schemaVersion: 2,
  mosqueName: 'MASJID RAYA AL-IKHLAS',
  mosqueAddress: 'Jl. Kebaikan No. 99, Kota Beriman',
  access: {},
  runningText: 'Selamat datang. Luruskan dan rapatkan shaf. Matikan alat komunikasi saat salat berlangsung.',
  logoUrl: '',
  backgroundUrl: '',
  backgroundMode: 'theme',
  theme: 'emerald',
  layoutId: 1,
  widgetSize: 'normal',
  display: { zoom: 100, paddingX: 0, paddingY: 0, runningTextSpeed: 30, runningTextSize: 32 },
  schedule: {},
  scheduleMetadata: {},
  slides: [
    { id: 'infak', title: 'Mari Berinfak', content: 'Barangsiapa membangun masjid karena Allah, maka Allah membangunkan baginya rumah di surga.' },
    { id: 'kajian', title: 'Kajian Rutin', content: "Kajian ba'da Maghrib setiap Sabtu. Mari hadir bersama keluarga." },
  ],
  agenda: [
    { id: 'tpa', day: 'Senin - Kamis', activity: 'TPA Anak-Anak', time: '16.00 WIB' },
    { id: 'tafsir', day: 'Sabtu', activity: 'Kajian Tafsir', time: "Ba'da Maghrib" },
  ],
  media: [],
  friday: { khatib: 'Belum diatur', imam: 'Belum diatur', muadzin: 'Belum diatur' },
  finance: { balance: 0, income: 0, expense: 0 },
  audio: {},
  timings: { preAdhanMinutes: 15, adhanMinutes: 3, iqamahMinutes: 10, blackoutMinutes: 15 },
}
