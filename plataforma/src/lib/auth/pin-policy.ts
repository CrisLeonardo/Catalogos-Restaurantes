/* ============================================================
   CANDADO DEL PIN — la decisión, sin dependencias (migración 112)
   ------------------------------------------------------------
   Vive aparte de trusted-device.ts (que habla con la base de datos) por la
   misma razón que tenant-guard.ts: la regla que decide quién entra tiene que
   poder probarse de verdad, y la única forma es que sea una función pura.

   Quien la llama carga los datos (¿el restaurante tiene el candado puesto?,
   ¿está este aparato en su lista?) y aplica la decisión; aquí no se consulta
   nada.
   ============================================================ */

/** Ids que genera lib/device-id.ts: un uuid, o `dev-<base36>`. */
const DEVICE_ID_RE = /^[a-zA-Z0-9-]{8,64}$/;

/** ¿Tiene forma de id de aparato? Filtra basura antes de tocar la base. */
export function isValidDeviceId(deviceId: string | null | undefined): boolean {
  return !!deviceId && DEVICE_ID_RE.test(deviceId);
}

export type PinAccessInput = {
  /** El restaurante encendió "el PIN solo funciona en los aparatos del local". */
  requiresTrusted: boolean;
  /** Este aparato ya está en la lista del restaurante. */
  trusted: boolean;
};

export type PinAccess = PinAccessInput & {
  /** ¿Puede este aparato usar el PIN y ver la grilla de nombres? */
  allowed: boolean;
};

/**
 * Único sitio donde se decide si este aparato puede entrar por PIN.
 *
 * La regla es corta a propósito: con el candado APAGADO todo sigue como
 * siempre (ningún restaurante que ya opera se ve afectado por la migración);
 * con el candado ENCENDIDO solo pasan los aparatos ya registrados.
 *
 * Que "apagado" implique permitir no es un descuido: es la mitad segura de
 * esta función. Un fallo al leer el estado del restaurante deja el sistema
 * como estaba —con el PIN protegido por su bloqueo de intentos y sus límites
 * por IP— en vez de dejar a un local entero sin poder abrir caja.
 */
export function decidePinAccess(input: PinAccessInput): PinAccess {
  return { ...input, allowed: input.trusted || !input.requiresTrusted };
}
