'use client';

/* Cupones. Línea N «nada saturado» (maqueta aprobada el 2026-11-18:
   docs/diseno/MAQUETA_PROMOCIONES_NADA_SATURADO_2026-11-18.html).

   Una línea con «Nuevo cupón» al lado; arriba los cupones en uso y abajo,
   en gris, los que no se pueden usar ahora. Cada fila abre una hoja con lo
   que hace el cupón en una frase y «Pausar». Un cupón que ya se usó no se
   elimina: se pausa, para que sus usos sigan contando. */

import { useMemo, useState, useTransition } from 'react';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HojaOperativa } from '@/components/ui/hoja-operativa';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { createCoupon, updateCoupon, toggleCoupon, deleteCoupon } from '@/lib/actions/cupones';
import type { Coupon } from '@/lib/db/cupones';
import { fmtMoney } from '@/lib/money';
import AvisoLectura from '@/components/admin/aviso-lectura';
import type { EstadoLectura } from '@/lib/db/lectura';
import {
  estadoDelCupon, fechaDeFin, fechaDeInicio, fechaLegible, NOMBRE_ESTADO, type EstadoCupon,
} from '@/lib/cupones/vigencia';
import s from './fidelidad.module.css';

interface Props {
  restaurantId: string;
  coupons: Coupon[];
  /** Si la consulta falló, la lista vacía NO significa «sin cupones». */
  estado: EstadoLectura;
  leidoEn: string;
  /** Zona del restaurante: las fechas del cupón son días de SU calendario. */
  timezone: string;
}

const TONO: Record<EstadoCupon, string | undefined> = {
  vigente: 'ok', programado: 'info', pausado: undefined, agotado: 'aviso', vencido: 'mal',
};

/** Q50 si es entero, Q12.50 si no. */
const q = (n: number) => fmtMoney(n, 'GTQ', Number.isInteger(n) ? 0 : 2);
const beneficio = (tipo: string, valor: number) => (tipo === 'PERCENT' ? `${valor} %` : q(valor));
const usos = (n: number, max: number | null) => (max ? `${n} de ${max} usos` : n === 0 ? 'sin usos' : n === 1 ? '1 uso' : `${n} usos`);

/** Ya pasó su último día (aunque esté en pausa, que `estadoDelCupon` pone primero). */
function yaVencio(c: Coupon) {
  return !!c.valid_until && Date.parse(c.valid_until) <= Date.now();
}

/** «4 abr 2027», sin el año si es el de hoy: la fila del teléfono es angosta. */
function fechaCorta(fecha: string) {
  return fechaLegible(fecha).replace(` ${new Date().getFullYear()}`, '');
}

function metaDeFila(c: Coupon, estado: EstadoCupon, tz: string) {
  const partes = [beneficio(c.discount_type, Number(c.discount_value)) + (c.min_order ? ` desde ${q(Number(c.min_order))}` : '')];
  if (estado === 'programado' && c.valid_from) partes.push(`empieza el ${fechaCorta(fechaDeInicio(c.valid_from, tz))}`);
  else if (yaVencio(c) && c.valid_until) partes.push(`venció el ${fechaCorta(fechaDeFin(c.valid_until, tz))}`);
  else if (estado === 'pausado') { /* la fecha no importa mientras esté en pausa */ }
  else if (c.valid_until) partes.push(`hasta el ${fechaCorta(fechaDeFin(c.valid_until, tz))}`);
  else partes.push('sin fin');
  partes.push(usos(c.uses, c.max_uses));
  return partes.join(' · ');
}

