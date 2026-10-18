import React, { useId } from 'react';
import { useTheme } from '../../theme/themeContext';
import { ThemeMode } from '../../theme/types';

export interface PinPosyLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
  textClassName?: string;
  variant?: 'badge' | 'flat';
}

interface LogoThemeSpec {
  gradStart: string;
  gradEnd: string;
  glyphFill: string;
  strokeColor: string;
  borderColor: string;
  boxShadow: string;
  flatFill: string;
}

const THEME_SPECS: Record<ThemeMode, LogoThemeSpec> = {
  // Vibrant Coral/Rose with clean white glyph
  'light-rose': {
    gradStart: '#EB577D',
    gradEnd: '#C82B51',
    glyphFill: '#FFFFFF',
    strokeColor: '#FFFFFF',
    borderColor: 'rgba(200, 43, 81, 0.3)',
    boxShadow: '0 2px 8px -1px rgba(224, 83, 117, 0.38)',
    flatFill: '#E05375',
  },
  // Sharp High-Contrast Black/Slate with clean white glyph
  'light-mono': {
    gradStart: '#27272A',
    gradEnd: '#09090B',
    glyphFill: '#FFFFFF',
    strokeColor: '#FFFFFF',
    borderColor: 'rgba(0, 0, 0, 0.25)',
    boxShadow: '0 2px 6px -1px rgba(0, 0, 0, 0.28)',
    flatFill: '#18181B',
  },
  // Glowing Neon Rose on dark surface with crisp white glyph
  'dark-rose': {
    gradStart: '#F472B6',
    gradEnd: '#BE185D',
    glyphFill: '#FFFFFF',
    strokeColor: '#FFFFFF',
    borderColor: 'rgba(244, 114, 182, 0.5)',
    boxShadow: '0 0 14px rgba(244, 114, 182, 0.42)',
    flatFill: '#F472B6',
  },
  // Inverted Crisp White badge with deep pitch-black glyph on dark surface
  'dark-mono': {
    gradStart: '#FFFFFF',
    gradEnd: '#E4E4E7',
    glyphFill: '#09090B',
    strokeColor: '#09090B',
    borderColor: 'rgba(255, 255, 255, 0.45)',
    boxShadow: '0 0 14px rgba(255, 255, 255, 0.28)',
    flatFill: '#FFFFFF',
  },
};

export const PinPosyLogo: React.FC<PinPosyLogoProps> = ({
  className = '',
  size = 32,
  showText = false,
  textClassName = '',
  variant = 'badge',
}) => {
  const { theme } = useTheme();
  const reactId = useId().replace(/:/g, '');
  const activeTheme: ThemeMode = theme && THEME_SPECS[theme] ? theme : 'light-rose';
  const spec = THEME_SPECS[activeTheme];

  const gradientId = `pinposy-grad-${activeTheme}-${reactId}`;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div
        className="relative shrink-0 flex items-center justify-center transition-all duration-300 group-hover:scale-105"
        style={{
          width: size,
          height: size,
          borderRadius: `${Math.round(size * 0.28)}px`,
          boxShadow: variant === 'badge' ? spec.boxShadow : undefined,
        }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="shrink-0 block"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={spec.gradStart} />
              <stop offset="100%" stopColor={spec.gradEnd} />
            </linearGradient>
          </defs>

          {/* Badge Background */}
          {variant === 'badge' && (
            <rect
              x="1.5"
              y="1.5"
              width="61"
              height="61"
              rx="18"
              fill={`url(#${gradientId})`}
              stroke={spec.borderColor}
              strokeWidth="1.5"
              className="transition-all duration-300"
            />
          )}

          {/* Top Sprig Leaves */}
          {/* Left Leaf */}
          <path
            d="M31.2 16.2C29.2 13.8 26.2 13.2 24.2 14.2C23.6 16.5 25.0 19.8 27.5 20.8C29.5 21.6 31.4 19.5 31.2 16.2Z"
            fill={variant === 'badge' ? spec.glyphFill : spec.flatFill}
            className="transition-colors duration-300"
          />
          {/* Right Leaf */}
          <path
            d="M32.8 16.2C34.8 13.8 37.8 13.2 39.8 14.2C40.4 16.5 39.0 19.8 36.5 20.8C34.5 21.6 32.6 19.5 32.8 16.2Z"
            fill={variant === 'badge' ? spec.glyphFill : spec.flatFill}
            className="transition-colors duration-300"
          />
          {/* Stem Center */}
          <path
            d="M32 17.5V20.5"
            stroke={variant === 'badge' ? spec.strokeColor : spec.flatFill}
            strokeWidth="1.75"
            strokeLinecap="round"
            className="transition-colors duration-300"
          />

          {/* Pin Body with Center Cutout */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M32 20C24.8 20 19 25.8 19 33C19 41.2 29.5 50.8 31.1 52.2C31.6 52.7 32.4 52.7 32.9 52.2C34.5 50.8 45 41.2 45 33C45 25.8 39.2 20 32 20ZM32 37.5C29.5 37.5 27.5 35.5 27.5 33C27.5 30.5 29.5 28.5 32 28.5C34.5 28.5 36.5 30.5 36.5 33C36.5 35.5 34.5 37.5 32 37.5Z"
            fill={variant === 'badge' ? spec.glyphFill : spec.flatFill}
            className="transition-colors duration-300"
          />
        </svg>
      </div>

      {showText && (
        <span className={`font-bold tracking-tight font-heading ${textClassName}`}>
          PinPosy
        </span>
      )}
    </div>
  );
};
