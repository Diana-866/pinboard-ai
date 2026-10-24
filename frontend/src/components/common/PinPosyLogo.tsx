import React from 'react';
import { Flower2 } from 'lucide-react';

/** Фирменный логотип PinPosy: цветок на розовой плашке (синхронизирован с лендингом и favicon). */
export const PinPosyLogo: React.FC<{ size?: number; withText?: boolean; className?: string }> = ({
  size = 36,
  withText = true,
  className = '',
}) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span
      className="rounded-xl flex items-center justify-center shadow-lg shrink-0"
      style={{ width: size, height: size, background: 'linear-gradient(160deg,#A95668 0%,#C67B8C 100%)' }}
    >
      <Flower2 className="text-white" style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.4} />
    </span>
    {withText && <span className="text-lg font-extrabold tracking-tight text-primary-theme">PinPosy</span>}
  </span>
);
