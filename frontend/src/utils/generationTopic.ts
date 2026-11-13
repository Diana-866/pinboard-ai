/** Returns a trimmed generation topic, or null when the input is empty. */
export function normalizeGenerationTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.trim();
  return topic.length > 0 ? topic : null;
}

/** Localized validation copy for every supported interface language. */
export function getTopicRequiredMessage(language: string): string {
  const messages: Record<string, string> = {
    en: 'Please enter a topic before generating pins.',
    ru: 'Введите тему, прежде чем создавать пины.',
    es: 'Introduce un tema antes de generar pines.',
    pt: 'Insira um tema antes de gerar Pins.',
    de: 'Bitte gib ein Thema ein, bevor du Pins generierst.',
    fr: 'Saisissez un sujet avant de générer des épingles.',
    zh: '请先输入主题，再生成 Pin。',
  };
  return messages[language] || messages.en;
}
