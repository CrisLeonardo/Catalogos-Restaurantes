'use client';

/* ============================================================
   PEDIDOS Y COBRO (/admin/ajustes/pedidos)
   ------------------------------------------------------------
   Antes: UNA tarjeta con trece ajustes seguidos —tarjeta, servicio,
   propina, confirmación automática, semáforo de cocina, moneda,
   locale, animaciones— separados por rótulos y con un botón
   "Guardar" al final, todo dentro de un acordeón cerrado llamado
   "Pedidos y moneda". Para cambiar el porcentaje de propina había
   que abrir el acordeón, reconocer el rótulo y recorrer media
   pantalla de cosas que no se buscaban.

   Ahora: grupos con nombre, cada uno una lista de filas
   "etiqueta ─ control", y la explicación DEBAJO del grupo en vez
   de intercalada entre las filas. Es la forma de una pantalla de
   Ajustes: se recorre con la mirada y se sabe qué hay sin leer.

   El botón de guardar es una barra pegada abajo que solo aparece
   cuando hay algo sin guardar; así en el teléfono no hay que
   bajar hasta el final para confirmar un interruptor.
   ============================================================ */

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { List, ListRow, ListText } from '@/components/ui/list';
import { Section, SectionNote } from '@/components/ui/section';
import { Switch } from '@/components/ui/switch';
import { saveOrdersAndCurrency } from '@/lib/actions/restaurant';
import { ServicePreferencesCtl } from '@/components/admin/service-preferences-ctl';
import type { ThemeConfig } from '@/lib/theme/defaults';
import SaveBar, { type SaveStatus } from '@/components/admin/save-bar';
import { useValueDirty } from '@/lib/use-form-dirty';

type Patch = Pick<ThemeConfig,
  'orderTypes' | 'dineInTableCount' | 'dineInCourseOptions' |
  'tipEnabled' | 'tipPercent' | 'tipOrderTypes' | 'acceptsCard' |
  'currencySymbol' | 'currencyPosition' | 'locale' | 'animations' |
  'kdsYellowMin' | 'kdsRedMin' | 'kdsConfirmFirst' |
  'salonReadyMin' | 'salonUnpaidMin' | 'salonUnacceptedMin' |
  'autoConfirmEnabled' | 'autoConfirmMinutes' | 'deliveryFee'
>;

const ORDER_TYPE_LABEL: Record<ThemeConfig['orderTypes'][number], string> = {
  dine_in: 'Comer en local',
  pickup: 'Para llevar',
  delivery: 'Domicilio',
};

interface Props {
  restaurantId: string;
  config: Patch;
}

/** Formatos de número que se ofrecen: el nombre del país y no el código. */
const LOCALES: { value: string; label: string }[] = [
  { value: 'es-GT', label: 'Guatemala' },
  { value: 'es-MX', label: 'México' },
  { value: 'es-SV', label: 'El Salvador' },
  { value: 'es-HN', label: 'Honduras' },
  { value: 'es-CR', label: 'Costa Rica' },
  { value: 'en-US', label: 'Estados Unidos' },
  { value: 'es-ES', label: 'España' },
];

/** «1,234.50» con el formato elegido (o el de Guatemala si el código no vale). */
function ejemploLocale(locale: string): string {
  try { return (1234.5).toLocaleString(locale || 'es-GT', { minimumFractionDigits: 2 }); }
  catch { return (1234.5).toLocaleString('es-GT', { minimumFractionDigits: 2 }); }
}

/** Campo de una fila: corto y a la derecha, donde va el valor. */

/** Fila con interruptor. */
function ToggleRow({ label, desc, value, onChange }: {
  label: string; desc?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <ListRow>
      <ListText title={label} desc={desc} />
      <Switch checked={value} onCheckedChange={onChange} aria-label={label} />
    </ListRow>
  );
}

/** Fila con un número (minutos, porcentaje). */
function NumberRow({ label, desc, value, min, max, suffix, onChange }: {
  label: string; desc?: string; value: number; min: number; max: number;
  suffix?: string; onChange: (v: number) => void;
}) {
  return (
    <ListRow>
      <ListText title={label} desc={desc} />
      <div className="flex shrink-0 items-center gap-2">
        <input
          type="number" inputMode="numeric"
          value={value} min={min} max={max}
          onChange={(e) => {
            const n = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
            onChange(n);
          }}
          aria-label={label}
          className="adm-field adm-field-auto adm-field-mono" style={{ width: 72, textAlign: 'center', padding: '8px 6px' }}
        />
        {suffix && <span className="text-[13px] text-adm-text-3">{suffix}</span>}
      </div>
    </ListRow>
  );
}

function toggleIn<T>(arr: T[], val: T, on: boolean): T[] {
  const has = arr.includes(val);
  if (on && !has) return [...arr, val];
  if (!on && has) return arr.filter((x) => x !== val);
  return arr;
}

