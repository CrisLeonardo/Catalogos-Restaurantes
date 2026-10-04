import type { Metadata } from 'next';
import { getLandingSettingsFresh, getLandingProof, getShowcaseOptions } from '@/lib/db/landing';
import LandingContentForm from '@/components/super/landing-content-form';
import { LandingPhone } from '@/components/landing-proof';
import { rootDomainForUrls } from '@/lib/tenant';

export const metadata: Metadata = { title: 'Portada — Super Admin' };
export const dynamic = 'force-dynamic';

/* Vitrina y testimonios de la web de ventas (auditoría 2026-10-02,
   WEB-02/03). A la derecha, el teléfono tal como está HOY en la portada. */
export default async function ConfiguracionPortadaPage() {
  const [settings, options, proof] = await Promise.all([
    getLandingSettingsFresh(),
    getShowcaseOptions(),
    getLandingProof(),
  ]);
  const root = rootDomainForUrls();
  const portada = `${root.includes('localhost') || root.startsWith('127.') ? 'http' : 'https'}://${root}`;

  return (
    <div className="landing-admin">
      <LandingContentForm initial={settings} options={options} />
      <aside className="landing-admin-aside">
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>En la portada ahora</div>
        <LandingPhone showcase={proof.showcase} />
        <a href={portada} target="_blank" rel="noreferrer" className="lp-link" style={{ fontSize: 13 }}>
          Abrir la portada ↗
        </a>
      </aside>
    </div>
  );
}
