import { describe, expect, it } from 'vitest'
import { acceptsMediaType, releaseSlideMedia, selectSlideMedia, setMediaPlacement, shouldAdvanceContent } from './slideshow'

const media = [
  { id: 'foto-1', name: 'Kegiatan 1', type: 'image/jpeg' },
  { id: 'foto-2', name: 'Kegiatan 2', type: 'image/jpeg' },
]

describe('slide media selection', () => {
  it('uses the selected photo, an explicit playlist, or no media as configured', () => {
    expect(selectSlideMedia({ mediaId: 'foto-2' }, 0, media)?.id).toBe('foto-2')
    expect(selectSlideMedia({ mediaMode: 'playlist' }, 3, media)?.id).toBe('foto-2')
    expect(selectSlideMedia({ mediaMode: 'none' }, 0, media)).toBeUndefined()
  })

  it('keeps media roles separate and advances hidden video slides by duration', () => {
    expect(setMediaPlacement(media, 'foto-1', 'background')[0].placement).toBe('background')
    expect(acceptsMediaType('video/mp4', 'visual')).toBe(true)
    expect(acceptsMediaType('audio/mpeg', 'visual')).toBe(false)
    expect(acceptsMediaType('audio/mpeg', 'audio')).toBe(true)
    expect(shouldAdvanceContent(2, 1, false, true)).toBe(true)
    expect(shouldAdvanceContent(2, 1, true, true)).toBe(false)
  })

  it('keeps cycling photos beyond the number of announcements and waits for videos to finish', () => {
    expect(selectSlideMedia({}, 4, media)?.id).toBe('foto-1')
    expect(selectSlideMedia({}, 5, media)?.id).toBe('foto-2')
    expect(shouldAdvanceContent(1, 2, true, false)).toBe(true)
    expect(shouldAdvanceContent(1, 2, true, true)).toBe(false)
  })

  it('returns a slide to the playlist when its selected media becomes a background', () => {
    const slides = releaseSlideMedia([{ id: 'kajian', title: 'Kajian', content: 'Ahad', mediaId: 'foto-1' }], 'foto-1')
    expect(slides[0]).toMatchObject({ mediaId: undefined, mediaMode: 'playlist' })
  })
})
