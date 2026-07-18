import { notFound } from 'next/navigation';
import { SavedBanner } from '@/components/super/ui';
import ThemeEditor from '@/components/super/theme-editor';
import { getRestaurantFullById } from '@/lib/db/super-admin';
import { listThemeTemplates } from '@/lib/actions/super-admin';
import { resolveTheme, type ThemeRow } from '@/lib/theme/resolve';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Apariencia — Super Admin' };

export default async function FichaAparienciaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const row = await getRestaurantFullById(id);
  if (!row) notFound();

  const theme = row.restaurant_themes[0] ?? null;
  const templates = await listThemeTemplates();
  const resolved = resolveTheme(theme as ThemeRow | null, row.slug, {
    brandName: row.name,
    tagline: row.tagline,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {saved === 'tema' && <SavedBanner message="Apariencia guardada." />}
      {/* full-bleed: rompe el max-width del layout para que el editor y la
          vista previa en vivo quepan lado a lado. */}
      <section className="bleed">
        <div className="bleed-inner">
          <ThemeEditor
            key={row.id}
            restaurantId={row.id}
            config={resolved.config}
            content={resolved.content}
            customCss={resolved.customCss}
            templates={templates}
          />
        </div>
      </section>
    </div>
  );
}
