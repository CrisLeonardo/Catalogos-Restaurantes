'use client';

import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface Props {
  section: string;
}

export default function HelpButton({ section }: Props) {
  return (
    <Button
      render={<Link href={`/admin/ayuda#${section}`} />}
      title="Abrir guía de ayuda"
      variant="ghost"
      size="icon"
      className="shrink-0"
    >
      <Icon name="helpCircle" size={18} />
    </Button>
  );
}
