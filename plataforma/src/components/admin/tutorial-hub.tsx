'use client';

/* ============================================================
   TutorialHub — /admin/ayuda
   Centro de ayuda del panel admin, adaptado al plan activo.
   · Búsqueda, acordeón por sección, plan-gating.
   · Tour de bienvenida (overlay spotlight, localStorage key).
   · Botones ? contextuales (HelpButton en topbar del shell).
   · TOURS GUIADOS "Ver en mi panel": la ayuda señala la interfaz
     REAL con un spotlight y navega sola entre páginas (motor en
     guided-tour.tsx, pasos en lib/tutorial/tours.ts). Sustituyen
     a las capturas de pantalla: no hay imágenes que mantener ni
     que caduquen con cada cambio de UI.
   ============================================================ */

import { useState, useMemo } from 'react';
/* `Link` es aqui `PanelLink`: traduce las rutas del panel al origen desde el
   que se sirve la pagina. Lo que no es del panel pasa de largo sin tocarse.
   Ver components/admin/panel-link.tsx. */
import Link from '@/components/admin/panel-link';
import { Icon } from '@/components/icons';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { List, ListButton, ListText } from '@/components/ui/list';
import { startGuidedTour } from '@/components/admin/guided-tour';
import { getGuidedTour } from '@/lib/tutorial/tours';
import type { PlatformContactSettings } from '@/lib/actions/super-admin';
import {
  TUTORIAL_SECTIONS,
  getPlanLevelNum,
  isSectionLocked,
  getPlanLabel,
  searchSections,
  type TutorialSectionDef,
  type TutorialStep,
} from '@/lib/tutorial/content';
import { usePathname as useRutaNavegador } from 'next/navigation';
import { panelBaseFrom, panelHref } from '@/lib/panel-links';

interface Props {
  plan: string | null;
  modules: Record<string, boolean>;
  contact: PlatformContactSettings;
}

const PLAN_COLORS: Record<string, string> = {
  'Plan Popular': 'var(--c-warn)',
  'Plan Premium': 'var(--c-alt)',
  /* Tinta del sistema y no un hex: #14b8a6 era legible en oscuro y se
     quedaba en 2.2:1 sobre el blanco del tema claro. */
  'Módulo': 'var(--c-info)',
};

