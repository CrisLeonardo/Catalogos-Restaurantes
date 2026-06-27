'use client';

/* ============================================================
   TutorialHub — /admin/ayuda
   Centro de ayuda del panel admin, adaptado al plan activo.
   Fases implementadas:
   · Fase 1 ✅ — Búsqueda, acordeón, plan-gating, placeholders de captura
   · Fase 2 ✅ — Tour de bienvenida (overlay spotlight + burbuja, localStorage key)
   · Fase 3 ✅ — Botones ? contextuales (HelpButton en topbar del shell)
   · Fase 4 ✅ — Screenshots reales en /public/tutorial/screenshots/
   ============================================================ */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import {
  TUTORIAL_SECTIONS,
  getPlanLevelNum,
  isSectionLocked,
  getPlanLabel,
  searchSections,
  type TutorialSectionDef,
  type TutorialStep,
} from '@/lib/tutorial/content';

interface Props {
  plan: string | null;
  modules: Record<string, boolean>;
}

const PLAN_COLORS: Record<string, string> = {
  'Plan Popular': '#f59e0b',
  'Plan Premium': '#6366f1',
  'Módulo': '#14b8a6',
};

export default function TutorialHub({ plan, modules }: Props) {
  const planNum = getPlanLevelNum(plan);
  const [query, setQuery] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'primeros-pasos': true,
  });

  const filteredSections = useMemo(
    () => searchSections(TUTORIAL_SECTIONS, query),
    [query],
  );

  function toggleSection(id: string) {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const isSearching = query.trim().length > 0;

  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h2 className="t-display" style={{ fontSize: 22, lineHeight: 1.1 }}>
            Centro de ayuda
          </h2>
          <p style={{ fontSize: 13, color: 'var(--u-text-3)', marginTop: 4 }}>
            Guía completa de tu sistema, adaptada a tu plan{plan ? ` ${getPlanDisplayName(plan)}` : ''}.
          </p>
        </div>

        {/* Botón tour — reinicia el tour borrando la flag y redirige al dashboard */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined') {
              window.localStorage.removeItem('leogin_tour_completed');
              window.location.href = '/admin';
            }
          }}
          className="press glass-quiet"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '9px 16px', borderRadius: 12, border: 'none',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            color: 'var(--u-text-2)', background: 'none', flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={16} />
          Ver tour de bienvenida
        </button>
      </div>

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
            borderRadius: 12, border: '1.5px solid var(--u-hair)',
            background: 'var(--surface-3, rgba(255,255,255,0.04))',
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

      {/* Resultados vacíos */}
      {isSearching && filteredSections.length === 0 && (
        <div
          className="glass"
          style={{ borderRadius: 16, padding: '32px 20px', textAlign: 'center', color: 'var(--u-text-3)' }}
        >
          <Icon name="helpCircle" size={28} style={{ marginBottom: 10 }} />
          <p style={{ fontSize: 14 }}>No encontramos resultados para <strong>&quot;{query}&quot;</strong>.</p>
          <p style={{ fontSize: 12, marginTop: 4 }}>Intenta con otra palabra o <button type="button" onClick={() => setQuery('')} style={{ background: 'none', border: 'none', color: 'var(--brand-accent)', cursor: 'pointer', fontSize: 12 }}>limpia la búsqueda</button>.</p>
        </div>
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

      {/* Soporte */}
      <div
        className="glass-quiet"
        style={{ borderRadius: 14, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}
      >
        <span style={{
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: 'rgba(var(--brand-accent-rgb,99,102,241),0.12)',
          color: 'var(--brand-accent)',
        }}>
          <Icon name="helpCircle" size={18} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--u-text)' }}>¿No encontraste lo que buscabas?</div>
          <div style={{ fontSize: 12, color: 'var(--u-text-3)', marginTop: 2 }}>
            Nuestro equipo de soporte está disponible para ayudarte.
          </div>
        </div>
        <Link
          href="/admin/soporte"
          className="press"
          style={{
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: 'rgba(var(--brand-accent-rgb,99,102,241),0.12)',
            color: 'var(--brand-accent)', textDecoration: 'none', flexShrink: 0,
          }}
        >
          Ir a soporte
        </Link>
      </div>
    </div>
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
    <div
      id={`ayuda-${section.id}`}
      className="glass"
      style={{
        borderRadius: 16,
        border: locked ? '1.5px solid var(--u-hair)' : '1.5px solid transparent',
        overflow: 'hidden',
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
          width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          background: locked
            ? 'rgba(255,255,255,0.04)'
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
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                background: `${labelColor}20`, color: labelColor ?? '#94a3b8',
                border: `1px solid ${labelColor}40`,
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
            <StepsList steps={section.steps} sectionId={section.id} />
          )}
        </div>
      )}
    </div>
  );
}

