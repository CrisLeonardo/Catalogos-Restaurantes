import { redirect } from 'next/navigation';
import { resolveModuleContext } from '@/lib/modules-server';
import { getRatings, getRatingsSummary } from '@/lib/db/encuestas';
import EncuestasPanel from '@/components/admin/encuestas-panel';
import { panelLink } from '@/lib/panel-links-server';

export const metadata = { title: 'Encuestas – Panel admin' };

export default async function EncuestasPage() {
  const mc = await resolveModuleContext('encuestas');
  if (!mc.ok) redirect(await panelLink('/admin/modulos'));

  const [ratings, summary] = await Promise.all([
    getRatings(mc.restaurantId),
    getRatingsSummary(mc.restaurantId),
  ]);

  return (
    <div className="anim-fade-up">
      <EncuestasPanel ratings={ratings} summary={summary} />
    </div>
  );
}
