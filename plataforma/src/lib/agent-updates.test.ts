import { describe, it, expect } from 'vitest';
import { isNewerVersion, pickAgentRelease, pickFromGitHubFeed } from './agent-updates';

const SHA = 'df85c9c60c8e3d56d5b7ecf91b718684fd0794a59ad7dcf803d6a903e7e9af7b';
const rel = (version: string) => ({ version, url: `https://x/${version}.exe`, sha256: SHA });

/** Una entrada de la API de GitHub, con lo mínimo que se lee de ella. */
function gh(tag: string, over: Record<string, unknown> = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    body: 'notas',
    assets: [{ name: 'LeoginAgent.exe', digest: `sha256:${SHA}`, browser_download_url: `https://x/${tag}.exe` }],
    ...over,
  };
}

describe('isNewerVersion', () => {
  it('compara por número, no por texto', () => {
    expect(isNewerVersion('0.7.1', '0.6.1')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.7.1', '0.7.1')).toBe(false);
    expect(isNewerVersion('0.6.1', '0.7.0')).toBe(false);
  });
});

describe('pickFromGitHubFeed', () => {
  it('toma el agente más nuevo con .exe y digest', () => {
    const r = pickFromGitHubFeed([gh('agent-v0.6.1'), gh('agent-v0.7.1'), gh('desktop-v0.3.2')]);
    expect(r?.version).toBe('0.7.1');
    expect(r?.sha256).toBe(SHA);
  });

  it('ignora los releases de Leogin Desktop', () => {
    expect(pickFromGitHubFeed([gh('desktop-v9.9.9')])).toBeNull();
  });

  // Sin hash el agente rechazaría la descarga; servirla sería enseñarle a
  // ejecutar lo que baje sin verificar.
  it('descarta un release sin digest', () => {
    const sinDigest = gh('agent-v0.8.0', {
      assets: [{ name: 'LeoginAgent.exe', digest: null, browser_download_url: 'https://x/a.exe' }],
    });
    const r = pickFromGitHubFeed([gh('agent-v0.7.1'), sinDigest]);
    expect(r?.version).toBe('0.7.1');
  });

  it('descarta borradores y prelanzamientos', () => {
    expect(pickFromGitHubFeed([gh('agent-v0.9.0', { draft: true })])).toBeNull();
    expect(pickFromGitHubFeed([gh('agent-v0.9.0', { prerelease: true })])).toBeNull();
  });

  it('aguanta una respuesta que no es la esperada', () => {
    expect(pickFromGitHubFeed(null)).toBeNull();
    expect(pickFromGitHubFeed({ message: 'API rate limit exceeded' })).toBeNull();
    expect(pickFromGitHubFeed([{}, { tag_name: 'agent-vXYZ' }])).toBeNull();
  });
});

describe('pickAgentRelease', () => {
  it('sin GitHub, manda la base (comportamiento de siempre)', () => {
    expect(pickAgentRelease(rel('0.6.1'), null)).toEqual({ release: rel('0.6.1'), source: 'db' });
  });

  it('sin fila registrada, sirve lo que hay publicado', () => {
    expect(pickAgentRelease(null, rel('0.7.1'))).toEqual({ release: rel('0.7.1'), source: 'github' });
  });

  it('sin nada, no inventa', () => {
    expect(pickAgentRelease(null, null)).toEqual({ release: null, source: 'none' });
  });

  it('GitHub más nuevo que la fila: gana GitHub', () => {
    expect(pickAgentRelease(rel('0.6.1'), rel('0.7.1')).source).toBe('github');
  });

  it('fila más nueva (ej. un beta publicado a mano): gana la base', () => {
    expect(pickAgentRelease(rel('0.8.0'), rel('0.7.1')).source).toBe('db');
  });

  // El rollback de la 065: apagar la fila tiene que frenar la propagación,
  // también por el camino nuevo.
  it('una versión apagada a mano NO vuelve desde GitHub', () => {
    const out = pickAgentRelease(rel('0.6.1'), rel('0.7.1'), [{ version: '0.7.1', enabled: false }]);
    expect(out).toEqual({ release: rel('0.6.1'), source: 'db' });
  });

  it('apagada y sin alternativa: mejor nada que un release retirado', () => {
    const out = pickAgentRelease(null, rel('0.7.1'), [{ version: '0.7.1', enabled: false }]);
    expect(out).toEqual({ release: null, source: 'none' });
  });
});