/* ── Contenido bloqueado ─────────────────────────────────── */

function LockedContent({ planLabel, moduleKey }: { planLabel: string | null; moduleKey?: string }) {
  const isModule = !!moduleKey;

  return (
    <div style={{
      borderRadius: 12, padding: '20px 18px', textAlign: 'center',
      background: 'var(--surface-3, rgba(255,255,255,0.03))',
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
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(20,184,166,0.12)', color: '#14b8a6', textDecoration: 'none',
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
              padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              background: 'rgba(99,102,241,0.12)', color: '#6366f1', textDecoration: 'none',
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

function StepsList({ steps, sectionId }: { steps: TutorialStep[]; sectionId: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {steps.map((step, i) => (
        <StepItem key={step.id} step={step} number={i + 1} sectionId={sectionId} />
      ))}
    </div>
  );
}

/* ── Paso individual ─────────────────────────────────────── */

function StepItem({ step, number, sectionId }: { step: TutorialStep; number: number; sectionId: string }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 20,
        paddingTop: number > 1 ? 24 : 0,
        borderTop: number > 1 ? '1px solid var(--u-hair)' : 'none',
      }}
    >
      {/* Lado izquierdo: texto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Número + título */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span style={{
            width: 26, height: 26, borderRadius: 99, flexShrink: 0,
            display: 'grid', placeItems: 'center',
            background: 'rgba(var(--brand-accent-rgb,99,102,241),0.14)',
            color: 'var(--brand-accent)',
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
            marginLeft: 36, padding: '8px 12px', borderRadius: 9,
            background: 'var(--surface-3, rgba(255,255,255,0.03))',
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
            marginLeft: 36, padding: '9px 12px', borderRadius: 9,
            background: 'rgba(var(--brand-accent-rgb,99,102,241),0.07)',
            border: '1px solid rgba(var(--brand-accent-rgb,99,102,241),0.2)',
          }}>
            <Icon name="sparkle" size={14} style={{ color: 'var(--brand-accent)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 12, color: 'var(--u-text-2)', lineHeight: 1.55 }}>
              <strong>Tip:</strong> {step.tip}
            </span>
          </div>
        )}
      </div>

      {/* Lado derecho: placeholder de captura */}
      <TutorialCaptura
        sectionId={sectionId}
        stepNumber={number}
        desc={step.screenshotDesc ?? step.title}
      />
    </div>
  );
}

/* ── Captura de pantalla ─────────────────────────────────── */
/* Carga la imagen real desde /public/tutorial/screenshots/.
   Si el archivo no existe (404), muestra el placeholder de espera. */

function TutorialCaptura({
  sectionId,
  stepNumber,
  desc,
}: {
  sectionId: string;
  stepNumber: number;
  desc: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const filename = `${sectionId}-paso${stepNumber}.png`;
  const src = `/tutorial/screenshots/${filename}`;

  if (!imgFailed) {
    return (
      <div
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--u-hair)',
          background: 'var(--surface-3, rgba(255,255,255,0.02))',
          minHeight: 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={desc}
          onError={() => setImgFailed(true)}
          style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12 }}
        />
      </div>
    );
  }

  return (
    <div
      title={`Captura pendiente: ${filename}`}
      style={{
        borderRadius: 12,
        border: '1.5px dashed var(--u-hair)',
        background: 'var(--surface-3, rgba(255,255,255,0.02))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '28px 20px',
        textAlign: 'center',
        minHeight: 120,
        color: 'var(--u-text-4)',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        display: 'grid', placeItems: 'center',
      }}>
        <Icon name="image" size={20} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 11.5, lineHeight: 1.4 }}>{desc}</span>
        <span style={{
          fontSize: 10, color: 'var(--u-text-5, var(--u-text-4))',
          fontFamily: 'monospace', opacity: 0.6,
        }}>
          {filename}
        </span>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────── */

function getPlanDisplayName(plan: string): string {
  const names: Record<string, string> = {
    BASICO: 'Básico', ESTANDAR: 'Estándar', POPULAR: 'Popular',
    PREMIUM: 'Premium', PREMIUM_PRO: 'Premium Pro',
    PREMIUM_ULTRA: 'Premium Ultra', ALTO_VOLUMEN: 'Alto Volumen', VARIABLE: 'Variable',
  };
  return names[plan] ?? plan;
}
