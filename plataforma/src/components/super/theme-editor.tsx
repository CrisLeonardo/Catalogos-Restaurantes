'use client';

/* Editor de personalización del Super Admin (motor completo).
   Edita ThemeConfig + ThemeContent + custom_css y guarda con saveRestaurantTheme.
   Aquí Leonardo "diseña" el sitio de cada restaurante. */

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Glass } from '@/components/glass';
import { Icon } from '@/components/icons';
import ImageUpload from '@/components/admin/image-upload';
import TemplateGallery from '@/components/admin/template-gallery';
import PreviewPane, { useThemePreviewChannel } from '@/components/super/preview-pane';
import {
  saveRestaurantTheme,
  saveThemeTemplate,
  deleteThemeTemplate,
  type ThemeTemplate,
} from '@/lib/actions/super-admin';
import {
  fontsForRole,
  TYPO_ROLES,
  ELEMENT_TARGETS,
  DEFAULT_TYPOGRAPHY,
  SHADOW_OPTIONS,
  type ThemeConfig,
  type ThemeContent,
  type TextStyle,
  type TypographyRole,
} from '@/lib/theme/defaults';
import { buildThemeVars } from '@/lib/theme/resolve';
import { applyTemplateToConfig, type BuiltinTemplate } from '@/lib/theme/templates';

interface Props {
  restaurantId: string;
  config: ThemeConfig;
  content: ThemeContent;
  customCss: string;
  templates?: ThemeTemplate[];
  saveAction?: (input: { restaurantId: string; config: ThemeConfig; content: ThemeContent; customCss: string }) => Promise<{ error?: string; ok?: boolean }>;
  showTemplates?: boolean;
  showAdvanced?: boolean;
  showOrdersAndCurrency?: boolean;
}

