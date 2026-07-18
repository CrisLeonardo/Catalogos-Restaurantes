import type { Metadata } from 'next';
import { getApiKeys } from '@/lib/actions/api-keys';
import ApiKeysManager from '@/components/super/api-keys-manager';

export const metadata: Metadata = { title: 'API — Super Admin' };
export const dynamic = 'force-dynamic';

export default async function ConfiguracionApiPage() {
  const apiKeys = await getApiKeys();
  return <ApiKeysManager initialKeys={apiKeys} />;
}
