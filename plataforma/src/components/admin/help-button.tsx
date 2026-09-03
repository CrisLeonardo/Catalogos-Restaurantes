'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

interface Props {
  section: string;
}

export default function HelpButton({ section }: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  return (
    <Button
      render={<Link href={`${panelHref(base, '/admin/ayuda')}#${section}`} />}
      title="Abrir guía de ayuda"
      variant="ghost"
      size="icon"
      className="shrink-0"
    >
      <Icon name="helpCircle" size={18} />
    </Button>
  );
}
