/* ============================================================
   DEPRECADO (migración 072 — 2026-07-12): el modelo de planes ya no
   cobra por GMV/ventas, así que esta barra ya no aplica en ningún
   plan. Se dejó de importar en app/admin/(protected)/page.tsx.

   No se pudo borrar este archivo desde el sandbox (permisos del
   filesystem montado) — bórralo manualmente cuando puedas:
     rm src/components/admin/plan-gmv-bar.tsx
   Mientras tanto queda como stub inerte para no romper el build.
   ============================================================ */
export default function PlanGmvBar() {
  return null;
}
