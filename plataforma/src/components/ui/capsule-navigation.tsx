'use client';

import Link from 'next/link';
import { useLayoutEffect, useRef } from 'react';
import { Icon } from '@/components/icons';
import { cn } from '@/lib/utils';
import styles from './capsule-navigation.module.css';

export type CapsuleDestination = {
  key: string;
  label: string;
  icon: string;
  href?: string;
  onSelect?: () => void;
  expanded?: boolean;
  controls?: string;
};

function NavigationIcon({ name }: { name: string }) {
  if (name === 'home') return (
    <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <path d="m4 27 24-21 24 21" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      <path fillRule="evenodd" d="M10 29 28 13l18 16v22H10V29Zm12 7v15h12V36H22Z" fill="currentColor" />
      <path d="M39 9h6v13l-6-5V9Z" fill="currentColor" />
    </svg>
  );
  if (name === 'receipt') return (
    <svg viewBox="0 0 56 56" fill="none" aria-hidden="true">
      <path d="M16 3h32a4 4 0 0 1 4 4v46l-4-1.5-4 1.5-4-1.5-4 1.5-4-1.5-4 1.5-4-1.5-4 1.5-4-1.5-4 1.5V7a4 4 0 0 1 4-4Z" fill="currentColor" />
      <path className={styles.cutout} d="M19 12h4v3h-4zm10 0h15v3H29zm-10 8h4v3h-4zm10 0h15v3H29zm-10 8h4v3h-4zm10 0h15v3H29zm-10 8h4v3h-4zm10 0h15v3H29z" />
    </svg>
  );
  return <Icon name={name} size={24} strokeWidth={2} />;
}

export default function CapsuleNavigation({ items, active, label, mobileOnly = false }: {
  items: CapsuleDestination[];
  active: string;
  label: string;
  mobileOnly?: boolean;
}) {
  const rail = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = rail.current;
    if (!element) return;
    let mounted = true;
    function measure() {
      if (!mounted || !element) return;
      const selected = [...element.querySelectorAll<HTMLElement>('[data-capsule-key]')]
        .find((item) => item.dataset.capsuleKey === active);
      element.dataset.measured = String(!!selected);
      if (!selected) return;
      element.style.setProperty('--capsule-left', `${selected.offsetLeft}px`);
      element.style.setProperty('--capsule-width', `${selected.offsetWidth}px`);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => { mounted = false; observer.disconnect(); };
  }, [items, active]);

  return (
    <div className={cn(styles.surface, styles.dock, mobileOnly && styles.mobileOnly)}>
      <nav ref={rail} className={styles.rail} aria-label={label} data-count={items.length}>
        <span className={styles.selection} aria-hidden="true" />
        {items.map((item) => {
          const current = item.key === active;
          const content = <><NavigationIcon name={item.icon} /><span>{item.label}</span></>;
          const common = {
            className: styles.item,
            'data-capsule-key': item.key,
            'aria-current': current ? 'page' as const : undefined,
          };
          return item.href ? (
            <Link key={item.key} {...common} href={item.href} onClick={item.onSelect}>{content}</Link>
          ) : (
            <button key={item.key} {...common} type="button" onClick={item.onSelect}
              aria-expanded={item.expanded} aria-controls={item.controls}>{content}</button>
          );
        })}
      </nav>
    </div>
  );
}