export default function ThemeEditor({ restaurantId, config: initialConfig, content: initialContent, customCss: initialCss, templates: initialTemplates = [], saveAction, showTemplates = true, showAdvanced = true, showOrdersAndCurrency = true }: Props) {
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
  const [appliedBuiltin, setAppliedBuiltin] = useState<string | null>(null);

  function applyBuiltinTemplate(tpl: BuiltinTemplate) {
    setConfig((prev) => applyTemplateToConfig(prev, tpl));
    // El CSS a medida pisa las variables de la plantilla (se inyecta al final
    // del documento) → sin limpiarlo, la plantilla sale como mezcla ilegible.
    setCss('');
    setAppliedBuiltin(tpl.id);
    setTplMsg(`Plantilla "${tpl.name}" aplicada (recuerda guardar). El CSS a medida se vació — vuelve a escribirlo si lo necesitas.`);
  }

  function applyTemplate() {
    const tpl = templates.find((t) => t.id === selectedTpl);
    if (!tpl) return;
    // La identidad del restaurante NO se pisa: solo el diseño.
    // Partimos de `prev` para que las plantillas viejas (sin tipografía/superficies)
    // conserven los defaults en vez de dejarlos undefined.
    setConfig((prev) => ({
      ...prev,
      ...tpl.config,
      brandName: prev.brandName,
      tagline: prev.tagline,
      zone: prev.zone,
      logoUrl: prev.logoUrl,
      markUrl: prev.markUrl,
    }));
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

  // ── Setters de tipografía granular ──
  const setTypo = (role: TypographyRole, patch: Partial<TextStyle>) =>
    setConfig((p) => ({ ...p, typography: { ...p.typography, [role]: { ...p.typography[role], ...patch } } }));
  const setEl = (key: string, patch: Partial<TextStyle>) =>
    setConfig((p) => ({ ...p, elementStyles: { ...p.elementStyles, [key]: { ...p.elementStyles[key], ...patch } } }));
  const toggleEl = (key: string, on: boolean) =>
    setConfig((p) => {
      const next = { ...p.elementStyles };
      if (on) {
        const role = ELEMENT_TARGETS.find((t) => t.key === key)?.role ?? 'heading';
        next[key] = { ...(p.typography[role] ?? DEFAULT_TYPOGRAPHY[role]) };
      } else {
        delete next[key];
      }
      return { ...p, elementStyles: next };
    });

  // Vista previa en vivo: cada cambio se transmite a /preview/[id]
  // (iframe lateral y/o ventana aparte) sin necesidad de guardar.
  const previewState = useMemo(() => ({ config, content, customCss: css }), [config, content, css]);
  useThemePreviewChannel(restaurantId, previewState);

  function save() {
    setMsg(null);
    start(async () => {
      const action = saveAction ?? saveRestaurantTheme;
      const res = await action({ restaurantId, config, content, customCss: css });
      if (res.error) setMsg(`Error: ${res.error}`);
      else { setMsg('Guardado ✓'); router.refresh(); }
    });
  }

  return (
    <div className="theme-editor-layout">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      {/* ── Plantillas ── */}
      {showTemplates && <Section title="Plantillas de tema">
        {/* Galería integrada (prediseñadas): la misma que ve el dueño. */}
        <details open>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
            Galería prediseñada ({'>'}15 estilos)
          </summary>
          <div style={{ paddingTop: 10 }}>
            <TemplateGallery onApply={applyBuiltinTemplate} appliedId={appliedBuiltin} />
          </div>
        </details>
        <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
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
          <button type="button" onClick={saveAsTemplate} disabled={!tplName.trim() || tplPending} className="press" style={{ padding: '9px 16px', borderRadius: 'var(--radius-full)', fontWeight: 600, fontSize: 12.5, border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text)', cursor: 'pointer', opacity: !tplName.trim() || tplPending ? 0.55 : 1 }}>
            {tplPending ? 'Guardando…' : 'Guardar como plantilla'}
          </button>
        </div>
        {tplMsg && <span style={{ fontSize: 12.5, color: tplMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>{tplMsg}</span>}
      </Section>}

      {/* ── Marca ── */}
      <Section title="Marca">
        <TextCtl label="Nombre de marca" value={config.brandName} onChange={(v) => setC('brandName', v)} />
        <TextCtl label="Tagline / lema" value={config.tagline} onChange={(v) => setC('tagline', v)} />
        <TextCtl label="Zona" value={config.zone} onChange={(v) => setC('zone', v)} placeholder="Zona 1, Centro…" />
        <Field label="Logo (portada)">
          <ImageUpload restaurantId={restaurantId} currentUrl={config.logoUrl} folder="logo" bgColor={config.colorBg} onUpload={(u) => setC('logoUrl', u)} />
        </Field>
        <Field label="Ícono de app instalada (PWA)">
          <ImageUpload restaurantId={restaurantId} currentUrl={config.pwaIconUrl} folder="pwa-icon" mode="icon" bgColor={config.colorBg} onUpload={(u) => setC('pwaIconUrl', u)} />
          <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 4 }}>
            Aparece en la pantalla de inicio cuando el cliente instala la app. Se convierte automáticamente a un ícono cuadrado (PNG 512×512) sobre el color de fondo del tema. Si no se sube, se usa el logo.
          </p>
        </Field>
      </Section>

      {/* ── Color ── */}
      <Section title="Color">
        <ColorCtl label="Fondo" value={config.colorBg} onChange={(v) => setC('colorBg', v)} />
        <ColorCtl label="Fondo 2 (gradiente)" value={config.colorBg2} onChange={(v) => setC('colorBg2', v)} />
        <ColorCtl label="Texto" value={config.colorText} onChange={(v) => setC('colorText', v)} />
        <ColorCtl label="Acento / primario" value={config.colorAccent} onChange={(v) => setC('colorAccent', v)} />
        <ColorCtl label="Texto sobre acento" value={config.onAccent} onChange={(v) => setC('onAccent', v)} />
        <Segmented label="Esquema de color" value={config.scheme} options={[['dark', 'Oscuro (auto)'], ['light', 'Claro (forzado)']]} onChange={(v) => setC('scheme', v as ThemeConfig['scheme'])} />
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

      {/* ── Estilos de texto (tipografía por rol) ── */}
      <Section title="Estilos de texto · por tipo">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
          Controla tamaño, grosor, negrita, itálica, espaciado, mayúsculas, color y familia de
          cada <strong>tipo</strong> de texto del menú. Aplica a todos los textos de ese tipo.
        </p>
        {TYPO_ROLES.map((r) => (
          <details key={r.key} style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--u-text-2)' }}>
              {r.label}
            </summary>
            <p style={{ fontSize: 11, color: 'var(--u-text-4)', margin: '6px 0 2px' }}>{r.hint}</p>
            <TextStyleCtl value={config.typography[r.key]} onChange={(patch) => setTypo(r.key, patch)} />
          </details>
        ))}
      </Section>

      {/* ── Glass / forma ── */}
      <Section title="Glass y forma">
        <Segmented label="Estilo glass" value={config.glassIntensity} options={[['translucido', 'Translúcido'], ['esmerilado', 'Esmerilado'], ['solido', 'Denso']]} onChange={(v) => setC('glassIntensity', v as ThemeConfig['glassIntensity'])} />
        <Slider label="Cantidad de glass" value={config.glassAmount ?? 100} min={0} max={100} step={1} format={(v) => `${v}%`} onChange={(v) => setC('glassAmount', v)} />
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
          100 % = efecto completo del estilo seleccionado · 0 % = sólido puro (sin blur ni transparencia)
        </p>
        <Slider label="Redondeo" value={config.cornerRadius} min={0.4} max={1.8} step={0.1} onChange={(v) => setC('cornerRadius', v)} />
        <Toggle label="Brillo que sigue al cursor" value={config.sheen} onChange={(v) => setC('sheen', v)} />
      </Section>

      {/* ── Superficies / tarjetas ── */}
      <Section title="Superficies y tarjetas">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
          Estos controles afectan los rellenos sutiles de tarjetas, chips, badges y velos. Se
          adaptan solos a cualquier paleta (clara u oscura).
        </p>
        <Slider label="Intensidad del tinte de superficies" value={config.surfaceTint} min={0.4} max={2.5} step={0.1} onChange={(v) => setC('surfaceTint', v)} />
        <Slider label="Profundidad de sombras (tarjetas)" value={config.cardShadow} min={0} max={1.6} step={0.1} onChange={(v) => setC('cardShadow', v)} />
        <Slider label="Oscuridad del velo de modales" value={config.scrimOpacity} min={0} max={0.85} step={0.05} onChange={(v) => setC('scrimOpacity', v)} />
        <div style={{ height: 1, background: 'var(--u-hair)', margin: '4px 0' }} />
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)' }}>Badge “No disponible” (vacío = automático por esquema).</p>
        <ColorOrAuto label="Fondo del badge" value={config.badgeBg} fallback="#1a1a1a" onChange={(v) => setC('badgeBg', v)} />
        <ColorOrAuto label="Texto del badge" value={config.badgeText} fallback="#ffffff" onChange={(v) => setC('badgeText', v)} />
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
        <Toggle label="Grano / textura" value={config.grain} onChange={(v) => setC('grain', v)} />
        {config.grain && (
          <Segmented
            label="Estilo del grano"
            value={config.grainStyle}
            options={[['fino', 'Fino (concreto)'], ['grueso', 'Grueso (asfalto/parrilla)'], ['papel', 'Papel (fibra cálida)']]}
            onChange={(v) => setC('grainStyle', v as ThemeConfig['grainStyle'])}
          />
        )}
        <Toggle label="Watermark girando (usa logo)" value={config.watermark} onChange={(v) => setC('watermark', v)} />
        {config.watermark && (
          <>
            <Slider label="Opacidad del watermark" value={config.watermarkOpacity} min={0.01} max={0.15} step={0.01} onChange={(v) => setC('watermarkOpacity', v)} />
            <Slider label="Tamaño del watermark" value={config.watermarkSize} min={40} max={120} step={5} onChange={(v) => setC('watermarkSize', v)} />
          </>
        )}
        {config.backgroundType === 'image' && (
          <Slider label="Velo sobre la imagen" value={config.bgOverlayOpacity} min={0} max={1} step={0.05} onChange={(v) => setC('bgOverlayOpacity', v)} />
        )}
      </Section>

      {/* ── Portada ── */}
      <Section title="Portada">
        <Segmented label="Variante" value={config.portadaVariant} options={[['spotlight', 'Spotlight'], ['poster', 'Poster'], ['stack', 'Stack'], ['none', 'Ninguna']]} onChange={(v) => setC('portadaVariant', v as ThemeConfig['portadaVariant'])} />
        <Toggle label="Mostrar logo" value={config.portadaShowLogo} onChange={(v) => setC('portadaShowLogo', v)} />
        <Toggle label="Mostrar badge 'Abierto'" value={config.portadaShowBadge} onChange={(v) => setC('portadaShowBadge', v)} />
        <Toggle label="Punto de estado (respira)" value={config.portadaShowStatus} onChange={(v) => setC('portadaShowStatus', v)} />
        <Segmented label="Estilo del botón" value={config.ctaStyle} options={[['white', 'Blanco'], ['accent', 'Acento'], ['outline', 'Contorno']]} onChange={(v) => setC('ctaStyle', v as ThemeConfig['ctaStyle'])} />
      </Section>

      {/* (El panel admin ya no se personaliza por restaurante: usa 2 temas
          fijos claro/oscuro que el staff alterna desde su barra superior.) */}

      {/* ── Catálogo ── */}
      <Section title="Catálogo">
        <Segmented label="Vista" value={config.catalogView} options={[['grid', 'Cuadrícula'], ['list', 'Lista']]} onChange={(v) => setC('catalogView', v as ThemeConfig['catalogView'])} />
        <Segmented label="Columnas" value={String(config.catalogColumns)} options={[['2', '2'], ['3', '3']]} onChange={(v) => setC('catalogColumns', Number(v) as 2 | 3)} />
        <Segmented label="Arte del producto" value={config.productArt} options={[['auto', 'Auto'], ['pattern', 'Patrón'], ['photo', 'Foto']]} onChange={(v) => setC('productArt', v as ThemeConfig['productArt'])} />
        <Toggle label="Buscador" value={config.showSearch} onChange={(v) => setC('showSearch', v)} />
        <Toggle label="Íconos de categoría" value={config.showCategoryIcons} onChange={(v) => setC('showCategoryIcons', v)} />
        <Toggle label="Mostrar tags" value={config.showTags} onChange={(v) => setC('showTags', v)} />
        <Toggle label="Favoritos como tarjeta destacada (máx. 3)" value={config.featuredFavorites} onChange={(v) => setC('featuredFavorites', v)} />
      </Section>

      {/* ── Pedidos / Moneda ── */}
      {showOrdersAndCurrency && <Section title="Pedidos y moneda">
        <Toggle label="Comer en local" value={config.orderTypes.includes('dine_in')} onChange={(v) => setC('orderTypes', toggleIn(config.orderTypes, 'dine_in', v))} />
        {config.orderTypes.includes('dine_in') && (
          <>
            <NumberCtl label="Cantidad de mesas" value={config.dineInTableCount} min={1} max={50} onChange={(v) => setC('dineInTableCount', v)} />
            <StringListCtl label="Preferencias de servicio" items={config.dineInCourseOptions} onChange={(v) => setC('dineInCourseOptions', v)} />
          </>
        )}
        <Toggle label="Domicilio" value={config.orderTypes.includes('delivery')} onChange={(v) => setC('orderTypes', toggleIn(config.orderTypes, 'delivery', v))} />
        <Toggle label="Para llevar" value={config.orderTypes.includes('pickup')} onChange={(v) => setC('orderTypes', toggleIn(config.orderTypes, 'pickup', v))} />
        <Toggle label="Pago con tarjeta (a domicilio, el repartidor lleva el POS)" value={config.acceptsCard} onChange={(v) => setC('acceptsCard', v)} />
        <Toggle label="Habilitar propina" value={config.tipEnabled} onChange={(v) => setC('tipEnabled', v)} />
        {config.tipEnabled && (
          <>
            <NumberCtl label="Porcentaje de propina (%)" value={config.tipPercent} min={1} max={50} onChange={(v) => setC('tipPercent', v)} />
            {config.orderTypes.map((t) => (
              <Toggle
                key={t}
                label={`Propina aplica a: ${t === 'dine_in' ? 'Comer en local' : t === 'pickup' ? 'Para llevar' : 'Domicilio'}`}
                value={config.tipOrderTypes.includes(t)}
                onChange={(v) => setC('tipOrderTypes', toggleIn(config.tipOrderTypes, t, v))}
              />
            ))}
          </>
        )}
        <Segmented label="Color activo en checkout (tabs/opciones)" value={config.checkoutActiveColor} options={[['text', 'Blanco/texto'], ['accent', 'Acento del restaurante']]} onChange={(v) => setC('checkoutActiveColor', v as ThemeConfig['checkoutActiveColor'])} />
        <Toggle label="Glass en campos del formulario" value={config.checkoutFormGlass} onChange={(v) => setC('checkoutFormGlass', v)} />
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
          Agrupa los campos (nombre, mesa, notas…) en una tarjeta con efecto glass + blur. Útil cuando el fondo es una imagen o watermark intenso.
        </p>
        <Toggle label="Glass en opciones de pago (efectivo/tarjeta)" value={config.checkoutPayGlass} onChange={(v) => setC('checkoutPayGlass', v)} />
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
          Da a las tarjetas de Efectivo y Tarjeta un fondo glass con blur para que se distingan con cualquier paleta (resuelve el «no se ve qué dice»).
        </p>
        <Segmented label="Sombra de texto en checkout (legibilidad)" value={config.checkoutTextShadow} options={SHADOW_OPTIONS} onChange={(v) => setC('checkoutTextShadow', v as ThemeConfig['checkoutTextShadow'])} />
        <p style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: -4 }}>
          Aplica una sombra a títulos y etiquetas del checkout para que el texto resalte sobre fondos vivos. Cada texto del menú también puede llevar su propia sombra en la sección de tipografía.
        </p>
        <TextCtl label="Símbolo de moneda" value={config.currencySymbol} onChange={(v) => setC('currencySymbol', v)} />
        <Segmented label="Posición del símbolo" value={config.currencyPosition} options={[['prefix', 'Antes (Q10)'], ['suffix', 'Después (10Q)']]} onChange={(v) => setC('currencyPosition', v as ThemeConfig['currencyPosition'])} />
        <TextCtl label="Locale (formato)" value={config.locale} onChange={(v) => setC('locale', v)} placeholder="es-GT" />
        <Toggle label="Animaciones" value={config.animations} onChange={(v) => setC('animations', v)} />
      </Section>}

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

      {/* ── Textos destacados (override por elemento) ── */}
      <Section title="Textos destacados · por elemento">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)' }}>
          Haz que UN texto en particular (ej. el título de la portada) se vea distinto a los
          demás de su tipo. Actívalo y ajusta su estilo completo.
        </p>
        {ELEMENT_TARGETS.map((t) => {
          const on = !!config.elementStyles[t.key];
          return (
            <details key={t.key} style={{ borderTop: '1px solid var(--u-hair)', paddingTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: on ? 'var(--brand-accent)' : 'var(--u-text-2)' }}>
                {t.label}{on && <Icon name="sparkle" size={11} style={{ display: 'inline', verticalAlign: '-1px', marginLeft: 6, color: 'var(--brand-accent)' }} />}
              </summary>
              <div style={{ paddingTop: 8 }}>
                <Toggle label="Estilo propio para este texto" value={on} onChange={(v) => toggleEl(t.key, v)} />
                {on && config.elementStyles[t.key] && (
                  <div style={{ marginTop: 8 }}>
                    <TextStyleCtl value={config.elementStyles[t.key]} onChange={(patch) => setEl(t.key, patch)} />
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </Section>

      {/* ── Avanzado ── */}
      {showAdvanced && <Section title="Avanzado · CSS propio">
        <p style={{ fontSize: 12, color: 'var(--u-text-4)', marginBottom: 6 }}>
          CSS crudo que se inyecta al final del sitio del restaurante (gana sobre todo). Para ajustes sin límite.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <button
            type="button"
            className="press"
            onClick={() => {
              const vars = buildThemeVars(config);
              const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
              const block = `:root {\n${lines}\n}`;
              setCss((prev) => prev.trim() ? `${block}\n\n${prev}` : block);
            }}
            style={{ padding: '7px 13px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text-2)' }}
          >
            Insertar variables del tema actual
          </button>
          {css.trim() && (
            <button
              type="button"
              className="press"
              onClick={() => { if (window.confirm('¿Limpiar el CSS personalizado?')) setCss(''); }}
              style={{ padding: '7px 13px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#f87171' }}
            >
              Limpiar
            </button>
          )}
        </div>
        <textarea
          value={css}
          onChange={(e) => setCss(e.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={'.glass { border-radius: 4px; }\n.t-display { letter-spacing: 0; }'}
          style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)', color: 'var(--u-text)', fontSize: 13, fontFamily: 'var(--ui-font-mono)', outline: 'none', resize: 'vertical' }}
        />
      </Section>}

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
  checkout: [
    ['title', 'Título'], ['typeLabel', 'Tipo de pedido'],
    ['dineIn', 'Tab: Comer aquí'], ['delivery', 'Tab: Domicilio'], ['pickup', 'Tab: Para llevar'],
    ['name', 'Nombre'], ['namePh', 'Placeholder nombre'],
    ['phone', 'Teléfono'], ['phonePh', 'Placeholder teléfono'],
    ['address', 'Dirección'], ['addressPh', 'Placeholder dirección'],
    ['notes', 'Notas'], ['notesPh', 'Placeholder notas'],
    ['mesa', 'Mesa: etiqueta'], ['mesaDetected', 'Mesa: detectada'], ['mesaNotFound', 'Mesa: no encontrada'],
    ['courseLabel', 'Servicio: etiqueta'], ['courseNone', 'Servicio: sin preferencia'],
    ['payLabel', 'Pago: etiqueta'],
    ['payCash', 'Pago: efectivo (delivery)'], ['payCashSub', 'Pago: sub-texto efectivo delivery'],
    ['payCashPickup', 'Pago: efectivo (pickup)'], ['payCashPickupSub', 'Pago: sub-texto efectivo pickup'],
    ['payCard', 'Pago: tarjeta (delivery)'], ['payCardSub', 'Pago: sub-texto tarjeta delivery'],
    ['payCardPickupSub', 'Pago: sub-texto tarjeta pickup'],
    ['cashAmountLabel', 'Cambio: etiqueta'], ['cashAmountSub', 'Cambio: sub-texto'],
    ['confirm', 'Confirmar'],
    ['errName', 'Error nombre'], ['errPhone', 'Error teléfono'], ['errAddress', 'Error dirección'],
    ['closedTitle', 'Cerrado: título'], ['closedMsg', 'Cerrado: mensaje'],
    ['pausedTitle', 'Pausa: título'], ['pausedMsg', 'Pausa: mensaje (vacío = del restaurante)'],
  ],
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
  width: '100%', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', border: '1px solid var(--u-hair-2)',
  borderRadius: 'var(--radius-md)', padding: '9px 11px', color: 'var(--u-text)', fontSize: 14, outline: 'none',
};

// Select con fondo adaptativo al tema del panel (antes #1a1a1a fijo →
// caja oscura flotando cuando el panel está en modo claro). Las <option>
// van claras fijas: el desplegable nativo se dibuja aparte del tema.
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  colorScheme: 'var(--admin-content-scheme, dark)' as React.CSSProperties['colorScheme'],
};

const optionStyle: React.CSSProperties = {
  background: '#fff',
  color: '#111',
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
      <button type="button" onClick={() => onChange(!value)} className="press" style={{ width: 42, height: 25, borderRadius: 99, border: 'none', cursor: 'pointer', padding: 3, background: value ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 12%, transparent)', display: 'flex', justifyContent: value ? 'flex-end' : 'flex-start', transition: 'background 180ms', flexShrink: 0 }}>
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
            <button key={val} type="button" onClick={() => onChange(val)} className="press" style={{ padding: '7px 13px', borderRadius: 'var(--radius-full)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? 'transparent' : 'var(--u-hair)'}`, background: on ? 'var(--u-text)' : 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: on ? 'var(--brand-bg)' : 'var(--u-text-3)', transition: 'all 150ms' }}>
              {lbl}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

function Slider({ label, value, min, max, step, onChange, format }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const display = format ? format(value) : value.toFixed(2);
  return (
    <Field label={`${label} · ${display}`}>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--brand-accent)' }} />
    </Field>
  );
}

function NumberCtl({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13.5, color: 'var(--u-text-2)' }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min));
          onChange(n);
        }}
        style={{ ...inputStyle, width: 70, textAlign: 'center', padding: '6px 8px', fontSize: 14 }}
      />
    </div>
  );
}

function StringListCtl({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const v = draft.trim();
    if (!v || items.includes(v)) return;
    onChange([...items, v]);
    setDraft('');
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--u-text-2)', padding: '7px 10px', background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', borderRadius: 'var(--radius-md)', border: '1px solid var(--u-hair)' }}>
              {item}
            </span>
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="press"
              style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.25)', background: 'transparent', color: '#f87171', flexShrink: 0 }}
            >
              Quitar
            </button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
            placeholder="Nueva preferencia…"
            style={{ ...inputStyle, flex: 1, padding: '7px 10px', fontSize: 13 }}
          />
          <button
            type="button"
            onClick={add}
            className="press"
            style={{ padding: '7px 14px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--u-hair-2)', background: 'color-mix(in srgb, var(--u-text) 6%, transparent)', color: 'var(--u-text-2)', flexShrink: 0 }}
          >
            Agregar
          </button>
        </div>
      </div>
    </Field>
  );
}

