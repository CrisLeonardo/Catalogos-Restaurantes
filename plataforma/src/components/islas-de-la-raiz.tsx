'use client';

/* ============================================================
   PIEZAS INTERACTIVAS DE LA PORTADA, APARTE DE LA CARTA
   ------------------------------------------------------------
   `app/page.tsx` sirve tres cosas en la misma ruta: la carta de un
   restaurante, la portada comercial de Leogin y el selector de sucursal
   de un grupo. Next empaqueta con la página todos los componentes de
   cliente que esa página importa, se usen o no, así que cada carta bajaba
   también la demo de la portada, sus planes, su menú y el selector de
   sucursal, con la tabla completa de íconos del panel (auditoría de
   lanzamiento 2026-11-23, LZ-12).

   Cargadas con `next/dynamic` desde aquí (un módulo de cliente), se
   siguen pintando en el servidor igual que antes, pero su código solo
   baja en la página que las muestra.
   ============================================================ */

import dynamic from 'next/dynamic';

export const SiteMenu = dynamic(() => import('@/components/site-menu'));
export const LeoginInstallBanner = dynamic(() => import('@/components/leogin-install-banner'));
export const LandingIntro = dynamic(() => import('@/components/landing-intro').then((m) => m.LandingIntro));
export const LandingDemo = dynamic(() => import('@/components/landing-demo').then((m) => m.LandingDemo));
export const PlanPorPreguntas = dynamic(() => import('@/components/landing-planes').then((m) => m.PlanPorPreguntas));
export const BranchSelector = dynamic(() => import('@/components/branch-selector'));
