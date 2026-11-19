/**
 * Error text for code that is not a React component.
 *
 * Components read `t` from `useI18n()`. Some failures are raised inside plain modules —
 * payment link creation, response validation, idempotency-key generation — where no hook is
 * available, so the language comes from the same storage the request layer already reads.
 *
 * Every entry here is a message a customer can actually see. Admin panels are deliberately
 * absent: the only reader there is the owner, who works in Russian.
 */
import { readLocalStorageValue } from '../lib/authStorage';

type Language = 'en' | 'ru' | 'es' | 'pt' | 'de' | 'fr' | 'zh';

export type AppErrorMessageKey =
  | 'projectNotFound'
  | 'boardNotFound'
  | 'pinNotFound'
  | 'scheduleNotFound'
  | 'publicationNotFound'
  | 'generationRequestNotFound'
  | 'pinterestAccountNotFound'
  | 'userNotFound'
  | 'insufficientCredits'
  | 'paymentLinkMissing'
  | 'userNotIdentified'
  | 'projectsListInvalid'
  | 'projectNotConfirmed'
  | 'savedPinsInvalidList'
  | 'savedPinsInvalidRecord'
  | 'savedPinMissingId'
  | 'savedPinDuplicateId'
  | 'savedPinMissingImage'
  | 'savedPinInvalidImage'
  | 'imageMustUseHttps'
  | 'generationInvalidResult'
  | 'generationIncompletePin'
  | 'generationPinMissingId'
  | 'generationDuplicateId'
  | 'generationMissingImage'
  | 'generationInvalidImage'
  | 'generationUnsafeImage'
  | 'secureKeyUnavailable'
  | 'sessionNotStored'
  | 'pinterestLinkDataMissing';

