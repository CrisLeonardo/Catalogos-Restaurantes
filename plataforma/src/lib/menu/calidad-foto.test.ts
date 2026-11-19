import { describe, expect, it } from 'vitest';
import { avisosDeFoto, medirFoto } from './calidad-foto';

/** Imagen sintética: tablero de ajedrez (bordes duros) o plano, con un brillo dado. */
function imagen(ancho: number, alto: number, color: (x: number, y: number) => number): number[] {
  const px: number[] = [];
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) { const v = color(x, y); px.push(v, v, v, 255); }
  return px;
}

describe('foto guiada', () => {
  it('una foto con bordes y buena luz no tiene avisos', () => {
    const tablero = imagen(40, 40, (x, y) => ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 200 : 40));
    expect(avisosDeFoto(medirFoto(tablero, 40, 40))).toEqual([]);
  });

  it('una foto oscura y plana avisa las dos cosas', () => {
    const plana = imagen(40, 40, () => 25);
    expect(avisosDeFoto(medirFoto(plana, 40, 40))).toEqual(['oscura', 'borrosa']);
  });

  it('demasiada luz se dice aparte', () => {
    const blanca = imagen(40, 40, (x, y) => ((x + y) % 2 ? 255 : 235));
    expect(avisosDeFoto(medirFoto(blanca, 40, 40))).toContain('quemada');
  });
});
