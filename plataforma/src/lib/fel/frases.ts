/* ============================================================
   FRASES DEL DTE · catálogo del SAT
   ------------------------------------------------------------
   Las frases son las leyendas legales que van impresas en la factura y
   le dicen al receptor cómo tratarla: si debe retenerte ISR, si tu
   factura le da crédito fiscal del IVA, si eres agente de retención.
   No son decorativas y no son opcionales.

   Fuente: FEL-CATALOGO-FRASES v0.6.0 del SAT (actualizado 25/03/2025).
   Los códigos de abajo están transcritos de ahí, no deducidos.

   ── Por qué esto es un módulo y no dos líneas en el XML ──
   Antes el XML fijaba TipoFrase="1" CodigoEscenario="1" para el régimen
   general y TipoFrase="2" para el pequeño contribuyente. Las dos estaban
   mal: la 2 es "Es Agente de Retención del IVA" (el pequeño contribuyente
   lleva la 3), y fijar el escenario 1 del ISR declara al emisor en
   Régimen Sobre las Utilidades aunque esté en Opcional Simplificado, que
   es lo normal en un restaurante pequeño.

   Nadie lo habría notado desde el código: el certificador acepta esas
   frases porque son válidas, solo que describen a otro contribuyente. El
   error aparece cuando al restaurante le retienen (o no le retienen) lo
   que no correspondía.

   Tres reglas que el catálogo impone y que aquí se respetan:
     1. Las frases se ACUMULAN. Un pequeño contribuyente del régimen
        electrónico lleva dos, no una.
     2. Algunas exigen número (y a veces fecha) de resolución de la SAT.
        Sin eso el DTE se rechaza.
     3. El texto que se imprime lo fija el SAT. Se incluye aquí para poder
        enseñárselo al dueño y que lo confirme con su contador ANTES de
        emitir, no después.
   ============================================================ */

/** Régimen de ISR del emisor. Determina la frase de tipo 1. */
export type RegimenIsr =
  | 'UTILIDADES'                 // Sobre las Utilidades de Actividades Lucrativas
  | 'SIMPLIFICADO'               // Opcional Simplificado sobre Ingresos, sujeto a retención
  | 'SIMPLIFICADO_PAGO_DIRECTO'  // Opcional Simplificado CON resolución de pago directo
  | 'EXENTO'                     // Exento del ISR
  | 'NO_APLICA';                 // El régimen de IVA ya lo cubre (pequeño contribuyente)

/** Afiliación de IVA del emisor. Determina el tipo de DTE y el desglose. */
export type RegimenIva =
  | 'GENERAL'              // Contribuyente normal: FACT con IVA desglosado
  | 'PEQUENO'              // Pequeño contribuyente: FPEQ, sin desglose de IVA
  | 'PEQUENO_ELECTRONICO'; // Pequeño contribuyente en régimen electrónico

export interface Frase {
  tipoFrase: number;
  codigoEscenario: number;
  numeroResolucion?: string;
  fechaResolucion?: string; // YYYY-MM-DD
}

export interface ConfigFiscal {
  regimenIva: RegimenIva;
  regimenIsr: RegimenIsr;
  /** ¿La SAT nombró agente de retención del IVA a este emisor? */
  agenteRetencionIva: boolean;
  /** Resolución de la SAT. La exigen el pago directo de ISR y el régimen electrónico. */
  numeroResolucion?: string | null;
  fechaResolucion?: string | null;
}

/* ── Catálogo (transcrito del SAT) ──────────────────────────── */

interface EntradaCatalogo {
  tipoFrase: number;
  codigoEscenario: number;
  /** Texto exacto que el SAT imprime en la factura. */
  texto: string;
  requiereResolucion: boolean;
  requiereFechaResolucion: boolean;
}

