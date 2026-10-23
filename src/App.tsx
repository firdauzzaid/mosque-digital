import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { createAdminAccess, isValidAdminPin, verifyAdminPin } from './auth'
import { defaultConfig } from './defaults'
import { acceptsMediaType, releaseSlideMedia, selectSlideMedia, setMediaPlacement, shouldAdvanceContent } from './slideshow'
import { createBackup, createPortableBackup, deleteMedia, getMedia, loadConfig, parseBackup, restorePortableBackup, saveConfig, saveMedia } from './storage'
import { dateKeyLocal, displayPhaseStatus, getPrayerPhase, nextPrayer } from './timeline'
import { prayerNames, type AppConfig, type MediaItem, type PrayerName } from './types'

type Screen = 'display' | 'setup' | 'login' | 'admin'
type AdminSection = 'general' | 'schedule' | 'content' | 'media' | 'info' | 'backup'
type City = { id: string; location: string }
type DisplayContent = { kicker: string; title: string; titleColor?: string; meta: string; body: string; mediaId?: string; mediaMode?: 'none' | 'playlist'; durationSeconds?: number; showText?: boolean }

const themeClass = { emerald: 'theme-emerald', gold: 'theme-gold', blue: 'theme-blue', red: 'theme-red', purple: 'theme-purple', cyan: 'theme-cyan', slate: 'theme-slate', orange: 'theme-orange' } as const
const formatTime = (date: Date) => date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replaceAll('.', ':')
const formatDate = (date: Date) => date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const formatDuration = (milliseconds: number) => new Date(Math.max(0, milliseconds)).toISOString().slice(11, 19)

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function useMediaUrls(media: MediaItem[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const objectUrls: string[] = []
    Promise.all(media.map(async (item) => {
      if (item.url) return [item.id, item.url] as const
      const stored = await getMedia(item.id)
      if (!stored) return undefined
      const url = URL.createObjectURL(stored.blob)
      objectUrls.push(url)
      return [item.id, url] as const
    })).then((entries) => {
      if (!alive) return
      setUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry))))
    }).catch(() => setUrls({}))
    return () => {
      alive = false
      objectUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [media])
  return urls
}

function AudioController({ phase, config, urls }: { phase: ReturnType<typeof getPrayerPhase>; config: AppConfig; urls: Record<string, string> }) {
  const player = useRef<HTMLAudioElement>(null)
  const beepedOccurrence = useRef<string | undefined>(undefined)
  const [preIndex, setPreIndex] = useState(0)
  const [failedSources, setFailedSources] = useState<Set<string>>(() => new Set())
  const preAdhanSources = [config.audio.tarhimId, config.audio.murottalId].map((id) => id && urls[id]).filter((url): url is string => typeof url === 'string' && !failedSources.has(url))
  const adhanSource = config.audio.adhanId ? urls[config.audio.adhanId] : undefined
  const source = phase.name === 'preAdhan' ? preAdhanSources[preIndex % Math.max(1, preAdhanSources.length)] : phase.name === 'adhan' && adhanSource && !failedSources.has(adhanSource) ? adhanSource : undefined

  useEffect(() => {
    setPreIndex(0)
    setFailedSources(new Set())
  }, [phase.name, phase.occurrenceKey])

  useEffect(() => {
    const audio = player.current
    if (!audio) return
    if (!source) {
      audio.pause()
      audio.currentTime = 0
      return
    }
    audio.play().catch(() => undefined)
  }, [source])

  useEffect(() => {
    if (phase.name !== 'adhan' || source || !phase.occurrenceKey || beepedOccurrence.current === phase.occurrenceKey) return
    beepedOccurrence.current = phase.occurrenceKey
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    oscillator.connect(context.destination)
    oscillator.frequency.value = 440
    oscillator.start()
    oscillator.stop(context.currentTime + 1)
    void context.close()
  }, [phase.name, phase.occurrenceKey, source])

  if (!source) return null
  return <audio ref={player} src={source} autoPlay onEnded={() => phase.name === 'preAdhan' && setPreIndex((value) => value + 1)} onError={() => { setFailedSources((sources) => new Set(sources).add(source)); if (phase.name === 'preAdhan') setPreIndex((value) => value + 1) }} />
}

