import type { MediaItem, Slide } from './types'

export const selectSlideMedia = (slide: Pick<Slide, 'mediaId' | 'mediaMode'> | undefined, index: number, media: MediaItem[]) => {
  if (slide?.mediaId) return media.find((item) => item.id === slide.mediaId)
  if (slide?.mediaMode === 'none') return undefined
  return media[index % Math.max(1, media.length)]
}

export const shouldAdvanceContent = (contentCount: number, mediaCount: number, showSlideshow: boolean, activeVisualIsVideo: boolean) => (contentCount > 1 || (showSlideshow && mediaCount > 1)) && (!showSlideshow || !activeVisualIsVideo)

export const setMediaPlacement = (media: MediaItem[], id: string, placement: NonNullable<MediaItem['placement']>) => media.map((item) => item.id === id ? { ...item, placement } : item)

export const releaseSlideMedia = (slides: Slide[], id: string) => slides.map((slide) => slide.mediaId === id ? { ...slide, mediaId: undefined, mediaMode: 'playlist' as const } : slide)

export const acceptsMediaType = (type: string, category: 'visual' | 'audio') => category === 'visual' ? /^(image|video)\//.test(type) : /^audio\//.test(type)
