'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ImageUploadProps {
  restaurantId: string;
  currentUrl?: string | null;
  folder?: string;
  onUpload: (url: string) => void;
}

export default function ImageUpload({
  restaurantId,
  currentUrl,
  folder = 'products',
  onUpload,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación local
    if (file.size > 5 * 1024 * 1024) {
      setError('La imagen no puede superar 5 MB.');
      return;
    }

    setError(null);
    setUploading(true);

    // Preview inmediato
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    const supabase = createClient();
    const ext = file.name.split('.').pop();
    const path = `${restaurantId}/${folder}/${Date.now()}.${ext}`;

    const { data, error: uploadError } = await supabase.storage
      .from('restaurant-assets')
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setPreview(currentUrl ?? null);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('restaurant-assets')
      .getPublicUrl(data.path);

    onUpload(publicUrl);
    setUploading(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Preview */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="press"
        style={{
          width: 88,
          height: 88,
          borderRadius: 'var(--radius-lg)',
          border: '1.5px dashed var(--u-hair-2)',
          background: preview
            ? `url(${preview}) center/cover no-repeat`
            : 'rgba(255,255,255,0.03)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
        aria-label="Subir imagen"
      >
        {!preview && (
          <span style={{ fontSize: 22, color: 'var(--u-text-4)' }}>+</span>
        )}
        {uploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              color: 'var(--u-text-2)',
            }}
          >
            Subiendo…
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={handleChange}
      />

      <span style={{ fontSize: 11, color: 'var(--u-text-4)' }}>
        {preview ? 'Toca para cambiar' : 'Toca para añadir foto'}
      </span>

      {error && (
        <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>
      )}
    </div>
  );
}
