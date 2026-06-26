import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(useGSAP, ScrollTrigger);

gsap.defaults({
  duration: 0.42,
  ease: 'power3.out',
});

// Silencia las advertencias "GSAP target not found" (benignas: una animación
// cuyo selector/ref no existe en la página simplemente no hace nada). Evita
// inundar la consola en páginas que no tienen los elementos animables.
gsap.config({ nullTargetWarn: false });

export function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export { gsap, useGSAP, ScrollTrigger };