function Display({ config, onAdmin }: { config: AppConfig; onAdmin: () => void }) {
  const now = useClock()
  const phase = getPrayerPhase(now, config.schedule, config)
  const visualMedia = useMemo(() => config.media.filter((item) => item.type.startsWith('image/') || item.type.startsWith('video/')), [config.media])
  const audioMedia = useMemo(() => config.media.filter((item) => [config.audio.tarhimId, config.audio.murottalId, config.audio.adhanId].includes(item.id)), [config.media, config.audio.tarhimId, config.audio.murottalId, config.audio.adhanId])
  const visualUrls = useMediaUrls(visualMedia)
  const audioUrls = useMediaUrls(audioMedia)
  const activeTheme = themeClass[config.theme]
  const schedule = config.schedule[dateKeyLocal(now)]
  const next = nextPrayer(now, config.schedule)
  const contentItems = useMemo<DisplayContent[]>(() => [
    ...config.slides.map((slide) => ({ kicker: 'PENGUMUMAN', title: slide.title, titleColor: slide.titleColor, meta: 'Informasi untuk jamaah', body: slide.content, mediaId: slide.mediaId, mediaMode: slide.mediaMode, durationSeconds: slide.durationSeconds, showText: slide.showText })),
    ...config.agenda.map((item) => ({ kicker: 'AGENDA MASJID', title: item.activity, meta: `${item.day} / ${item.time}`, body: 'Mari hadir dan ramaikan kegiatan masjid.' })),
  ], [config.agenda, config.slides])
  const [contentIndex, setContentIndex] = useState(0)
  const content = contentItems[contentIndex % Math.max(1, contentItems.length)]
  const slideshowMedia = visualMedia.filter((item) => item.placement !== 'background')
  const activeVisual = selectSlideMedia(content, contentIndex, slideshowMedia)
  const activeVisualUrl = activeVisual ? visualUrls[activeVisual.id] : undefined
  const activeVisualIsVideo = Boolean(activeVisualUrl && activeVisual?.type.startsWith('video/'))
  const backgroundMedia = visualMedia.find((item) => item.id === config.backgroundMediaId && item.placement === 'background')
  const backgroundMediaUrl = backgroundMedia ? visualUrls[backgroundMedia.id] : undefined
  const money = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)
  const tickerStyle = { animationDuration: `${config.display.runningTextSpeed}s`, '--ticker-size': `${config.display.runningTextSize}px` } as CSSProperties

  useEffect(() => {
    setContentIndex(0)
  }, [config.agenda, config.display.showSlideshow, config.media, config.slides])

  useEffect(() => {
    if (!shouldAdvanceContent(contentItems.length, slideshowMedia.length, config.display.showSlideshow, activeVisualIsVideo)) return
    const timer = window.setTimeout(() => setContentIndex((index) => index + 1), (content?.durationSeconds ?? 10) * 1_000)
    return () => window.clearTimeout(timer)
  }, [activeVisualIsVideo, config.display.showSlideshow, content?.durationSeconds, contentIndex, contentItems.length, slideshowMedia.length])

  if (phase.name === 'blackout') return <main className="blackout" aria-label="Tampilan dinonaktifkan selama salat" />
  const phaseMessage = phase.name === 'preAdhan' ? 'menjelang adzan' : phase.name === 'adhan' ? 'Saatnya azan' : phase.name === 'iqamah' ? 'Menuju iqamah' : undefined
  return <main className={`display serambi-display ${activeTheme}`}>
    <AudioController phase={phase} config={config} urls={audioUrls} />
    <img className="plate header-architecture" src="/plates/header-architecture.png" alt="" />
    <header className="serambi-masthead"><img className="mosque-mark" src={config.logoUrl || '/plates/masjid-jami-al-hikmah-mark.png'} alt="Logo masjid" /><div className="mosque-identity"><span>MASJID</span><h1>{config.mosqueName}</h1><small>{config.mosqueAddress}</small></div><div className="masthead-date"><strong>{formatDate(now).split(',')[0]}</strong><span>{formatDate(now).replace(/^.*?,\s*/, '')}</span></div><time className="masthead-clock">{formatTime(now)}</time></header>
    <img className="plate prayer-band-material" src="/plates/prayer-band-material.png" alt="" />
    <section className="prayer-band" aria-label="Waktu salat selanjutnya"><div className="next-prayer"><span>WAKTU SALAT<br />SELANJUTNYA</span><strong>{next?.prayer ?? '—'}</strong></div><div className="next-time"><span>PUKUL</span><strong>{next ? formatTime(next.at).slice(0, 5) : '--:--'}</strong></div><div className="next-countdown"><span>MENUJU {next?.prayer ?? 'SALAT'}</span><strong>{next ? formatDuration(next.at.getTime() - now.getTime()) : '--:--:--'}</strong></div></section>
    <div className="content-divider" />
    {backgroundMediaUrl ? backgroundMedia?.type.startsWith('video/') ? <video className="plate interior-background" src={backgroundMediaUrl} autoPlay muted loop playsInline /> : <img className="plate interior-background" src={backgroundMediaUrl} alt="" /> : <img className="plate interior-plate" src="/plates/interior-plate.png" alt="" />}
    {content?.showText !== false && <section className="announcement" aria-live="polite">
      <div className="announcement-copy"><p>{content?.kicker ?? 'PENGUMUMAN'}</p><h2 style={content?.titleColor ? { color: content.titleColor } : undefined}>{content?.title ?? 'Informasi Masjid'}</h2><strong>{content?.meta ?? 'Pengumuman untuk jamaah'}</strong><span>{content?.body ?? 'Atur informasi dan agenda dari panel admin.'}</span></div>
    </section>}
    {config.display.showSlideshow && activeVisual && activeVisualUrl && <section className={`documentation-stage${content?.showText === false ? ' media-only' : ''}`} aria-label={`Dokumentasi: ${activeVisual.name}`}>{activeVisualIsVideo ? <video key={`${activeVisual.id}-${contentIndex}`} src={activeVisualUrl} autoPlay muted playsInline onEnded={() => setContentIndex((index) => index + 1)} onError={() => setContentIndex((index) => index + 1)} /> : <img src={activeVisualUrl} alt={activeVisual.name} />}</section>}
    <section className="schedule-panel"><header><span>JADWAL SALAT</span><small>HARI INI</small></header>{schedule ? prayerNames.map((prayer) => <div className={next?.prayer === prayer ? 'schedule-row active' : 'schedule-row'} key={prayer}><span>{prayer}</span><strong>{schedule[prayer] ?? '--:--'}</strong></div>) : <p>Jadwal hari ini belum tersedia. Atur dari panel admin.</p>}</section>
    <section className="details-rail"><div className="friday-details"><p>JUMAT INI</p><strong>{config.friday.khatib}</strong><span>Imam: {config.friday.imam} / Muadzin: {config.friday.muadzin}</span></div><div className="finance-details"><p>KEUANGAN {config.mosqueName}</p><span>Saldo kas akhir <strong>{money(config.finance.balance)}</strong></span><span>Pemasukan bulan ini <strong>{money(config.finance.income)}</strong></span><span>Pengeluaran bulan ini <strong>{money(config.finance.expense)}</strong></span></div></section>
    <footer className="ticker"><b>INFO TERKINI</b><div className="ticker-viewport"><span style={tickerStyle}>{config.runningText}</span></div></footer>
    {phaseMessage && <section className="phase-overlay"><div className="phase-brand"><img src="/plates/masjid-jami-al-hikmah-mark.png" alt="" /><span>{config.mosqueName}</span></div><div className="phase-content"><p>{phaseMessage}</p><h2>{phase.prayer}</h2>{phase.endsAt && <strong>{formatDuration(phase.endsAt.getTime() - now.getTime())}</strong>}</div></section>}
    <button className="admin-entry" onClick={onAdmin} aria-label="Buka panel admin">⚙</button>
  </main>
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (value: string) => void; type?: 'text' | 'number' | 'password' | 'time' }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>
}