/** Lo que hace el cupón, en una frase (sirve igual para la hoja y el formulario). */
function Frase({ tipo, valor, minimo, maxUsos, desde, hasta, usado, vencido }: {
  tipo: string; valor: number; minimo: number | null; maxUsos: number | null;
  desde: string | null; hasta: string | null; usado?: number; vencido?: boolean;
}) {
  return (
    <p className={s.frase}>
      <b>{tipo === 'PERCENT' ? `${valor || 0} % de descuento` : `${q(valor || 0)} de descuento`}</b>
      {minimo ? <>, en compras desde <b>{q(minimo)}</b></> : ', sin compra mínima'}
      {maxUsos ? <>, para <b>{maxUsos} usos</b></> : ', sin límite de usos'}
      {desde ? <>. Empieza el <b>{fechaLegible(desde)}</b></> : ''}
      {hasta ? <>. {vencido ? 'Valió' : 'Vale'} hasta el <b>{fechaLegible(hasta)}</b> (incluido).</> : desde ? ' y no tiene fecha de fin.' : '. No tiene fecha de fin.'}
      {usado !== undefined && (usado === 0 ? ' Nadie lo ha usado todavía.' : <> Usado <b>{usado === 1 ? '1 vez' : `${usado} veces`}</b>.</>)}
    </p>
  );
}

export default function CuponesPanel({ restaurantId, coupons, estado, leidoEn, timezone }: Props) {
  const { add: toast } = useToastManager();
  const { confirm, dialog } = useConfirm();
  const [abierto, setAbierto] = useState<string | null>(null);
  const [editando, setEditando] = useState<Coupon | 'nuevo' | null>(null);

  const filas = useMemo(() => coupons.map((c) => ({ c, estado: estadoDelCupon(c) })), [coupons]);
  const enUso = filas.filter((f) => f.estado === 'vigente' || f.estado === 'programado');
  const resto = filas.filter((f) => !(f.estado === 'vigente' || f.estado === 'programado'));
  const usosTotales = enUso.reduce((n, f) => n + (f.c.uses || 0), 0);
  const cupon = abierto ? coupons.find((c) => c.id === abierto) ?? null : null;

  function hecho(titulo: string) { toast({ title: titulo, type: 'success' }); }

  async function eliminar(c: Coupon) {
    setAbierto(null);
    if (!(await confirm({
      title: `¿Eliminar ${c.code}?`,
      description: 'Quien lo tenga ya no podrá usarlo. No se puede deshacer.',
      confirmLabel: 'Eliminar',
      destructive: true,
    }))) return;
    const r = await deleteCoupon(restaurantId, c.id);
    if (r.error) toast({ title: r.error, type: 'error' }); else hecho(`${c.code} eliminado`);
  }

  const vacio = coupons.length === 0;

  return (
    <div className={s.panel}>
      {dialog}
      <AvisoLectura
        estado={estado}
        que="tus cupones"
        noConcluir="No significa que no tengas cupones."
        leidoEn={leidoEn}
        sinDatos={vacio}
      />

      {vacio ? (estado === 'error' ? null : (
        <EmptyState
          icon="ticket"
          title="Aún no tienes cupones"
          desc="Crea un código de descuento para que tus clientes lo usen al pedir."
          action={{ label: 'Crear el primero', onClick: () => setEditando('nuevo') }}
        />
      )) : (
        <>
          <div className={s.mandos}>
            <p className={s.linea}>
              <b>{enUso.length} en uso</b>
              {usosTotales > 0 && <> · usados {usosTotales === 1 ? '1 vez' : `${usosTotales} veces`}</>}
            </p>
            <button type="button" className={s.anotar} onClick={() => setEditando('nuevo')}>
              <Icon name="plus" size={18} /> Nuevo cupón
            </button>
          </div>

          {enUso.length > 0 && <Grupo titulo="En uso" filas={enUso} timezone={timezone} onAbrir={setAbierto} />}
          {resto.length > 0 && <Grupo titulo="Sin usar ahora" filas={resto} timezone={timezone} onAbrir={setAbierto} apagada />}
        </>
      )}

      {cupon && (
        <HojaCupon
          restaurantId={restaurantId}
          cupon={cupon}
          timezone={timezone}
          onClose={() => setAbierto(null)}
          onCambiar={() => { setAbierto(null); setEditando(cupon); }}
          onEliminar={() => eliminar(cupon)}
          onHecho={(t) => { setAbierto(null); hecho(t); }}
        />
      )}
      {editando && (
        <HojaFormulario
          restaurantId={restaurantId}
          cupon={editando === 'nuevo' ? null : editando}
          timezone={timezone}
          onClose={() => setEditando(null)}
          onHecho={(t) => { setEditando(null); hecho(t); }}
        />
      )}
    </div>
  );
}

