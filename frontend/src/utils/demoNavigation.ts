export type DemoNavigationTab =
  | 'boards'
  | 'calendar'
  | 'generator'
  | 'competitors'
  | 'keywords'
  | 'analytics'
  | 'pricing'
  | 'settings';

/**
 * Maps a visitor's text to a known app section for the demo navigation helper.
 * This is intentionally deterministic and never claims to interpret Pinterest data.
 */
export function getDemoNavigationTarget(
  query: string,
  language = 'en',
): DemoNavigationTab | undefined {
  const normalized = query.trim().normalize('NFKC').toLocaleLowerCase(language);
  if (!normalized) return undefined;

  const matches = (...terms: string[]) => terms.some((term) => normalized.includes(term));

  if (matches('доск', 'board', 'pinnwand', 'tablero', 'tableau', 'pasta', '画板', '看板')) {
    return 'boards';
  }
  if (matches('календар', 'время', 'час', 'когда', 'schedule', 'calendar', 'time', 'zeit', 'planen', 'horario', 'programar', 'heure', 'planifier', 'agendar', '日历', '排期', '时间')) {
    return 'calendar';
  }
  if (matches('генерац', 'пин', 'созда', 'generate', 'create', 'erstelle', 'erstellen', 'crear', 'créer', 'criar', '生成', '创建')) {
    return 'generator';
  }
  if (matches('конкурент', 'competitor', 'wettbewerb', 'competidor', 'concurrent', 'concorr')) {
    return 'competitors';
  }
  if (matches('ключ', 'keyword', 'schlüssel', 'palabra', 'mot-clé', 'palavra-chave', '关键词')) {
    return 'keywords';
  }
  if (matches('аналит', 'статист', 'показател', 'analytics', 'metric', 'statistic', 'kennzahl', 'statistik', 'métrica', 'estadíst', 'statistique', 'indicateur', 'dados', '数据', '指标')) {
    return 'analytics';
  }
  if (matches('тариф', 'оплат', 'цена', 'plan', 'price', 'pricing', 'tarif', 'precio', 'preço', 'plano', '价格')) {
    return 'pricing';
  }
  if (matches('настрой', 'setting', 'einstellung', 'configuración', 'paramètre', 'configuração', '设置')) {
    return 'settings';
  }

  return undefined;
}
