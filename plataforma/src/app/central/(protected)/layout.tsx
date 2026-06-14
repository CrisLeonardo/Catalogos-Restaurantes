import { redirect } from 'next/navigation';
import { getGroupContext } from '@/lib/db/group';
import GroupShell from '@/components/group/group-shell';

export default async function CentralProtectedLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getGroupContext();
  if (!ctx) redirect('/central/login');

  return (
    <GroupShell orgName={ctx.org.name} logoUrl={ctx.org.logo_url} branchCount={ctx.branches.length}>
      {children}
    </GroupShell>
  );
}
