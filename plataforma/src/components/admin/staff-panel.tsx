'use client';

/* StaffPanel — personal y permisos POR TRABAJO (auditoría 1.7: E12, N18, R35, C05).
   Maqueta aprobada: docs/diseno/MAQUETA_PERMISOS_POR_TRABAJO_2026-11-08.html

   Cada persona tiene un PUESTO (plantilla: Mesero, Cocina, Caja, Recepción,
   Reparto, Encargado) que rellena sus tareas; lo que el dueño añade o quita
   encima se enseña como EXCEPCIÓN. Las tareas van agrupadas por área y
   dichas con palabras de trabajo, y «Así verá el panel» se calcula con la
   misma regla que arma el panel real (`buildNav` + `can`). El servidor lo
   vuelve a comprobar todo: esta pantalla solo evita ofrecer lo que se iba a
   rechazar. */

import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Section } from '@/components/ui/section';
import { List, ListButton, ListRow } from '@/components/ui/list';
import { EmptyState } from '@/components/ui/empty-state';
import { buildNav, type NavContext } from '@/lib/admin-nav';
import {
  AREAS, PUESTOS, PUESTO_LABEL, excepciones, fueraDelTecho, permisosDePuesto, puestoQueCoincide,
  tareasDelicadas, etiquetaDeTarea, type PuestoKey,
} from '@/lib/permisos-trabajo';
import {
  createStaff, updateStaffPermissions, removeStaff, resetStaffPassword, setArqueoCiego,
  type StaffState, type StaffMember, type ActivityRow,
} from '@/lib/actions/staff';
import { setStaffPin, type StaffPinState } from '@/lib/actions/staff-pin';
import { staffLoginHandle } from '@/lib/staff-email';
import { haceTiempo } from '@/lib/dates';
import { describirActividad } from '@/lib/activity-labels';
import { FIELD_LABEL } from '@/components/admin/field-label';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useReauth } from '@/components/auth/reauth';
import { useToastManager } from '@/components/ui/toast';
import s from './staff-panel.module.css';

/** Cuántas filas de la bitácora se ven antes de «Ver toda la actividad». */
const ACTIVIDAD_VISIBLE = 10;

/** Lo que el panel necesita para calcular «Así verá el panel» sin el rol. */
export type NavBase = Omit<NavContext, 'role' | 'permissions' | 'showStaff' | 'preview'>;

type Editor = { member: StaffMember | null } | null;

function iniciales(nombre: string | null): string {
  const partes = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
  return (partes.slice(0, 2).map((p) => p[0]).join('') || '·').toUpperCase();
}

function credencial(m: StaffMember, slug: string | null): string {
  if (m.access === 'user') return `Usuario ${staffLoginHandle(m.username ?? '', slug)}`;
  if (m.access === 'email') return m.email ?? 'Con su correo';
  return 'PIN en el local';
}

