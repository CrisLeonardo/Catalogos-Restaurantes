import type { Metadata } from 'next';
import { getPlatformContactSettings } from '@/lib/actions/super-admin';
import SoporteClient from '@/components/admin/soporte-client';

export const metadata: Metadata = { title: 'Soporte — Panel Admin' };

export default async function SoportePage() {
  const contact = await getPlatformContactSettings();
  return <SoporteClient contact={contact} />;
}
