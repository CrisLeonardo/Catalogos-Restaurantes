import { describe, it, expect } from 'vitest';
import { readMainPcStatus, type MainPcInput } from './main-pc';

const NOW = Date.parse('2026-08-10T12:00:00.000Z');
const secondsAgo = (s: number) => new Date(NOW - s * 1000).toISOString();

function agent(over: Partial<MainPcInput> = {}): MainPcInput {
  return {
    exists: true,
    isActive: true,
    lastSeenAt: secondsAgo(10),
    deviceName: 'CAJA-01',
    activatedDeviceId: 'dev-caja',
    activatedDeviceLabel: 'Windows · Leogin Desktop',
    ...over,
  };
}

describe('readMainPcStatus', () => {
  it('sin agente: no hay PC principal en ningún aparato', () => {
    const s = readMainPcStatus(null, 'dev-celular', NOW);
    expect(s.on).toBe(false);
    expect(s.isThisDevice).toBe(false);
    expect(s.where).toBe('none');
  });

  it('en la PC que la activó: encendida y es esta', () => {
    const s = readMainPcStatus(agent(), 'dev-caja', NOW);
    expect(s.on).toBe(true);
    expect(s.isThisDevice).toBe(true);
    expect(s.where).toBe('this');
    expect(s.live).toBe(true);
    expect(s.label).toContain('Esta computadora');
  });

  // El bug que motivó la migración 110: el celular del dueño veía el
  // interruptor encendido como si ESE aparato fuera el servidor del local.
  it('desde otro aparato: encendida en el local, pero NO es este', () => {
    const s = readMainPcStatus(agent(), 'dev-celular', NOW);
    expect(s.on).toBe(true);
    expect(s.isThisDevice).toBe(false);
    expect(s.where).toBe('other');
    expect(s.label).toBe('PC principal: CAJA-01');
  });

  it('sin id de dispositivo (navegador sin almacenamiento) no afirma que es esta', () => {
    const s = readMainPcStatus(agent(), null, NOW);
    expect(s.isThisDevice).toBe(false);
    expect(s.where).toBe('other');
  });

  it('instalación anterior a la 110: se sabe que hay una, no cuál', () => {
    const s = readMainPcStatus(agent({ activatedDeviceId: null }), 'dev-caja', NOW);
    expect(s.on).toBe(true);
    expect(s.isThisDevice).toBe(false);
    expect(s.where).toBe('unknown');
  });

  it('apagada a propósito: nadie la ve encendida', () => {
    const s = readMainPcStatus(agent({ isActive: false }), 'dev-caja', NOW);
    expect(s.on).toBe(false);
    expect(s.isThisDevice).toBe(false);
    expect(s.tone).toBe('warn');
    expect(s.detail).toContain('CAJA-01');
  });

  it('sin heartbeat todavía: encendida pero esperando', () => {
    const s = readMainPcStatus(agent({ lastSeenAt: null }), 'dev-caja', NOW);
    expect(s.on).toBe(true);
    expect(s.live).toBe(false);
    expect(s.label).toContain('Esperando');
  });

  it('sin responder hace rato: sigue siendo la principal, pero avisa', () => {
    const s = readMainPcStatus(agent({ lastSeenAt: secondsAgo(600) }), 'dev-caja', NOW);
    expect(s.on).toBe(true);
    expect(s.live).toBe(false);
    expect(s.tone).toBe('warn');
    expect(s.detail).toContain('Sin responder');
  });

  it('el nombre que reporta el agente gana a la etiqueta del navegador', () => {
    const s = readMainPcStatus(agent(), 'dev-celular', NOW);
    expect(s.deviceLabel).toBe('CAJA-01');
    const sinNombre = readMainPcStatus(agent({ deviceName: null }), 'dev-celular', NOW);
    expect(sinNombre.deviceLabel).toBe('Windows · Leogin Desktop');
  });
});
