'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ImageUploadProps {
  restaurantId: string;
  currentUrl?: string | null;
  folder?: string;
  /**
   * 'icon' normaliza la imagen a un PNG cuadrado 512×512 antes de subir
   * (fondo de marca + logo centrado en la "safe zone"). Necesario para que
   * el ícono de la PWA instalada se vea bien en Android/iOS y NUNCA salga
   * como imagen rota: el manifest exige un raster cuadrado de tamaño
   * concreto (PNG), no un SVG ni un WebP de tamaño desconocido.
   */
  mode?: 'photo' | 'icon';
  /** Color de fondo para el ícono (mode='icon'). Por defecto el oscuro de plataforma. */
  bgColor?: string;
  onUpload: (url: string) => void;
}

/**
 * Convierte cualquier imagen (PNG/JPG/WebP/GIF) en un PNG cuadrado 512×512
 * con el logo contenido en el 76% central sobre un fondo sólido. El canvas
 * decodifica WebP de forma nativa (a diferencia de next/og en el servidor),
 * así que el resultado es un ícono universalmente válido para el manifest PWA.
 */
async function normalizeIcon(file: File, bg: string, size = 512): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    // Fondo de marca a sangre completa (clave para el ícono "maskable").
    ctx.fillStyle = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(bg) ? bg : '#0b0b0c';
    ctx.fillRect(0, 0, size, size);

    // Logo contenido en el 76% central → dentro de la safe zone del maskable.
    const pad = size * 0.12;
    const box = size - pad * 2;
    const scale = Math.min(box / bitmap.width, box / bitmap.height);
    const w = bitmap.width * scale;
    const h = bitmap.height * scale;
    ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    );
    if (!blob) return file;
    return new File([blob], 'icon.png', { type: 'image/png' });
  } catch {
    return file; // ante cualquier fallo (p.ej. SVG no decodificable) subir el original
  }
}

/**
 * Redimensiona y recomprime en el navegador antes de subir: una foto de
 * celular de 5 MB termina pesando ~200 KB sin pérdida visible en el menú.
 * Siempre intenta convertir a WebP (sin importar si el cliente subió JPG,
 * PNG o WebP) y se queda con el resultado más liviano. GIF y SVG se suben
 * tal cual (canvas los rompería / perdería la animación).
 */
export async function compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));

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
  mode = 'photo',
  bgColor = '#0b0b0c',
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

    // Ícono PWA → PNG cuadrado 512×512; resto → comprimir webp.
    const upload = mode === 'icon'
      ? await normalizeIcon(file, bgColor)
      : await compressImage(file);

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
          // Color de fondo SIEMPRE presente detrás de la imagen (no solo en
          // modo icon): si el logo tiene transparencia, sin esto se ve el
          // fondo del panel admin (cambia con el tema claro/oscuro) en vez
          // del fondo real donde se mostrará el logo — se veía "lavado" en
          // modo claro con logos claros/blancos.
          backgroundColor: preview ? bgColor : 'color-mix(in srgb, var(--u-text) 3%, transparent)',
          backgroundImage: preview ? `url(${preview})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
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