function Admin({ config, setConfig, onExit }: { config: AppConfig; setConfig: (config: AppConfig) => void; onExit: () => void }) {
  const now = useClock()
  const [section, setSection] = useState<AdminSection>('general')
  const [backup, setBackup] = useState('')
  const [pendingRestore, setPendingRestore] = useState<AppConfig | undefined>()
  const [notice, setNotice] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [cityQuery, setCityQuery] = useState('')
  const [cities, setCities] = useState<City[]>([])
  const patch = (value: Partial<AppConfig>) => setConfig({ ...config, ...value })
  const visualMedia = config.media.filter((item) => item.type.startsWith('image/') || item.type.startsWith('video/'))
  const backgroundMedia = visualMedia.filter((item) => item.placement === 'background')
  const slideshowMedia = visualMedia.filter((item) => item.placement !== 'background')
  const patchTimings = (name: keyof AppConfig['timings'], value: string) => patch({ timings: { ...config.timings, [name]: Math.max(0, Number(value)) } })

  const upload = async (event: ChangeEvent<HTMLInputElement>, purpose: 'background' | 'slideshow' | keyof AppConfig['audio']) => {
    const file = event.target.files?.[0]
    if (!file) return
    const category = purpose === 'background' || purpose === 'slideshow' ? 'visual' : 'audio'
    if (!acceptsMediaType(file.type, category)) return setNotice(category === 'visual' ? 'Pilih file gambar atau video.' : 'Pilih file audio.')
    if (file.size > 100 * 1024 * 1024) return setNotice('Ukuran file maksimal 100 MB.')
    const item: MediaItem = { id: crypto.randomUUID(), name: file.name, type: file.type || 'application/octet-stream', durationSeconds: 10, ...(purpose === 'background' || purpose === 'slideshow' ? { placement: purpose } : {}) }
    try {
      await saveMedia({ ...item, blob: file })
      if (purpose === 'background' || purpose === 'slideshow') patch({ media: [...config.media, item], backgroundMediaId: purpose === 'background' ? item.id : config.backgroundMediaId })
      else patch({ media: [...config.media, item], audio: { ...config.audio, [purpose]: item.id } })
      setNotice(`${file.name} tersimpan untuk penggunaan offline.`)
    } catch {
      setNotice('Media gagal disimpan. Kosongkan ruang penyimpanan perangkat, lalu coba lagi.')
    } finally {
      event.target.value = ''
    }
  }

  const removeMedia = async (id: string) => {
    await deleteMedia(id)
    patch({ media: config.media.filter((item) => item.id !== id), backgroundMediaId: config.backgroundMediaId === id ? undefined : config.backgroundMediaId, slides: config.slides.map((slide) => slide.mediaId === id ? { ...slide, mediaId: undefined, mediaMode: 'none' } : slide), audio: {
      tarhimId: config.audio.tarhimId === id ? undefined : config.audio.tarhimId,
      murottalId: config.audio.murottalId === id ? undefined : config.audio.murottalId,
      adhanId: config.audio.adhanId === id ? undefined : config.audio.adhanId,
    } })
  }

  const moveVisualMedia = (id: string, placement: NonNullable<MediaItem['placement']>) => patch({
    media: setMediaPlacement(config.media, id, placement),
    backgroundMediaId: placement === 'background' ? id : config.backgroundMediaId === id ? undefined : config.backgroundMediaId,
    slides: placement === 'background' ? releaseSlideMedia(config.slides, id) : config.slides,
  })

  const schedule = config.schedule[dateKeyLocal(now)] ?? {}
  const displayStatus = displayPhaseStatus(getPrayerPhase(now, config.schedule, config))
  const setPrayerTime = (prayer: PrayerName, time: string) => {
    const updatedSchedule = { ...config.schedule, [dateKeyLocal(now)]: { ...schedule, [prayer]: time } }
    const status = displayPhaseStatus(getPrayerPhase(now, updatedSchedule, config))
    patch({ schedule: updatedSchedule })
    setNotice(`Jadwal manual tersimpan. ${status.notice}`)
  }
  const addSlide = () => patch({ slides: [...config.slides, { id: crypto.randomUUID(), title: 'Pengumuman baru', content: 'Isi pengumuman.', mediaMode: 'none', durationSeconds: 10, showText: true }] })
  const moveSlide = (from: number, direction: -1 | 1) => {
    const target = from + direction
    if (target < 0 || target >= config.slides.length) return
    const slides = [...config.slides]
    ;[slides[from], slides[target]] = [slides[target], slides[from]]
    patch({ slides })
  }
  const addAgenda = () => patch({ agenda: [...config.agenda, { id: crypto.randomUUID(), day: 'Hari', activity: 'Kegiatan', time: 'Waktu' }] })
  const prepareRestore = () => {
    const restored = parseBackup(backup)
    if (!restored) return setNotice('Backup tidak valid. Tidak ada data yang diganti.')
    setPendingRestore(restored.config)
    setNotice(`${restored.legacy ? 'Backup lama dikenali' : 'Backup tervalidasi'}. Konfirmasi untuk mengganti konfigurasi; media tidak ikut dipulihkan.`)
  }
  const confirmRestore = () => {
    if (!pendingRestore) return
    setConfig(pendingRestore)
    setPendingRestore(undefined)
    setBackup('')
    setNotice('Konfigurasi dipulihkan. File media tidak termasuk backup.')
  }
  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
  const exportPortable = async () => {
    try {
      download(await createPortableBackup(config), `mosque-display-${dateKeyLocal(now)}.mdisplay`)
      setNotice('Backup lengkap beserta media berhasil dibuat.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Backup media gagal dibuat.') }
  }
  const importPortable = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const restored = await restorePortableBackup(file)
      if (!restored) return setNotice('File backup lengkap tidak valid.')
      setConfig(restored)
      setNotice('Konfigurasi dan media berhasil dipulihkan.')
    } catch { setNotice('Media tidak dapat dipulihkan. Pastikan ruang penyimpanan perangkat mencukupi.') } finally { event.target.value = '' }
  }
  const updatePin = async () => {
    if (!isValidAdminPin(newPin)) return setNotice('PIN harus terdiri dari 6 sampai 12 angka.')
    if (newPin !== confirmPin) return setNotice('Konfirmasi PIN tidak sama.')
    patch({ access: await createAdminAccess(newPin) })
    setNewPin(''); setConfirmPin(''); setNotice('PIN admin diperbarui.')
  }
  const searchCity = async () => {
    try {
      const response = await fetch(`https://api.myquran.com/v2/sholat/kota/cari/${encodeURIComponent(cityQuery)}`)
      if (!response.ok) throw new Error('Jaringan jadwal tidak tersedia')
      const body: unknown = await response.json()
      const data = typeof body === 'object' && body !== null && 'data' in body ? (body as { data?: unknown }).data : undefined
      setCities(Array.isArray(data) ? data.filter((item): item is { id: string; lokasi: string } => typeof item === 'object' && item !== null && typeof (item as { id?: unknown }).id === 'string' && typeof (item as { lokasi?: unknown }).lokasi === 'string').map((item) => ({ id: item.id, location: item.lokasi })) : [])
      if (!Array.isArray(data)) setNotice('Kota tidak ditemukan.')
    } catch { setNotice('Pencarian kota memerlukan koneksi internet.') }
  }
  const downloadSchedule = async (city: City) => {
    const now = new Date()
    try {
      const response = await fetch(`https://api.myquran.com/v2/sholat/jadwal/${city.id}/${now.getFullYear()}/${now.getMonth() + 1}`)
      if (!response.ok) throw new Error('Jaringan jadwal tidak tersedia')
      const body: unknown = await response.json()
      const data = typeof body === 'object' && body !== null && 'data' in body ? (body as { data?: { jadwal?: unknown } }).data?.jadwal : undefined
      if (!Array.isArray(data)) return setNotice('Jadwal tidak tersedia.')
      const imported = Object.fromEntries(data.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return []
        const row = item as Record<string, unknown>
        const date = typeof row.date === 'string' ? row.date : undefined
        if (!date) return []
        return [[date, { imsak: String(row.imsak ?? ''), subuh: String(row.subuh ?? ''), syuruq: String(row.terbit ?? ''), dzuhur: String(row.dzuhur ?? ''), ashar: String(row.ashar ?? ''), maghrib: String(row.maghrib ?? ''), isya: String(row.isya ?? '') }]]
      }))
      const coverage = Object.keys(imported).sort()
      const updatedSchedule = { ...config.schedule, ...imported }
      const status = displayPhaseStatus(getPrayerPhase(now, updatedSchedule, config))
      patch({ schedule: updatedSchedule, scheduleMetadata: { cityId: city.id, cityName: city.location, downloadedAt: new Date().toISOString(), coverageStart: coverage[0], coverageEnd: coverage.at(-1) } })
      setCities([]); setCityQuery(''); setNotice(`Jadwal bulan ini tersimpan untuk penggunaan offline. ${status.notice}`)
    } catch { setNotice('Unduhan jadwal memerlukan koneksi internet.') }
  }
  const menu: Array<[AdminSection, string]> = [['general', 'Tampilan'], ['schedule', 'Jadwal'], ['content', 'Konten'], ['media', 'Media Display & Audio'], ['info', 'Info Masjid'], ['backup', 'Backup']]
  return <main className="admin"><aside><h1>Panel Admin</h1><p>Mode offline</p><nav>{menu.map(([id, label]) => <button className={section === id ? 'active' : ''} onClick={() => setSection(id)} key={id}>{label}</button>)}</nav><button className="preview" onClick={onExit} title={displayStatus.notice}>{displayStatus.previewLabel}</button></aside><section className="admin-content"><header><h2>{menu.find(([id]) => id === section)?.[1]}</h2>{notice && <p className="notice" role="status">{notice}</p>}</header>
    {section === 'general' && <div className="form-grid"><Field label="Nama masjid" value={config.mosqueName} onChange={(mosqueName) => patch({ mosqueName })} /><Field label="Alamat" value={config.mosqueAddress} onChange={(mosqueAddress) => patch({ mosqueAddress })} /><label className="field"><span>PIN baru (6-12 angka)</span><input type="password" inputMode="numeric" value={newPin} onChange={(event) => setNewPin(event.target.value)} /></label><label className="field"><span>Konfirmasi PIN</span><input type="password" inputMode="numeric" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} /></label><div className="actions"><button type="button" onClick={() => void updatePin()}>Ubah PIN</button></div><label className="field"><span>Tema</span><select value={config.theme} onChange={(event) => patch({ theme: event.target.value as AppConfig['theme'] })}>{['emerald', 'gold', 'blue', 'red', 'purple', 'cyan', 'slate', 'orange'].map((theme) => <option value={theme} key={theme}>{theme}</option>)}</select></label><Field label="Kecepatan teks (detik)" value={config.display.runningTextSpeed} type="number" onChange={(runningTextSpeed) => patch({ display: { ...config.display, runningTextSpeed: Number(runningTextSpeed) } })} /><Field label="Ukuran teks (px)" value={config.display.runningTextSize} type="number" onChange={(runningTextSize) => patch({ display: { ...config.display, runningTextSize: Number(runningTextSize) } })} /><Field label="Tarhim/murottal sebelum azan (menit)" value={config.timings.preAdhanMinutes} type="number" onChange={(value) => patchTimings('preAdhanMinutes', value)} /><Field label="Durasi azan (menit)" value={config.timings.adhanMinutes} type="number" onChange={(value) => patchTimings('adhanMinutes', value)} /><Field label="Jeda iqamah salat biasa (menit)" value={config.timings.iqamahMinutes} type="number" onChange={(value) => patchTimings('iqamahMinutes', value)} /><Field label="Jeda iqamah salat Jumat (menit)" value={config.timings.fridayIqamahMinutes} type="number" onChange={(value) => patchTimings('fridayIqamahMinutes', value)} /><Field label="Layar hitam setelah iqamah (menit)" value={config.timings.blackoutMinutes} type="number" onChange={(value) => patchTimings('blackoutMinutes', value)} /><label className="field full"><span>Teks berjalan</span><textarea value={config.runningText} onChange={(event) => patch({ runningText: event.target.value })} /></label></div>}
    {section === 'schedule' && <section className="editor"><div className="editor-heading"><h3>Unduh jadwal resmi</h3></div><p>Internet hanya dipakai saat mencari dan mengunduh jadwal bulan ini. Setelah itu jadwal tersimpan offline.</p>{config.scheduleMetadata.coverageEnd && <p>Data terakhir: {config.scheduleMetadata.cityName ?? 'manual'} hingga {config.scheduleMetadata.coverageEnd}.</p>}<div className="actions"><input aria-label="Nama kota" value={cityQuery} placeholder="Contoh: Jakarta" onChange={(event) => setCityQuery(event.target.value)} /><button onClick={() => void searchCity()}>Cari kota</button></div>{cities.map((city) => <div className="media-list" key={city.id}><div><span>{city.location}</span><button onClick={() => void downloadSchedule(city)}>Unduh bulan ini</button></div></div>)}<div className="editor-heading"><h3>Edit jadwal hari ini</h3></div><p>Jadwal manual untuk {dateKeyLocal(now)}. Jadwal kosong ditampilkan sebagai belum tersedia.</p><div className="form-grid">{prayerNames.map((prayer) => <Field key={prayer} type="time" label={prayer} value={schedule[prayer] ?? ''} onChange={(value) => setPrayerTime(prayer, value)} />)}</div></section>}
    {section === 'content' && <div className="editor">
      <div className="editor-heading"><h3>Slide pengumuman</h3><div className="actions"><button onClick={() => setSection('media')}>Kelola slideshow dokumentasi</button><button onClick={addSlide}>Tambah slide</button></div></div>
      <p>Pilih hanya media dari slideshow dokumentasi. Latar display diatur terpisah pada halaman Media Display & Audio.</p>
      {config.slides.map((slide, index) => {
        const mediaValue = slide.mediaId ? `media:${slide.mediaId}` : slide.mediaMode === 'playlist' ? 'playlist' : 'none'
        const updateSlide = (value: Partial<typeof slide>) => patch({ slides: config.slides.map((item, itemIndex) => itemIndex === index ? { ...item, ...value } : item) })
        return <div className="edit-row slide-row" key={slide.id}>
          <Field label="Judul" value={slide.title} onChange={(title) => updateSlide({ title })} />
          <label className="field title-color"><span>Warna judul</span><input type="color" value={slide.titleColor ?? '#f6ebd5'} onChange={(event) => updateSlide({ titleColor: event.target.value })} /></label>
          <Field label="Pesan" value={slide.content} onChange={(content) => updateSlide({ content })} />
          <label className="field"><span>Media slideshow</span><select value={mediaValue} onChange={(event) => { const value = event.target.value; updateSlide({ mediaId: value.startsWith('media:') ? value.slice(6) : undefined, mediaMode: value === 'playlist' ? 'playlist' : 'none' }) }}><option value="none">Tanpa media</option><option value="playlist">Putar semua slideshow</option>{slideshowMedia.map((item) => <option value={`media:${item.id}`} key={item.id}>{item.name}</option>)}</select></label>
          <Field label="Durasi foto (detik)" type="number" value={slide.durationSeconds ?? 10} onChange={(value) => updateSlide({ durationSeconds: Math.min(60, Math.max(5, Number(value))) })} />
          <label className="field toggle"><input type="checkbox" checked={slide.showText !== false} onChange={(event) => updateSlide({ showText: event.target.checked })} /><span>Tampilkan teks</span></label>
          <div className="slide-actions"><button disabled={index === 0} onClick={() => moveSlide(index, -1)}>Naik</button><button disabled={index === config.slides.length - 1} onClick={() => moveSlide(index, 1)}>Turun</button><button className="danger" onClick={() => patch({ slides: config.slides.filter((item) => item.id !== slide.id) })}>Hapus</button></div>
        </div>
      })}
      <div className="editor-heading"><h3>Agenda</h3><button onClick={addAgenda}>Tambah agenda</button></div>
      {config.agenda.map((item, index) => <div className="edit-row agenda-row" key={item.id}><Field label="Hari" value={item.day} onChange={(day) => patch({ agenda: config.agenda.map((agenda, agendaIndex) => agendaIndex === index ? { ...agenda, day } : agenda) })} /><Field label="Kegiatan" value={item.activity} onChange={(activity) => patch({ agenda: config.agenda.map((agenda, agendaIndex) => agendaIndex === index ? { ...agenda, activity } : agenda) })} /><Field label="Waktu" value={item.time} onChange={(time) => patch({ agenda: config.agenda.map((agenda, agendaIndex) => agendaIndex === index ? { ...agenda, time } : agenda) })} /><button className="danger" onClick={() => patch({ agenda: config.agenda.filter((agenda) => agenda.id !== item.id) })}>Hapus</button></div>)}
    </div>}
    {section === 'media' && <div className="editor"><section className="media-section"><h3>Latar Display</h3><p>Unggah satu gambar atau video untuk menjadi latar area konten. Video diputar berulang tanpa suara.</p><label className="upload">Unggah gambar atau video latar<input type="file" accept="image/*,video/*" onChange={(event) => void upload(event, 'background')} /></label><label className="field"><span>Media latar aktif</span><select value={config.backgroundMediaId ?? ''} onChange={(event) => patch({ backgroundMediaId: event.target.value || undefined })}><option value="">Gunakan latar masjid bawaan</option>{backgroundMedia.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="media-list">{backgroundMedia.map((item) => <div key={item.id}><span>{item.type.startsWith('video/') ? 'VIDEO LATAR · ' : 'GAMBAR LATAR · '}{item.name}</span><div className="slide-actions"><button className="media-action" onClick={() => moveVisualMedia(item.id, 'slideshow')}>Pindahkan ke slideshow</button><button className="danger" onClick={() => void removeMedia(item.id)}>Hapus</button></div></div>)}</div></section><section className="media-section"><div className="editor-heading"><h3>Slideshow Dokumentasi</h3><label className="field toggle"><input type="checkbox" checked={config.display.showSlideshow} onChange={(event) => patch({ display: { ...config.display, showSlideshow: event.target.checked } })} /><span>Tampilkan slideshow di panel tengah</span></label></div><p>Unggah banyak foto atau video kegiatan. Koleksi ini tidak pernah dipakai sebagai background.</p><label className="upload">Unggah foto atau video slideshow<input type="file" accept="image/*,video/*" onChange={(event) => void upload(event, 'slideshow')} /></label><div className="media-list">{slideshowMedia.map((item) => <div key={item.id}><span>{item.type.startsWith('video/') ? 'VIDEO SLIDESHOW · ' : 'FOTO SLIDESHOW · '}{item.name}</span><div className="slide-actions"><button className="media-action" onClick={() => moveVisualMedia(item.id, 'background')}>Jadikan background</button><button className="danger" onClick={() => void removeMedia(item.id)}>Hapus</button></div></div>)}</div></section><section className="media-section"><h3>Audio Salat</h3><p>Tarhim diputar lebih dulu, lalu murottal, dan urutan itu diulang sampai azan.</p>{([['tarhimId', 'Audio tarhim'], ['murottalId', 'Audio murottal'], ['adhanId', 'Audio azan']] as const).map(([id, label]) => <label className="upload" key={id}>{label}: {config.audio[id] ? 'terpasang' : 'belum ada'}<input type="file" accept="audio/*" onChange={(event) => void upload(event, id)} /></label>)}</section></div>}
    {section === 'info' && <div className="form-grid"><Field label="Khatib" value={config.friday.khatib} onChange={(khatib) => patch({ friday: { ...config.friday, khatib } })} /><Field label="Imam" value={config.friday.imam} onChange={(imam) => patch({ friday: { ...config.friday, imam } })} /><Field label="Muadzin" value={config.friday.muadzin} onChange={(muadzin) => patch({ friday: { ...config.friday, muadzin } })} /><Field label="Saldo kas akhir" value={config.finance.balance} type="number" onChange={(balance) => patch({ finance: { ...config.finance, balance: Number(balance) } })} /><Field label="Pemasukan bulan ini" value={config.finance.income} type="number" onChange={(income) => patch({ finance: { ...config.finance, income: Number(income) } })} /><Field label="Pengeluaran bulan ini" value={config.finance.expense} type="number" onChange={(expense) => patch({ finance: { ...config.finance, expense: Number(expense) } })} /></div>}
    {section === 'backup' && <div className="editor"><p>Backup ringkas berisi konfigurasi dan jadwal. Backup lengkap juga menyertakan gambar, video, serta audio untuk dipindahkan ke perangkat lain.</p><textarea className="backup" value={backup} placeholder="Tekan buat backup ringkas atau tempel backup di sini" onChange={(event) => { setBackup(event.target.value); setPendingRestore(undefined) }} /><div className="actions"><button onClick={() => { setBackup(createBackup(config)); setNotice('Backup ringkas siap disalin. Media tidak termasuk.') }}>Buat backup ringkas</button><button onClick={prepareRestore}>Validasi backup ringkas</button>{pendingRestore && <><button className="danger" onClick={confirmRestore}>Konfirmasi pulihkan konfigurasi</button><button onClick={() => setPendingRestore(undefined)}>Batalkan</button></>}</div><div className="editor-heading"><h3>Backup lengkap</h3></div><p>Gunakan untuk memindahkan display ke perangkat baru. Setiap file media maksimal 100 MB.</p><div className="actions"><button onClick={() => void exportPortable()}>Unduh backup lengkap</button><label className="upload">Pulihkan backup lengkap<input type="file" accept=".mdisplay,application/octet-stream" onChange={(event) => void importPortable(event)} /></label></div></div>}
  </section></main>
}

