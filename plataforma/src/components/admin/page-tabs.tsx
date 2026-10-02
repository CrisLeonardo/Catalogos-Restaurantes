'use client';

/* ============================================================
   PESTAÑAS DENTRO DE UNA PANTALLA (auditoría 2026-10-02, T-07)
   ------------------------------------------------------------
   Lealtad, Proveedores, Reservaciones, Lista de espera y Facturación
   tenían su propia fila subrayada en acento, distinta del control
   segmentado de la barra de sección (Pedidos › Tomar pedidos…) que se ve
   justo encima. Dos estilos de pestaña en la misma pantalla se leen como
   dos niveles de navegación distintos. Ahora es el mismo control
   (`.admin-tabs` + `.admin-tab`), con `.adm-tabs-page` para que viva en
   el contenido: a lo ancho en el teléfono, a su medida en escritorio.
   Los filtros (Tomar pedidos) siguen siendo píldoras: filtran una lista,
   no cambian de pantalla.
   ============================================================ */
export default function PageTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: readonly (readonly [K, string])[];
  value: K;
  onChange: (k: K) => void;
  label?: string;
}) {
  return (
    <div className="admin-tabs adm-tabs-page" role="tablist" aria-label={label}>
      {tabs.map(([k, text]) => (
        <button
          key={k}
          type="button"
          role="tab"
          aria-selected={value === k}
          data-active={value === k ? '1' : '0'}
          className="admin-tab press"
          onClick={() => onChange(k)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
