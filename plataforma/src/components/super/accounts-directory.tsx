'use client';

/* Directorio de CUENTAS del Super Admin: la lista que faltaba.
   ------------------------------------------------------------
   El resto del panel entra por el restaurante. Esto entra por la persona,
   que es como llega el problema: alguien escribe por WhatsApp con su
   nombre y su correo, y hasta ahora no había dónde escribirlo.

   Filtra en el cliente, igual que el directorio de restaurantes: `profiles`
   son las personas que TRABAJAN en la plataforma —dueños y personal—, no
   los comensales, así que son pocas y caben de una vez.

   Dos decisiones que no son de estilo:

   · Las credenciales de PIN del local (`usuario@slug`) vienen ESCONDIDAS.
     Son cuentas de Auth reales y son las más numerosas de todas —una por
     turno, por local—, así que mezcladas tapan a las personas que se
     buscan aquí. Se enseñan con un interruptor, y el interruptor dice
     cuántas hay para que nadie piense que se perdieron.

   · La fila entera lleva a la ficha de la persona (fase 2), y los locales
     que salen dentro son texto, no enlaces: un enlace dentro de otro no
     es HTML válido, y los locales ya son enlaces de verdad en la ficha. */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/icons';
import { EmptyState } from '@/components/super/ui';

export type DirectoryLocal = {
  restaurantId: string;
  name: string;
  slug: string;
  role: string;
  legacy: boolean;
};

export type AccountDirectoryRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
  providers: string[];
  esPin: boolean;
  verificado: boolean;
  suspendida: boolean;
  createdAt: string | null;
  lastSignInAt: string | null;
  locales: DirectoryLocal[];
  sinLocal: boolean;
  huerfana: boolean;
};

type Filtro = 'all' | 'sinLocal' | 'huerfanas' | 'sinVerificar';
type SortKey = 'recent' | 'name' | 'lastSeen';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'recent',   label: 'Recientes' },
  { key: 'name',     label: 'Nombre' },
  { key: 'lastSeen', label: 'Último acceso' },
];

/* Los tres filtros, dichos una sola vez: el contador del chip y la lista
   que sale al pulsarlo tienen que ser exactamente la misma pregunta. */

/** Dejó el registro a medias: tiene cuenta y nunca creó su restaurante. */
const esSinLocal = (r: AccountDirectoryRow) => r.sinLocal && !r.huerfana;

/** Su restaurante se borró debajo. Sigue pudiendo entrar y no tiene a dónde. */
const esHuerfana = (r: AccountDirectoryRow) => r.huerfana;

/**
 * Nunca abrió el enlace de confirmación.
 *
 * Las credenciales de PIN quedan fuera —igual que no llevan la etiqueta en
 * su tarjeta—: su correo es inventado y no existe ningún buzón que
 * verificar, así que contarlas aquí sería inflar el número justo con las
 * cuentas a las que este problema no les puede pasar.
 */
const esSinVerificar = (r: AccountDirectoryRow) => !r.verificado && !r.esPin;

const ROL_LOCAL: Record<string, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Gerente',
  STAFF: 'Personal',
  WAITER: 'Mesero',
};

