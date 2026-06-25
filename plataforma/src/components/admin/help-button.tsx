'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';

interface Props {
  section: string;
}

export default function HelpButton({ section }: Props) {
  return (
    <Link
      href={`/admin/ayuda#${section}`}
      title="Abrir guía de ayuda"
      className="press glass-quiet"
      style={{
        width: 42,
        height: 42,
        borderRadius: 12,
        display: 'grid',
        placeItems: 'center',
        color: 'var(--u-text-3)',
        textDecoration: 'none',
        flexShrink: 0,
        border: 'none',
      }}
    >
      <Icon name="helpCircle" size={18} />
    </Link>
  );
}