export default function TutorialHub({ plan, modules, contact }: Props) {
  /* Prefijo del origen unico ('' en el subdominio de hoy). Ver lib/panel-links.ts. */
  const base = panelBaseFrom(useRutaNavegador());
  const planNum = getPlanLevelNum(plan);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'primeros-pasos': true,
  });

  // Las secciones de un módulo activable (moduleKey) no se muestran en
  // absoluto si el restaurante no tiene ese módulo habilitado — a diferencia
  // de las secciones limitadas por plan (que sí quedan visibles "bloqueadas"
  // como incentivo de upgrade), un módulo apagado no es un ítem a promocionar
  // y solo saturaría la lista de ayuda.
  const filteredSections = useMemo(
    () => searchSections(TUTORIAL_SECTIONS, query).filter(
      (s) => !s.moduleKey || modules[s.moduleKey] === true,
    ),
    [query, modules],
  );

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>

      {/* Entradilla. El título lo pone la barra de arriba ("Centro de ayuda");
          repetirlo aquí a 22 px solo empujaba hacia abajo el buscador, que es
          lo que de verdad se usa en esta pantalla. */}
      <p style={{ fontSize: 14, color: 'var(--u-text-3)', lineHeight: 1.5 }}>
        Guía completa de tu sistema, adaptada a tu plan{plan ? ` ${getPlanDisplayName(plan)}` : ''}.
        Las secciones con <strong style={{ color: 'var(--u-text-2)' }}>guía interactiva</strong> te
        muestran cada paso señalándolo en tu propio panel.
      </p>

      {/* Barra de búsqueda */}
      <div style={{ position: 'relative' }}>
        <Icon
          name="search"
          size={16}
          style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--u-text-4)', pointerEvents: 'none',
          }}
        />
        <input
          type="search"
          placeholder="Busca un tema: pedidos, QR, inventario, cupones…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%', padding: '11px 14px 11px 40px',
            borderRadius: 'var(--radius-lg)', border: '1.5px solid var(--u-hair)',
            background: 'var(--surface-3, color-mix(in srgb, var(--u-text) 4%, transparent))',
            color: 'var(--u-text)', fontSize: 14, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--u-text-4)', padding: 4,
            }}
          >
            <Icon name="x" size={14} />
          </button>
        )}
      </div>

      {/* El tour, como primera fila y no como botón peleando con el titular:
          es un destino ("empezá por aquí"), y de fila se lee y se toca igual
          que todo lo demás de esta pantalla. Se esconde mientras se busca,
          porque entonces lo único que importa son los resultados. */}
      {!isSearching && (
        <List>
          <ListButton
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem('leogin_tour_completed');
                window.location.href = panelHref(base, '/admin');
              }
            }}
          >
            <span
              className="grid size-7 shrink-0 place-items-center rounded-adm-md"
              style={{ background: 'color-mix(in srgb, var(--u-text) 8%, transparent)', color: 'var(--u-text-2)' }}
            >
              <Icon name="sparkle" size={16} />
            </span>
            <ListText
              title="Ver el tour de bienvenida"
              desc="Un repaso guiado del panel, señalando cada cosa en su sitio."
            />
            <Icon name="chevronRight" size={15} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
          </ListButton>
        </List>
      )}

      {/* Resultados vacíos */}
      {isSearching && filteredSections.length === 0 && (
        <Card className="px-5 py-8 text-center" style={{ color: 'var(--u-text-3)' }}>
          <Icon name="helpCircle" size={28} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14 }}>No encontramos resultados para <strong>&quot;{query}&quot;</strong>.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Intenta con otra palabra o <button type="button" onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--brand-accent-ink)', cursor: 'pointer', fontSize: 12 }}>limpia la búsqueda</button>.</p>
        </Card>
      )}

      {/* Secciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredSections.map((section) => {
          const locked = isSectionLocked(section, planNum, modules);
          const planLabel = getPlanLabel(section.planLevel, section.moduleKey);
          const isOpen = isSearching || !!openSections[section.id];

          return (
            <TutorialSection
              key={section.id}
              section={section}
              locked={locked}
              planLabel={planLabel}
              isOpen={isOpen}
              onToggle={() => toggleSection(section.id)}
            />
          );
        })}
      </div>

      {/* Contactar soporte */}
      <ContactSupportCard contact={contact} />
    </div>
  );
}

/* ── Contactar soporte ───────────────────────────────────── */

function ContactSupportCard({ contact }: { contact: PlatformContactSettings }) {
  const waLink = contact.support_whatsapp
    ? `https://wa.me/${contact.support_whatsapp.replace(/\D/g, '')}`
    : null;
  const mailLink = contact.support_email ? `mailto:${contact.support_email}` : null;

  return (
    <Card className="px-5 py-4.5 mt-1">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: 'rgba(var(--brand-accent-rgb,99,102,241),0.12)',
          color: 'var(--brand-accent-ink)',
        }}>
          <Icon name="helpCircle" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>¿No encontraste lo que buscabas?</div>
          <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
            Escríbenos directamente y te respondemos a la brevedad.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {waLink ? (
          <Button
            render={<a href={waLink} target="_blank" rel="noopener noreferrer" />}
            size="lg"
            className="justify-start h-auto py-3 whitespace-normal"
            style={{
              background: 'var(--c-ok-bg)',
              border: '1px solid var(--c-ok-line)',
              color: 'var(--c-ok)',
            }}
          >
            <Icon name="whatsapp" size={18} />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0, textAlign: 'left' }}>
              <span>Escribir por WhatsApp</span>
              {contact.support_whatsapp && (
                /* El dato de contacto va en la MISMA tinta que su botón, un
                   punto más suave. Los rgba() de antes eran los tonos del
                   tema oscuro: en claro, verde y azul pálidos sobre blanco
                   (1.3:1 y 1.7:1) — el teléfono y el correo de soporte no
                   se leían. */
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--c-ok)', opacity: 0.85, wordBreak: 'break-all' }}>
                  {contact.support_whatsapp}
                </span>
              )}
            </span>
          </Button>
        ) : (
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '13px 18px', borderRadius: 'var(--radius-lg)',
              fontSize: 14, opacity: 0.4,
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
              color: 'var(--u-text-3)',
            }}
          >
            <Icon name="whatsapp" size={18} />
            WhatsApp no configurado
          </div>
        )}

        {mailLink ? (
          <Button
            render={<a href={mailLink} />}
            size="lg"
            className="justify-start h-auto py-3 whitespace-normal"
            style={{
              background: 'var(--c-info-bg)',
              border: '1px solid var(--c-info-line)',
              color: 'var(--c-info)',
            }}
          >
            <Icon name="mail" size={18} />
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, minWidth: 0, textAlign: 'left' }}>
              <span>Enviar correo electrónico</span>
              {contact.support_email && (
                <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--c-info)', opacity: 0.85, wordBreak: 'break-all' }}>
                  {contact.support_email}
                </span>
              )}
            </span>
          </Button>
        ) : (
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 10,
              padding: '13px 18px', borderRadius: 'var(--radius-lg)',
              fontSize: 14, opacity: 0.4,
              background: 'color-mix(in srgb, var(--u-text) 4%, transparent)',
              border: '1px solid var(--u-hair)',
              color: 'var(--u-text-3)',
            }}
          >
            <Icon name="mail" size={18} />
            Correo no configurado
          </div>
        )}
      </div>
    </Card>
  );
}

