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