const CATALOGO: Record<string, EntradaCatalogo> = {
  'isr.utilidades':       { tipoFrase: 1, codigoEscenario: 1, texto: 'Sujeto a pagos trimestrales ISR',    requiereResolucion: false, requiereFechaResolucion: false },
  'isr.simplificado':     { tipoFrase: 1, codigoEscenario: 2, texto: 'Sujeto a retención definitiva ISR',  requiereResolucion: false, requiereFechaResolucion: false },
  'isr.pago_directo':     { tipoFrase: 1, codigoEscenario: 3, texto: 'Sujeto a pago directo ISR',          requiereResolucion: true,  requiereFechaResolucion: true  },
  'isr.exento':           { tipoFrase: 1, codigoEscenario: 4, texto: 'Exento del ISR',                     requiereResolucion: false, requiereFechaResolucion: false },
  'iva.agente_retencion': { tipoFrase: 2, codigoEscenario: 1, texto: 'Agente de Retención del IVA',        requiereResolucion: false, requiereFechaResolucion: false },
  'iva.sin_credito':      { tipoFrase: 3, codigoEscenario: 1, texto: 'No genera derecho a crédito fiscal', requiereResolucion: false, requiereFechaResolucion: false },
  'iva.reg_electronico':  { tipoFrase: 7, codigoEscenario: 1, texto: 'No retener,',                        requiereResolucion: true,  requiereFechaResolucion: false },
};

function entradaDe(frase: Frase): EntradaCatalogo | undefined {
  return Object.values(CATALOGO).find(
    (c) => c.tipoFrase === frase.tipoFrase && c.codigoEscenario === frase.codigoEscenario,
  );
}

/* ── Derivación ─────────────────────────────────────────────── */

/** Valor del atributo AfiliacionIVA del emisor, según el XSD del SAT. */
export function afiliacionIvaXml(regimen: RegimenIva): 'GEN' | 'PEQ' {
  return regimen === 'GENERAL' ? 'GEN' : 'PEQ';
}

/** Tipo de DTE que corresponde al régimen. Emitir el otro lo rechaza el certificador. */
export function tipoDteDeRegimen(regimen: RegimenIva): 'FACT' | 'FPEQ' {
  return regimen === 'GENERAL' ? 'FACT' : 'FPEQ';
}

/**
 * ¿Se desglosa IVA en el DTE?
 *
 * El pequeño contribuyente no traslada IVA: su factura no lleva bloque de
 * impuestos y el monto es todo el precio. Desglosar IVA desde una cuenta
 * PEQ es un rechazo seguro del certificador.
 */
export function desglosaIva(regimen: RegimenIva): boolean {
  return regimen === 'GENERAL';
}

/** Las frases que corresponden a esta configuración fiscal, en orden de catálogo. */
export function frasesPara(config: ConfigFiscal): Frase[] {
  const claves: string[] = [];

  switch (config.regimenIsr) {
    case 'UTILIDADES':                claves.push('isr.utilidades'); break;
    case 'SIMPLIFICADO':              claves.push('isr.simplificado'); break;
    case 'SIMPLIFICADO_PAGO_DIRECTO': claves.push('isr.pago_directo'); break;
    case 'EXENTO':                    claves.push('isr.exento'); break;
    case 'NO_APLICA':                 break;
  }

  if (config.agenteRetencionIva) claves.push('iva.agente_retencion');

  // El pequeño contribuyente siempre advierte que no da crédito fiscal; el
  // del régimen electrónico añade además que no se le debe retener.
  if (config.regimenIva === 'PEQUENO' || config.regimenIva === 'PEQUENO_ELECTRONICO') {
    claves.push('iva.sin_credito');
  }
  if (config.regimenIva === 'PEQUENO_ELECTRONICO') {
    claves.push('iva.reg_electronico');
  }

  return claves.map((k) => {
    const e = CATALOGO[k];
    const frase: Frase = { tipoFrase: e.tipoFrase, codigoEscenario: e.codigoEscenario };
    if (e.requiereResolucion && config.numeroResolucion) {
      frase.numeroResolucion = config.numeroResolucion;
    }
    if (e.requiereFechaResolucion && config.fechaResolucion) {
      frase.fechaResolucion = config.fechaResolucion;
    }
    return frase;
  });
}

