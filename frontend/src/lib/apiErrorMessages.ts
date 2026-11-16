export type ApiFallbackMessage = 'network' | 'invalidResponse' | 'generic';

type SupportedLocale = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

const MESSAGES: Record<SupportedLocale, Record<ApiFallbackMessage, string>> = {
  en: {
    network: 'The server is unavailable. It may be waking up after inactivity. Please wait a moment and try again.',
    invalidResponse: 'The server returned an invalid response. Please try again later.',
    generic: 'Something went wrong. Please try again.',
  },
  ru: {
    network: 'Сервер не отвечает. Возможно, он просыпается после простоя — подождите минуту и попробуйте снова.',
    invalidResponse: 'Сервер вернул некорректный ответ. Попробуйте позже.',
    generic: 'Произошла ошибка. Попробуйте ещё раз.',
  },
  es: {
    network: 'El servidor no está disponible. Puede que se esté iniciando tras un periodo de inactividad. Espera un momento e inténtalo de nuevo.',
    invalidResponse: 'El servidor devolvió una respuesta no válida. Inténtalo de nuevo más tarde.',
    generic: 'Se ha producido un error. Inténtalo de nuevo.',
  },
  pt: {
    network: 'O servidor está indisponível. Pode estar a iniciar após um período de inatividade. Aguarde um momento e tente novamente.',
    invalidResponse: 'O servidor devolveu uma resposta inválida. Tente novamente mais tarde.',
    generic: 'Ocorreu um erro. Tente novamente.',
  },
  de: {
    network: 'Der Server ist nicht erreichbar. Möglicherweise startet er nach einer Ruhephase. Bitte warte kurz und versuche es erneut.',
    invalidResponse: 'Der Server hat eine ungültige Antwort zurückgegeben. Bitte versuche es später erneut.',
    generic: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
  },
  fr: {
    network: 'Le serveur est indisponible. Il est peut-être en cours de réveil après une période d’inactivité. Attendez un instant, puis réessayez.',
    invalidResponse: 'Le serveur a renvoyé une réponse invalide. Veuillez réessayer plus tard.',
    generic: 'Une erreur s’est produite. Veuillez réessayer.',
  },
  zh: {
    network: '服务器暂时无法响应，可能正在从休眠状态恢复。请稍等片刻后重试。',
    invalidResponse: '服务器返回了无效响应，请稍后重试。',
    generic: '发生错误，请重试。',
  },
};

export function getApiFallbackMessage(
  key: ApiFallbackMessage,
  locale: string | null | undefined
): string {
  const normalized = String(locale || '').toLowerCase().split('-')[0] as SupportedLocale;
  return (MESSAGES[normalized] || MESSAGES.en)[key];
}