export default function StaffPanel({
  restaurantId, slug, staff, activity, enabledKeys, isOwner = true, techo, navBase, arqueoCiego,
}: {
  restaurantId: string;
  /** La dirección del restaurante: segunda mitad de la credencial por usuario. */
  slug: string | null;
  staff: StaffMember[];
  activity: ActivityRow[];
  /** Llaves que el restaurante tiene activas: no se ofrecen módulos apagados. */
  enabledKeys: string[];
  /** ¿Lo mira el dueño? Un encargado reparte con techo y sólo por PIN. */
  isOwner?: boolean;
  /** Lo que tiene quien mira, si no es el dueño: su techo al repartir. */
  techo: string[] | null;
  navBase: NavBase;
  arqueoCiego: boolean | null;
}) {
  const [editor, setEditor] = useState<Editor>(null);
  const fichaRef = useRef<HTMLElement>(null);
  const [verTodaActividad, setVerTodaActividad] = useState(false);
  const [actor, setActor] = useState('');
  const actores = [...new Map(
    activity.filter((r) => r.actor_id).map((r) => [r.actor_id as string, r.actor_name || 'Sin nombre']),
  )].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const actividadFiltrada = actor ? activity.filter((r) => r.actor_id === actor) : activity;
  const actividadVisible = verTodaActividad ? actividadFiltrada : actividadFiltrada.slice(0, ACTIVIDAD_VISIBLE);
  const heredados = staff.filter((m) => m.accesoHeredado);

  function abrir(member: StaffMember | null) {
    setEditor({ member });
    // En el teléfono la ficha queda debajo de la lista: se lleva a la vista.
    requestAnimationFrame(() => fichaRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  return (
    <div className={s.layout}>
      <div className={s.columna}>
        <Section
          title="Personal"
          aside={(
            <Button type="button" onClick={() => abrir(null)} size="sm">
              <Icon name="plus" size={14} /> Agregar
            </Button>
          )}
        >
          {heredados.length > 0 && (
            <div className={s.aviso} role="status" style={{ marginBottom: 12 }}>
              <Icon name="alertCircle" size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--c-warn)' }} />
              <div>
                <strong>Revisa {heredados.length === 1 ? '1 acceso heredado' : `${heredados.length} accesos heredados`}</strong>
                <p>
                  {heredados.map((m) => m.full_name || 'Sin nombre').join(', ')}{' '}
                  {heredados.length === 1 ? 'tenía' : 'tenían'} acceso a todo sin que se eligiera. Lo conservamos igual; confirma su trabajo cuando puedas.
                </p>
              </div>
            </div>
          )}

          {staff.length === 0 ? (
            <EmptyState
              icon="users"
              title="Sin personal todavía"
              desc="Agrega a tu equipo eligiendo su trabajo: Mesero, Cocina, Caja, Recepción, Reparto o Encargado. Después puedes ajustar tarea por tarea."
              action={{ label: 'Agregar el primero', onClick: () => abrir(null) }}
            />
          ) : (
            <div className={s.card}>
              <ul className={s.lista}>
                {staff.map((m) => {
                  const ex = excepciones(m.puesto, m.permissions ?? []);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        className={s.persona}
                        aria-current={editor?.member?.id === m.id ? 'true' : undefined}
                        onClick={() => abrir(m)}
                      >
                        <span className={s.avatar} aria-hidden="true">{iniciales(m.full_name)}</span>
                        <span className={s.personaTexto}>
                          <span className={s.nombre}>{m.full_name || 'Miembro del equipo'}</span>
                          <span className={s.chips}>
                            <span className={`${s.chip} ${s.chipPuesto}`}>{m.puesto ? PUESTO_LABEL[m.puesto] : 'A medida'}</span>
                            {ex.añadidos.map((k) => <span key={k} className={`${s.chip} ${s.chipExcepcion}`}>+ {etiquetaDeTarea(k)}</span>)}
                            {ex.quitados.map((k) => <span key={k} className={`${s.chip} ${s.chipExcepcion}`}>− {etiquetaDeTarea(k)}</span>)}
                            {m.accesoHeredado && <span className={`${s.chip} ${s.chipRevisar}`}>Revisar</span>}
                          </span>
                          <span className={s.meta}>{credencial(m, slug)}</span>
                        </span>
                        <Icon name="chevronRight" size={16} style={{ flexShrink: 0, color: 'var(--u-text-3)' }} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </Section>

        {isOwner && arqueoCiego !== null && (
          <ArqueoCiego restaurantId={restaurantId} activo={arqueoCiego} />
        )}
      </div>

      {editor ? (
        <section ref={fichaRef} className={`${s.card} ${s.ficha}`} aria-labelledby="ficha-titulo" style={{ scrollMarginTop: 16 }}>
          <Ficha
            key={editor.member?.id ?? 'nuevo'}
            restaurantId={restaurantId}
            slug={slug}
            member={editor.member}
            enabledKeys={enabledKeys}
            isOwner={isOwner}
            techo={techo}
            navBase={navBase}
            arqueoCiego={arqueoCiego === true}
            onClose={() => setEditor(null)}
          />
        </section>
      ) : (
        <Section
          title="Actividad reciente"
          aside={actores.length > 1 ? (
            <div style={{ width: 130 }}>
              <Select
                aria-label="Filtrar la actividad por persona"
                options={[{ value: '', label: 'Todos' }, ...actores.map(([id, nombre]) => ({ value: id, label: nombre }))]}
                value={actor}
                onValueChange={(v) => { setActor(v); setVerTodaActividad(false); }}
              />
            </div>
          ) : undefined}
        >
          {actividadFiltrada.length === 0 ? (
            <Card className="p-4.5" style={{ fontSize: 13, color: 'var(--u-text-4)' }}>Sin actividad registrada todavía.</Card>
          ) : (
            <List>
              {actividadVisible.map((r) => (
                <ListRow key={r.id}>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-adm-text-2" title={describirActividad(r)}>{describirActividad(r)}</span>
                  <span className="shrink-0 text-[11px] text-adm-text-4">{haceTiempo(r.created_at)}</span>
                </ListRow>
              ))}
              {actividadFiltrada.length > ACTIVIDAD_VISIBLE && (
                <ListButton
                  onClick={() => setVerTodaActividad((v) => !v)}
                  className="gap-2 text-[13px] font-semibold"
                  style={{ color: 'var(--brand-accent-ink, var(--adm-accent-500))' }}
                >
                  {verTodaActividad ? 'Ver menos' : `Ver toda la actividad (${actividadFiltrada.length})`}
                </ListButton>
              )}
            </List>
          )}
        </Section>
      )}
    </div>
  );
}

function ArqueoCiego({ restaurantId, activo }: { restaurantId: string; activo: boolean }) {
  const [on, setOn] = useState(activo);
  const [pendiente, startTransition] = useTransition();
  const toast = useToastManager();
  return (
    <div className={`${s.card} ${s.ajuste}`}>
      <div>
        <strong id="arqueo-ciego">Arqueo ciego</strong>
        <span>Quien no puede «ver cuánto debería haber» cuenta el efectivo sin verlo. La diferencia aparece al cerrar.</span>
      </div>
      <Switch
        aria-labelledby="arqueo-ciego"
        checked={on}
        disabled={pendiente}
        onCheckedChange={(v: boolean) => {
          setOn(v);
          startTransition(async () => {
            const r = await setArqueoCiego(restaurantId, v);
            if (r && 'error' in r) {
              setOn(!v);
              toast.add({ title: r.error, type: 'error' });
            }
          });
        }}
      />
    </div>
  );
}

/** Flechas para moverse dentro de un grupo de opciones (radiogroup). */
function moverConFlechas(e: KeyboardEvent<HTMLDivElement>) {
  const claves = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];
  if (!claves.includes(e.key)) return;
  const opciones = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)')];
  const i = opciones.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const paso = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
  const sig = opciones[(i + paso + opciones.length) % opciones.length];
  sig.focus();
  sig.click();
}

function Ficha({
  restaurantId, slug, member, enabledKeys, isOwner, techo, navBase, arqueoCiego, onClose,
}: {
  restaurantId: string;
  slug: string | null;
  member: StaffMember | null;
  enabledKeys: string[];
  isOwner: boolean;
  techo: string[] | null;
  navBase: NavBase;
  arqueoCiego: boolean;
  onClose: () => void;
}) {
  const isNew = !member;
  const inicialPerms = member?.permissions ?? permisosDePuesto('mesero');
  const [perms, setPerms] = useState<string[]>(inicialPerms);
  const [puesto, setPuesto] = useState<PuestoKey | null>(
    member ? (member.puesto ?? puestoQueCoincide(inicialPerms)) : 'mesero',
  );
  const [nombre, setNombre] = useState(member?.full_name ?? '');
  const [access, setAccess] = useState<'pin' | 'user'>('pin');
  const [username, setUsername] = useState('');
  const abiertasIniciales = useMemo(
    () => new Set(AREAS.filter((a) => a.tareas.some((t) => inicialPerms.includes(t.key))).map((a) => a.key)),
    // Sólo al abrir la ficha: después cada área recuerda si el dueño la abrió.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const createAction = useActionState<StaffState, FormData>(createStaff, null);
  const updateAction = useActionState<StaffState, FormData>(updateStaffPermissions, null);
  const pinAction = useActionState<StaffPinState, FormData>(setStaffPin, null);
  const passAction = useActionState<StaffState, FormData>(resetStaffPassword, null);
  const [removeState, removeAction, removing] = useActionState<StaffState, FormData>(removeStaff, null);
  const [state, formAction, isPending] = isNew ? createAction : updateAction;

  const toast = useToastManager();
  const { confirm, dialog } = useConfirm();
  const { reauthSubmit, dialog: reauthDialog } = useReauth();
  useEffect(() => {
    if (state && 'ok' in state) {
      toast.add({ title: isNew ? 'Persona agregada' : 'Cambios guardados', type: 'success' });
      onClose();
    }
  }, [state, onClose, toast, isNew]);
  useEffect(() => { if (removeState && 'ok' in removeState) onClose(); }, [removeState, onClose]);
  const pinResult = pinAction[0];
  const passResult = passAction[0];
  useEffect(() => { if (pinResult && 'ok' in pinResult) toast.add({ title: 'PIN actualizado', type: 'success' }); }, [pinResult, toast]);
  useEffect(() => {
    if (passResult && 'ok' in passResult) toast.add({ title: 'Contraseña actualizada', description: 'Pásasela a esta persona.', type: 'success' });
  }, [passResult, toast]);

  const ex = excepciones(puesto, perms);
  const nExc = ex.añadidos.length + ex.quitados.length;
  const primerNombre = nombre.trim().split(/\s+/)[0] || (isNew ? 'esta persona' : 'Sin nombre');
  const etiquetaPuesto = puesto ? PUESTO_LABEL[puesto] : 'a medida';
  const fuera = (lista: string[]) => fueraDelTecho(techo, lista);

  function elegirPuesto(k: PuestoKey) {
    setPuesto(k);
    setPerms(permisosDePuesto(k));
  }
  function alternar(k: string, on: boolean) {
    setPerms((prev) => (on ? [...new Set([...prev, k])] : prev.filter((p) => p !== k)));
  }

  return (
    <>
      {dialog}
      {reauthDialog}
      <div className={s.fichaHead}>
        <div style={{ minWidth: 0 }}>
          <h2 id="ficha-titulo">{isNew ? 'Agregar al equipo' : (member.full_name || 'Miembro del equipo')}</h2>
          <p>{PUESTO_LABEL[puesto as PuestoKey] ?? 'A medida'} · entra con {isNew ? (access === 'pin' ? 'PIN' : 'usuario') : credencial(member, slug)}</p>
        </div>
        <Button type="button" variant="secondary" size="icon" onClick={onClose} aria-label="Cerrar la ficha">
          <Icon name="x" size={18} />
        </Button>
      </div>

      <div className={s.fichaCuerpo}>
        <form action={formAction} className={s.form}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          {!isNew && <input type="hidden" name="userId" value={member.id} />}
          {puesto && <input type="hidden" name="puesto" value={puesto} />}
          {perms.map((p) => <input key={p} type="hidden" name="permissions" value={p} />)}

          <div className={s.campo}>
            <label htmlFor="staff-nombre" className={s.etiqueta} style={FIELD_LABEL}>Nombre{isNew && ' *'}</label>
            <input
              id="staff-nombre" name="full_name" required={isNew} value={nombre}
              onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Carlos Méndez" className="adm-field"
            />
          </div>

          <div>
            <h3 className={s.pasoTitulo} id="puesto-titulo">¿Qué trabajo hace?</h3>
            <div className={s.puestos} role="radiogroup" aria-labelledby="puesto-titulo" onKeyDown={moverConFlechas}>
              {PUESTOS.map((p) => {
                const sel = puesto === p.key;
                const bloqueado = fuera(p.permisos).length > 0;
                return (
                  <button
                    key={p.key}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    tabIndex={sel || (!puesto && p.key === 'mesero') ? 0 : -1}
                    disabled={bloqueado}
                    title={bloqueado ? 'Incluye tareas que tú no tienes' : undefined}
                    className={s.puesto}
                    onClick={() => elegirPuesto(p.key)}
                  >
                    <b>{p.label}</b>
                    <span>{p.desc}</span>
                    {sel && <span className={s.marca} aria-hidden="true"><Icon name="check" size={12} strokeWidth={3} style={{ color: 'var(--adm-card)' }} /></span>}
                  </button>
                );
              })}
            </div>
          </div>

          {isNew && (
            <div>
              <h3 className={s.pasoTitulo} id="entra-titulo">¿Cómo entra?</h3>
              <input type="hidden" name="access_type" value={access} />
              <div className={s.entra} role="radiogroup" aria-labelledby="entra-titulo" onKeyDown={moverConFlechas}>
                <button type="button" role="radio" aria-checked={access === 'pin'} tabIndex={access === 'pin' ? 0 : -1} onClick={() => setAccess('pin')}>
                  Con PIN<small>En el aparato del local</small>
                </button>
                <button
                  type="button" role="radio" aria-checked={access === 'user'} tabIndex={access === 'user' ? 0 : -1}
                  disabled={!isOwner} title={!isOwner ? 'Los accesos con usuario los da el dueño' : undefined}
                  onClick={() => setAccess('user')}
                >
                  Con usuario<small>Desde su propio teléfono</small>
                </button>
              </div>

              {access === 'pin' ? (
                <div className={s.campo} style={{ marginTop: 12 }}>
                  <label htmlFor="staff-pin" style={FIELD_LABEL}>PIN de acceso (4 dígitos) *</label>
                  <input
                    id="staff-pin" name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4}
                    required placeholder="1234" autoComplete="off" className="adm-field" style={{ letterSpacing: '0.3em' }}
                  />
                  <p className={s.ayuda}>Entrará desde «¿Quién eres?» en el aparato del local, sin correo ni contraseña.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                  <div className={s.campo}>
                    <label htmlFor="staff-usuario" style={FIELD_LABEL}>Usuario *</label>
                    <input
                      id="staff-usuario" name="username" type="text" required minLength={3} maxLength={24}
                      pattern="[a-z0-9_-]{3,24}" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      placeholder="Ej. carlos" value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase().trim())} className="adm-field"
                    />
                    <p className={s.ayuda}>
                      {username.length >= 3 && slug
                        ? <>Entrará escribiendo <strong style={{ color: 'var(--u-text)' }}>{staffLoginHandle(username, slug)}</strong>.</>
                        : 'Minúsculas, números, guion y guion bajo. Es sólo de tu restaurante.'}
                    </p>
                  </div>
                  <div className={s.campo}>
                    <label htmlFor="staff-clave" style={FIELD_LABEL}>Contraseña (mínimo 8) *</label>
                    <input id="staff-clave" name="password" type="text" minLength={8} required autoComplete="off" placeholder="Ej. Sucursal2026" className="adm-field" />
                    <p className={s.ayuda}>La cambiará por una suya al entrar la primera vez.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <div className={s.tareasHead}>
              <div>
                <h3 className={s.pasoTitulo}>Qué puede hacer</h3>
                <p>{nExc ? `${nExc} ${nExc === 1 ? 'excepción' : 'excepciones'} a la plantilla` : puesto ? 'Igual a la plantilla' : 'Permisos a medida'}</p>
              </div>
              {puesto && nExc > 0 && (
                <Button type="button" variant="secondary" size="sm" onClick={() => setPerms(permisosDePuesto(puesto))}>
                  Restaurar plantilla
                </Button>
              )}
            </div>

            {AREAS.map((area) => {
              const visibles = area.tareas.filter((t) => enabledKeys.includes(t.key) || perms.includes(t.key));
              if (visibles.length === 0) return null;
              const n = visibles.filter((t) => perms.includes(t.key)).length;
              return (
                <details key={area.key} className={s.area} open={abiertasIniciales.has(area.key) || undefined}>
                  <summary>
                    <Icon name="chevronRight" size={16} className={s.flecha} />
                    {area.label}
                    <span className={s.cuenta}>{n ? `${n} de ${visibles.length}` : 'Sin acceso'}</span>
                  </summary>
                  <div className={s.tareas}>
                    {visibles.map((t) => {
                      const on = perms.includes(t.key);
                      const base = puesto ? permisosDePuesto(puesto).includes(t.key) : on;
                      const esExc = !!puesto && on !== base;
                      const sinTecho = !on && fuera([t.key]).length > 0;
                      const id = `tarea-${t.key.replace('.', '-')}`;
                      return (
                        <div key={t.key} className={s.tarea}>
                          <div>
                            <span id={id} className={s.tareaNombre}>{t.label}</span>
                            {t.ayuda && <span className={s.detalle}>{t.ayuda}</span>}
                            {(t.delicada || esExc) && (
                              <span className={s.chips}>
                                {t.delicada && <span className={`${s.chip} ${s.chipDelicada}`}>Delicada</span>}
                                {esExc && <span className={`${s.chip} ${s.chipExcepcion}`}>{on ? 'Añadida' : 'Quitada'} · excepción</span>}
                              </span>
                            )}
                          </div>
                          {/* Nombrado con aria-labelledby y no con <label htmlFor>: la
                              casilla oculta del interruptor queda fijada arriba de la
                              ficha (container-type) y enfocarla movía la página. */}
                          <Switch aria-labelledby={id} checked={on} disabled={sinTecho} onCheckedChange={(v: boolean) => alternar(t.key, v)} />
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

          <div className={s.pie}>
            {state && 'error' in state && <p className={s.error} role="alert">{state.error}</p>}
            <p>Los cambios surten efecto en su siguiente acción.</p>
            <Button type="submit" size="action" className="w-full" disabled={isPending || perms.length === 0}>
              {isPending ? 'Guardando…' : `${isNew ? 'Agregar' : 'Guardar'} a ${primerNombre} como ${etiquetaPuesto}`}
            </Button>
          </div>
        </form>

        <div className={s.vistaLateral}>
          <VistaDelPanel nombre={primerNombre} perms={perms} navBase={navBase} arqueoCiego={arqueoCiego} />
        </div>
      </div>

      {!isNew && (
        <div className={s.extras}>
          {member.access === 'pin' && (
            <>
              <form action={pinAction[1]} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="userId" value={member.id} />
                <div style={{ flex: 1 }}>
                  <label htmlFor="staff-nuevo-pin" style={FIELD_LABEL}>Cambiar PIN</label>
                  <input id="staff-nuevo-pin" name="pin" type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="1234" autoComplete="off" className="adm-field" style={{ letterSpacing: '0.3em' }} />
                </div>
                <Button type="submit" variant="secondary" size="touch" className="whitespace-nowrap">Cambiar</Button>
              </form>
              {pinAction[0] && 'error' in pinAction[0] && <p className={s.error} style={{ textAlign: 'left' }}>{pinAction[0].error}</p>}
            </>
          )}

          {isOwner && member.access === 'user' && (
            <>
              <form action={passAction[1]} onSubmit={reauthSubmit()} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <input type="hidden" name="restaurantId" value={restaurantId} />
                <input type="hidden" name="userId" value={member.id} />
                <div style={{ flex: 1 }}>
                  <label htmlFor="staff-nueva-clave" style={FIELD_LABEL}>Nueva contraseña de {staffLoginHandle(member.username ?? '', slug)}</label>
                  <input id="staff-nueva-clave" name="password" type="text" minLength={8} autoComplete="off" placeholder="Mínimo 8 caracteres" className="adm-field" />
                </div>
                <Button type="submit" variant="secondary" size="touch" className="whitespace-nowrap">Cambiar</Button>
              </form>
              {passAction[0] && 'error' in passAction[0] && <p className={s.error} style={{ textAlign: 'left' }}>{passAction[0].error}</p>}
            </>
          )}

          <form
            action={removeAction}
            onSubmit={reauthSubmit(() => confirm({
              title: `¿Quitar a ${primerNombre} del equipo?`,
              description: 'Pierde el acceso al panel desde su siguiente acción. Lo que ya hizo queda en la bitácora.',
              confirmLabel: 'Quitar',
            }))}
          >
            <input type="hidden" name="restaurantId" value={restaurantId} />
            <input type="hidden" name="userId" value={member.id} />
            <Button type="submit" variant="destructive" size="touch" className="w-full" disabled={removing}>
              {removing ? 'Quitando…' : 'Quitar del equipo'}
            </Button>
            {removeState && 'error' in removeState && <p className={s.error} role="alert" style={{ marginTop: 8 }}>{removeState.error}</p>}
          </form>
        </div>
      )}
    </>
  );
}

/** «Así verá el panel»: la misma regla del panel real, con la lista que se está editando. */
function VistaDelPanel({ nombre, perms, navBase, arqueoCiego }: {
  nombre: string;
  perms: string[];
  navBase: NavBase;
  arqueoCiego: boolean;
}) {
  const grupos = useMemo(() => {
    const ctx: NavContext = { ...navBase, role: 'RESTAURANT_STAFF', permissions: perms, showStaff: perms.includes('personal'), preview: false };
    const visibles = new Map(buildNav(ctx).map((g) => [g.key, g.items.filter((i) => !i.locked).map((i) => i.label)]));
    const todos = buildNav({ ...ctx, role: 'RESTAURANT_OWNER', permissions: null, showStaff: true });
    return todos.map((g) => ({ key: g.key, label: g.label, items: visibles.get(g.key) ?? null }));
  }, [navBase, perms]);
  const reparto = perms.includes('reparto');
  const tareas = AREAS.flatMap((a) => a.tareas);
  const puede = tareas.filter((t) => perms.includes(t.key)).map((t) => t.label);
  const noPuede = tareas.filter((t) => !perms.includes(t.key)).map((t) => t.label);
  const delicadas = tareasDelicadas(perms);
  const ciegas = arqueoCiego && perms.includes('caja.cerrar') && !perms.includes('caja.ver_esperado');

  return (
    <div className={s.vista} aria-labelledby="vista-titulo">
      <h3 id="vista-titulo">Así verá {nombre} el panel</h3>
      <p>Se calcula con la misma regla que usa el servidor.</p>
      <ul className={s.grupos} aria-label="Destinos que verá">
        {grupos.map((g) => (
          <li key={g.key} data-off={g.items === null ? '' : undefined}>
            <b>{g.label}</b>
            <span>{g.items === null ? 'No lo verá' : g.key === 'hoy' ? 'Inicio del turno' : g.items.join(' · ')}</span>
          </li>
        ))}
        {reparto && <li><b>Reparto</b><span>Pantalla del repartidor, fuera del panel</span></li>}
      </ul>
      <h4>Podrá</h4>
      <ul className={s.puede}>
        {puede.slice(0, 9).map((t) => <li key={t}>{t}</li>)}
        {puede.length > 9 && <li>y {puede.length - 9} más</li>}
        {puede.length === 0 && <li>Nada todavía: elige su trabajo</li>}
      </ul>
      <h4>No podrá</h4>
      <ul className={s.noPuede}>
        {noPuede.slice(0, 6).map((t) => <li key={t}>{t}</li>)}
        {noPuede.length > 6 && <li>y {noPuede.length - 6} más</li>}
        <li>Suscripción, propiedad del local y dueños</li>
      </ul>
      {ciegas && (
        <div className={s.nota}>
          <strong>Contará la caja a ciegas</strong>
          <p>El arqueo ciego está activo y no puede ver cuánto debería haber.</p>
        </div>
      )}
      {delicadas.length > 0 && (
        <div className={s.delicadas}>
          <strong>Acciones delicadas ({delicadas.length})</strong>
          <p>Podrá {delicadas.map((t) => t.label.charAt(0).toLowerCase() + t.label.slice(1)).join(', ')}. Queda en la bitácora con su nombre.</p>
        </div>
      )}
    </div>
  );
}
