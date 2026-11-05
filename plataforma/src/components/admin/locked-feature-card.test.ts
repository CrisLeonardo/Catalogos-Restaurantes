import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { defaultPlanPricing, planPresentation } from '@/lib/plans';

vi.mock('next/navigation', () => ({ usePathname: () => '/panel/aud-planes' }));
vi.mock('@/components/plan-pricing-context', () => ({ usePlanPricing: () => defaultPlanPricing() }));

import LockedFeatureSection from './locked-feature-card';

describe('Hoy describe el alcance efectivo de Estándar', () => {
  it('no vende como exclusivas de Premium las modalidades que Estándar permite', () => {
    const html = renderToStaticMarkup(createElement(LockedFeatureSection, { planActual: 'ESTANDAR' }));
    expect(html).not.toContain('Tu plan Estándar incluye pedidos para llevar.');
    expect(html).toContain('2 de 3');
  });
  it('no ofrece como bloqueada una función habilitada por excepción', () => {
    const presentation = planPresentation({ plan: 'ESTANDAR', pricing: defaultPlanPricing(), modules: { loyalty: true }, orderTypes: ['delivery', 'dine_in'] });
    const html = renderToStaticMarkup(createElement(LockedFeatureSection, { planActual: 'ESTANDAR', presentation }));
    expect(html).not.toContain('Programa de lealtad');
    expect(html).toContain('Comer en local');
    expect(html).toContain('A domicilio');
  });
});
