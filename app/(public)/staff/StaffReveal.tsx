'use client';

import { useEffect, useRef, type ReactNode } from 'react';

export default function StaffReveal({ className, children, revealStyle }: { className: string; children: ReactNode; revealStyle?: 'sides' }) {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const threshold = revealStyle === 'sides' ? 0.25 : 0.15;
    let lastScrollY = window.scrollY;
    let scrollingUp = false;
    const onScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY !== lastScrollY) scrollingUp = scrollY < lastScrollY;
      lastScrollY = scrollY;
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const element = entry.target as HTMLElement;
        if (entry.intersectionRatio >= threshold) {
          element.classList.add('is-visible');
        } else if (scrollingUp) {
          element.classList.remove('is-visible');
        }
      }
    }, { threshold });
    section.querySelectorAll<HTMLElement>('.staff-section-head, .staff-card, .staff-empty').forEach(element => observer.observe(element));
    section.dataset.revealReady = 'true';
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, [revealStyle]);

  return <section ref={sectionRef} className={`${className} staff-section-reveal`} data-reveal-style={revealStyle}>{children}</section>;
}