const MESSAGES: Record<Language, Record<AppErrorMessageKey, string>> = {
  en: {
    projectNotFound: "This project was not found. It may have been deleted, or it belongs to another account.",
    boardNotFound: "This board was not found. Refresh the list and choose a board again.",
    pinNotFound: "This pin no longer exists. Refresh the list to see the current pins.",
    scheduleNotFound: "This schedule entry was not found. Refresh the calendar and try again.",
    publicationNotFound: "This publication was not found. Refresh the calendar and try again.",
    generationRequestNotFound: "This generation request was not found. Start a new generation.",
    pinterestAccountNotFound: "The selected Pinterest account was not found or is disconnected. Reconnect Pinterest.",
    userNotFound: "Your account was not found. Sign in again.",
    insufficientCredits: "Not enough credits for this action. Top up your balance and try again.",
    paymentLinkMissing: "The server did not return a payment link. Try again or contact support.",
    userNotIdentified: "Could not identify the user. Reload the page and sign in again.",
    projectsListInvalid: "The server returned an invalid project list. Reload the page and try again.",
    projectNotConfirmed: "Could not confirm the project for the new board. Reload the list and try again.",
    savedPinsInvalidList: "The server returned an invalid list of saved pins.",
    savedPinsInvalidRecord: "The server returned an invalid saved pin record.",
    savedPinMissingId: "A saved pin has no identifier.",
    savedPinDuplicateId: "The server returned a duplicate saved pin identifier.",
    savedPinMissingImage: "A saved pin has no permanent image link.",
    savedPinInvalidImage: "The server returned an invalid saved pin image link.",
    imageMustUseHttps: "A saved image link must use HTTPS.",
    generationInvalidResult: "The server returned an invalid generation result. Check the saved results again.",
    generationIncompletePin: "The server returned incomplete pin data. The recovery key has been kept.",
    generationPinMissingId: "A saved pin has a missing or invalid identifier. The recovery key has been kept.",
    generationDuplicateId: "The server returned a duplicate pin identifier. The recovery key has been kept.",
    generationMissingImage: "A saved pin has no permanent image link. The recovery key has been kept.",
    generationInvalidImage: "The server returned an invalid image link. The recovery key has been kept.",
    generationUnsafeImage: "A saved image link must be a secure HTTPS link. The recovery key has been kept.",
    secureKeyUnavailable: "Secure key generation is unavailable. Open PinPosy over a secure HTTPS connection and try again.",
    sessionNotStored: "The browser blocked saving your session. Allow site storage and sign in again.",
    pinterestLinkDataMissing: "The server did not return the data needed for a secure connection.",
  },
  ru: {
    projectNotFound: "Проект не найден. Возможно, он удалён или принадлежит другому аккаунту.",
    boardNotFound: "Доска не найдена. Обновите список и выберите доску заново.",
    pinNotFound: "Этот пин больше не существует. Обновите список, чтобы увидеть актуальные пины.",
    scheduleNotFound: "Запись расписания не найдена. Обновите календарь и попробуйте снова.",
    publicationNotFound: "Публикация не найдена. Обновите календарь и попробуйте снова.",
    generationRequestNotFound: "Запрос генерации не найден. Запустите новую генерацию.",
    pinterestAccountNotFound: "Выбранный Pinterest-аккаунт не найден или отключён. Подключите Pinterest заново.",
    userNotFound: "Аккаунт не найден. Войдите заново.",
    insufficientCredits: "Недостаточно кредитов для этого действия. Пополните баланс и повторите.",
    paymentLinkMissing: "Сервер не вернул ссылку на оплату. Попробуйте ещё раз или напишите в поддержку.",
    userNotIdentified: "Не удалось определить пользователя. Обновите страницу и войдите снова.",
    projectsListInvalid: "Сервер вернул некорректный список проектов. Обновите страницу и попробуйте ещё раз.",
    projectNotConfirmed: "Не удалось подтвердить проект для новой доски. Обновите список и попробуйте ещё раз.",
    savedPinsInvalidList: "Сервер вернул некорректный список сохранённых пинов.",
    savedPinsInvalidRecord: "Сервер вернул некорректную запись сохранённого пина.",
    savedPinMissingId: "У сохранённого пина отсутствует идентификатор.",
    savedPinDuplicateId: "Сервер вернул повторяющийся идентификатор сохранённого пина.",
    savedPinMissingImage: "У сохранённого пина отсутствует постоянная ссылка на изображение.",
    savedPinInvalidImage: "Сервер вернул некорректную ссылку на изображение сохранённого пина.",
    imageMustUseHttps: "Ссылка на сохранённое изображение должна использовать HTTPS.",
    generationInvalidResult: "Сервер вернул некорректный результат генерации. Повторите проверку сохранённых результатов.",
    generationIncompletePin: "Сервер вернул неполные данные пина. Ключ восстановления сохранён.",
    generationPinMissingId: "У сохранённого пина отсутствует или некорректен идентификатор. Ключ восстановления сохранён.",
    generationDuplicateId: "Сервер вернул повторяющийся идентификатор пина. Ключ восстановления сохранён.",
    generationMissingImage: "У сохранённого пина отсутствует постоянная ссылка на изображение. Ключ восстановления сохранён.",
    generationInvalidImage: "Сервер вернул некорректную ссылку на изображение. Ключ восстановления сохранён.",
    generationUnsafeImage: "Ссылка на сохранённое изображение должна быть безопасной HTTPS-ссылкой. Ключ восстановления сохранён.",
    secureKeyUnavailable: "Безопасная генерация ключа недоступна. Откройте PinPosy через защищённое HTTPS-соединение и повторите попытку.",
    sessionNotStored: "Браузер не разрешил сохранить сессию. Разрешите хранилище сайта и войдите снова.",
    pinterestLinkDataMissing: "Сервер не вернул данные для безопасного подключения.",
  },
  es: {
    projectNotFound: "No se encontró este proyecto. Puede que se haya eliminado o que pertenezca a otra cuenta.",
    boardNotFound: "No se encontró este tablero. Actualiza la lista y elige un tablero de nuevo.",
    pinNotFound: "Este pin ya no existe. Actualiza la lista para ver los pines actuales.",
    scheduleNotFound: "No se encontró esta entrada de la programación. Actualiza el calendario e inténtalo de nuevo.",
    publicationNotFound: "No se encontró esta publicación. Actualiza el calendario e inténtalo de nuevo.",
    generationRequestNotFound: "No se encontró esta solicitud de generación. Inicia una nueva generación.",
    pinterestAccountNotFound: "La cuenta de Pinterest seleccionada no se encontró o está desconectada. Vuelve a conectar Pinterest.",
    userNotFound: "No se encontró tu cuenta. Inicia sesión de nuevo.",
    insufficientCredits: "No hay créditos suficientes para esta acción. Recarga tu saldo e inténtalo de nuevo.",
    paymentLinkMissing: "El servidor no devolvió ningún enlace de pago. Inténtalo de nuevo o escribe al soporte.",
    userNotIdentified: "No se pudo identificar al usuario. Recarga la página e inicia sesión de nuevo.",
    projectsListInvalid: "El servidor devolvió una lista de proyectos no válida. Recarga la página e inténtalo de nuevo.",
    projectNotConfirmed: "No se pudo confirmar el proyecto para el nuevo tablero. Actualiza la lista e inténtalo de nuevo.",
    savedPinsInvalidList: "El servidor devolvió una lista no válida de pines guardados.",
    savedPinsInvalidRecord: "El servidor devolvió un registro de pin guardado no válido.",
    savedPinMissingId: "Un pin guardado no tiene identificador.",
    savedPinDuplicateId: "El servidor devolvió un identificador de pin guardado duplicado.",
    savedPinMissingImage: "Un pin guardado no tiene enlace permanente a la imagen.",
    savedPinInvalidImage: "El servidor devolvió un enlace de imagen no válido para el pin guardado.",
    imageMustUseHttps: "El enlace de la imagen guardada debe usar HTTPS.",
    generationInvalidResult: "El servidor devolvió un resultado de generación no válido. Vuelve a comprobar los resultados guardados.",
    generationIncompletePin: "El servidor devolvió datos incompletos del pin. Se ha conservado la clave de recuperación.",
    generationPinMissingId: "Un pin guardado tiene un identificador ausente o no válido. Se ha conservado la clave de recuperación.",
    generationDuplicateId: "El servidor devolvió un identificador de pin duplicado. Se ha conservado la clave de recuperación.",
    generationMissingImage: "Un pin guardado no tiene enlace permanente a la imagen. Se ha conservado la clave de recuperación.",
    generationInvalidImage: "El servidor devolvió un enlace de imagen no válido. Se ha conservado la clave de recuperación.",
    generationUnsafeImage: "El enlace de la imagen guardada debe ser un enlace HTTPS seguro. Se ha conservado la clave de recuperación.",
    secureKeyUnavailable: "La generación segura de claves no está disponible. Abre PinPosy mediante una conexión HTTPS segura e inténtalo de nuevo.",
    sessionNotStored: "El navegador bloqueó el guardado de tu sesión. Permite el almacenamiento del sitio e inicia sesión de nuevo.",
    pinterestLinkDataMissing: "El servidor no devolvió los datos necesarios para una conexión segura.",
  },
  pt: {
    projectNotFound: "Este projeto não foi encontrado. Pode ter sido eliminado ou pertencer a outra conta.",
    boardNotFound: "Este quadro não foi encontrado. Atualize a lista e escolha um quadro novamente.",
    pinNotFound: "Este pin já não existe. Atualize a lista para ver os pins atuais.",
    scheduleNotFound: "Esta entrada da programação não foi encontrada. Atualize o calendário e tente novamente.",
    publicationNotFound: "Esta publicação não foi encontrada. Atualize o calendário e tente novamente.",
    generationRequestNotFound: "Este pedido de geração não foi encontrado. Inicie uma nova geração.",
    pinterestAccountNotFound: "A conta do Pinterest selecionada não foi encontrada ou está desligada. Volte a ligar o Pinterest.",
    userNotFound: "A sua conta não foi encontrada. Entre novamente.",
    insufficientCredits: "Não há créditos suficientes para esta ação. Carregue o saldo e tente novamente.",
    paymentLinkMissing: "O servidor não devolveu qualquer link de pagamento. Tente novamente ou contacte o suporte.",
    userNotIdentified: "Não foi possível identificar o utilizador. Recarregue a página e entre novamente.",
    projectsListInvalid: "O servidor devolveu uma lista de projetos inválida. Recarregue a página e tente novamente.",
    projectNotConfirmed: "Não foi possível confirmar o projeto para o novo quadro. Atualize a lista e tente novamente.",
    savedPinsInvalidList: "O servidor devolveu uma lista inválida de pins guardados.",
    savedPinsInvalidRecord: "O servidor devolveu um registo de pin guardado inválido.",
    savedPinMissingId: "Um pin guardado não tem identificador.",
    savedPinDuplicateId: "O servidor devolveu um identificador de pin guardado duplicado.",
    savedPinMissingImage: "Um pin guardado não tem ligação permanente à imagem.",
    savedPinInvalidImage: "O servidor devolveu uma ligação de imagem inválida para o pin guardado.",
    imageMustUseHttps: "A ligação da imagem guardada deve usar HTTPS.",
    generationInvalidResult: "O servidor devolveu um resultado de geração inválido. Verifique novamente os resultados guardados.",
    generationIncompletePin: "O servidor devolveu dados incompletos do pin. A chave de recuperação foi mantida.",
    generationPinMissingId: "Um pin guardado tem um identificador ausente ou inválido. A chave de recuperação foi mantida.",
    generationDuplicateId: "O servidor devolveu um identificador de pin duplicado. A chave de recuperação foi mantida.",
    generationMissingImage: "Um pin guardado não tem ligação permanente à imagem. A chave de recuperação foi mantida.",
    generationInvalidImage: "O servidor devolveu uma ligação de imagem inválida. A chave de recuperação foi mantida.",
    generationUnsafeImage: "A ligação da imagem guardada deve ser uma ligação HTTPS segura. A chave de recuperação foi mantida.",
    secureKeyUnavailable: "A geração segura de chaves não está disponível. Abra o PinPosy através de uma ligação HTTPS segura e tente novamente.",
    sessionNotStored: "O navegador bloqueou o armazenamento da sua sessão. Permita o armazenamento do site e entre novamente.",
    pinterestLinkDataMissing: "O servidor não devolveu os dados necessários para uma ligação segura.",
  },
  de: {
    projectNotFound: "Dieses Projekt wurde nicht gefunden. Möglicherweise wurde es gelöscht oder gehört zu einem anderen Konto.",
    boardNotFound: "Dieses Board wurde nicht gefunden. Aktualisieren Sie die Liste und wählen Sie erneut ein Board.",
    pinNotFound: "Dieser Pin existiert nicht mehr. Aktualisieren Sie die Liste, um die aktuellen Pins zu sehen.",
    scheduleNotFound: "Dieser Zeitplan-Eintrag wurde nicht gefunden. Aktualisieren Sie den Kalender und versuchen Sie es erneut.",
    publicationNotFound: "Diese Veröffentlichung wurde nicht gefunden. Aktualisieren Sie den Kalender und versuchen Sie es erneut.",
    generationRequestNotFound: "Diese Generierungsanfrage wurde nicht gefunden. Starten Sie eine neue Generierung.",
    pinterestAccountNotFound: "Das gewählte Pinterest-Konto wurde nicht gefunden oder ist getrennt. Verbinden Sie Pinterest erneut.",
    userNotFound: "Ihr Konto wurde nicht gefunden. Melden Sie sich erneut an.",
    insufficientCredits: "Nicht genügend Credits für diese Aktion. Laden Sie Ihr Guthaben auf und versuchen Sie es erneut.",
    paymentLinkMissing: "Der Server hat keinen Zahlungslink zurückgegeben. Versuchen Sie es erneut oder wenden Sie sich an den Support.",
    userNotIdentified: "Der Benutzer konnte nicht ermittelt werden. Laden Sie die Seite neu und melden Sie sich erneut an.",
    projectsListInvalid: "Der Server hat eine ungültige Projektliste zurückgegeben. Laden Sie die Seite neu und versuchen Sie es erneut.",
    projectNotConfirmed: "Das Projekt für das neue Board konnte nicht bestätigt werden. Aktualisieren Sie die Liste und versuchen Sie es erneut.",
    savedPinsInvalidList: "Der Server hat eine ungültige Liste gespeicherter Pins zurückgegeben.",
    savedPinsInvalidRecord: "Der Server hat einen ungültigen gespeicherten Pin-Datensatz zurückgegeben.",
    savedPinMissingId: "Einem gespeicherten Pin fehlt die Kennung.",
    savedPinDuplicateId: "Der Server hat eine doppelte Kennung für einen gespeicherten Pin zurückgegeben.",
    savedPinMissingImage: "Einem gespeicherten Pin fehlt der dauerhafte Bildlink.",
    savedPinInvalidImage: "Der Server hat einen ungültigen Bildlink für den gespeicherten Pin zurückgegeben.",
    imageMustUseHttps: "Der Link zu einem gespeicherten Bild muss HTTPS verwenden.",
    generationInvalidResult: "Der Server hat ein ungültiges Generierungsergebnis zurückgegeben. Prüfen Sie die gespeicherten Ergebnisse erneut.",
    generationIncompletePin: "Der Server hat unvollständige Pin-Daten zurückgegeben. Der Wiederherstellungsschlüssel wurde behalten.",
    generationPinMissingId: "Einem gespeicherten Pin fehlt eine gültige Kennung. Der Wiederherstellungsschlüssel wurde behalten.",
    generationDuplicateId: "Der Server hat eine doppelte Pin-Kennung zurückgegeben. Der Wiederherstellungsschlüssel wurde behalten.",
    generationMissingImage: "Einem gespeicherten Pin fehlt der dauerhafte Bildlink. Der Wiederherstellungsschlüssel wurde behalten.",
    generationInvalidImage: "Der Server hat einen ungültigen Bildlink zurückgegeben. Der Wiederherstellungsschlüssel wurde behalten.",
    generationUnsafeImage: "Der Link zu einem gespeicherten Bild muss ein sicherer HTTPS-Link sein. Der Wiederherstellungsschlüssel wurde behalten.",
    secureKeyUnavailable: "Die sichere Schlüsselerzeugung ist nicht verfügbar. Öffnen Sie PinPosy über eine sichere HTTPS-Verbindung und versuchen Sie es erneut.",
    sessionNotStored: "Der Browser hat das Speichern Ihrer Sitzung blockiert. Erlauben Sie den Website-Speicher und melden Sie sich erneut an.",
    pinterestLinkDataMissing: "Der Server hat die für eine sichere Verbindung nötigen Daten nicht zurückgegeben.",
  },
  fr: {
    projectNotFound: "Ce projet est introuvable. Il a peut-être été supprimé ou appartient à un autre compte.",
    boardNotFound: "Ce tableau est introuvable. Actualisez la liste et choisissez à nouveau un tableau.",
    pinNotFound: "Ce pin n’existe plus. Actualisez la liste pour voir les pins actuels.",
    scheduleNotFound: "Cette entrée de programmation est introuvable. Actualisez le calendrier et réessayez.",
    publicationNotFound: "Cette publication est introuvable. Actualisez le calendrier et réessayez.",
    generationRequestNotFound: "Cette demande de génération est introuvable. Lancez une nouvelle génération.",
    pinterestAccountNotFound: "Le compte Pinterest sélectionné est introuvable ou déconnecté. Reconnectez Pinterest.",
    userNotFound: "Votre compte est introuvable. Reconnectez-vous.",
    insufficientCredits: "Crédits insuffisants pour cette action. Rechargez votre solde et réessayez.",
    paymentLinkMissing: "Le serveur n’a pas renvoyé de lien de paiement. Réessayez ou contactez le support.",
    userNotIdentified: "Impossible d’identifier l’utilisateur. Rechargez la page et reconnectez-vous.",
    projectsListInvalid: "Le serveur a renvoyé une liste de projets invalide. Rechargez la page et réessayez.",
    projectNotConfirmed: "Impossible de confirmer le projet pour le nouveau tableau. Actualisez la liste et réessayez.",
    savedPinsInvalidList: "Le serveur a renvoyé une liste invalide de pins enregistrés.",
    savedPinsInvalidRecord: "Le serveur a renvoyé un enregistrement de pin enregistré invalide.",
    savedPinMissingId: "Un pin enregistré n’a pas d’identifiant.",
    savedPinDuplicateId: "Le serveur a renvoyé un identifiant de pin enregistré en double.",
    savedPinMissingImage: "Un pin enregistré n’a pas de lien d’image permanent.",
    savedPinInvalidImage: "Le serveur a renvoyé un lien d’image invalide pour le pin enregistré.",
    imageMustUseHttps: "Le lien d’une image enregistrée doit utiliser HTTPS.",
    generationInvalidResult: "Le serveur a renvoyé un résultat de génération invalide. Vérifiez à nouveau les résultats enregistrés.",
    generationIncompletePin: "Le serveur a renvoyé des données de pin incomplètes. La clé de récupération a été conservée.",
    generationPinMissingId: "Un pin enregistré a un identifiant absent ou invalide. La clé de récupération a été conservée.",
    generationDuplicateId: "Le serveur a renvoyé un identifiant de pin en double. La clé de récupération a été conservée.",
    generationMissingImage: "Un pin enregistré n’a pas de lien d’image permanent. La clé de récupération a été conservée.",
    generationInvalidImage: "Le serveur a renvoyé un lien d’image invalide. La clé de récupération a été conservée.",
    generationUnsafeImage: "Le lien d’une image enregistrée doit être un lien HTTPS sécurisé. La clé de récupération a été conservée.",
    secureKeyUnavailable: "La génération sécurisée de clés n’est pas disponible. Ouvrez PinPosy via une connexion HTTPS sécurisée et réessayez.",
    sessionNotStored: "Le navigateur a bloqué l’enregistrement de votre session. Autorisez le stockage du site et reconnectez-vous.",
    pinterestLinkDataMissing: "Le serveur n’a pas renvoyé les données nécessaires à une connexion sécurisée.",
  },
  zh: {
    projectNotFound: "未找到该项目，可能已被删除或属于其他账号。",
    boardNotFound: "未找到该画板，请刷新列表后重新选择。",
    pinNotFound: "该 Pin 已不存在，请刷新列表查看当前 Pin。",
    scheduleNotFound: "未找到该排期记录，请刷新日历后重试。",
    publicationNotFound: "未找到该发布记录，请刷新日历后重试。",
    generationRequestNotFound: "未找到该生成请求，请重新发起生成。",
    pinterestAccountNotFound: "所选 Pinterest 账号不存在或已断开，请重新连接 Pinterest。",
    userNotFound: "未找到你的账号，请重新登录。",
    insufficientCredits: "额度不足，请充值后重试。",
    paymentLinkMissing: "服务器未返回支付链接，请重试或联系客服。",
    userNotIdentified: "无法识别用户，请刷新页面后重新登录。",
    projectsListInvalid: "服务器返回了无效的项目列表，请刷新页面后重试。",
    projectNotConfirmed: "无法确认新画板的项目，请刷新列表后重试。",
    savedPinsInvalidList: "服务器返回了无效的已保存 Pin 列表。",
    savedPinsInvalidRecord: "服务器返回了无效的已保存 Pin 记录。",
    savedPinMissingId: "某个已保存 Pin 缺少标识符。",
    savedPinDuplicateId: "服务器返回了重复的已保存 Pin 标识符。",
    savedPinMissingImage: "某个已保存 Pin 缺少永久图片链接。",
    savedPinInvalidImage: "服务器返回了无效的已保存 Pin 图片链接。",
    imageMustUseHttps: "已保存图片链接必须使用 HTTPS。",
    generationInvalidResult: "服务器返回了无效的生成结果，请重新检查已保存的结果。",
    generationIncompletePin: "服务器返回的 Pin 数据不完整，恢复密钥已保留。",
    generationPinMissingId: "某个已保存 Pin 的标识符缺失或无效，恢复密钥已保留。",
    generationDuplicateId: "服务器返回了重复的 Pin 标识符，恢复密钥已保留。",
    generationMissingImage: "某个已保存 Pin 缺少永久图片链接，恢复密钥已保留。",
    generationInvalidImage: "服务器返回了无效的图片链接，恢复密钥已保留。",
    generationUnsafeImage: "已保存图片链接必须是安全的 HTTPS 链接，恢复密钥已保留。",
    secureKeyUnavailable: "无法安全生成密钥，请通过安全的 HTTPS 连接打开 PinPosy 后重试。",
    sessionNotStored: "浏览器阻止保存会话，请允许本站存储后重新登录。",
    pinterestLinkDataMissing: "服务器未返回安全连接所需的数据。",
  },
};

