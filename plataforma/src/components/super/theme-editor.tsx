'use client';

/* Editor de personalización del Super Admin (motor completo).
   Edita ThemeConfig + ThemeContent + custom_css y guarda con saveRestaurantTheme.
   Aquí Leonardo "diseña" el sitio de cada restaurante. */

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import ImageUpload from '@/components/admin/image-upload';
import PreviewPane, { useThemePreviewChannel } from '@/components/super/preview-pane';
import {
  saveRestaurantTheme,
  saveThemeTemplate,
  deleteThemeTemplate,
  type ThemeTemplate,
} from '@/lib/actions/super-admin';
import { fontsForRole, type ThemeConfig, type ThemeContent } from '@/lib/theme/defaults';

interface Props {
  restaurantId: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
  templates?: ThemeTemplate[];
}

export default function ThemeEditor({ restaurantId, config: initialConfig, content: initialContent, customCss: initialCss, templates: initialTemplates = [] }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<ThemeConfig>(initialConfig);
  const [content, setContent] = useState<ThemeContent>(initialContent);
  const [css, setCss] = useState(initialCss);
  const [isPending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  // Plantillas de tema (lista local para reflejar guardar/borrar al instante).
  const [templates, setTemplates] = useState<ThemeTemplate[]>(initialTemplates);
  const [selectedTpl, setSelectedTpl] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [tplPending, startTpl] = useTransition();

  function applyTemplate() {
    const tpl = templates.find((t) => t.id === selectedTpl);
    if (!tpl) return;
    // La identidad del restaurante NO se pisa: solo el diseño.
    setConfig({
      ...tpl.config,
      brandName: config.brandName,
      tagline: config.tagline,
      zone: config.zone,
      logoUrl: config.logoUrl,
      markUrl: config.markUrl,
    });
    setContent(structuredClone(tpl.content));
    setCss(tpl.custom_css ?? '');
    setTplMsg(`Plantilla "${tpl.name}" aplicada (recuerda guardar).`);
  }

  function saveAsTemplate() {
    setTplMsg(null);
    startTpl(async () => {
      const res = await saveThemeTemplate({ name: tplName, config, content, customCss: css });
      if (res.error) { setTplMsg(`Error: ${res.error}`); return; }
      if (res.template) {
        setTemplates((prev) => [res.template!, ...prev]);
        setSelectedTpl(res.template.id);
        setTplName('');
        setTplMsg('Plantilla guardada ✓');
      }
    });
  }

  function removeTemplate() {
    const tpl = templates.find((t) => t.id === selectedTpl);
    if (!tpl) return;
    if (!window.confirm(`¿Borrar la plantilla "${tpl.name}"?`)) return;
    startTpl(async () => {
      const res = await deleteThemeTemplate(tpl.id);
      if (res.error) { setTplMsg(`Error: ${res.error}`); return; }
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
      setSelectedTpl('');
      setTplMsg('Plantilla borrada.');
    });
  }

  const setC = <K extends keyof ThemeConfig>(k: K, v: ThemeConfig[K]) => setConfig((p) => ({ ...p, [k]: v }));
  const setT = (section: keyof ThemeContent, key: string, v: string) =>
    setContent((p) => ({ ...p, [section]: { ...p[section], [key]: v } }));

  // Vista previa en vivo: cada cambio se transmite a /preview/[id]
  // (iframe lateral y/o ventana aparte) sin necesidad de guardar.
  const previewState = useMemo(() => ({ config, content, customCss: css }), [config, content, css]);
  useThemePreviewChannel(restaurantId, previewState);

  function save() {
    setMsg(null);
    start(async () => {
      const res = await saveRestaurantTheme({ restaurantId, config, content, customCss: css });
      if (res.error) setMsg(`Error: ${res.error}`);
      else { setMsg('Guardado ✓'); router.refresh(); }
    });
  }

  return (
    <div className="theme-editor-layout">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {/* ── Plantillas ── */}
      <Section title="Plantillas de tema">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
          Aplica un diseño guardado (la marca y el logo del restaurante se conservan)
          o guarda el tema actual para reutilizarlo con otro cliente.
        </p>
        {templates.length > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={selectedTpl}
              onChange={(e) => setSelectedTpl(e.target.value)}
              style={{ ...selectStyle, flex: 1, minWidth: 160, cursor: 'pointer' }}
            >
              <option value="" style={optionStyle}>Elegir plantilla…</option>
              {templates.map((t) => <option key={t.id} value={t.id} style={optionStyle}>{t.name}</option>)}
            </select>
            <button type="button" onClick={applyTemplate} disabled={!selectedTpl || tplPending} className="press btn-white" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 12.5, border: 'none', cursor: 'pointer', opacity: !selectedTpl || tplPending ? 0.55 : 1 }}>
              Aplicar
            </button>
            <button type="button" onClick={removeTemplate} disabled={!selectedTpl || tplPending} className="press" style={{ padding: '9px 13px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171', cursor: 'pointer', opacity: !selectedTpl || tplPending ? 0.55 : 1 }}>
              Borrar
            </button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="text"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="Nombre para el tema actual…"
            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
          />
          <button type="button" onClick={saveAsTemplate} disabled={!tplName.trim() || tplPending} className="press" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5, border: '1px solid var(--u-hair-2)', background: 'rgba(255,255,255,0.06)', color: 'var(--u-text)', cursor: 'pointer', opacity: !tplName.trim() || tplPending ? 0.55 : 1 }}>
            {tplPending ? 'Guardando…' : 'Guardar como plantilla'}
          </button>
        </div>
        {tplMsg && <span style={{ fontSize: 12.5, color: tplMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{tplMsg}</span>}
      </Section>

      {/* ── Marca ── */}
      <Section title="Marca">
        <TextCtl label="Nombre de marca" value={config.brandName} onChange={(v) => setC('brandName', v)} />
        <TextCtl label="Tagline / lema" value={config.tagline} onChange={(v) => setC('tagline', v)} />
        <TextCtl label="Zona" value={config.zone} onChange={(v) => setC('zone', v)} placeholder="Zona 1, Centro…" />
        <Field label="Logo (portada)">
          <ImageUpload restaurantId={restaurantId} currentUrl={config.logoUrl} folder="logo" onUpload={(u) => setC('logoUrl', u)} />
        </Field>
      </Section>

      {/* ── Color ── */}
      <Section title="Color">
        <ColorCtl label="Fondo" value={config.colorBg} onChange={(v) => setC('colorBg', v)} />
        <ColorCtl label="Fondo 2 (gradiente)" value={config.colorBg2} onChange={(v) => setC('colorBg2', v)} />
        <ColorCtl label="Texto" value={config.colorText} onChange={(v) => setC('colorText', v)} />
        <ColorCtl label="Acento / primario" value={config.colorAccent} onChange={(v) => setC('colorAccent', v)} />
        <ColorCtl label="Texto sobre acento" value={config.onAccent} onChange={(v) => setC('onAccent', v)} />
        <Segmented label="Esquema" value={config.scheme} options={[['dark', 'Oscuro'], ['light', 'Claro']]} onChange={(v) => setC('scheme', v as ThemeConfig['scheme'])} />
      </Section>

      {/* ── Tipografía ── */}
      <Section title="Tipografía">
        <FontCtl label="Display (títulos)" role="display" value={config.fontDisplay} onChange={(v) => setC('fontDisplay', v)} />
        <FontCtl label="Poster (kickers)" role="poster" value={config.fontPoster} onChange={(v) => setC('fontPoster', v)} />
        <FontCtl label="Cuerpo" role="body" value={config.fontBody} onChange={(v) => setC('fontBody', v)} />
        <FontCtl label="Serif (itálicas)" role="serif" value={config.fontSerif} onChange={(v) => setC('fontSerif', v)} />
        <FontCtl label="Mono (precios)" role="mono" value={config.fontMono} onChange={(v) => setC('fontMono', v)} />
        <Slider label="Escala de texto" value={config.fontScale} min={0.85} max={1.25} step={0.05} onChange={(v) => setC('fontScale', v)} />
      </Section>

      {/* ── Glass / forma ── */}
      <Section title="Glass y forma">
        <Segmented label="Intensidad glass" value={config.glassIntensity} options={[['translucido', 'Translúcido'], ['esmerilado', 'Esmerilado'], ['solido', 'Sólido']]} onChange={(v) => setC('glassIntensity', v as ThemeConfig['glassIntensity'])} />
        <Slider label="Redondeo" value={config.cornerRadius} min={0.4} max={1.8} step={0.1} onChange={(v) => setC('cornerRadius', v)} />
        <Toggle label="Brillo que sigue al cursor" value={config.sheen} onChange={(v) => setC('sheen', v)} />
      </Section>

      {/* ── Fondo ── */}
      <Section title="Fondo">
        <Segmented label="Tipo de fondo" value={config.backgroundType} options={[['asphalt', 'Asphalt'], ['solid', 'Sólido'], ['gradient', 'Gradiente'], ['image', 'Imagen']]} onChange={(v) => setC('backgroundType', v as ThemeConfig['backgroundType'])} />
        {config.backgroundType === 'image' && (
          <Field label="Imagen de fondo">
            <ImageUpload restaurantId={restaurantId} currentUrl={config.backgroundImage} folder="bg" onUpload={(u) => setC('backgroundImage', u)} />
          </Field>
        )}
        {config.backgroundType === 'gradient' && (
          <TextCtl label="CSS del gradiente" value={config.backgroundGradient ?? ''} onChange={(v) => setC('backgroundGradient', v || null)} placeholder="linear-gradient(160deg, #111, #333)" />
        )}
        <Toggle label="Luz ambiental (glow)" value={config.ambientGlow} onChange={(v) => setC('ambientGlow', v)} />
        <Toggle label="Grano de concreto" value={config.grain} onChange={(v) => setC('grain', v)} />
        <Toggle label="Watermark girando (usa logo)" value={config.watermark} onChange={(v) => setC('watermark', v)} />
      </Section>

      {/* ── Portada ── */}
      <Section title="Portada">
        <Segmented label="Variante" value={config.portadaVariant} options={[['spotlight', 'Spotlight'], ['poster', 'Poster'], ['stack', 'Stack'], ['none', 'Ninguna']]} onChange={(v) => setC('portadaVariant', v as ThemeConfig['portadaVariant'])} />
        <Toggle label="Mostrar logo" value={config.portadaShowLogo} onChange={(v) => setC('portadaShowLogo', v)} />
        <Toggle label="Mostrar badge 'Abierto'" value={config.portadaShowBadge} onChange={(v) => setC('portadaShowBadge', v)} />
        <Toggle label="Punto de estado (respira)" value={config.portadaShowStatus} onChange={(v) => setC('portadaShowStatus', v)} />
        <Segmented label="Estilo del botón" value={config.ctaStyle} options={[['white', 'Blanco'], ['accent', 'Acento'], ['outline', 'Contorno']]} onChange={(v) => setC('ctaStyle', v as ThemeConfig['ctaStyle'])} />
      </Section>

      {/* ── Catálogo ── */}
      <Section title="Catálogo">
        <Segmented label="Vista" value={config.catalogView} options={[['grid', 'Cuadrícula'], ['list', 'Lista']]} onChange={(v) => setC('catalogView', v as ThemeConfig['catalogView'])} />
        <Segmented label="Columnas" value={String(config.catalogColumns)} options={[['2', '2'], ['3', '3']]} onChange={(v) => setC('catalogColumns', Number(v) as 2 | 3)} />
        <Segmented label="Arte del producto" value={config.productArt} options={[['auto', 'Auto'], ['pattern', 'Patrón'], ['photo', 'Foto']]} onChange={(v) => setC('productArt', v as ThemeConfig['productArt'])} />
        <Toggle label="Buscador" value={config.showSearch} onChange={(v) => setC('showSearch', v)} />
        <Toggle label="Íconos de categoría" value={config.showCategoryIcons} onChange={(v) => setC('showCategoryIcons', v)} />
        <Toggle label="Mostrar tags" value={config.showTags} onChange={(v) => setC('showTags', v)} />
      </Section>

      {/* ── Pedidos / Moneda ── */}
      <Section title="Pedidos y moneda">
        <Toggle label="Domicilio" value={config.orderTypes.includes('delivery')} onChange={(v) => setC('orderTypes', toggleIn(config.orderTypes, 'delivery', v))} />
        <Toggle label="Para llevar" value={config.orderTypes.includes('pickup')} onChange={(v) => setC('orderTypes', toggleIn(config.orderTypes, 'pickup', v))} />
        <TextCtl label="Símbolo de moneda" value={config.currencySymbol} onChange={(v) => setC('currencySymbol', v)} />
        <Segmented label="Posición del símbolo" value={config.currencyPosition} options={[['prefix', 'Antes (Q10)'], ['suffix', 'Después (10Q)']]} onChange={(v) => setC('currencyPosition', v as ThemeConfig['currencyPosition'])} />
        <TextCtl label="Locale (formato)" value={config.locale} onChange={(v) => setC('locale', v)} placeholder="es-GT" />
        <Toggle label="Animaciones" value={config.animations} onChange={(v) => setC('animations', v)} />
      </Section>

      {/* ── Textos (todos) ── */}
      <Section title="Textos del cliente">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 6 }}>
          Cada palabra que ve el comensal. Deja vacío para usar el texto por defecto.
        </p>
        {(Object.keys(CONTENT_FIELDS) as Array<keyof ThemeContent>).map((section) => (
          <details key={section} style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', textTransform: 'capitalize' }}>
              {SECTION_LABELS[section]}
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10 }}>
              {CONTENT_FIELDS[section].map(([key, label]) => (
                <TextCtl
                  key={key}
                  label={label}
                  value={(content[section] as Record<string, string>)[key] ?? ''}
                  onChange={(v) => setT(section, key, v)}
                />
              ))}
            </div>
          </details>
        ))}
      </Section>

      {/* ── Avanzado ── */}
      <Section title="Avanzado · CSS propio">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 6 }}>
          CSS crudo que se inyecta al final del sitio del restaurante (gana sobre todo). Para ajustes sin límite.
        </p>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'.glass { border-radius: 4px; }\n.t-display { letter-spacing: 0; }'}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--u-hair-2)', color: 'var(--u-text)', fontSize: 13, fontFamily: 'var(--ui-font-mono)', outline: 'none', resize: 'vertical' }}
        />
      </Section>

      {/* ── Guardar ── */}
      <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', flexWrap: 'wrap' }}>
        <button onClick={save} disabled={isPending} className="press btn-white" style={{ padding: '12px 22px', borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: 14, border: 'none', cursor: isPending ? 'not-allowed' : 'pointer', opacity: isPending ? 0.7 : 1 }}>
          {isPending ? 'Guardando…' : 'Guardar apariencia'}
        </button>
        {/* En pantallas angostas el panel lateral se oculta: este enlace abre la vista previa en una pestaña. */}
        <a
          href={`/preview/${restaurantId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press"
          style={{ fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)', textDecoration: 'none', padding: '11px 16px', borderRadius: 'var(--radius-full)', border: '1px solid var(--u-hair-2)' }}
        >
          Vista previa ↗
        </a>
        {msg && <span style={{ fontSize: 13, color: msg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{msg}</span>}
      </div>
    </div>

    {/* ── Columna derecha: vista previa en vivo ── */}
    <PreviewPane previewId={restaurantId} />
    </div>
  );
}

function toggleIn<T>(arr: T[], val: T, on: boolean): T[] {
  const has = arr.includes(val);
  if (on && !has) return [...arr, val];
  if (!on && has) return arr.filter((x) => x !== val);
  return arr;
}

/* ── Definiciones de textos ── */
const SECTION_LABELS: Record<keyof ThemeContent, string> = {
  portada: 'Portada', catalog: 'Catálogo', product: 'Producto', cart: 'Carrito',
  checkout: 'Checkout', confirmation: 'Confirmación', tracking: 'Seguimiento', tags: 'Etiquetas',
};
const CONTENT_FIELDS: Record<keyof ThemeContent, [string, string][]> = {
  portada: [['title', 'Título (vacío = nombre)'], ['subtitle', 'Subtítulo (vacío = tagline)'], ['cta', 'Botón'], ['badgeOpen', 'Badge abierto'], ['badgeClosed', 'Badge cerrado'], ['posterKicker', 'Kicker (poster)']],
  catalog: [['kicker', 'Kicker'], ['heading', 'Título del menú'], ['searchPlaceholder', 'Placeholder búsqueda'], ['allLabel', 'Etiqueta "Todo"'], ['empty', 'Mensaje vacío']],
  product: [['add', 'Botón agregar'], ['soldOut', 'Agotado'], ['prepTime', 'Tiempo de prep.'], ['fresh', 'Etiqueta "fresco"'], ['chooseOne', 'Opción obligatoria'], ['optional', 'Opción opcional']],
  cart: [['title', 'Título'], ['empty', 'Vacío'], ['emptyCta', 'Botón vacío'], ['subtotal', 'Subtotal'], ['shipping', 'Envío'], ['free', 'Gratis'], ['total', 'Total'], ['checkout', 'Botón pagar'], ['barCta', 'Barra: ver carrito'], ['itemsOne', '"producto"'], ['itemsMany', '"productos"']],
  checkout: [['title', 'Título'], ['typeLabel', 'Tipo de pedido'], ['delivery', 'Domicilio'], ['pickup', 'Para llevar'], ['name', 'Nombre'], ['namePh', 'Placeholder nombre'], ['phone', 'Teléfono'], ['phonePh', 'Placeholder teléfono'], ['address', 'Dirección'], ['addressPh', 'Placeholder dirección'], ['notes', 'Notas'], ['notesPh', 'Placeholder notas'], ['payLabel', 'Pago'], ['payCash', 'Efectivo'], ['payCashSub', 'Sub-texto pago'], ['confirm', 'Confirmar'], ['errName', 'Error nombre'], ['errPhone', 'Error teléfono'], ['errAddress', 'Error dirección'], ['closedTitle', 'Cerrado: título'], ['closedMsg', 'Cerrado: mensaje'], ['pausedTitle', 'Pausa: título'], ['pausedMsg', 'Pausa: mensaje (vacío = del restaurante)']],
  confirmation: [['title', 'Título'], ['subtitle', 'Subtítulo'], ['orderNo', 'N° de pedido'], ['type', 'Tipo'], ['eta', 'Tiempo estimado'], ['etaValue', 'Valor tiempo'], ['payment', 'Pago'], ['notified', 'Notificado'], ['track', 'Botón seguimiento'], ['again', 'Otro pedido']],
  tracking: [['title', 'Título'], ['subtitle', 'Subtítulo'], ['statusNew', 'Recibido'], ['statusPrep', 'En preparación'], ['statusReady', 'Listo'], ['statusReadyPickup', 'Listo (pickup)'], ['statusTransit', 'En camino'], ['statusDelivered', 'Entregado'], ['statusCancel', 'Cancelado'], ['back', 'Volver al menú']],
  tags: [['hot', 'Picante'], ['new', 'Nuevo'], ['fav', 'Favorito'], ['veg', 'Veggie']],
};

/* ── Controles reutilizables ── */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Glass variant="quiet" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 10.5 }}>{title}</div>
      {children}
    </Glass>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12.5, color: 'var(--u-text-2)', fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};

// Selects need a solid dark background so native OS dropdown options are readable
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  background: '#1a1a1a',
  colorScheme: 'dark',
};

const optionStyle: React.CSSProperties = {
  background: '#1a1a1a',
  color: '#e5e5e5',
};

function TextCtl({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Field label={label}>
      <input type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </Field>
  );
}

function ColorCtl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 36, height: 36, borderRadius: 8, border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0, background: 'transparent' }} />
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)', flex: 1 }}>{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, width: 96, fontFamily: 'var(--ui-font-mono)', fontSize: 12, padding: '6px 8px' }} />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)} className="press" style={{ width: 42, height: 25, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3, background: value ? 'var(--u-text)' : 'rgba(255,255,255,0.12)', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', transition: 'background 180ms', flexShrink: 0 }}>
        <span style={{ width: 19, height: 19, borderRadius: 99, background: value ? 'var(--brand-bg)' : 'var(--u-text)' }} />
      </button>
    </div>
  );
}

function Segmented({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {options.map(([val, lbl]) => {
          const on = value === val;
          return (
            <button key={val} type="button" onClick={() => onChange(val)} className="press" style={{ padding: '7px 13px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? 'var(--u-text)' : 'rgba(255,255,255,0.04)', color: on ? 'var(--brand-bg)' : 'var(--u-text-3)', transition: 'all 150ms' }}>
              {lbl}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Slider({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={`${label} · ${value.toFixed(2)}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--brand-accent)' }} />
    </Field>
  );
}

function FontCtl({ label, role, value, onChange }: { label: string; role: 'display' | 'poster' | 'body' | 'serif' | 'mono'; value: string; onChange: (v: string) => void }) {
  const opts = fontsForRole(role);
  const has = opts.some((o) => o.family === value);
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...selectStyle, cursor: 'pointer' }}>
        {!has && <option value={value} style={optionStyle}>{value}</option>}
        {opts.map((o) => <option key={o.family} value={o.family} style={optionStyle}>{o.label}</option>)}
      </select>
    </Field>
  );
}
