'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { confirmarPlanTrasPrueba } from '@/lib/actions/cambiar-plan';
import { formatPlanAmount, PLANS, type PlanCode } from '@/lib/plans';

export default function PruebaDePlan({ restaurantId, plan, amount, endsAt, confirmed, esDueno }: {
  restaurantId: string;
  plan: PlanCode;
  amount: number;
  endsAt: string;
  confirmed: boolean;
  esDueno: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fecha = new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala' }).format(new Date(endsAt));
  const importe = formatPlanAmount(amount);
  const nombre = PLANS[plan].name;

  async function decidir() {
    setError(null);
    const acepta = !confirmed;
    const ok = await confirm({
      title: acepta ? `Contratar ${nombre}` : 'Retirar contratación',
      description: acepta
        ? `Tu primera mensualidad de ${importe} vence el ${fecha}. Hasta entonces puedes retirar la contratación aquí mismo.`
        : `La prueba sigue hasta el ${fecha}. Al vencer, tu carta pasa a Básico y se conservan tus datos.`,
      confirmLabel: acepta ? `Contratar por ${importe} al mes` : 'Retirar contratación',
      cancelLabel: 'Volver',
    });
    if (!ok) return;
    start(async () => {
      const res = await confirmarPlanTrasPrueba(restaurantId, { plan, amount, endsAt }, acepta);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      {dialog}
      <h2 className="text-[18px] font-bold">Tu prueba termina el {fecha}</h2>
      {confirmed ? (
        <p className="text-[14px] text-adm-text-3">Confirmaste {nombre} por {importe} al mes. Tu primera mensualidad vence el {fecha}.</p>
      ) : (
        <>
          <p className="text-[14px] text-adm-text-3">Estás probando {nombre}. Si quieres seguir, confirma la mensualidad de {importe}. Tu primer cobro será el {fecha}.</p>
          <p className="text-[14px] text-adm-text-3">Si vence sin confirmación, tu carta sigue en Básico. Puedes resolver los pedidos que ya aceptaste.</p>
        </>
      )}
      {error && <p role="alert" className="text-[14px] text-[var(--c-danger)]">{error}</p>}
      {esDueno && (
        <Button type="button" size="touch" variant={confirmed ? 'outline' : 'primary'} onClick={decidir} disabled={pending} className="self-start">
          {pending ? 'Guardando…' : confirmed ? 'Retirar contratación' : `Contratar ${nombre}`}
        </Button>
      )}
    </Card>
  );
}
