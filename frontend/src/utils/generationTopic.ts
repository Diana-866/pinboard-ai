/** Return a trimmed user-supplied topic, or null when the input is blank. */
export function getExplicitGenerationTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const topic = value.trim();
  return topic.length > 0 ? topic : null;
}
