import React from 'react';
import './RKLogo.css';

/**
 * RKLogo component - renders the company identity seamlessly fitting
 * the website's dark luxury color tone with transparent background,
 * subtle neon violet accent facet, and ambient breathing glow.
 *
 * Props:
 * - variant: 'full' (mark + text) | 'mark' (symbol only)
 * - size: 'sm' (header) | 'md' (badge/card) | 'lg' (intro hero)
 * - withText: boolean (whether to render the RK companion text)
 * - className: custom class
 */
export default function RKLogo({
  variant = 'full',
  size = 'md',
  withText = false,
  className = '',
}) {
  const imgSrc = variant === 'mark' ? '/rk-mark.png' : '/rk-logo.png';

  return (
    <div className={`rk-logo-container rk-size-${size} ${className}`}>
      {/* Ambient Radial Backlight Glow */}
      <div className="rk-ambient-glow" />

      {/* High-Resolution Transparent Logo Image */}
      <div className="rk-mark-wrapper">
        <img
          src={imgSrc}
          alt="RK Company Identity"
          className="rk-logo-image"
          loading="eager"
        />
      </div>

      {/* Optional Companion Brand Text for Header / Hero */}
      {withText && (
        <div className="rk-brand-text">
          <span className="rk-brand-title">
            <span className="rk-brand-script">RK</span>
          </span>
          <span className="rk-brand-by">Commerce Automation</span>
        </div>
      )}
    </div>
  );
}
