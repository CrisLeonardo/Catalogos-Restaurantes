'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ImageUploadProps {
  restaurantId: string;
  currentUrl?: string | null;
  folder?: string;
  onUpload: (url: string) => void;
}

/**
 * Redimensiona y recomprime en el navegador antes de subir: una foto de
 * celular de 5 MB termina pesando ~200 KB sin pérdida visible en el menú.
 * GIF y SVG se suben tal cual (canvas los rompería).
 */
async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    // Pequeña y ya comprimida: no vale la pena reprocesar.
    if (scale === 1 && file.size < 400 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality),
    );
    if (!blob || blob.size >= file.size) return file;
    const base = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${base}.webp`, { type: 'image/webp' });
  } catch {
    return file; // ante cualquier fallo, subir el original
  }
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
  const objectUrlRef = useRef<string | null>(null);

  // Liberar el object URL del preview al desmontar (fuga de memoria).
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function setLocalPreview(url: string | null) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (url?.startsWith('blob:')) objectUrlRef.current = url;
    setPreview(url);
  }

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación local
    if (file.size > 10 * 1024 * 1024) {
      setError('La imagen no puede superar 10 MB.');
      return;
    }

    setError(null);
    setUploading(true);

    // Preview inmediato
    setLocalPreview(URL.createObjectURL(file));

    // Comprimir antes de subir (móvil con datos lo agradece).
    const upload = await compressImage(file);

    const supabase = createClient();
    const ext = upload.name.split('.').pop();
    const path = `${restaurantId}/${folder}/${Date.now()}.${ext}`;

    const { data, error: uploadError } = await supabase.storage
      .from('restaurant-assets')
      .upload(path, upload, { upsert: true });

    if (uploadError) {
      setError(uploadError.message);
      setLocalPreview(currentUrl ?? null);
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