function Login({ config, onSuccess, onBack }: { config: AppConfig; onSuccess: () => void; onBack: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const submit = async () => {
    if (Date.now() < lockedUntil || submitting) return
    setError(''); setSubmitting(true)
    try {
      if (await verifyAdminPin(pin, config.access)) return onSuccess()
      const nextAttempts = attempts + 1
      setPin(''); setAttempts(nextAttempts); setError('PIN tidak sesuai. Coba lagi.')
      if (nextAttempts >= 5) { setLockedUntil(Date.now() + 5 * 60_000); setAttempts(0) }
    } catch { setError('Verifikasi PIN gagal. Muat ulang halaman, lalu coba kembali.') } finally { setSubmitting(false) }
  }
  const locked = Date.now() < lockedUntil
  return <main className="login"><form onSubmit={(event) => { event.preventDefault(); void submit() }}><h1>Admin Masjid</h1><p>Masukkan PIN untuk mengubah tampilan.</p><input type="password" inputMode="numeric" maxLength={12} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} autoFocus disabled={locked || submitting} /><button type="submit" disabled={locked || submitting}>{submitting ? 'Memeriksa PIN…' : 'Masuk'}</button><button type="button" className="secondary" onClick={onBack} disabled={submitting}>Kembali</button>{error && <p className="error" role="alert">{error}</p>}{locked && <p className="error" role="alert">Terlalu banyak percobaan. Coba lagi beberapa menit lagi.</p>}</form></main>
}

