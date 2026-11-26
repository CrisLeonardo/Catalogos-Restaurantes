import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { emailEnabled, sendEmail } from '@/lib/email';
import { rootDomainForUrls } from '@/lib/tenant';

type Aviso = {
  restaurante: string;
  tipo: 'previo' | 'vence';
  correo: string;
  nombre: string;
  slug: string;
  vence: string;
  confirmado: boolean;
  reserva: string;
};

export async function enviarAvisosDePrueba(): Promise<{ enviados: number; fallidos: number }> {
  if (!emailEnabled()) return { enviados: 0, fallidos: 0 };
  const db = createServiceClient();
  const { data, error } = await db.rpc('leogin_tomar_avisos_de_prueba');
  if (error) return { enviados: 0, fallidos: 1 };

  const dominio = rootDomainForUrls();
  const origen = dominio.includes('localhost') ? `http://${dominio}` : `https://${dominio}`;
  const fechaLocal = new Intl.DateTimeFormat('es-GT', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Guatemala',
  });
  const entregas = await Promise.all(((data ?? []) as Aviso[]).map(async (aviso) => {
    const fecha = fechaLocal.format(new Date(aviso.vence));
    const heading = aviso.tipo === 'previo' ? `Tu prueba de Leogin termina el ${fecha}` : 'Tu prueba de Leogin terminó';
    const body = aviso.confirmado
      ? [aviso.tipo === 'previo'
        ? `Confirmaste la contratación para ${aviso.nombre}. Tu primera mensualidad vence el ${fecha}.`
        : `La mensualidad de ${aviso.nombre} está disponible en Mi suscripción.`]
      : [aviso.tipo === 'previo'
        ? `Si quieres seguir con el plan de ${aviso.nombre}, confirma la mensualidad en Mi suscripción. Si prefieres seguir con el menú gratis, tu carta pasará a Básico al vencer.`
        : `La carta de ${aviso.nombre} sigue disponible con el plan Básico y tus datos se conservan. Puedes resolver los pedidos que recibiste durante la prueba.`];
    const correo = await sendEmail({
      to: aviso.correo, subject: heading, heading, body,
      cta: { label: 'Ver mi suscripción', url: `${origen}/panel/${encodeURIComponent(aviso.slug)}/suscripcion` },
    });
    if (!correo.ok) return false;
    const { error: errorMarca } = await db.from('prueba_aviso_envios')
      .update({ enviado_en: new Date().toISOString() })
      .eq('restaurant_id', aviso.restaurante).eq('tipo', aviso.tipo).eq('reservado_hasta', aviso.reserva);
    return !errorMarca;
  }));
  const enviados = entregas.filter(Boolean).length;
  return { enviados, fallidos: entregas.length - enviados };
}
