import { describe, it, expect } from 'vitest';
import {
  impedimentoDeCuentaParaCorreo,
  impedimentoParaCambiarCorreo,
  impedimentoParaEnlace,
  type CuentaParaRescate,
} from './account-rescue-rules';

/* ════════════════════════════════════════════════════════════
   LO QUE EL RESCATE NO PUEDE HACER (fase 2)
   ------------------------------------------------------------
   Estas reglas se saltan una sola vez y el daño es de los que no se
   ven en el momento: la cuenta de Google se parte en dos —con sus
   restaurantes repartidos entre las dos mitades— y el acceso por PIN
   del local deja de abrir sin que nadie relacione una cosa con la
   otra. Por eso están aquí y no dentro de la acción.
   ════════════════════════════════════════════════════════════ */

function cuenta(over: Partial<CuentaParaRescate> = {}): CuentaParaRescate {
  return {
    email: 'carlos@ejemplo.com',
    providers: ['email'],
    esPin: false,
    ...over,
  };
}

const PIN = cuenta({
  email: 'u.9f2c4a1b.carlos@staff.leogin.internal',
  esPin: true,
});

describe('corregir el correo', () => {
  it('se puede con una cuenta normal de correo y contraseña', () => {
    expect(impedimentoParaCambiarCorreo(cuenta(), 'carlos@gmail.com')).toBeNull();
  });

  it('NO se puede si entra con Google', () => {
    // Su identidad en Google seguiría apuntando al correo viejo: la próxima
    // vez que pulse el botón acabaría con dos cuentas.
    expect(
      impedimentoParaCambiarCorreo(cuenta({ providers: ['google'] }), 'carlos@gmail.com'),
    ).toBe('google');
  });

  it('NO se puede si entra con Google Y con contraseña', () => {
    expect(
      impedimentoParaCambiarCorreo(cuenta({ providers: ['email', 'google'] }), 'carlos@gmail.com'),
    ).toBe('google');
  });

  it('NO se puede con una credencial por PIN', () => {
    expect(impedimentoParaCambiarCorreo(PIN, 'carlos@gmail.com')).toBe('pin');
  });

  it('lo que descalifica a la CUENTA se dice antes que lo del correo', () => {
    // Con el orden al revés, a alguien con Google que además tecleó mal el
    // correo se le mandaría a corregir un campo que no le iba a servir.
    expect(
      impedimentoParaCambiarCorreo(cuenta({ providers: ['google'] }), 'esto-no-es-un-correo'),
    ).toBe('google');
  });

  it('rechaza un correo mal escrito', () => {
    expect(impedimentoParaCambiarCorreo(cuenta(), 'juan@gmial')).toBe('formato');
    expect(impedimentoParaCambiarCorreo(cuenta(), '')).toBe('formato');
    expect(impedimentoParaCambiarCorreo(cuenta(), 'juan @gmail.com')).toBe('formato');
  });

  it('rechaza el dominio interno del personal por PIN', () => {
    expect(
      impedimentoParaCambiarCorreo(cuenta(), 'u.abc.pepe@staff.leogin.internal'),
    ).toBe('dominio-interno');
  });

  it('rechaza guardar el mismo correo que ya tiene', () => {
    expect(impedimentoParaCambiarCorreo(cuenta(), 'carlos@ejemplo.com')).toBe('sin-cambio');
  });

  it('el mismo correo con otras mayúsculas o espacios sigue siendo el mismo', () => {
    expect(impedimentoParaCambiarCorreo(cuenta(), '  CARLOS@Ejemplo.com  ')).toBe('sin-cambio');
  });

  it('una cuenta sin correo puede recibir uno', () => {
    expect(impedimentoParaCambiarCorreo(cuenta({ email: null }), 'carlos@gmail.com')).toBeNull();
  });
});

describe('mandar el enlace de recuperación', () => {
  it('se puede con una cuenta normal y el proveedor puesto', () => {
    expect(impedimentoParaEnlace(cuenta(), true)).toBeNull();
  });

  it('NO se puede sin proveedor de correo', () => {
    expect(impedimentoParaEnlace(cuenta(), false)).toBe('sin-proveedor');
  });

  it('NO se puede a una credencial por PIN, ni con el proveedor puesto', () => {
    expect(impedimentoParaEnlace(PIN, true)).toBe('pin');
  });

  it('a una credencial por PIN se le dice PIN, no «falta el proveedor»', () => {
    // Decirle lo del proveedor haría creer que el día que se configure
    // Resend esto va a funcionar, y no va a funcionar nunca: no hay buzón.
    expect(impedimentoParaEnlace(PIN, false)).toBe('pin');
  });

  it('NO se puede a una cuenta sin correo', () => {
    expect(impedimentoParaEnlace(cuenta({ email: null }), true)).toBe('sin-correo');
  });
});

describe('lo que la pantalla apaga antes de que nadie teclee', () => {
  /* La pantalla y la acción tienen que decir lo mismo: si el formulario deja
     escribir algo que la acción va a rechazar, quien está al teléfono ya
     prometió que estaba resuelto. */

  it('una cuenta normal no se apaga', () => {
    expect(impedimentoDeCuentaParaCorreo(cuenta())).toBeNull();
  });

  it('la de Google se apaga, y con el mismo motivo que daría la acción', () => {
    const c = cuenta({ providers: ['google'] });
    expect(impedimentoDeCuentaParaCorreo(c)).toBe('google');
    expect(impedimentoParaCambiarCorreo(c, 'nuevo@ejemplo.com')).toBe('google');
  });

  it('la de PIN se apaga, y con el mismo motivo que daría la acción', () => {
    expect(impedimentoDeCuentaParaCorreo(PIN)).toBe('pin');
    expect(impedimentoParaCambiarCorreo(PIN, 'nuevo@ejemplo.com')).toBe('pin');
  });

  it('no se apaga por un correo mal escrito: eso lo dice el formulario al enviar', () => {
    expect(impedimentoDeCuentaParaCorreo(cuenta())).toBeNull();
    expect(impedimentoParaCambiarCorreo(cuenta(), 'roto')).toBe('formato');
  });
});