function Setup({ config, setConfig, onSuccess, onBack }: { config: AppConfig; setConfig: (config: AppConfig) => void; onSuccess: () => void; onBack: () => void }) {
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const submit = async () => {
    if (!isValidAdminPin(pin)) return setError('PIN harus terdiri dari 6 sampai 12 angka.')
    if (pin !== confirmation) return setError('Konfirmasi PIN tidak sama.')
    setConfig({ ...config, access: await createAdminAccess(pin) })
    onSuccess()
  }
  return <main className="login"><form onSubmit={(event) => { event.preventDefault(); void submit() }}><h1>Siapkan Admin Masjid</h1><p>Buat PIN lokal untuk melindungi pengaturan perangkat ini.</p><input aria-label="PIN baru" type="password" inputMode="numeric" maxLength={12} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))} autoFocus /><input aria-label="Konfirmasi PIN" type="password" inputMode="numeric" maxLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value.replace(/\D/g, ''))} /><button type="submit">Simpan PIN dan buka admin</button><button type="button" className="secondary" onClick={onBack}>Kembali</button>{error && <p className="error">{error}</p>}</form></main>
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(loadConfig)
  const [screen, setScreen] = useState<Screen>('display')
  useEffect(() => { saveConfig(config) }, [config])
  const activeConfig = useMemo(() => ({ ...defaultConfig, ...config, timings: { ...defaultConfig.timings, ...config.timings }, audio: { ...defaultConfig.audio, ...config.audio }, display: { ...defaultConfig.display, ...config.display } }), [config])
  if (screen === 'setup') return <Setup config={activeConfig} setConfig={setConfig} onSuccess={() => setScreen('admin')} onBack={() => setScreen('display')} />
  if (screen === 'login') return <Login config={activeConfig} onSuccess={() => setScreen('admin')} onBack={() => setScreen('display')} />
  if (screen === 'admin') return <Admin config={activeConfig} setConfig={setConfig} onExit={() => setScreen('display')} />
  return <Display config={activeConfig} onAdmin={() => setScreen(activeConfig.access.pinHash ? 'login' : 'setup')} />
}
