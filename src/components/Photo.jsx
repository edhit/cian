import { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

/**
 * Пропорции заданы заранее: когда фотографии поедут в R2, их загрузка
 * не будет сдвигать уже отрисованный список.
 */
export function Photo({ src, alt = '', className = '', ratio = '4 / 3', rounded = 'rounded-[8px]' }) {
  const [failed, setFailed] = useState(false);
  const usable = typeof src === 'string' && /^https?:\/\//i.test(src) && !failed;

  return (
    <div
      className={`relative overflow-hidden bg-fill ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {usable ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-label-3">
          <ImageIcon size={22} strokeWidth={1.5} aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