function Grupo({ titulo, filas, timezone, onAbrir, apagada }: {
  titulo: string; filas: { c: Coupon; estado: EstadoCupon }[]; timezone: string;
  onAbrir: (id: string) => void; apagada?: boolean;
}) {
  return (
    <>
      <h2 className={s.grupo}>{titulo}</h2>
      <ul className={`${s.tarjeta} ${s.lista}`}>
        {filas.map(({ c, estado }) => (
          <li key={c.id} className={apagada ? s.apagada : undefined}>
            <button type="button" className={s.abrir} onClick={() => onAbrir(c.id)} aria-label={`${c.code}, ${NOMBRE_ESTADO[estado]}. Ver el cupón`}>
              <span className={s.filaTexto}>
                <b className={s.codigo}>{c.code}</b>
                <span>{metaDeFila(c, estado, timezone)}</span>
              </span>
              <span className={s.chip} data-tono={TONO[estado]}>{NOMBRE_ESTADO[estado]}</span>
              <Icon name="chevronRight" size={16} className={s.chevron} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── Hoja de un cupón ─────────────────────────────────────────── */
function HojaCupon({ restaurantId, cupon, timezone, onClose, onCambiar, onEliminar, onHecho }: {
  restaurantId: string; cupon: Coupon; timezone: string;
  onClose: () => void; onCambiar: () => void; onEliminar: () => void; onHecho: (t: string) => void;
}) {
  const [pendiente, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const estado = estadoDelCupon(cupon);
  /* Un cupón en pausa también puede haber vencido: reanudarlo no bastaría. */
  const vencio = yaVencio(cupon);
  const seAgoto = cupon.max_uses != null && cupon.uses >= cupon.max_uses;
  const terminado = vencio || seAgoto;

  function alternar() {
    setError(null);
    start(async () => {
      const r = await toggleCoupon(restaurantId, cupon.id, !cupon.is_active);
      if (r.error) { setError(r.error); return; }
      onHecho(cupon.is_active ? `${cupon.code} en pausa` : `${cupon.code} se puede usar otra vez`);
    });
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(cupon.code); setCopiado(true); } catch { setError('No se pudo copiar. Escríbelo a mano.'); }
  }

  const pie = terminado
    ? <Button type="button" size="action" className="w-full" onClick={onCambiar}>{vencio ? 'Cambiar la fecha' : 'Cambiar el límite de usos'}</Button>
    : cupon.is_active
      ? <Button type="button" size="action" variant="outline" className="w-full" disabled={pendiente} onClick={alternar}>{pendiente ? 'Pausando…' : 'Pausar el cupón'}</Button>
      : <Button type="button" size="action" className="w-full" disabled={pendiente} onClick={alternar}>{pendiente ? 'Guardando…' : 'Reanudar el cupón'}</Button>;

  return (
    <HojaOperativa
      label={`Cupón ${cupon.code}`}
      title={cupon.code}
      className="hoja-fidelidad"
      resumen={cupon.description ? <p className={s.hojaResumen}>{cupon.description}</p> : undefined}
      onClose={onClose}
      footer={pie}
    >
      <div className={s.hojaCuerpo}>
        <Frase
          tipo={cupon.discount_type}
          valor={Number(cupon.discount_value)}
          minimo={cupon.min_order != null ? Number(cupon.min_order) : null}
          maxUsos={cupon.max_uses}
          desde={estado === 'programado' && cupon.valid_from ? fechaDeInicio(cupon.valid_from, timezone) : null}
          hasta={cupon.valid_until ? fechaDeFin(cupon.valid_until, timezone) : null}
          usado={cupon.uses}
          vencido={vencio}
        />
        {estado !== 'vigente' && (
          <p className={s.hojaResumen}>
            <span className={s.chip} data-tono={TONO[estado]}>{NOMBRE_ESTADO[estado]}</span>{' '}
            {estado === 'pausado' && vencio ? 'Está en pausa y ya pasó su fecha.'
              : estado === 'pausado' ? 'Nadie lo puede usar hasta que lo reanudes.'
              : estado === 'programado' ? 'Todavía no se puede usar.'
              : estado === 'vencido' ? 'Ya pasó su fecha: nadie lo puede usar.'
              : 'Llegó a su límite de usos.'}
          </p>
        )}
        {error && <p role="alert" className={s.error}>{error}</p>}
        <ul className={s.opciones}>
          {!terminado && (
            <li><button type="button" className={s.opcion} onClick={onCambiar}><Icon name="edit" size={16} /><span>Cambiar el cupón</span></button></li>
          )}
          {terminado && (
            <li><button type="button" className={s.opcion} disabled={pendiente} onClick={alternar}><span>{cupon.is_active ? 'Pausar el cupón' : 'Reanudar el cupón'}</span></button></li>
          )}
          <li>
            <button type="button" className={s.opcion} onClick={copiar}>
              <span>{copiado ? 'Código copiado' : 'Copiar el código'}</span>
            </button>
          </li>
          <li>
            <button type="button" className={s.opcion} data-tono="peligro" disabled={cupon.uses > 0} onClick={onEliminar}>
              <Icon name="trash" size={16} /><span>Eliminar</span>
              {cupon.uses > 0 && <em>{cupon.is_active ? 'ya se usó: páusalo' : 'ya se usó'}</em>}
            </button>
          </li>
        </ul>
      </div>
    </HojaOperativa>
  );
}

/* ── Nuevo cupón o cambiarlo: código, descuento y hasta cuándo ──── */
function HojaFormulario({ restaurantId, cupon, timezone, onClose, onHecho }: {
  restaurantId: string; cupon: Coupon | null; timezone: string;
  onClose: () => void; onHecho: (t: string) => void;
}) {
  const [codigo, setCodigo] = useState(cupon?.code ?? '');
  const [tipo, setTipo] = useState<'PERCENT' | 'FIXED'>(cupon?.discount_type ?? 'PERCENT');
  const [valor, setValor] = useState(cupon ? String(cupon.discount_value) : '');
  const [hasta, setHasta] = useState(cupon?.valid_until ? fechaDeFin(cupon.valid_until, timezone) : '');
  const [conFecha, setConFecha] = useState(!!cupon?.valid_until);
  const [minimo, setMinimo] = useState(cupon?.min_order != null ? String(cupon.min_order) : '');
  const [maxUsos, setMaxUsos] = useState(cupon?.max_uses != null ? String(cupon.max_uses) : '');
  const [desde, setDesde] = useState(cupon?.valid_from ? fechaDeInicio(cupon.valid_from, timezone) : '');
  const [nota, setNota] = useState(cupon?.description ?? '');
  const [verCondiciones, setVerCondiciones] = useState(!!(cupon?.min_order || cupon?.max_uses || cupon?.valid_from));
  const [verNota, setVerNota] = useState(!!cupon?.description);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, start] = useTransition();

  const n = parseFloat(valor);
  const fin = conFecha ? hasta : '';
  const valido = /^[A-Z0-9_-]{3,20}$/.test(codigo) && n > 0 && (tipo === 'FIXED' || n <= 100) && (!conFecha || !!hasta);

  function guardar() {
    if (!valido) return;
    setError(null);
    start(async () => {
      const datos = {
        code: codigo,
        description: nota.trim() || undefined,
        discount_type: tipo,
        discount_value: n,
        min_order: minimo ? parseFloat(minimo) : undefined,
        max_uses: maxUsos ? parseInt(maxUsos, 10) : undefined,
        valid_from: desde || null,
        valid_until: fin || null,
      };
      const r = cupon ? await updateCoupon(restaurantId, cupon.id, datos) : await createCoupon(restaurantId, datos);
      if (r.error) { setError(r.error); return; }
      onHecho(cupon ? `${codigo} guardado` : `${codigo} creado`);
    });
  }

  return (
    <HojaOperativa
      label={cupon ? `Cambiar ${cupon.code}` : 'Nuevo cupón'}
      className="hoja-fidelidad"
      onClose={onClose}
      footer={(
        <Button type="button" size="action" className="w-full" disabled={!valido || pendiente} onClick={guardar}>
          {pendiente ? 'Guardando…' : cupon ? 'Guardar cambios' : `Crear ${codigo || 'cupón'}`}
        </Button>
      )}
    >
      <div className={s.hojaCuerpo}>
        <label className={s.campo}>
          Código
          <input className="adm-field" value={codigo} maxLength={20} autoCapitalize="characters" placeholder="NAVIDAD15"
            onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))} />
          {codigo.length > 0 && codigo.length < 3 && <small>Al menos 3 letras o números.</small>}
        </label>

        <div className={s.campo}>
          <span id="cupon-descuento">Descuento</span>
          <div className={s.dos}>
            <div className={s.modos} role="group" aria-labelledby="cupon-descuento">
              <button type="button" className={s.modo} aria-pressed={tipo === 'PERCENT'} aria-label="Porcentaje" onClick={() => setTipo('PERCENT')}>%</button>
              <button type="button" className={s.modo} aria-pressed={tipo === 'FIXED'} aria-label="Quetzales" onClick={() => setTipo('FIXED')}>Q</button>
            </div>
            <input className="adm-field tabular-nums" style={{ textAlign: 'right' }} inputMode="decimal" aria-label={tipo === 'PERCENT' ? 'Porcentaje de descuento' : 'Quetzales de descuento'}
              placeholder={tipo === 'PERCENT' ? '15' : '25'} value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.]/g, ''))} />
          </div>
          {tipo === 'PERCENT' && n > 100 && <small style={{ color: 'var(--c-danger)' }}>Como mucho 100 %.</small>}
        </div>

        <div className={s.campo}>
          <span id="cupon-hasta">Vale hasta</span>
          <div className={s.modos} role="group" aria-labelledby="cupon-hasta">
            <button type="button" className={s.modo} aria-pressed={!conFecha} onClick={() => setConFecha(false)}>Sin fin</button>
            <button type="button" className={s.modo} aria-pressed={conFecha} onClick={() => setConFecha(true)}>Elegir fecha</button>
          </div>
          {conFecha && (
            <input className="adm-field" type="date" aria-label="Último día en que vale (incluido)" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          )}
        </div>

        {verCondiciones ? (
          <>
            <div className={s.dos}>
              <label className={s.campo}>Compra mínima (Q)
                <input className="adm-field tabular-nums" inputMode="decimal" placeholder="Sin mínimo" value={minimo} onChange={(e) => setMinimo(e.target.value.replace(/[^\d.]/g, ''))} />
              </label>
              <label className={s.campo}>Límite de usos
                <input className="adm-field tabular-nums" inputMode="numeric" placeholder="Sin límite" value={maxUsos} onChange={(e) => setMaxUsos(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
            <label className={s.campo}><span>Empieza el <small>· vacío, desde hoy</small></span>
              <input className="adm-field" type="date" value={desde} max={fin || undefined} onChange={(e) => setDesde(e.target.value)} />
            </label>
          </>
        ) : (
          <button type="button" className={s.agregar} onClick={() => setVerCondiciones(true)}>+ Compra mínima, límite de usos o inicio</button>
        )}

        {verNota ? (
          <label className={s.campo}><span>Nota para ti <small>· tus clientes no la ven</small></span>
            <input className="adm-field" maxLength={120} value={nota} placeholder="Ej.: campaña de Navidad" onChange={(e) => setNota(e.target.value)} />
          </label>
        ) : (
          <button type="button" className={s.agregar} onClick={() => setVerNota(true)}>+ Agregar una nota</button>
        )}

        <Frase
          tipo={tipo}
          valor={Number.isFinite(n) ? n : 0}
          minimo={minimo ? parseFloat(minimo) : null}
          maxUsos={maxUsos ? parseInt(maxUsos, 10) : null}
          desde={desde || null}
          hasta={fin || null}
        />
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
    </HojaOperativa>
  );
}
