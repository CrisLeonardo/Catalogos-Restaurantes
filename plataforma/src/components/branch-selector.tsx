'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import { subdomainUrl } from '@/lib/tenant';
import { isLight } from '@/lib/theme/resolve';
import { nearestBranch } from '@/lib/geo';
import {
  getPreferredBranch,
  savePreferredBranch,
  clearPreferredBranch,
} from '@/lib/customer-local';
import type { PublicGroup, PublicBranch } from '@/lib/db/org-public';
import { assetSrc } from '@/lib/asset-image';

/* ============================================================
   SELECTOR PÚBLICO DE SUCURSAL (link único del grupo)
   Vive en grupo-slug.dominio. Detecta la ubicación del cliente,
   sugiere la sucursal más cercana y lo enruta a su menú. Siempre
   deja elegir manualmente y recuerda la elección.
   ============================================================ */

type View =
  | { kind: 'choose' }                                   // pantalla inicial
  | { kind: 'locating' }                                 // pidiendo GPS
  | { kind: 'suggestion'; branch: PublicBranch; distanceKm: number; withinRadius: boolean }
  | { kind: 'manual'; note?: string };                   // lista manual

export default function BranchSelector({ group }: { group: PublicGroup }) {
  const accent = group.color_primary || 'var(--brand-accent)';
  // Texto sobre el acento del grupo: auto por luminancia (antes #fff fijo,
  // ilegible si el grupo usa un acento claro tipo amarillo/crema).
  const onAccent = group.color_primary
    ? (isLight(group.color_primary) ? '#15130f' : '#ffffff')
    : 'var(--brand-on-accent, #fff)';
  const branches = group.branches;

  const [view, setView] = useState<View>({ kind: 'choose' });
  const [remembered, setRemembered] = useState<PublicBranch | null>(null);
  const [ready, setReady] = useState(false);

  // Al montar (solo cliente, para no romper la hidratación): ¿hay sucursal
  // recordada en localStorage y todavía válida?
  useEffect(() => {
    const slug = getPreferredBranch(group.slug);
    const found = slug ? branches.find((b) => b.slug === slug) ?? null : null;
    if (!found && slug) clearPreferredBranch(group.slug);

    setRemembered(found);
    setReady(true);
  }, [group.slug, branches]);

  function go(branch: PublicBranch) {
    savePreferredBranch(group.slug, branch.slug);
    window.location.href = subdomainUrl(branch.slug);
  }

  function detect() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setView({ kind: 'manual', note: 'Tu navegador no permite detectar la ubicación. Elige tu sucursal.' });
      return;
    }
    setView({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const best = nearestBranch(branches, pos.coords.latitude, pos.coords.longitude);
        if (!best) {
          setView({ kind: 'manual', note: 'Aún no podemos ubicar las sucursales en el mapa. Elige la tuya.' });
          return;
        }
        setView({
          kind: 'suggestion',
          branch: best.branch,
          distanceKm: best.distanceKm,
          withinRadius: best.withinRadius,
        });
      },
      () => {
        setView({ kind: 'manual', note: 'No pudimos detectar tu ubicación. Elige tu sucursal.' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        gap: 20,
      }}
    >
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Encabezado del grupo */}
        <header style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          {group.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={assetSrc(group.logo_url, 128)} alt={group.name} width={56} height={56} style={{ borderRadius: 14, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 56, height: 56, borderRadius: 14, background: accent, display: 'grid', placeItems: 'center', color: onAccent, fontWeight: 800, fontSize: 24, fontFamily: 'var(--font-display)' }}>
              {group.name.charAt(0)}
            </div>
          )}
          <div className="t-display" style={{ fontSize: 22, lineHeight: 1.15 }}>{group.name}</div>
          <p style={{ fontSize: 13.5, color: 'var(--u-text-3)', margin: 0 }}>
            Te llevamos a la sucursal más cercana para pedir en línea.
          </p>
        </header>

        {/* Cuerpo según vista (no renderiza hasta saber si hay recordada) */}
        {ready && remembered && view.kind === 'choose' && (
          <RememberedCard branch={remembered} accent={accent} onContinue={go} onChange={() => setRemembered(null)} />
        )}

        {ready && !(remembered && view.kind === 'choose') && (
          view.kind === 'locating' ? (
            <div className="glass" style={{ borderRadius: 16, padding: '28px 20px', textAlign: 'center' }}>
              <div className="spin" style={{ margin: '0 auto 12px', width: 26, height: 26, borderRadius: '50%', border: '2.5px solid var(--u-hair-2)', borderTopColor: accent }} />
              <p style={{ fontSize: 14, color: 'var(--u-text-2)', margin: 0 }}>Detectando tu ubicación…</p>
            </div>
          ) : view.kind === 'suggestion' ? (
            <SuggestionCard
              branch={view.branch}
              distanceKm={view.distanceKm}
              withinRadius={view.withinRadius}
              accent={accent}
              onConfirm={() => go(view.branch)}
              onPickOther={() => setView({ kind: 'manual' })}
            />
          ) : view.kind === 'manual' ? (
            // Fallback tras denegar/fallar la ubicación: lista + reintentar.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {view.note && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--u-text) 5%, transparent)', border: '1px solid var(--u-hair-2)' }}>
                  <Icon name="alertCircle" size={15} style={{ color: 'var(--u-text-3)', flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12.5, color: 'var(--u-text-3)', lineHeight: 1.5 }}>{view.note}</span>
                </div>
              )}
              <BranchList branches={branches} accent={accent} onPick={go} />
              <button onClick={detect} className="press" style={{ ...ghostBtn, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <Icon name="mapPin" size={15} /> Reintentar ubicación
              </button>
            </div>
          ) : (
            // Pantalla inicial: ubicación (primario) + elegir manualmente.
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <button
                onClick={detect}
                className="press"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  width: '100%', padding: '14px 18px', borderRadius: 'var(--radius-full)',
                  background: accent, color: onAccent, border: 'none', cursor: 'pointer',
                  fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-sans)',
                }}
              >
                <Icon name="mapPin" size={17} /> Usar mi ubicación
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--u-text-4)', fontSize: 11.5 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--u-hair)' }} />
                o elige tu sucursal
                <span style={{ flex: 1, height: 1, background: 'var(--u-hair)' }} />
              </div>
              <BranchList branches={branches} accent={accent} onPick={go} />
            </div>
          )
        )}
      </div>

      <style>{`@keyframes bsspin{to{transform:rotate(360deg)}} .spin{animation:bsspin .8s linear infinite}`}</style>
    </main>
  );
}

