import { gsap, useGSAP, prefersReducedMotion } from '../lib/gsap';

const REVEAL_SELECTOR = [
  '.page-title',
  '.page-subtitle',
  '.card',
  '.card-flat',
  '.card-elevated',
  '.card-muted',
  '.card-interactive',
  '.table-wrapper',
  '.gsap-reveal',
  '[data-gsap-reveal]',
].join(',');

export default function usePageMotion(scopeRef, dependencies = []) {
  useGSAP(() => {
    const root = scopeRef.current;
    if (!root) return;

    const reduceMotion = prefersReducedMotion();
    const revealItems = Array.from(root.querySelectorAll(REVEAL_SELECTOR)).slice(0, 36);

    if (reduceMotion) {
      gsap.set([root, ...revealItems], {
        autoAlpha: 1,
        clearProps: 'transform,opacity,visibility',
      });
      return;
    }

    gsap.set(revealItems, { willChange: 'transform,opacity' });

    const timeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onComplete: () => {
        gsap.set(revealItems, { clearProps: 'willChange,transform,opacity,visibility' });
      },
    });

    timeline
      .fromTo(
        root,
        { autoAlpha: 0, y: 8 },
        { autoAlpha: 1, y: 0, duration: 0.22, clearProps: 'transform,opacity,visibility' },
      )
      .fromTo(
        revealItems,
        { autoAlpha: 0, y: 14, scale: 0.985 },
        {
          autoAlpha: 1,
          y: 0,
          scale: 1,
          duration: 0.38,
          stagger: { each: 0.035, from: 'start' },
        },
        '-=0.08',
      );
  }, {
    scope: scopeRef,
    dependencies,
    revertOnUpdate: true,
  });
}