/** El texto que el cliente verá impreso. Para confirmar la configuración antes de emitir. */
export function textosDeFrases(config: ConfigFiscal): string[] {
  return frasesPara(config)
    .map((f) => {
      const e = entradaDe(f);
      if (!e) return '';
      return f.numeroResolucion ? `${e.texto} ${f.numeroResolucion}`.trim() : e.texto;
    })
    .filter(Boolean);
}

/**
 * Problemas de la configuración fiscal, en lenguaje del dueño.
 *
 * Se comprueba ANTES de emitir porque el rechazo del certificador llega
 * como un código del SAT frente a un cliente que espera su factura. Vale
 * más un aviso en la pantalla de configuración que un error en la caja.
 */
export function problemasDeConfiguracion(config: ConfigFiscal): string[] {
  const problemas: string[] = [];

  for (const frase of frasesPara(config)) {
    const e = entradaDe(frase);
    if (!e) continue;
    if (e.requiereResolucion && !config.numeroResolucion) {
      problemas.push(
        `La frase «${e.texto}» exige el número de resolución de la SAT. ` +
        'Búscalo en la resolución que te autorizó ese régimen.',
      );
    }
    if (e.requiereFechaResolucion && !config.fechaResolucion) {
      problemas.push(`La frase «${e.texto}» exige también la fecha de esa resolución.`);
    }
  }

  if (config.regimenIva === 'GENERAL' && config.regimenIsr === 'NO_APLICA') {
    problemas.push(
      'Un contribuyente del régimen general debe declarar su régimen de ISR en la factura. ' +
      'Elige el que aparece en tu constancia del RTU.',
    );
  }

  if (config.regimenIva !== 'GENERAL' && config.regimenIsr !== 'NO_APLICA' && config.regimenIsr !== 'EXENTO') {
    problemas.push(
      'El pequeño contribuyente normalmente no lleva frase de retención de ISR. ' +
      'Confírmalo con tu contador antes de dejarla activa.',
    );
  }

  return problemas;
}

/** Opciones para los selectores de la configuración, con el texto que verá el cliente. */
export const OPCIONES_REGIMEN_IVA: Array<{ value: RegimenIva; label: string; nota: string }> = [
  { value: 'GENERAL',             label: 'Régimen general (IVA 12%)',                    nota: 'Tu factura desglosa el IVA y le da crédito fiscal a tu cliente.' },
  { value: 'PEQUENO',             label: 'Pequeño contribuyente',                        nota: 'Tu factura no desglosa IVA y lleva «No genera derecho a crédito fiscal».' },
  { value: 'PEQUENO_ELECTRONICO', label: 'Pequeño contribuyente (régimen electrónico)',  nota: 'Como el anterior, y además «No retener». Requiere el número de resolución de la SAT.' },
];

export const OPCIONES_REGIMEN_ISR: Array<{ value: RegimenIsr; label: string; nota: string }> = [
  { value: 'SIMPLIFICADO',              label: 'Opcional Simplificado sobre Ingresos',    nota: 'El más común. Imprime «Sujeto a retención definitiva ISR».' },
  { value: 'UTILIDADES',                label: 'Sobre las Utilidades',                    nota: 'Imprime «Sujeto a pagos trimestrales ISR».' },
  { value: 'SIMPLIFICADO_PAGO_DIRECTO', label: 'Opcional Simplificado con pago directo',  nota: 'Solo si la SAT te dio resolución de pago directo. Requiere número y fecha.' },
  { value: 'EXENTO',                    label: 'Exento del ISR',                          nota: 'Imprime «Exento del ISR».' },
  { value: 'NO_APLICA',                 label: 'No aplica (pequeño contribuyente)',       nota: 'No se imprime frase de ISR.' },
];