export default function AccountsDirectory({ rows }: { rows: AccountDirectoryRow[] }) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('all');
  const [sort, setSort] = useState<SortKey>('recent');
  const [verPin, setVerPin] = useState(false);
  /* 20 a la vista y «Ver más»: eran 30 tarjetas altas de golpe, sin
     paginar (auditoría 2026-10-02, SUP-08). Al cambiar filtro o búsqueda se
     vuelve a 20. */
  const [limite, setLimite] = useState(20);
  useEffect(() => { setLimite(20); }, [filtro, sort, verPin]);

  const pins = useMemo(() => rows.filter((r) => r.esPin), [rows]);
  const base = useMemo(() => (verPin ? rows : rows.filter((r) => !r.esPin)), [rows, verPin]);

  // Los contadores se sacan de lo mismo que se va a filtrar, no del total:
  // si el chip dice 30 y al pulsarlo salen 35, el número deja de servir
  // para nada. Por eso dependen de `base` y no de `rows`.
  const cuenta = useMemo(
    () => ({
      sinLocal: base.filter(esSinLocal).length,
      huerfanas: base.filter(esHuerfana).length,
      sinVerificar: base.filter(esSinVerificar).length,
    }),
    [base],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = base.filter((r) => {
      if (filtro === 'sinLocal' && !esSinLocal(r)) return false;
      if (filtro === 'huerfanas' && !esHuerfana(r)) return false;
      if (filtro === 'sinVerificar' && !esSinVerificar(r)) return false;
      if (needle) {
        const heno = `${r.email ?? ''} ${r.fullName ?? ''} ${r.locales.map((l) => l.name).join(' ')}`.toLowerCase();
        if (!heno.includes(needle)) return false;
      }
      return true;
    });
    switch (sort) {
      case 'name':
        out.sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es'));
        break;
      case 'lastSeen':
        // Quien nunca ha entrado va al final, no al principio: un null no
        // es «hace muchísimo», es «todavía no».
        out.sort((a, b) => (b.lastSignInAt ?? '').localeCompare(a.lastSignInAt ?? ''));
        break;
      default:
        out.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
    return out;
  }, [base, q, filtro, sort]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Búsqueda + orden */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* El buscador del panel (`.adm-search`, D-8): tocar la lupa también enfoca. */}
        <label className="adm-search" style={{ flex: '1 1 220px', maxWidth: 380 }}>
          <Icon name="search" size={16} aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimite(20); }}
            placeholder="Buscar por correo, nombre o restaurante…"
            aria-label="Buscar cuenta"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por" className="adm-field adm-field-auto">
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>Orden: {s.label}</option>
          ))}
        </select>
      </div>

      {/* Filtros: cada uno es un problema con nombre, no una categoría */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <FilterChip active={filtro === 'all'} onClick={() => setFiltro('all')} label={`Todas · ${base.length}`} />
        <FilterChip
          active={filtro === 'sinLocal'}
          onClick={() => setFiltro(filtro === 'sinLocal' ? 'all' : 'sinLocal')}
          label={`Sin ningún local · ${cuenta.sinLocal}`}
          title="Crearon su cuenta y no llegaron a crear el restaurante. Su correo ya está ocupado."
        />
        <FilterChip
          active={filtro === 'huerfanas'}
          onClick={() => setFiltro(filtro === 'huerfanas' ? 'all' : 'huerfanas')}
          label={`Huérfanas · ${cuenta.huerfanas}`}
          danger={cuenta.huerfanas > 0}
          title="Personal cuyo restaurante se borró. Siguen pudiendo entrar al login y no tienen a dónde ir."
        />
        <FilterChip
          active={filtro === 'sinVerificar'}
          onClick={() => setFiltro(filtro === 'sinVerificar' ? 'all' : 'sinVerificar')}
          label={`Sin verificar · ${cuenta.sinVerificar}`}
          title="Nunca abrieron el enlace de confirmación. Es la explicación más común de «no me llegó el correo»."
        />

        {pins.length > 0 && (
          <>
            <span aria-hidden style={{ width: 1, height: 18, background: 'var(--adm-border-2, var(--u-hair-2))', margin: '0 4px' }} />
            <FilterChip
              active={verPin}
              onClick={() => setVerPin((v) => !v)}
              label={`${verPin ? 'Ocultar' : 'Ver'} accesos por PIN · ${pins.length}`}
              title="Credenciales de turno del local (usuario@slug). No son la cuenta de una persona."
            />
          </>
        )}
      </div>

      {/* Resultados */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={base.length === 0 ? 'Aún no hay cuentas' : 'Sin resultados'}
          body={
            base.length === 0
              ? 'Aquí aparecerá cada persona que cree su cuenta en Leogin, tenga restaurante o no.'
              : 'Prueba con otro término o quita los filtros.'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.slice(0, limite).map((r) => (
            <AccountCard key={r.id} row={r} marcarSinVerificar={filtro === 'sinVerificar'} />
          ))}
          {filtered.length > limite && (
            <button
              type="button"
              onClick={() => setLimite((n) => n + 20)}
              className="press"
              style={{ alignSelf: 'center', marginTop: 6, padding: '9px 18px', borderRadius: 'var(--radius-full)', cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'var(--adm-card, transparent)', color: 'var(--u-text-2)', fontSize: 13, fontWeight: 600 }}
            >
              Ver más ({filtered.length - limite} restantes)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AccountCard({ row, marcarSinVerificar }: { row: AccountDirectoryRow; marcarSinVerificar: boolean }) {
  const nombre = nombreDe(row);
  const conGoogle = row.providers.includes('google');

  return (
    <Card variant="interactive" style={{ padding: 0 }}>
    <Link
      href={`/super/cuentas/${row.id}`}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '13px 16px', textDecoration: 'none' }}
    >
      <span
        aria-hidden
        style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0, display: 'grid', placeItems: 'center',
          background: row.suspendida
            ? 'color-mix(in srgb, var(--c-danger) 14%, transparent)'
            : 'color-mix(in srgb, var(--brand-accent) 14%, transparent)',
          color: row.suspendida ? 'var(--c-danger)' : 'var(--brand-accent-ink)',
          fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15,
        }}
      >
        {nombre.trim().charAt(0).toUpperCase() || '·'}
      </span>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {/* Nombre + lo que hay que saber de un vistazo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--u-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombre}
          </span>
          {row.suspendida && <Badge variant="danger">Suspendida</Badge>}
          {esHuerfana(row) && <Badge variant="danger">Huérfana</Badge>}
          {esSinLocal(row) && <Badge variant="warn">Sin ningún local</Badge>}
          {/* Casi todas lo tenían: como insignia fija era ruido. Para eso
              está el filtro «Sin verificar»; con él puesto, sí se marca. */}
          {marcarSinVerificar && esSinVerificar(row) && <Badge variant="warn">Correo sin verificar</Badge>}
          {row.role === 'SUPER_ADMIN' && <Badge variant="accent">Super admin</Badge>}
          {row.esPin && <Badge variant="neutral">Acceso por PIN</Badge>}
        </div>

        {/* Correo + cómo entra + cuándo entró */}
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--u-text-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--ui-font-mono)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.email ?? 'sin correo'}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Icon name={conGoogle ? 'globe' : 'key'} size={12} />
            {comoEntra(row.providers)}
          </span>
          <span className="hide-mobile">{ultimoAcceso(row.lastSignInAt)}</span>
        </div>

        {/* Sus locales: la pregunta que la ficha del restaurante no contesta */}
        {row.locales.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
            {row.locales.map((l) => (
              <span
                key={l.restaurantId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 'var(--radius-full)', fontSize: 11, fontWeight: 600,
                  color: 'var(--u-text-3)',
                  background: 'var(--adm-card, color-mix(in srgb, var(--u-text) 5%, transparent))',
                  border: '1px solid var(--adm-border, var(--u-hair))',
                }}
              >
                {l.name}
                <span style={{ color: 'var(--u-text-4)', fontWeight: 500 }}>· {ROL_LOCAL[l.role] ?? l.role}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0, alignSelf: 'center' }} />
    </Link>
    </Card>
  );
}

