/* ============================================================
   CIFRA DE MI CUENTA — una sola, para Resumen, Finanzas y
   Comparativa (cada página tenía su copia).
   ------------------------------------------------------------
   Auditoría 2026-10-02 (MIC-03/MIC-04): la primera cifra («hero»)
   iba en la letra de portada a 26 px y en una rejilla de dos
   columnas no cabía — «Q2,650.00» se salía de su tarjeta en un
   teléfono de 390 px. Ahora todas van en la mono del panel (las
   cifras se alinean entre sí), la grande crece con el ancho de
   pantalla sin pasarse, y la tarjeta puede encogerse (`minWidth: 0`).
   El rótulo sube de 9,5 a 11 px.
   ============================================================ */

export default function Kpi({ label, value, sub, hero, small }: {
  label: string;
  value: string;
  sub?: string;
  /** La cifra principal de la fila: un poco más grande. */
  hero?: boolean;
  /** Texto en vez de número (p. ej. el nombre del restaurante): se corta con «…». */
  small?: boolean;
}) {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <div className="t-kicker" style={{ fontSize: 11 }}>{label}</div>
      <div
        className="t-mono"
        style={{
          fontWeight: 600,
          fontSize: small ? 16 : hero ? 'clamp(20px, 5.6vw, 26px)' : 'clamp(18px, 5vw, 22px)',
          color: 'var(--u-text)',
          lineHeight: 1.1,
          ...(small
            ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
            : { overflowWrap: 'anywhere' }),
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--u-text-3)' }}>{sub}</div>}
    </div>
  );
}