/* Control completo de un TextStyle (tamaño, grosor, negrita, etc.). */
function TextStyleCtl({ value, onChange }: { value: TextStyle; onChange: (patch: Partial<TextStyle>) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
      <Slider label="Tamaño (×)" value={value.size} min={0.6} max={2.4} step={0.05} onChange={(v) => onChange({ size: v })} />
      <Slider label="Grosor" value={value.weight} min={100} max={900} step={100} onChange={(v) => onChange({ weight: v })} />
      <Toggle label="Negrita / itálica (italic)" value={value.italic} onChange={(v) => onChange({ italic: v })} />
      <Slider label="Espaciado entre letras (em)" value={value.tracking} min={-0.05} max={0.4} step={0.01} onChange={(v) => onChange({ tracking: v })} />
      <Slider label="Interlineado" value={value.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => onChange({ lineHeight: v })} />
      <Segmented
        label="Mayúsculas"
        value={value.transform}
        options={[['none', 'Normal'], ['uppercase', 'MAYÚS'], ['lowercase', 'minús'], ['capitalize', 'Capital']]}
        onChange={(v) => onChange({ transform: v as TextStyle['transform'] })}
      />
      <Segmented
        label="Familia"
        value={value.font}
        options={[['', 'Auto'], ['display', 'Display'], ['poster', 'Poster'], ['body', 'Cuerpo'], ['serif', 'Serif'], ['mono', 'Mono']]}
        onChange={(v) => onChange({ font: v as TextStyle['font'] })}
      />
      <Segmented
        label="Sombra de texto"
        value={value.shadow ?? 'none'}
        options={SHADOW_OPTIONS}
        onChange={(v) => onChange({ shadow: v as TextStyle['shadow'] })}
      />
      <ColorOrAuto label="Color" value={value.color} fallback="#ffffff" onChange={(v) => onChange({ color: v })} />
    </div>
  );
}

/* Color con interruptor "automático" (vacío) ↔ color propio. */
function ColorOrAuto({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (v: string) => void }) {
  const custom = value !== '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Toggle label={`${label}: propio`} value={custom} onChange={(on) => onChange(on ? fallback : '')} />
      {custom && <ColorCtl label={label} value={value || fallback} onChange={onChange} />}
    </div>
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
