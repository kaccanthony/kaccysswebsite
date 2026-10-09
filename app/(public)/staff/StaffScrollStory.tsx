'use client';

import { useEffect, useRef, type FocusEvent, type ReactNode } from 'react';

const HEADER_HEIGHT = 64;

export default function StaffScrollStory({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const sectionRef = useRef<HTMLElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const travelRef = useRef(0);

  useEffect(() => {
    const section = sectionRef.current;
    const sticky = stickyRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!section || !sticky || !viewport || !track) return;

    const heading = sticky.querySelector<HTMLElement>('.staff-section-head');
    const revealEnabled = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window;
    let frame = 0;
    let lastScrollY = window.scrollY;
    let scrollingUp = false;
    const update = () => {
      frame = 0;
      if (revealEnabled && heading) {
        const bounds = heading.getBoundingClientRect();
        if (bounds.top < window.innerHeight && bounds.bottom > 0) {
          heading.classList.add('is-visible');
        } else if (scrollingUp && bounds.top >= window.innerHeight) {
          heading.classList.remove('is-visible');
        }
      }
      const travel = travelRef.current;
      if (travel <= 0) {
        track.style.transform = '';
        section.style.setProperty('--story-progress', '0');
        return;
      }
      const distance = Math.min(travel, Math.max(0, HEADER_HEIGHT - section.getBoundingClientRect().top));
      track.style.transform = `translate3d(${-distance}px, 0, 0)`;
      section.style.setProperty('--story-progress', String(distance / travel));
    };
    const onScroll = () => {
      const scrollY = window.scrollY;
      if (scrollY !== lastScrollY) scrollingUp = scrollY < lastScrollY;
      lastScrollY = scrollY;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const measure = () => {
      const cards = Array.from(track.querySelectorAll<HTMLElement>('.staff-card'));
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      const width = cards.reduce((sum, card) => sum + card.offsetWidth, 0) + Math.max(0, cards.length - 1) * gap;
      const travel = Math.max(0, width - viewport.clientWidth);
      travelRef.current = travel;
      section.dataset.storyStatic = travel <= 1 ? 'true' : 'false';
      section.style.height = travel > 1 ? `${sticky.clientHeight + travel}px` : '';
      update();
    };

    section.dataset.storyReady = 'true';
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(track);

    const cards = Array.from(track.querySelectorAll<HTMLElement>('.staff-card'));
    let revealObserver: IntersectionObserver | null = null;
    if (revealEnabled) {
      revealObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          const card = entry.target as HTMLElement;
          const visible = entry.intersectionRatio >= 0.45;
          if (visible) {
            card.classList.add('is-visible');
          } else if (scrollingUp) {
            const bounds = entry.rootBounds ?? viewport.getBoundingClientRect();
            card.dataset.side = entry.boundingClientRect.left < bounds.left ? 'left' : 'right';
            card.classList.remove('is-visible');
          }
        }
      }, { root: viewport, threshold: 0.45 });
      cards.forEach(card => revealObserver?.observe(card));
      section.dataset.revealReady = 'true';
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      revealObserver?.disconnect();
    };
  }, []);

  function focusCard(event: FocusEvent<HTMLElement>) {
    const card = (event.target as HTMLElement).closest<HTMLElement>('.staff-card');
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!card || !section || !track || travelRef.current <= 0) return;
    const desired = Math.min(travelRef.current, Math.max(0, card.offsetLeft - track.offsetLeft));
    window.scrollTo({ top: window.scrollY + section.getBoundingClientRect().top - HEADER_HEIGHT + desired, behavior: 'auto' });
  }

  return (
    <section ref={sectionRef} className="staff-section staff-story" aria-label={`${label} staff profiles`} onFocusCapture={focusCard}>
      <div ref={stickyRef} className="staff-story-sticky">
        <div className="staff-section-head">
          <span className="staff-section-title">{label}</span>
          <span className="staff-section-count">{count}</span>
        </div>
        <div ref={viewportRef} className="staff-story-viewport">
          <div ref={trackRef} className="staff-story-track">{children}</div>
        </div>
        <div className="staff-story-progress" aria-hidden="true"><span /></div>
      </div>
    </section>
  );
}