export default function OrdersCurrencyEditor({ restaurantId, config: initial }: Props) {
  const [patch, setPatch] = useState<Patch>(initial);
  const [isPending, start] = useTransition();
  const [status, setStatus] = useState<SaveStatus>(null);

  /* "Hay algo sin guardar" se decide comparando contra la foto del último
     guardado y no con una bandera que se enciende al primer toque: quien
     cambia un interruptor y lo devuelve a como estaba no dejó nada
     pendiente, y la barra tiene que irse sola. */
  const { dirty, markSaved } = useValueDirty(patch);

  function set<K extends keyof Patch>(k: K, v: Patch[K]) {
    setPatch((p) => ({ ...p, [k]: v }));
  }

  function save() {
    setStatus(null);
    start(async () => {
      const res = await saveOrdersAndCurrency({ restaurantId, patch });
      if (res.error) { setStatus({ error: res.error }); return; }
      markSaved();
      setStatus({ saved: true });
    });
  }

  const sym = patch.currencySymbol || 'Q';

  return (
    <div className="flex flex-col gap-6 pb-2">
      <Section title="Cobro">
        <List>
          <ToggleRow
            label="Pago con tarjeta"
            value={patch.acceptsCard}
            onChange={(v) => set('acceptsCard', v)}
          />
          <ListRow>
            <ListText title="Símbolo de la moneda" />
            <input
              type="text" value={patch.currencySymbol} aria-label="Símbolo de la moneda"
              onChange={(e) => set('currencySymbol', e.target.value)}
              className="adm-field adm-field-auto adm-field-mono" style={{ width: 72, textAlign: 'center' }}
            />
          </ListRow>
          <ListRow>
            <ListText title="Dónde va el símbolo" />
            <div className="flex shrink-0 gap-1.5">
              {(['prefix', 'suffix'] as const).map((val) => (
                <Button
                  key={val} type="button" size="sm"
                  variant={patch.currencyPosition === val ? 'primary' : 'secondary'}
                  onClick={() => set('currencyPosition', val)}
                  className="rounded-adm-full"
                >
                  {val === 'prefix' ? sym + '10' : '10' + sym}
                </Button>
              ))}
            </div>
          </ListRow>
          {/* La tarifa de envío normal NO se podía configurar en ninguna
              pantalla: existía en la base (`deliveryFee`, 0 por defecto) y un
              restaurante sin zonas entregaba gratis sin saberlo (auditoría
              2026-10-02, AJU-19). Las zonas con su propia tarifa siguen
              mandando sobre esta. */}
          {patch.orderTypes.includes('delivery') && (
            <ListRow>
              <ListText title="Envío a domicilio" desc="Lo que se cobra por llevar un pedido. Si tienes zonas, cada una cobra su tarifa." />
              <div className="flex shrink-0 items-center gap-1.5">
                {patch.currencyPosition !== 'suffix' && <span className="text-[13px] text-adm-text-3">{sym}</span>}
                <input
                  type="number" inputMode="decimal" min={0} max={10000} step="0.5"
                  value={patch.deliveryFee}
                  onChange={(e) => set('deliveryFee', Math.max(0, Math.min(10000, parseFloat(e.target.value) || 0)))}
                  aria-label="Envío a domicilio"
                  className="adm-field adm-field-auto adm-field-mono" style={{ width: 84, textAlign: 'center', padding: '8px 6px' }}
                />
                {patch.currencyPosition === 'suffix' && <span className="text-[13px] text-adm-text-3">{sym}</span>}
              </div>
            </ListRow>
          )}
        </List>
        <SectionNote>
          A domicilio el repartidor lleva el POS y cobra al entregar; para
          recoger se cobra con la terminal del local. Envío en 0 = gratis.
        </SectionNote>
      </Section>

      <Section title="Propina">
        <List>
          <ToggleRow
            label="Cobrar propina"
            value={patch.tipEnabled}
            onChange={(v) => set('tipEnabled', v)}
          />
          {patch.tipEnabled && (
            <NumberRow
              label="Porcentaje" suffix="%"
              value={patch.tipPercent} min={1} max={50}
              onChange={(v) => set('tipPercent', v)}
            />
          )}
          {patch.tipEnabled && patch.orderTypes.map((t) => (
            <ToggleRow
              key={t}
              label={ORDER_TYPE_LABEL[t]}
              value={patch.tipOrderTypes.includes(t)}
              onChange={(v) => set('tipOrderTypes', toggleIn(patch.tipOrderTypes, t, v))}
            />
          ))}
        </List>
        {patch.tipEnabled && (
          <SectionNote>
            Se suma al total en los tipos de pedido marcados. El comensal no
            puede quitarla.
          </SectionNote>
        )}
      </Section>

      {patch.orderTypes.includes('dine_in') && (
        <Section title="Comer en local">
          <List>
            <div className="px-4 py-3.5">
              <ServicePreferencesCtl
                items={patch.dineInCourseOptions}
                onChange={(v) => set('dineInCourseOptions', v)}
              />
            </div>
          </List>
          <SectionNote>
            El comensal elige una de estas al ordenar en la mesa (por ejemplo,
            la entrada primero).
          </SectionNote>
        </Section>
      )}

      <Section title="Cuando entra un pedido">
        <List>
          <ToggleRow
            label="Confirmarlos solo"
            desc="Pasan a “En preparación” si nadie los confirma antes."
            value={patch.autoConfirmEnabled}
            onChange={(v) => set('autoConfirmEnabled', v)}
          />
          {patch.autoConfirmEnabled && (
            <NumberRow
              label="Esperar" suffix="min"
              value={patch.autoConfirmMinutes} min={1} max={60}
              onChange={(v) => set('autoConfirmMinutes', v)}
            />
          )}
          <ToggleRow
            label="A cocina solo al confirmar"
            desc={patch.kdsConfirmFirst
              ? 'Llegan a la pantalla de cocina después de que alguien los confirme.'
              : 'Aparecen en cocina en cuanto el cliente los envía.'}
            value={patch.kdsConfirmFirst}
            onChange={(v) => set('kdsConfirmFirst', v)}
          />
        </List>
      </Section>

      <Section title="Semáforo de la cocina">
        <List>
          <NumberRow
            label="Pasa a ámbar" suffix="min"
            value={patch.kdsYellowMin} min={1} max={120}
            onChange={(v) => set('kdsYellowMin', Math.min(v, patch.kdsRedMin - 1))}
          />
          <NumberRow
            label="Pasa a rojo" suffix="min"
            value={patch.kdsRedMin} min={2} max={240}
            onChange={(v) => set('kdsRedMin', Math.max(v, patch.kdsYellowMin + 1))}
          />
        </List>
        <SectionNote>
          Minutos de espera con los que la comanda cambia de color en la
          pantalla de cocina. Verde a tiempo · ámbar apúrate · rojo tarde.
        </SectionNote>
      </Section>

      {/* Los relojes del SALÓN, que son otra cosa que los de la cocina: no
          miden cuánto tarda un plato, miden cuánto lleva algo esperando a
          una persona. Se pueden cambiar porque «dentro del rato» no
          significa lo mismo en un menú del día que en una sobremesa. */}
      <Section title="Cuándo una mesa te necesita">
        <List>
          <NumberRow
            label="Comida lista sin llevar" suffix="min"
            value={patch.salonReadyMin} min={1} max={60}
            onChange={(v) => set('salonReadyMin', v)}
          />
          <NumberRow
            label="Servida sin cobrar" suffix="min"
            value={patch.salonUnpaidMin} min={1} max={180}
            onChange={(v) => set('salonUnpaidMin', v)}
          />
          <NumberRow
            label="Sin que cocina la acepte" suffix="min"
            value={patch.salonUnacceptedMin} min={1} max={60}
            onChange={(v) => set('salonUnacceptedMin', v)}
          />
        </List>
        <SectionNote>
          Pasado el tiempo, la mesa queda <strong>pendiente</strong> en el
          salón: se dice con texto, sin color. Al <strong>doble</strong> pasa
          a <strong>alarma</strong> y se pinta con tu color de marca. Lo que
          un cliente pide con la mano —llamar o pedir la cuenta— es alarma
          desde el primer segundo y no depende de estos números.
        </SectionNote>
      </Section>

      <Section title="Formato y movimiento">
        <List>
          {/* Antes era un campo para escribir «es-GT» a mano: un código
              técnico que el dueño no tiene por qué conocer (auditoría
              2026-10-02, T-15 / AJU-09). Ahora se elige por cómo se ve un
              precio; un código raro que ya estuviera guardado se conserva. */}
          <ListRow>
            <ListText title="Formato de números" desc={`Así se ven tus precios: ${ejemploLocale(patch.locale)}`} />
            <select
              value={patch.locale} aria-label="Formato de números"
              onChange={(e) => set('locale', e.target.value)}
              className="adm-field adm-field-auto" style={{ width: 'auto', maxWidth: 190 }}
            >
              {LOCALES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              {!LOCALES.some((l) => l.value === patch.locale) && patch.locale && (
                <option value={patch.locale}>{patch.locale}</option>
              )}
            </select>
          </ListRow>
          <ToggleRow
            label="Animaciones"
            desc="Las transiciones del menú de tus clientes."
            value={patch.animations}
            onChange={(v) => set('animations', v)}
          />
        </List>
      </Section>

      <p className="px-4 text-[12px] leading-snug text-adm-text-3">
        Los modos de pedido (domicilio, para llevar, comer en local) se
        encienden en Funciones. La cantidad de mesas y sus QR, en Ajustes › Salón.
      </p>

      <SaveBar dirty={dirty} pending={isPending} status={status} onSave={save} />
    </div>
  );
}
