import React, { useRef } from 'react';
import { Download, Sparkles, Copy, Check, ExternalLink } from 'lucide-react';
import { useI18n } from '../../i18n/i18nContext';
import { SupportedAspectRatio } from '../../services/gemini';

export interface PinCanvasData {
  imageUrl: string;
  headline: string;
  subheadline: string;
  brandText: string;
  style: 'minimal' | 'glass' | 'split' | 'sticker' | 'banner';
  destinationUrl?: string;
  aspectRatio?: SupportedAspectRatio;
}

interface PinCanvasProps {
  data: PinCanvasData;
  onExport?: () => void;
  onRatioChange?: (ratio: SupportedAspectRatio) => void;
  className?: string;
}

export const ASPECT_RATIO_SPECS: Record<
  SupportedAspectRatio,
  { label: string; nameKey: string; width: number; height: number; desc: string }
> = {
  '2:3': { label: '2:3', nameKey: 'Standard Pin', width: 1000, height: 1500, desc: '1000 × 1500 px' },
  '9:16': { label: '9:16', nameKey: 'Idea / Story', width: 1080, height: 1920, desc: '1080 × 1920 px' },
  '3:4': { label: '3:4', nameKey: 'Editorial', width: 1080, height: 1440, desc: '1080 × 1440 px' },
  '4:5': { label: '4:5', nameKey: 'Portrait', width: 1080, height: 1350, desc: '1080 × 1350 px' },
  '1:1': { label: '1:1', nameKey: 'Square', width: 1080, height: 1080, desc: '1080 × 1080 px' },
};

