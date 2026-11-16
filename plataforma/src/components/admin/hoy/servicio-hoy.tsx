import { Icon } from '@/components/icons';
import { List, ListLink, ListText, StatusPill, type Tone } from '@/components/ui/list';
import { Section } from '@/components/ui/section';
import { agoLabel } from '@/components/admin/hoy-widgets';
import { STATUS_LABEL_SHORT } from '@/lib/order-status';
import { ordenarServicio, type PedidoVivo } from '@/lib/hoy-etapa';
import type { HouseData } from '@/lib/db/hoy';
import type { OrderStatus } from '@/types';

/* «Servicio» (ficha 2.1): «En curso» y «La casa» eran dos bloques para una
   sola pregunta —¿cómo va la sala?—. Ahora es uno: arriba lo que urge (lo
   listo se enfría), luego la fila de espera y la próxima reserva. */

const TONO: Record<OrderStatus, Tone> = {
  NEW: 'accent', PREP: 'warn', READY: 'ok', TRANSIT: 'ok',
  SERVED: 'neutral', DELIVERED: 'neutral', CANCEL: 'neutral',
};

const VISIBLES = 5;

export function ServicioHoy({
  pedidos, casa, ahora, dinero, href, verMesas,
}: {
  pedidos: PedidoVivo[];
  casa: HouseData | null;
  ahora: number;
  dinero: (n: number) => string;
  href: (ruta: string) => string;
  verMesas: boolean;
}) {
  const mesas = casa?.tables ?? null;
  const espera = casa?.waiting ?? null;
  const reserva = casa?.reservation ?? null;
  if (pedidos.length === 0 && !espera && !reserva) return null;

  const titulo = mesas && mesas.total >= mesas.occupied && mesas.total > 0
    ? `Servicio · ${mesas.occupied} de ${mesas.total} mesas`
    : 'Servicio';
  const lista = ordenarServicio(pedidos);

  return (
    <Section
      title={titulo}
      action={verMesas && mesas ? { href: href('/admin/mesas'), label: 'Ver mesas' } : undefined}
    >
      <List>
        {lista.slice(0, VISIBLES).map((p) => (
          <ListLink key={p.id} href={href('/admin/pedidos')} className="gap-3">
            <ListText
              title={p.etiqueta}
              desc={[p.es_prueba ? 'Prueba' : null, p.cliente, agoLabel(p.created_at, ahora)].filter(Boolean).join(' · ')}
            />
            <StatusPill tone={TONO[p.status]} className="shrink-0">{STATUS_LABEL_SHORT[p.status]}</StatusPill>
            <span className="min-w-20 shrink-0 text-right text-[14px] font-semibold tabular-nums text-adm-text">
              {dinero(p.total)}
            </span>
          </ListLink>
        ))}
        {lista.length > VISIBLES && (
          <ListLink href={href('/admin/pedidos')} className="gap-2 text-[14px] font-semibold text-adm-accent-ink">
            Ver los {lista.length} pedidos
            <Icon name="chevronRight" size={15} />
          </ListLink>
        )}
        {espera && (
          <ListLink href={href('/admin/lista-espera')}>
            <span className="w-11 shrink-0 text-[18px] font-semibold tabular-nums text-adm-text">{espera.count}</span>
            <ListText
              title={espera.count === 1 ? 'Grupo esperando mesa' : 'Grupos esperando mesa'}
              desc={`El primero de la fila llegó ${agoLabel(espera.since, ahora)}.`}
            />
            <span className="shrink-0 text-[13px] font-semibold text-adm-accent-ink">Ver la fila</span>
          </ListLink>
        )}
        {reserva && (
          <ListLink href={href('/admin/reservaciones')}>
            <span className="w-11 shrink-0 text-[14px] font-semibold tabular-nums text-adm-text-2">{reserva.time}</span>
            <ListText
              title={`${reserva.name} · ${reserva.partySize} ${reserva.partySize === 1 ? 'persona' : 'personas'}`}
              desc={reserva.more > 0
                ? `Y ${reserva.more} ${reserva.more === 1 ? 'reserva más' : 'reservas más'} hoy.`
                : 'La única reserva de hoy.'}
            />
            <Icon name="chevronRight" size={15} className="shrink-0 text-adm-text-4" />
          </ListLink>
        )}
      </List>
    </Section>
  );
}
