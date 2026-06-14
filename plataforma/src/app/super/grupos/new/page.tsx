import Link from 'next/link';
import { CreateOrgForm } from '@/components/super/group-forms';

export const metadata = { title: 'Nuevo grupo – Super Admin' };

export default function NewGrupoPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460 }}>
      <Link href="/super/grupos" className="press t-mute" style={{ fontSize: 13, textDecoration: 'none' }}>← Grupos</Link>
      <h1 className="t-display" style={{ fontSize: 24 }}>Nuevo grupo</h1>
      <div className="glass" style={{ borderRadius: 16, padding: 22 }}>
        <CreateOrgForm />
      </div>
    </div>
  );
}
