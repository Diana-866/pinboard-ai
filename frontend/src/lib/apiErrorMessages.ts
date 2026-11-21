export type ApiFallbackMessage = 'network' | 'timeout' | 'rateLimited' | 'invalidResponse' | 'generic';

type SupportedLocale = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

const MESSAGES: Record<SupportedLocale, Record<ApiFallbackMessage, string>> = {
  en: {
    network: 'The server is not responding. Check your connection and try again in a minute.',
    invalidResponse: 'The server returned an invalid response. Please try again later.',
    generic: 'Something went wrong. Please try again.',
    timeout: "The server took too long to answer. Check your connection and try again.",
    rateLimited: "Too many requests. Please wait {seconds} s and try again.",
  },
  ru: {
    network: 'Сервер не отвечает. Проверьте соединение и попробуйте снова через минуту.',
    invalidResponse: 'Сервер вернул некорректный ответ. Попробуйте позже.',
    generic: 'Произошла ошибка. Попробуйте ещё раз.',
    timeout: "Сервер слишком долго не отвечал. Проверьте соединение и попробуйте снова.",
    rateLimited: "Слишком много запросов. Подождите {seconds} с и попробуйте снова.",
  },
  es: {
    network: 'El servidor no responde. Comprueba tu conexión e inténtalo de nuevo en un minuto.',
    invalidResponse: 'El servidor devolvió una respuesta no válida. Inténtalo de nuevo más tarde.',
    generic: 'Se ha producido un error. Inténtalo de nuevo.',
    timeout: "El servidor tardó demasiado en responder. Comprueba tu conexión e inténtalo de nuevo.",
    rateLimited: "Demasiadas solicitudes. Espera {seconds} s e inténtalo de nuevo.",
  },
  pt: {
    network: 'O servidor não responde. Verifique a ligação e tente novamente dentro de um minuto.',
    invalidResponse: 'O servidor devolveu uma resposta inválida. Tente novamente mais tarde.',
    generic: 'Ocorreu um erro. Tente novamente.',
    timeout: "O servidor demorou demasiado a responder. Verifique a ligação e tente novamente.",
    rateLimited: "Demasiados pedidos. Aguarde {seconds} s e tente novamente.",
  },
  de: {
    network: 'Der Server antwortet nicht. Prüfe deine Verbindung und versuche es in einer Minute erneut.',
    invalidResponse: 'Der Server hat eine ungültige Antwort zurückgegeben. Bitte versuche es später erneut.',
    generic: 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.',
    timeout: "Der Server hat zu lange nicht geantwortet. Prüfe deine Verbindung und versuche es erneut.",
    rateLimited: "Zu viele Anfragen. Bitte warte {seconds} Sek. und versuche es erneut.",
  },
  fr: {
    network: 'Le serveur ne répond pas. Vérifiez votre connexion et réessayez dans une minute.',
    invalidResponse: 'Le serveur a renvoyé une réponse invalide. Veuillez réessayer plus tard.',
    generic: 'Une erreur s’est produite. Veuillez réessayer.',
    timeout: "Le serveur a mis trop de temps à répondre. Vérifiez votre connexion et réessayez.",
    rateLimited: "Trop de requêtes. Patientez {seconds} s, puis réessayez.",
  },
  zh: {
    network: '服务器没有响应。请检查网络连接，一分钟后再试。',
    invalidResponse: '服务器返回了无效响应，请稍后重试。',
    generic: '发生错误，请重试。',
    timeout: "服务器响应超时，请检查网络连接后重试。",
    rateLimited: "请求过于频繁，请等待 {seconds} 秒后重试。",
  },
};

export function getApiFallbackMessage(
  key: ApiFallbackMessage,
  locale: string | null | undefined
): string {
  const normalized = String(locale || '').toLowerCase().split('-')[0] as SupportedLocale;
  return (MESSAGES[normalized] || MESSAGES.en)[key];
}
