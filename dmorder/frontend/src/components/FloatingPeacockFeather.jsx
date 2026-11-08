import React, { useEffect, useRef } from 'react';
import './FloatingPeacockFeather.css';

/**
 * FloatingPeacockFeather
 * ─────────────────────────────────────────────────────────────────────
 * Award-quality cinematic peacock feather animated using GSAP ScrollTrigger.
 *
 * Enhanced Features:
 *   • Prominent, majestic scale across viewports
 *   • Dynamic aerodynamic flexibility: quill bends and flexes with wind drag
 *   • Real-time scroll velocity reaction: stretch, skew & 3D tilt in breeze
 *   • Natural spring-back elasticity when scroll movement pauses
 *   • Dual-phase organic idle breathing & flutter
 *   • Full GSAP cleanup on unmount
 */
export default function FloatingPeacockFeather({ active = true }) {
  const featherRef = useRef(null);
  const flexRef    = useRef(null);
  const glowRef    = useRef(null);

  /* ── Auto-dimming on typing & clicking ────────────────────────
   * When the user types or clicks anywhere on the website to perform work,
   * feather opacity drops smoothly to a faint silhouette (0.08) so it never
   * obstructs reading, inputs, or interactive elements.
   * Smoothly restores when the user stops interacting.
   */
  useEffect(() => {
    if (!active) return;

    let idleTimer = null;
    let isInputFocused = false;

    const dim = () => {
      featherRef.current?.classList.add('pf-dimmed');
      glowRef.current?.classList.add('pf-dimmed');
    };

    const restore = () => {
      if (!isInputFocused) {
        featherRef.current?.classList.remove('pf-dimmed');
        glowRef.current?.classList.remove('pf-dimmed');
      }
    };

    const scheduleRestore = (delay = 2000) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        restore();
      }, delay);
    };

    const handlePointerDown = () => {
      dim();
      scheduleRestore(2000);
    };

    const handleKeyDown = () => {
      dim();
      scheduleRestore(2400);
    };

    const handleInput = () => {
      dim();
      scheduleRestore(2400);
    };

    const handleFocusIn = (e) => {
      const tag = e.target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target?.isContentEditable
      ) {
        isInputFocused = true;
        dim();
      }
    };

    const handleFocusOut = (e) => {
      const tag = e.target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target?.isContentEditable
      ) {
        isInputFocused = false;
        scheduleRestore(1200);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('keydown', handleKeyDown, { passive: true });
    window.addEventListener('input', handleInput, { passive: true });
    document.addEventListener('focusin', handleFocusIn, { passive: true });
    document.addEventListener('focusout', handleFocusOut, { passive: true });

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('input', handleInput);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    /* ── Accessibility: static fallback ──────────────────────────── */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const el = featherRef.current;
      if (el) {
        el.style.cssText = [
          'position:fixed',
          'top:24vh',
          'left:75vw',
          'opacity:0.12',
          'transform:translateX(-50%) rotate(12deg)',
          'z-index:50',
          'pointer-events:none',
        ].join(';');
      }
      return;
    }

    let gsapLib, ScrollTrigger, entrance, scrollTl, floatTl, flutterTl;
    let mounted = true;

    /* ── Async GSAP bootstrap ──────────────────────────────────── */
    (async () => {
      try {
        const [gsapMod, stMod] = await Promise.all([
          import('gsap'),
          import('gsap/ScrollTrigger'),
        ]);
        if (!mounted) return;

        gsapLib       = gsapMod.default || gsapMod.gsap || gsapMod;
        ScrollTrigger = stMod.ScrollTrigger;
        gsapLib.registerPlugin(ScrollTrigger);

        const el     = featherRef.current;
        const flexEl = flexRef.current;
        const glow   = glowRef.current;
        if (!el || !flexEl) return;

        /* ── Chapter waypoints with aerodynamic wind flex ──────────
         * x    = horizontal % of viewport width
         * y    = vertical % of viewport height (travel down page)
         * rot  = primary stem rotation in degrees
         * skew = dynamic quill flex / bend against the wind
         * rotY = subtle 3D perspective twist catching light
         * sc   = scale factor
         * op   = opacity
         */
        /* ── Chapter waypoints with aerodynamic wind flex ──────────
         * x    = horizontal % of viewport width
         * y    = vertical % of viewport height (travel down page)
         * rot  = primary stem rotation in degrees
         * skew = dynamic quill flex / bend against the wind
         * rotY = subtle 3D perspective twist catching light
         * sc   = scale factor
         * op   = opacity
         */
        /* Horizontal sweep waypoints — y stays fixed so feather glides left↔right.
         * rot gives gentle sway as if caught by wind.
         */
        const W = [
          /* 0 · Hero / A         */ { x: 82, y: 30, rot:  2,  skew:  0,  rotY:  0,  sc: 1.00, op: 0.70 },
          /* 1 · Workflow / B     */ { x: 10, y: 30, rot: -4,  skew: -3,  rotY: -8,  sc: 1.00, op: 0.80 },
          /* 2 · Problem / C      */ { x: 78, y: 30, rot:  5,  skew:  3,  rotY:  8,  sc: 1.00, op: 0.85 },
          /* 3 · Engine / D       */ { x:  8, y: 30, rot: -3,  skew: -4,  rotY: -6,  sc: 1.00, op: 0.88 },
          /* 4 · Architecture / E */ { x: 80, y: 30, rot:  4,  skew:  4,  rotY:  7,  sc: 1.00, op: 0.90 },
          /* 5 · Features / F     */ { x:  6, y: 30, rot: -5,  skew: -5,  rotY: -9,  sc: 1.00, op: 0.92 },
          /* 6 · FAQ / G          */ { x: 82, y: 30, rot:  3,  skew:  3,  rotY:  6,  sc: 1.00, op: 0.95 },
          /* 7 · Contact / H      */ { x: 50, y: 30, rot:  0,  skew:  0,  rotY:  0,  sc: 1.05, op: 1.00 },
        ];

        /* ── Initial visible position on right (Visible right from the start) ── */
        gsapLib.set(el, {
          position: 'fixed',
          top:      W[0].y + 'vh',
          left:     W[0].x + 'vw',
          xPercent: -50,
          yPercent: -50,
          rotate:   W[0].rot,
          scale:    W[0].sc,
          opacity:  W[0].op,
          zIndex:   50,
        });

        gsapLib.set(flexEl, {
          transformOrigin: '45% 90%',
          skewX: 0,
          skewY: 0,
          rotateY: 0,
        });

        if (glow) {
          gsapLib.set(glow, {
            position: 'fixed',
            top:      W[0].y + 'vh',
            left:     W[0].x + 'vw',
            xPercent: -50,
            yPercent: -50,
            opacity:  0.42,
            scale:    1.0,
            zIndex:   49,
          });
        }

        /* ── 1. IMMEDIATE SOFT ENTRANCE (Feather is visible immediately from start) ─── */
        entrance = gsapLib.timeline();
        entrance.from(el, {
          duration: 0.45,
          opacity:  0,
          scale:    W[0].sc * 0.94,
          ease:     'power1.out',
        });

        /* ── 2. CONTINUOUS ORGANIC IDLE FLUTTER (Active immediately) ── */
        /* Idle sway: gentle horizontal drift like wind */
        floatTl = gsapLib.timeline({ repeat: -1, yoyo: true });
        floatTl
          .to(el, { duration: 3.6, x: '+=10', rotate: '+=2', ease: 'sine.inOut' })
          .to(el, { duration: 3.2, x: '-=10', rotate: '-=2', ease: 'sine.inOut' });

        /* Gentle harmonic feather tip bend while idling */
        flutterTl = gsapLib.timeline({ repeat: -1, yoyo: true });
        flutterTl
          .to(flexEl, { duration: 2.6, skewX: 2.5, rotateY: 6, ease: 'sine.inOut' })
          .to(flexEl, { duration: 2.8, skewX: -2.5, rotateY: -6, ease: 'sine.inOut' });

        /* ── 3. SCROLL JOURNEY & VELOCITY-REACTIVE FLEXIBILITY ──── */
        /* Scroll journey across all 8 chapters: moves downwards as usual */
        scrollTl = gsapLib.timeline({
          scrollTrigger: {
            trigger: 'body',
            start:   'top top',
            end:     'bottom bottom',
            scrub:   1.4,
            onUpdate: (self) => {
              const vel = self.getVelocity();
              const clampedV = gsapLib.utils.clamp(-2600, 2600, vel);
              const windSkew = clampedV * -0.0035;
              const windTilt = clampedV * 0.0055;
              const stretch  = 1 + Math.abs(clampedV) * 0.00004;

              gsapLib.to(flexEl, {
                skewX:    windSkew,
                skewY:    windSkew * 0.25,
                rotateY:  windTilt,
                scaleY:   stretch,
                scaleX:   2 - stretch,
                duration: 0.25,
                ease:     'power1.out',
                overwrite: 'auto',
              });

              if (Math.abs(vel) < 30) {
                gsapLib.to(flexEl, {
                  skewX:    0,
                  skewY:    0,
                  rotateY:  0,
                  scaleX:   1,
                  scaleY:   1,
                  duration: 0.8,
                  ease:     'elastic.out(1.15, 0.45)',
                  overwrite: 'auto',
                });
              }
            },
          },
        });

        /* Inter-chapter waypoints moving downwards */
        W.slice(1).forEach((wp) => {
          scrollTl.to(el, {
            top:     wp.y + 'vh',
            left:    wp.x + 'vw',
            rotate:  wp.rot,
            scale:   wp.sc,
            opacity: wp.op,
            ease:    'power1.inOut',
            duration: 1,
          });
        });

        /* Glow follows smoothly */
        if (glow) {
          const glowTl = gsapLib.timeline({
            scrollTrigger: {
              trigger: 'body',
              start:   'top top',
              end:     'bottom bottom',
              scrub:   2.2,
            },
          });
          W.slice(1).forEach((wp, i) => {
            glowTl.to(glow, {
              top:     wp.y + 'vh',
              left:    wp.x + 'vw',
              opacity: i % 2 === 0 ? 0.38 : 0.7,
              scale:   i % 2 === 0 ? 0.95 : 1.4,
              ease:    'none',
              duration: 1,
            });
          });
        }

      } catch (err) {
        console.warn('[FloatingPeacockFeather] GSAP init error:', err);
      }
    })();

    /* ── Cleanup on unmount ──────────────────────────────────── */
    return () => {
      mounted = false;
      try {
        entrance?.kill();
        scrollTl?.kill();
        floatTl?.kill();
        flutterTl?.kill();
        ScrollTrigger?.getAll().forEach((t) => t.kill());
      } catch (_) {}
    };
  }, [active]);

  return React.createElement(
    React.Fragment,
    null,
    /* Radiant Iridescent Glow Aura */
    React.createElement('div', {
      ref: glowRef,
      className: 'pf-glow',
      'aria-hidden': 'true',
    }),
    /* Feather positioning anchor */
    React.createElement(
      'div',
      {
        ref: featherRef,
        className: 'pf-feather-wrap',
        'aria-hidden': 'true',
      },
      /* Flexible quill container: bends and tilts dynamically */
      React.createElement(
        'div',
        {
          ref: flexRef,
          className: 'pf-feather-flex',
        },
        React.createElement('img', {
          src:       '/peacock-feather.png',
          alt:       '',
          className: 'pf-feather-img',
          draggable: 'false',
          loading:   'eager',
          decoding:  'async',
        })
      )
    )
  );
}

