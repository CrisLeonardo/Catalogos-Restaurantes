/**
 * ¿Existe esta mesa en el local? (auditoría 1.12, M01)
 * Las mesas se identifican por número, de 1 a `dineInTableCount`. Un QR
 * de una mesa que no existe (impreso para otro local, o un enlace con un
 * número cambiado) no deja pedir a esa mesa: lo dice la carta y lo
 * rechaza el servidor (decisión del dueño, 2026-11-09).
 */
export function mesaExiste(numero: number | null | undefined, totalMesas: number | null | undefined): boolean {
  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 1) return false;
  const total = Number(totalMesas);
  return Number.isFinite(total) && total >= 1 ? numero <= total : true;
}
