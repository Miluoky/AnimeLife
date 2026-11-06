import { useState, type SyntheticEvent, type ImgHTMLAttributes } from 'react'

export interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onLoad' | 'onError'> {
  src?: string | null
  srcSet?: string
  webpSrc?: string | null
  webpSrcSet?: string
  alt: string
  aspectRatio?: string
  priority?: boolean
  className?: string
  imgClassName?: string
  placeholderFill?: string
  fallbackTitle?: string
  /** заполнить уже свёрстанный слот (position: absolute; inset: 0), без своего aspect-ratio */
  fill?: boolean
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void
}

/**
 * Стилизованная SVG-заглушка постера в стилистике Dark Anime:
 * предотвращает сдвиг макета (CLS = 0) и красиво выглядит при сбое сети или отсутствующей обложке.
 */
function FallbackPoster({ title, alt }: { title?: string; alt: string }) {
  const displayTitle = title || alt || 'AnimeLife'
  return (
    <div
      className="optimized-image__fallback"
      role="img"
      aria-label={alt}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 30%, var(--surface-2) 0%, var(--surface) 75%, var(--bg) 100%)',
        border: '1px solid var(--line)',
        borderRadius: 'inherit',
        padding: '16px 12px',
        boxSizing: 'border-box',
        color: 'var(--muted)',
        textAlign: 'center',
        userSelect: 'none',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ marginBottom: '12px', opacity: 0.85 }}
        aria-hidden="true"
      >
        <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" strokeWidth="2" strokeDasharray="3 3" />
        <path d="M16 8V40M32 8V40" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.5" />
        <circle cx="24" cy="24" r="8" fill="color-mix(in srgb, var(--accent) 15%, transparent)" stroke="var(--accent)" strokeWidth="2" />
        <polygon points="22,20 28,24 22,28" fill="var(--accent)" />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--text-soft)',
          lineHeight: 1.3,
          maxHeight: '2.6em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {displayTitle}
      </span>
      <span
        style={{
          marginTop: '6px',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        AnimeLife
      </span>
    </div>
  )
}

/**
 * Оптимизированный компонент изображения:
 * - Поддержка WebP через <picture> с авто-фоллбэком на исходный формат
 * - Аппаратный blur-up эффект при загрузке (progressive fade-in без дерганья)
 * - Гарантия CLS = 0 через контейнер фиксированного соотношения сторон (aspect-ratio)
 * - Элегантная тёмная векторная SVG-заглушка при ошибке или пустом источнике
 */
export function OptimizedImage({
  src,
  srcSet,
  webpSrc,
  webpSrcSet,
  alt,
  aspectRatio = '225 / 338',
  priority = false,
  className = '',
  imgClassName = '',
  placeholderFill,
  fallbackTitle,
  fill = false,
  sizes,
  onLoad,
  onError,
  ...rest
}: OptimizedImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  const handleLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    setLoaded(true)
    onLoad?.(e)
  }

  const handleError = (e: SyntheticEvent<HTMLImageElement>) => {
    setError(true)
    onError?.(e)
  }

  const effectiveSrc = src || null
  const showFallback = error || !effectiveSrc

  return (
    <div
      className={`optimized-image ${className}`}
      style={
        fill
          ? {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              overflow: 'hidden',
              backgroundColor: placeholderFill || 'var(--surface-2)',
              borderRadius: 'inherit',
            }
          : {
              position: 'relative',
              width: '100%',
              aspectRatio,
              overflow: 'hidden',
              backgroundColor: placeholderFill || 'var(--surface-2)',
              borderRadius: 'inherit',
            }
      }
    >
      {showFallback ? (
        <FallbackPoster title={fallbackTitle} alt={alt} />
      ) : (
        <picture
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
          }}
        >
          {webpSrcSet && <source type="image/webp" srcSet={webpSrcSet} sizes={sizes} />}
          {webpSrc && !webpSrcSet && <source type="image/webp" srcSet={webpSrc} sizes={sizes} />}
          {srcSet && <source srcSet={srcSet} sizes={sizes} />}
          <img
            src={effectiveSrc}
            alt={alt}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            // @ts-expect-error fetchpriority is standard in modern browsers
            fetchpriority={priority ? 'high' : undefined}
            onLoad={handleLoad}
            onError={handleError}
            className={`optimized-image__img ${imgClassName}`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: loaded ? 1 : 0,
              filter: loaded ? 'none' : 'blur(10px)',
              // После загрузки transform не фиксируем: наведение (кадры на главной) само увеличивает картинку.
              transform: loaded ? undefined : 'scale(1.04)',
              transition: 'opacity 0.35s var(--ease), filter 0.35s var(--ease), transform 0.35s var(--ease)',
              willChange: loaded ? 'auto' : 'opacity, filter, transform',
            }}
            {...rest}
          />
        </picture>
      )}
    </div>
  )
}

export default OptimizedImage
