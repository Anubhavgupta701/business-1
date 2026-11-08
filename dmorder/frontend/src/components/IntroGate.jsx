import React, { useEffect, useRef, useState } from 'react';
import './IntroGate.css';

/* ------------------------------------------------------------------ */
/* Canvas 3D Particle Field                                            */
/* Renders warm floating dust particles with simulated depth (z-axis) */
/* ------------------------------------------------------------------ */
function ParticleCanvas() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animId;
    let W, H;

    const PARTICLE_COUNT = 90;
    const particles = [];

    function resize() {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    }

    function randomParticle() {
      return {
        x:    Math.random() * W,
        y:    Math.random() * H,
        z:    Math.random(),          // 0 = far, 1 = close
        vx:   (Math.random() - 0.5) * 0.22,
        vy:   (Math.random() - 0.5) * 0.18,
        vz:   (Math.random() - 0.5) * 0.0006,
        base: Math.random(),          // saved base z for pulsing
      };
    }

    resize();
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(randomParticle());

    /* Mor Pankh iridescent particle tones: amber gold & emerald teal */
    function colorByZ(z) {
      if (z > 0.45) {
        // Shimmering peacock gold
        const r = Math.round(180 + z * 50);
        const g = Math.round(140 + z * 50);
        const b = Math.round(65  + z * 40);
        return `rgb(${r},${g},${b})`;
      } else {
        // Deep peacock emerald-teal
        const r = Math.round(20  + z * 30);
        const g = Math.round(150 + z * 60);
        const b = Math.round(145 + z * 60);
        return `rgb(${r},${g},${b})`;
      }
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        // move
        p.x  += p.vx;
        p.y  += p.vy;
        p.z  += p.vz;

        // wrap edges
        if (p.x < -2)  p.x = W + 2;
        if (p.x > W+2) p.x = -2;
        if (p.y < -2)  p.y = H + 2;
        if (p.y > H+2) p.y = -2;

        // clamp z
        if (p.z < 0.0) { p.z = 0.0; p.vz *= -1; }
        if (p.z > 1.0) { p.z = 1.0; p.vz *= -1; }

        const size    = 0.6 + p.z * 2.4;   // 0.6–3px
        const opacity = 0.12 + p.z * 0.55; // 0.12–0.67

        ctx.globalAlpha = opacity;
        ctx.fillStyle   = colorByZ(p.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      }

      /* Draw subtle connecting lines between close neighbours */
      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 80) {
            const alpha = ((80 - dist) / 80) * 0.07 * Math.min(a.z, b.z);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = `rgb(180,110,50)`;
            ctx.lineWidth   = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      animId = requestAnimationFrame(draw);
    }

    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement || document.body);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="intro-canvas" />;
}

/* ------------------------------------------------------------------ */
/* IntroGate Component                                                 */
/* ------------------------------------------------------------------ */
export default function IntroGate({ phase, onEnter }) {
  const [hoverState, setHoverState]   = useState('idle');
  const [isExiting,  setIsExiting]    = useState(false);
  const stageRef                      = useRef(null);

  /* Exit transition */
  const handleEnter = (withSound) => {
    if (isExiting) return;
    setIsExiting(true);
    setTimeout(() => onEnter(withSound), 500);
  };

  /* Keyboard shortcuts */
  useEffect(() => {
    const onKeyDown = (e) => {
      if (phase !== 'gate' || isExiting) return;
      if (e.key === 'Enter') handleEnter(true);
      if (e.key === 'Escape') handleEnter(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, isExiting]);

  /* Subtle 3D card tilt on mouse move */
  useEffect(() => {
    if (phase !== 'gate') return;
    const card = stageRef.current;
    if (!card) return;

    const onMove = (e) => {
      const rect = card.getBoundingClientRect();
      const cx   = rect.left + rect.width  / 2;
      const cy   = rect.top  + rect.height / 2;
      const dx   = (e.clientX - cx) / (rect.width  / 2);
      const dy   = (e.clientY - cy) / (rect.height / 2);
      const maxT = 6; // degrees
      card.style.transform =
        `perspective(900px) rotateX(${-dy * maxT}deg) rotateY(${dx * maxT}deg)`;
    };

    const onLeave = () => {
      card.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.16,1,0.3,1)';
    };

    const onEnterCard = () => {
      card.style.transition = 'transform 0.12s linear';
    };

    card.addEventListener('mousemove',  onMove);
    card.addEventListener('mouseleave', onLeave);
    card.addEventListener('mouseenter', onEnterCard);
    return () => {
      card.removeEventListener('mousemove',  onMove);
      card.removeEventListener('mouseleave', onLeave);
      card.removeEventListener('mouseenter', onEnterCard);
    };
  }, [phase]);

  return (
    <div className={`intro-gate ${isExiting ? 'exiting' : ''}`}>
      {/* 3D Particle Canvas Layer */}
      <ParticleCanvas />

      {/* Vignette */}
      <div className="intro-vignette" />

      {/* HUD Corner Labels */}
      <div className="intro-hud hud-tl">
        <span className="hud-beacon" />
        <span>RK: System Active</span>
      </div>
      <div className="intro-hud hud-tr">
        <span>Meta Instagram API: Official Connection</span>
      </div>
      <div className="intro-hud hud-bl">
        <span>Audio: Ambient Synthesizer</span>
      </div>
      <div className="intro-hud hud-br">
        <span>[Enter] with sound / [Esc] quiet</span>
      </div>

      {/* ---- LOADER PHASE ---- */}
      {phase === 'loader' ? (
        <div className="intro-loader-wrap">
          <img
            src="/rk-sticker.png"
            alt="RK Sticker Logo"
            className="intro-logo-img"
            style={{ marginBottom: 8 }}
          />
          <div className="loader-track">
            <div className="loader-fill" />
          </div>
          <p className="loader-text">Loading catalog and order system</p>
        </div>
      ) : (
        /* ---- GATE PHASE ---- */
        <div className="intro-stage" ref={stageRef}>
          {/* Status badge */}
          <div className="intro-badge">
            <span className="intro-badge-dot" />
            <span>Official Instagram Automation</span>
          </div>

          {/* Logo + Brand */}
          <div className="intro-logo-centerpiece">
            <img
              src="/rk-sticker.png"
              alt="RK Sticker Logo"
              className="intro-logo-img"
            />
            <div className="intro-brand-wrapper">
              <div className="intro-brand-mark">
                <span className="intro-brand-rk">RK</span>
              </div>
            </div>
          </div>

          {/* Tagline */}
          <p className="intro-subtitle">
            Experience with sound enabled, or enter quietly.
            Sound plays only if you choose it.
          </p>

          {/* EQ Visualizer */}
          <div className="intro-equalizer">
            <span className="eq-label">
              {hoverState === 'silent' ? 'Muted' : 'Audio Active'}
            </span>
            <div className="eq-bars">
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
              <span className="eq-bar" />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="intro-actions">
            <div
              className="hero-sound-btn-wrap"
              onMouseEnter={() => setHoverState('sound')}
              onMouseLeave={() => setHoverState('idle')}
            >
              <button
                className="hero-sound-btn"
                onClick={() => handleEnter(true)}
                aria-label="Enter with sound enabled"
              >
                <span className="btn-speaker-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                    <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                </span>
                <span>Enter with sound</span>
              </button>
            </div>

            <button
              className="hero-silent-btn"
              onClick={() => handleEnter(false)}
              onMouseEnter={() => setHoverState('silent')}
              onMouseLeave={() => setHoverState('idle')}
              aria-label="Enter without sound"
            >
              <svg viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
              <span>Enter without sound</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
