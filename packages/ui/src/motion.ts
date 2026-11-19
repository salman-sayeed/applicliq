/**
 * Svelte transitions that respect reduced motion. Svelte 5 runs transitions with the Web
 * Animations API, which the CSS reduced-motion rule in theme.css can't reach, so these check the
 * system preference and the "Reduce motion" setting (`data-reduce-motion` on <html>) each time a
 * transition starts and play it with no duration when motion is off.
 */
import { flip as svelteFlip } from 'svelte/animate';
import {
  crossfade as svelteCrossfade,
  fade as svelteFade,
  fly as svelteFly,
  slide as svelteSlide,
} from 'svelte/transition';

export function reducedMotion(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.hasAttribute('data-reduce-motion')) return true;
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function still<P extends { duration?: unknown; delay?: number }>(params: P | undefined): P {
  return reducedMotion() ? ({ ...params, duration: 0, delay: 0 } as P) : (params ?? ({} as P));
}

export const fade: typeof svelteFade = (node, params) => svelteFade(node, still(params));
export const fly: typeof svelteFly = (node, params) => svelteFly(node, still(params));
export const slide: typeof svelteSlide = (node, params) => svelteSlide(node, still(params));
export const flip: typeof svelteFlip = (node, fromTo, params) =>
  svelteFlip(node, fromTo, still(params));

export const crossfade: typeof svelteCrossfade = (params) => {
  const [send, receive] = svelteCrossfade(params);
  const wrap =
    (fn: typeof send): typeof send =>
    (node, options) =>
      reducedMotion() ? () => ({ duration: 0 }) : fn(node, options);
  return [wrap(send), wrap(receive)];
};