/* ── Sección acordeón ────────────────────────────────────── */

function TutorialSection({
  section,
  locked,
  planLabel,
  isOpen,
  onToggle,
}: {
  section: TutorialSectionDef;
  locked: boolean;
  planLabel: string | null;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const labelColor = planLabel ? (PLAN_COLORS[planLabel] ?? '#94a3b8') : null;

  return (
    <Card
      id={`ayuda-${section.id}`}
      className="overflow-hidden p-0"
      style={{
        border: locked ? '1.5px solid var(--u-hair)' : '1.5px solid transparent',
        opacity: locked ? 0.72 : 1,
      }}
    >
      {/* Encabezado de la sección */}
      <button
        type="button"
        onClick={onToggle}
        className="press"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '16px 18px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        {/* Ícono */}
        <span style={{
          width: 38, height: 38, borderRadius: 'var(--radius-md)', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: locked
            ? 'color-mix(in srgb, var(--u-text) 4%, transparent)'
            : 'rgba(var(--brand-accent-rgb,99,102,241),0.12)',
          color: locked ? 'var(--u-text-4)' : 'var(--brand-accent)',
        }}>
          <Icon name={locked ? 'lock' : section.icon} size={17} />
        </span>

        {/* Título + descripción */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--u-text)' }}>
              {section.title}
            </span>
            {planLabel && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                background: `color-mix(in srgb, ${labelColor} 13%, transparent)`, color: labelColor ?? '#94a3b8',
                border: `1px solid color-mix(in srgb, ${labelColor} 25%, transparent)`,
                textTransform: 'uppercase', letterSpacing: '0.04em',
              }}>
                {planLabel}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
            {section.description}
          </div>
        </div>

        {/* Chevron */}
        <Icon
          name="chevronDown"
          size={16}
          style={{
            color: 'var(--u-text-4)', flexShrink: 0,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 200ms',
          }}
        />
      </button>

      {/* Contenido expandido */}
      {isOpen && (
        <div style={{ padding: '0 18px 18px' }}>
          {locked ? (
            <LockedContent planLabel={planLabel} moduleKey={section.moduleKey} />
          ) : (
            <>
              {/* Tour guiado sobre el panel real (si esta sección tiene uno) */}
              {getGuidedTour(section.id) && (
                <Button
                  type="button"
                  onClick={() => startGuidedTour(section.id)}
                  className="mb-4.5"
                >
                  <Icon name="sparkle" size={15} />
                  Ver en mi panel (guía interactiva)
                </Button>
              )}
              <StepsList steps={section.steps} />
            </>
          )}
        </div>
      )}
    </Card>
  );
}

/* ── Contenido bloqueado ─────────────────────────────────── */