function FilterChip({ label, active, onClick, danger, title }: {
  label: string; active: boolean; onClick: () => void; danger?: boolean; title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      /* El `title` SOLO —que es lo que había— se convierte en el nombre
         accesible del botón y tapa al de verdad: un lector de pantalla leía
         «Personal cuyo restaurante se borró…» y nunca decía ni el filtro ni
         cuántos hay. Se dicen los dos, y en ese orden. */
      aria-label={title ? `${label}. ${title}` : undefined}
      className="press"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: active
          ? (danger ? 'color-mix(in srgb, var(--c-danger) 14%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 14%, transparent)')
          : 'var(--adm-card, color-mix(in srgb, var(--u-text) 5%, transparent))',
        color: active ? (danger ? 'var(--c-danger)' : 'var(--brand-accent)') : 'var(--u-text-3)',
        border: `1px solid ${active
          ? (danger ? 'color-mix(in srgb, var(--c-danger) 30%, transparent)' : 'color-mix(in srgb, var(--brand-accent) 30%, transparent)')
          : 'var(--adm-border, var(--u-hair))'}`,
        transition: 'all 140ms',
      }}
    >
      {label}
    </button>
  );
}


/** Nombre para enseñar: el suyo, o la parte del correo antes de la arroba. */
function nombreDe(r: AccountDirectoryRow): string {
  if (r.fullName?.trim()) return r.fullName.trim();
  const email = r.email ?? '';
  return email.split('@')[0] || 'Sin nombre';
}

function comoEntra(providers: string[]): string {
  const google = providers.includes('google');
  const clave = providers.includes('email');
  if (google && clave) return 'Google y contraseña';
  if (google) return 'Google';
  if (clave) return 'Contraseña';
  return 'sin identidad';
}

/** «hace 3 días» — lo justo para separar a un cliente vivo de una cuenta muerta. */
function ultimoAcceso(iso: string | null): string {
  if (!iso) return 'nunca ha entrado';
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return 'entró hoy';
  if (dias === 1) return 'entró ayer';
  if (dias < 30) return `entró hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `entró hace ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
}