/* ── Sucursal recordada ─────────────────────────────────────── */
function RememberedCard({ branch, accent, onContinue, onChange }: {
  branch: PublicBranch; accent: string; onContinue: (b: PublicBranch) => void; onChange: () => void;
}) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>Tu sucursal</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="mapPin" size={18} style={{ color: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{branch.name}</div>
          {branch.address && <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>{branch.address}</div>}
        </div>
      </div>
      <button onClick={() => onContinue(branch)} className="press" style={primaryBtn(accent)}>
        Seguir en {branch.name} <Icon name="arrowRight" size={16} />
      </button>
      <button onClick={onChange} className="press" style={ghostBtn}>Cambiar sucursal</button>
    </div>
  );
}

/* ── Sugerencia (más cercana) ───────────────────────────────── */
function SuggestionCard({ branch, distanceKm, withinRadius, accent, onConfirm, onPickOther }: {
  branch: PublicBranch; distanceKm: number; withinRadius: boolean; accent: string;
  onConfirm: () => void; onPickOther: () => void;
}) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="t-kicker" style={{ fontSize: 9.5 }}>Sucursal más cercana</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="mapPin" size={18} style={{ color: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16 }}>{branch.name}</div>
          <div style={{ fontSize: 12, color: 'var(--u-text-4)', marginTop: 2 }}>
            {branch.address ? `${branch.address} · ` : ''}a {fmtKm(distanceKm)}
          </div>
        </div>
      </div>

      {!withinRadius && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--c-warn, #fbbf24) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--c-warn, #fbbf24) 28%, transparent)' }}>
          <Icon name="alertCircle" size={15} style={{ color: 'var(--c-warn, #fbbf24)', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12.5, color: 'var(--u-text-2)', lineHeight: 1.5 }}>
            Estás fuera de la zona de reparto de esta sucursal. Puedes pedir <strong>para llevar</strong> o ver el menú igualmente.
          </span>
        </div>
      )}

      <button onClick={onConfirm} className="press" style={primaryBtn(accent)}>
        Ir a {branch.name} <Icon name="arrowRight" size={16} />
      </button>
      <button onClick={onPickOther} className="press" style={ghostBtn}>Elegir otra sucursal</button>
    </div>
  );
}

/* ── Lista de sucursales (reutilizable) ─────────────────────── */
function BranchList({ branches, accent, onPick }: {
  branches: PublicBranch[]; accent: string; onPick: (b: PublicBranch) => void;
}) {
  return (
    <div className="glass" style={{ borderRadius: 16, overflow: 'hidden' }}>
      {branches.map((b, i) => (
        <button
          key={b.slug}
          onClick={() => onPick(b)}
          className="press"
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            padding: '13px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--u-hair)',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <Icon name="mapPin" size={16} style={{ color: accent, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--u-text)' }}>{b.name}</div>
            {b.address && <div style={{ fontSize: 11.5, color: 'var(--u-text-4)', marginTop: 2 }}>{b.address}</div>}
          </div>
          <Icon name="chevronRight" size={16} style={{ color: 'var(--u-text-4)', flexShrink: 0 }} />
        </button>
      ))}
    </div>
  );
}

/* ── helpers de estilo ──────────────────────────────────────── */
const primaryBtn = (accent: string): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  width: '100%', padding: '13px 18px', borderRadius: 'var(--radius-full)',
  background: accent,
  // Texto auto por luminancia del acento; si el acento viene como var CSS
  // (sin hex que medir), usa el on-accent del tema.
  color: accent.startsWith('#') ? (isLight(accent) ? '#15130f' : '#ffffff') : 'var(--brand-on-accent, #fff)',
  border: 'none', cursor: 'pointer',
  fontSize: 14.5, fontWeight: 700, fontFamily: 'var(--font-sans)',
});
const ghostBtn: React.CSSProperties = {
  width: '100%', padding: '11px 18px', borderRadius: 'var(--radius-full)',
  background: 'color-mix(in srgb, var(--u-text) 4%, transparent)', color: 'var(--u-text-2)',
  border: '1px solid var(--u-hair-2)', cursor: 'pointer',
  fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font-sans)',
};

function fmtKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