function LockedContent({ planLabel, moduleKey }: { planLabel: string | null; moduleKey?: string }) {
  const isModule = !!moduleKey;

  return (
    <div style={{
      borderRadius: 'var(--radius-lg)', padding: '20px 18px', textAlign: 'center',
      background: 'var(--surface-3, color-mix(in srgb, var(--u-text) 3%, transparent))',
      border: '1.5px dashed var(--u-hair)',
    }}>
      <Icon name="lock" size={22} style={{ color: 'var(--u-text-4)', marginBottom: 10 }} />
      {isModule ? (
        <>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-2)', margin: '0 0 6px' }}>
            Módulo no activado
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: '0 0 14px' }}>
            Este módulo está disponible en tu plan pero necesita ser activado.
            Ve a Módulos para encenderlo.
          </p>
          <Link
            href="/admin/modulos"
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
              background: 'var(--c-info-bg)', color: 'var(--c-info)', textDecoration: 'none',
            }}
          >
            Ir a Módulos →
          </Link>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text-2)', margin: '0 0 6px' }}>
            Disponible en {planLabel}
          </p>
          <p style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5, margin: '0 0 14px' }}>
            Esta funcionalidad forma parte de un plan superior. Mejora tu plan para desbloquearla.
          </p>
          <Link
            href="/admin/suscripcion"
            className="press"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600,
              background: 'var(--c-alt-bg)', color: 'var(--c-alt)', textDecoration: 'none',
            }}
          >
            Ver mi suscripción →
          </Link>
        </>
      )}
    </div>
  );
}

/* ── Lista de pasos ──────────────────────────────────────── */
/* Texto a ancho completo. Antes cada paso llevaba al lado una
   captura de pantalla (/public/tutorial/screenshots/): mantener
   una imagen por paso era insostenible — cada cambio de UI las
   dejaba viejas. El "mira dónde está" lo resuelve ahora el tour
   guiado sobre el panel real. */

function StepsList({ steps }: { steps: TutorialStep[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {steps.map((step, i) => (
        <StepItem key={step.id} step={step} number={i + 1} />
      ))}
    </div>
  );
}

/* ── Paso individual ─────────────────────────────────────── */

function StepItem({ step, number }: { step: TutorialStep; number: number }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        maxWidth: 640,
        paddingTop: number > 1 ? 22 : 0,
        borderTop: number > 1 ? '1px solid var(--u-hair)' : 'none',
      }}
    >
      {/* Número + título */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{
          width: 26, height: 26, borderRadius: 'var(--radius-full)', flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: 'rgba(var(--brand-accent-rgb,99,102,241),0.14)',
          color: 'var(--brand-accent-ink)',
          fontSize: 12, fontWeight: 800, marginTop: 1,
        }}>
          {number}
        </span>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--u-text)', margin: 0, lineHeight: 1.3 }}>
          {step.title}
        </h4>
      </div>

      {/* Descripción */}
      <p style={{ fontSize: 13, color: 'var(--u-text-2)', margin: 0, lineHeight: 1.65, paddingLeft: 36 }}>
        {step.description}
      </p>

      {/* Ruta de navegación */}
      {step.route && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 7,
          marginLeft: 36, padding: '8px 12px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface-3, color-mix(in srgb, var(--u-text) 3%, transparent))',
          border: '1px solid var(--u-hair)',
        }}>
          <Icon name="chevronRight" size={13} style={{ color: 'var(--u-text-4)', flexShrink: 0, marginTop: 2 }} />
          <span style={{ fontSize: 11.5, color: 'var(--u-text-3)', lineHeight: 1.5, fontFamily: 'var(--font-mono, monospace)' }}>
            {step.route}
          </span>
        </div>
      )}

      {/* Tip */}
      {step.tip && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          marginLeft: 36, padding: '9px 12px', borderRadius: 'var(--radius-md)',
          background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)',
          border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.2)',
        }}>
          <Icon name="sparkle" size={14} style={{ color: 'var(--brand-accent-ink)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--u-text-2)', lineHeight: 1.55 }}>
            <strong>Tip:</strong> {step.tip}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function getPlanDisplayName(plan: string): string {
  const names: Record<string, string> = {
    BASICO: 'Básico', ESTANDAR: 'Estándar', PREMIUM: 'Premium', PRO: 'Pro',
  };
  return names[plan] ?? plan;
}
