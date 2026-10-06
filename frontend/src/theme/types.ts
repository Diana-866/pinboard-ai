export type ThemeMode = 'light-rose' | 'light-mono' | 'dark-rose' | 'dark-mono';

export interface ThemeConfig {
  id: ThemeMode;
  nameKey: string;
  descKey: string;
  isDark: boolean;
  accentColor: string;
  bgPreview: string;
  surfacePreview: string;
  textPreview: string;
  borderPreview: string;
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'light-rose',
    nameKey: 'themeLightRose',
    descKey: 'themeLightRoseDesc',
    isDark: false,
    accentColor: '#E05375',
    bgPreview: '#FFF9FA',
    surfacePreview: '#FFFFFF',
    textPreview: '#1E232E',
    borderPreview: '#F2DFE4',
  },
  {
    id: 'light-mono',
    nameKey: 'themeLightMono',
    descKey: 'themeLightMonoDesc',
    isDark: false,
    accentColor: '#18181B',
    bgPreview: '#F9FAFB',
    surfacePreview: '#FFFFFF',
    textPreview: '#111827',
    borderPreview: '#E5E7EB',
  },
  {
    id: 'dark-rose',
    nameKey: 'themeDarkRose',
    descKey: 'themeDarkRoseDesc',
    isDark: true,
    accentColor: '#F472B6',
    bgPreview: '#0E0F14',
    surfacePreview: '#161720',
    textPreview: '#F3F4F6',
    borderPreview: '#2B2633',
  },
  {
    id: 'dark-mono',
    nameKey: 'themeDarkMono',
    descKey: 'themeDarkMonoDesc',
    isDark: true,
    accentColor: '#FFFFFF',
    bgPreview: '#0B0C0E',
    surfacePreview: '#14171A',
    textPreview: '#E5E7EB',
    borderPreview: '#22272E',
  },
];