export const PinCanvas: React.FC<PinCanvasProps> = ({
  data,
  onExport,
  onRatioChange,
  className = '',
}) => {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const ratio = (data.aspectRatio || '2:3') as SupportedAspectRatio;
  const spec = ASPECT_RATIO_SPECS[ratio] || ASPECT_RATIO_SPECS['2:3'];

  const getAspectClass = () => {
    switch (ratio) {
      case '9:16':
        return 'aspect-[9/16] max-w-[260px]';
      case '3:4':
        return 'aspect-[3/4] max-w-[310px]';
      case '4:5':
        return 'aspect-[4/5] max-w-[310px]';
      case '1:1':
        return 'aspect-square max-w-[310px]';
      case '2:3':
      default:
        return 'aspect-[2/3] max-w-[310px]';
    }
  };

  const handleDownload = () => {
    const { width, height } = spec;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw background image
      ctx.drawImage(img, 0, 0, width, height);

      // Dark overlay scrim
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, 'rgba(0,0,0,0.15)');
      gradient.addColorStop(0.5, 'rgba(0,0,0,0.3)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.88)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Text box
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';

      const isSquare = ratio === '1:1';
      const headlineY = isSquare ? height - 200 : height - 250;
      const subheadlineY = isSquare ? height - 130 : height - 170;
      const brandY = isSquare ? height - 40 : height - 60;

      // Headline
      ctx.font = `bold ${isSquare ? '42px' : '48px'} "Manrope", "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(data.headline || 'Minimalist Aesthetic Guide', width / 2, headlineY, width - 120);

      // Subheadline
      ctx.font = `${isSquare ? '24px' : '28px'} "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillText(data.subheadline || 'Essential Tips & Ideas', width / 2, subheadlineY, width - 140);

      // Brand URL
      ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(data.brandText || 'pinsprig.com', width / 2, brandY);

      const a = document.createElement('a');
      a.download = `pinsprig-${ratio.replace(':', 'x')}-${spec.width}x${spec.height}-${Date.now()}.png`;
      a.href = canvas.toDataURL('image/png');
      a.click();

      if (onExport) onExport();
    };
    img.src = data.imageUrl;
  };

  const copyMetadata = () => {
    navigator.clipboard.writeText(`${data.headline}\n${data.subheadline}\n${data.destinationUrl || ''}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Aspect Ratio & Resolution Info Bar */}
      <div className="mb-3 w-full flex items-center justify-between text-xs px-1">
        <div className="flex items-center gap-1.5 font-mono text-[11px] bg-subtle px-2.5 py-1 rounded-lg border border-subtle text-secondary-theme">
          <span className="font-bold text-primary-theme">{spec.label}</span>
          <span className="text-muted-theme">·</span>
          <span>{spec.desc}</span>
        </div>

        {/* Quick Format Switcher for this Pin */}
        {onRatioChange && (
          <div className="flex items-center gap-1 bg-subtle p-0.5 rounded-lg border border-subtle">
            {(Object.keys(ASPECT_RATIO_SPECS) as SupportedAspectRatio[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onRatioChange(r)}
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded transition-colors cursor-pointer ${
                  ratio === r
                    ? 'accent-btn font-bold shadow-xs'
                    : 'text-secondary-theme hover:text-primary-theme'
                }`}
                title={`${r} (${ASPECT_RATIO_SPECS[r].desc})`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dynamic Aspect Container */}
      <div
        ref={containerRef}
        className={`relative w-full ${getAspectClass()} rounded-2xl overflow-hidden shadow-xl border border-subtle group select-none transition-all duration-300 hover:scale-[1.01]`}
      >
        {/* Background Image */}
        <img
          src={data.imageUrl}
          alt={data.headline}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Dynamic Gradient Scrim based on style */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

        {/* Pinterest "Save" Badge (authentic Pinterest UI indicator) */}
        <div className="absolute top-3.5 right-3.5 z-10 flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-md transition-colors cursor-default">
            Save
          </span>
        </div>

        {/* Brand / Watermark top or bottom */}
        <div className="absolute top-3.5 left-3.5 z-10">
          <span className="text-[10px] font-semibold tracking-wider uppercase text-white/90 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
            {data.brandText || 'PinSprig'}
          </span>
        </div>

        {/* Text Overlay Section (bottom) */}
        <div className={`absolute bottom-0 left-0 right-0 ${ratio === '1:1' ? 'p-3.5' : 'p-4'} flex flex-col justify-end text-white`}>
          {data.style === 'glass' ? (
            <div className="p-3.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 space-y-1">
              <h4 className={`${ratio === '1:1' ? 'text-sm md:text-base' : 'text-base md:text-lg'} font-bold font-heading leading-tight drop-shadow-sm`}>
                {data.headline || 'Minimalist Interior Design'}
              </h4>
              <p className="text-[11px] text-white/85 line-clamp-2">
                {data.subheadline || '7 Expert Rules for a Cozy, Clutter-Free Aesthetic'}
              </p>
            </div>
          ) : data.style === 'split' ? (
            <div className="bg-white text-zinc-950 p-3.5 rounded-xl shadow-lg space-y-1">
              <h4 className={`${ratio === '1:1' ? 'text-sm md:text-base' : 'text-base md:text-lg'} font-bold font-heading leading-tight`}>
                {data.headline}
              </h4>
              <p className="text-[11px] text-zinc-600 font-medium line-clamp-2">
                {data.subheadline}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 text-left">
              <h4 className={`${ratio === '1:1' ? 'text-sm md:text-base' : 'text-base md:text-lg'} font-bold font-heading leading-snug drop-shadow-md`}>
                {data.headline || 'Aesthetic Minimalist Inspiration'}
              </h4>
              <p className="text-[11px] text-white/90 font-medium leading-relaxed drop-shadow-sm line-clamp-2">
                {data.subheadline || 'Essential styling principles and curated guides.'}
              </p>
            </div>
          )}

          {/* Outbound Link preview */}
          {data.destinationUrl && (
            <div className="mt-2 pt-1.5 border-t border-white/20 flex items-center justify-between text-[10px] text-white/70">
              <span className="truncate max-w-[190px]">{data.destinationUrl.replace(/^https?:\/\//, '')}</span>
              <ExternalLink className="w-3 h-3 shrink-0" />
            </div>
          )}
        </div>
      </div>

      {/* Pin Canvas Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={handleDownload}
          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-surface hover:bg-subtle text-primary-theme border border-subtle flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{t.generator.exportImageBtn} ({spec.desc})</span>
        </button>

        <button
          onClick={copyMetadata}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface hover:bg-subtle text-secondary-theme border border-subtle flex items-center gap-1.5 transition-colors cursor-pointer"
          title="Copy title & description"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? t.common.copied : t.common.copy}</span>
        </button>
      </div>
    </div>
  );
};