export function currentInterfaceLanguage(): Language {
  const stored = String(readLocalStorageValue('pinposy_lang') || '').toLowerCase().split('-')[0];
  return (Object.prototype.hasOwnProperty.call(MESSAGES, stored) ? stored : 'en') as Language;
}

export function getAppErrorMessage(key: AppErrorMessageKey): string {
  return MESSAGES[currentInterfaceLanguage()][key];
}

/**
 * Translate a machine-readable API error code into the user's language.
 *
 * The backend answers in Russian with a code. Every screen would otherwise have to map the
 * code itself, so the request layer does it once: a known code becomes a localized message,
 * and an unknown one returns null so the caller keeps the server text instead of inventing
 * a meaning for a failure we do not understand.
 */
const NOT_FOUND_CODES: Record<string, AppErrorMessageKey> = {
  project_not_found: 'projectNotFound',
  board_not_found: 'boardNotFound',
  pin_not_found: 'pinNotFound',
  schedule_not_found: 'scheduleNotFound',
  publication_not_found: 'publicationNotFound',
  generation_request_not_found: 'generationRequestNotFound',
  pinterest_account_not_found: 'pinterestAccountNotFound',
  user_not_found: 'userNotFound',
};

export function getLocalizedApiError(code: unknown, status: unknown): string | null {
  if (typeof code !== 'string') return null;
  if (code === 'insufficient_credits' && Number(status) === 402) {
    return getAppErrorMessage('insufficientCredits');
  }
  if (Number(status) === 404 && Object.prototype.hasOwnProperty.call(NOT_FOUND_CODES, code)) {
    return getAppErrorMessage(NOT_FOUND_CODES[code]);
  }
  return null;
}
