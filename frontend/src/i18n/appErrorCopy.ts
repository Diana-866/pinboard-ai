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
  | 'tariffRequired'
  | 'tariffInsufficient'
  | 'pinterestUnavailable'
  | 'pinterestRateLimited'
  | 'pinterestNotConnected'
  | 'pinAlreadyScheduled'
  | 'publicationNotFailed'
  | 'boardNameRequired'
  | 'invalidScheduleTime'
  | 'scheduleTooFar'
  | 'invalidTimezone'
  | 'projectUrlRequired'
  | 'projectUrlInvalid'
  | 'pinImageMissing'
  | 'boardSelectionRequired'
  | 'imageUploadRequired'
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
    tariffRequired: "Your plan is not active right now. Choose a plan to create pins again.",
    tariffInsufficient: "This section is not included in your current plan. Upgrade to continue.",
    pinterestUnavailable: "Pinterest is temporarily unavailable. Nothing was lost — try this again in a minute.",
    pinterestRateLimited: "Pinterest is limiting how often this can be done. Wait a moment and try again.",
    pinterestNotConnected: "Connect your Pinterest account first, then schedule the publication.",
    pinAlreadyScheduled: "This pin is already scheduled or published. Check the calendar before scheduling it again.",
    publicationNotFailed: "This action is only available for a publication with the Failed status.",
    boardNameRequired: "A board name is required.",
    invalidScheduleTime: "Check the publication date and time — it cannot be empty or in the past.",
    scheduleTooFar: "A publication cannot be scheduled more than a year ahead.",
    invalidTimezone: "That time zone is not recognized. Check the time zone in your profile.",
    projectUrlRequired: "Add your site URL in the project settings before publishing.",
    projectUrlInvalid: "The site URL is invalid. Use a full HTTP or HTTPS address without a login or password.",
    pinImageMissing: "This pin has no saved image. Generate or upload an image first.",
    boardSelectionRequired: "Choose a Pinterest board before scheduling the publication.",
    imageUploadRequired: "Attach an image file (PNG/JPG/WebP/GIF, up to 5 MB).",
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
    tariffRequired: "Подписка не активна. Выберите тариф, чтобы снова создавать пины.",
    tariffInsufficient: "Этот раздел не входит в ваш тариф. Перейдите на другой, чтобы продолжить.",
    pinterestUnavailable: "Pinterest временно недоступен. Ничего не потеряно — повторите через минуту.",
    pinterestRateLimited: "Pinterest ограничил частоту действий. Подождите немного и повторите.",
    pinterestNotConnected: "Сначала подключите Pinterest-аккаунт, затем запланируйте публикацию.",
    pinAlreadyScheduled: "Этот пин уже в расписании или опубликован. Проверьте календарь перед повторным планированием.",
    publicationNotFailed: "Действие доступно только для публикации со статусом «Ошибка».",
    boardNameRequired: "Название доски обязательно.",
    invalidScheduleTime: "Проверьте дату и время публикации — они не могут быть пустыми или в прошлом.",
    scheduleTooFar: "Публикацию нельзя запланировать более чем на год вперёд.",
    invalidTimezone: "Часовой пояс не распознан. Проверьте часовой пояс в профиле.",
    projectUrlRequired: "Укажите адрес сайта в настройках проекта перед публикацией.",
    projectUrlInvalid: "Ссылка сайта некорректна. Укажите полный адрес HTTP или HTTPS без логина и пароля.",
    pinImageMissing: "У пина нет сохранённого изображения. Сначала сгенерируйте или загрузите его.",
    boardSelectionRequired: "Выберите доску Pinterest перед планированием публикации.",
    imageUploadRequired: "Прикрепите файл изображения (PNG/JPG/WebP/GIF, до 5 МБ).",
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
    tariffRequired: "Tu plan no está activo ahora mismo. Elige un plan para volver a crear pines.",
    tariffInsufficient: "Esta sección no está incluida en tu plan actual. Mejora el plan para continuar.",
    pinterestUnavailable: "Pinterest no está disponible temporalmente. No se ha perdido nada: inténtalo de nuevo en un minuto.",
    pinterestRateLimited: "Pinterest está limitando la frecuencia de esta acción. Espera un momento e inténtalo de nuevo.",
    pinterestNotConnected: "Conecta primero tu cuenta de Pinterest y luego programa la publicación.",
    pinAlreadyScheduled: "Este pin ya está programado o publicado. Revisa el calendario antes de programarlo de nuevo.",
    publicationNotFailed: "Esta acción solo está disponible para una publicación con el estado «Error».",
    boardNameRequired: "El nombre del tablero es obligatorio.",
    invalidScheduleTime: "Comprueba la fecha y la hora de publicación: no pueden estar vacías ni en el pasado.",
    scheduleTooFar: "No se puede programar una publicación con más de un año de antelación.",
    invalidTimezone: "Esa zona horaria no se reconoce. Comprueba la zona horaria de tu perfil.",
    projectUrlRequired: "Añade la URL de tu sitio en los ajustes del proyecto antes de publicar.",
    projectUrlInvalid: "La URL del sitio no es válida. Usa una dirección HTTP o HTTPS completa, sin usuario ni contraseña.",
    pinImageMissing: "Este pin no tiene imagen guardada. Genera o sube una imagen primero.",
    boardSelectionRequired: "Elige un tablero de Pinterest antes de programar la publicación.",
    imageUploadRequired: "Adjunta un archivo de imagen (PNG/JPG/WebP/GIF, hasta 5 MB).",
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
    tariffRequired: "Seu plano não está ativo agora. Escolha um plano para voltar a criar pins.",
    tariffInsufficient: "Esta seção não está incluída no seu plano atual. Faça upgrade para continuar.",
    pinterestUnavailable: "O Pinterest está temporariamente indisponível. Nada foi perdido — tente novamente dentro de um minuto.",
    pinterestRateLimited: "O Pinterest está a limitar a frequência desta ação. Aguarde um momento e tente novamente.",
    pinterestNotConnected: "Ligue primeiro a sua conta do Pinterest e depois agende a publicação.",
    pinAlreadyScheduled: "Este pin já está agendado ou publicado. Verifique o calendário antes de o agendar novamente.",
    publicationNotFailed: "Esta ação só está disponível para uma publicação com o estado «Erro».",
    boardNameRequired: "O nome do quadro é obrigatório.",
    invalidScheduleTime: "Verifique a data e a hora de publicação: não podem estar vazias nem no passado.",
    scheduleTooFar: "Não é possível agendar uma publicação com mais de um ano de antecedência.",
    invalidTimezone: "Esse fuso horário não é reconhecido. Verifique o fuso horário no seu perfil.",
    projectUrlRequired: "Adicione o endereço do seu site nas definições do projeto antes de publicar.",
    projectUrlInvalid: "O endereço do site é inválido. Use um endereço HTTP ou HTTPS completo, sem utilizador nem palavra-passe.",
    pinImageMissing: "Este pin não tem imagem guardada. Gere ou carregue uma imagem primeiro.",
    boardSelectionRequired: "Escolha um quadro do Pinterest antes de agendar a publicação.",
    imageUploadRequired: "Anexe um ficheiro de imagem (PNG/JPG/WebP/GIF, até 5 MB).",
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
    tariffRequired: "Dein Tarif ist derzeit nicht aktiv. Wähle einen Tarif, um wieder Pins zu erstellen.",
    tariffInsufficient: "Dieser Bereich ist in deinem aktuellen Tarif nicht enthalten. Führe ein Upgrade durch.",
    pinterestUnavailable: "Pinterest ist vorübergehend nicht erreichbar. Es ist nichts verloren gegangen — versuchen Sie es in einer Minute erneut.",
    pinterestRateLimited: "Pinterest begrenzt, wie oft diese Aktion möglich ist. Warten Sie kurz und versuchen Sie es erneut.",
    pinterestNotConnected: "Verbinden Sie zuerst Ihr Pinterest-Konto und planen Sie dann die Veröffentlichung.",
    pinAlreadyScheduled: "Dieser Pin ist bereits geplant oder veröffentlicht. Prüfen Sie den Kalender, bevor Sie ihn erneut planen.",
    publicationNotFailed: "Diese Aktion ist nur für eine Veröffentlichung mit dem Status „Fehler“ verfügbar.",
    boardNameRequired: "Ein Board-Name ist erforderlich.",
    invalidScheduleTime: "Prüfen Sie Datum und Uhrzeit der Veröffentlichung — sie dürfen nicht leer oder in der Vergangenheit liegen.",
    scheduleTooFar: "Eine Veröffentlichung kann nicht mehr als ein Jahr im Voraus geplant werden.",
    invalidTimezone: "Diese Zeitzone ist unbekannt. Prüfen Sie die Zeitzone in Ihrem Profil.",
    projectUrlRequired: "Tragen Sie die Website-Adresse in den Projekteinstellungen ein, bevor Sie veröffentlichen.",
    projectUrlInvalid: "Die Website-Adresse ist ungültig. Verwenden Sie eine vollständige HTTP- oder HTTPS-Adresse ohne Benutzername und Passwort.",
    pinImageMissing: "Dieser Pin hat kein gespeichertes Bild. Erzeugen oder laden Sie zuerst ein Bild hoch.",
    boardSelectionRequired: "Wählen Sie ein Pinterest-Board, bevor Sie die Veröffentlichung planen.",
    imageUploadRequired: "Fügen Sie eine Bilddatei hinzu (PNG/JPG/WebP/GIF, bis 5 MB).",
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
    tariffRequired: "Votre offre n'est pas active pour le moment. Choisissez une offre pour créer à nouveau des épingles.",
    tariffInsufficient: "Cette section n'est pas incluse dans votre offre actuelle. Passez à une offre supérieure.",
    pinterestUnavailable: "Pinterest est temporairement indisponible. Rien n’est perdu — réessayez dans une minute.",
    pinterestRateLimited: "Pinterest limite la fréquence de cette action. Patientez un instant, puis réessayez.",
    pinterestNotConnected: "Connectez d’abord votre compte Pinterest, puis programmez la publication.",
    pinAlreadyScheduled: "Ce pin est déjà programmé ou publié. Vérifiez le calendrier avant de le programmer à nouveau.",
    publicationNotFailed: "Cette action n’est disponible que pour une publication au statut « Échec ».",
    boardNameRequired: "Le nom du tableau est obligatoire.",
    invalidScheduleTime: "Vérifiez la date et l’heure de publication — elles ne peuvent pas être vides ni passées.",
    scheduleTooFar: "Une publication ne peut pas être programmée plus d’un an à l’avance.",
    invalidTimezone: "Ce fuseau horaire n’est pas reconnu. Vérifiez le fuseau horaire de votre profil.",
    projectUrlRequired: "Ajoutez l’adresse de votre site dans les réglages du projet avant de publier.",
    projectUrlInvalid: "L’adresse du site est invalide. Utilisez une adresse HTTP ou HTTPS complète, sans identifiant ni mot de passe.",
    pinImageMissing: "Ce pin n’a pas d’image enregistrée. Générez ou importez d’abord une image.",
    boardSelectionRequired: "Choisissez un tableau Pinterest avant de programmer la publication.",
    imageUploadRequired: "Joignez un fichier image (PNG/JPG/WebP/GIF, jusqu’à 5 Mo).",
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
    tariffRequired: "您的套餐当前未生效。请选择套餐以继续创建 Pin。",
    tariffInsufficient: "当前套餐不包含此功能。请升级套餐后继续。",
    pinterestUnavailable: "Pinterest 暂时不可用，数据没有丢失，请稍后重试。",
    pinterestRateLimited: "Pinterest 限制了该操作的频率，请稍等片刻后重试。",
    pinterestNotConnected: "请先连接 Pinterest 账号，再安排发布。",
    pinAlreadyScheduled: "该 Pin 已在排期中或已发布，请先查看日历再重新安排。",
    publicationNotFailed: "该操作仅适用于状态为“失败”的发布记录。",
    boardNameRequired: "画板名称不能为空。",
    invalidScheduleTime: "请检查发布日期和时间，不能为空且不能早于现在。",
    scheduleTooFar: "发布排期不能超过一年之后。",
    invalidTimezone: "无法识别该时区，请检查个人资料中的时区设置。",
    projectUrlRequired: "发布前请在项目设置中填写网站地址。",
    projectUrlInvalid: "网站地址无效，请填写不含用户名和密码的完整 HTTP 或 HTTPS 地址。",
    pinImageMissing: "该 Pin 没有已保存的图片，请先生成或上传图片。",
    boardSelectionRequired: "在安排发布前请选择 Pinterest 画板。",
    imageUploadRequired: "请附加图片文件（PNG/JPG/WebP/GIF，最大 5 MB）。",
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

const VALIDATION_CODES: Record<string, AppErrorMessageKey> = {
  board_name_required: 'boardNameRequired',
  invalid_schedule_time: 'invalidScheduleTime',
  schedule_too_far: 'scheduleTooFar',
  invalid_timezone: 'invalidTimezone',
  project_url_required: 'projectUrlRequired',
  project_url_invalid: 'projectUrlInvalid',
  pin_image_missing: 'pinImageMissing',
  board_selection_required: 'boardSelectionRequired',
  image_upload_required: 'imageUploadRequired',
};

const CONFLICT_CODES: Record<string, AppErrorMessageKey> = {
  pinterest_not_connected: 'pinterestNotConnected',
  pin_already_scheduled: 'pinAlreadyScheduled',
  publication_not_failed: 'publicationNotFailed',
};

/**
 * 403 is the product's paywall. Both answers are customer-fixable — choose a plan, or choose
 * a different plan — so they get codes and a localized message; any other 403 (for example an
 * unverified email) keeps its own handling.
 */
const TARIFF_CODES: Record<string, AppErrorMessageKey> = {
  tariff_required: 'tariffRequired',
  tariff_insufficient: 'tariffInsufficient',
};

const TRANSIENT_CODES: Record<string, AppErrorMessageKey> = {
  pinterest_unavailable: 'pinterestUnavailable',
  pinterest_rate_limited: 'pinterestRateLimited',
};

export function getLocalizedApiError(code: unknown, status: unknown): string | null {
  if (typeof code !== 'string') return null;
  if (code === 'insufficient_credits' && Number(status) === 402) {
    return getAppErrorMessage('insufficientCredits');
  }
  if (Number(status) === 404 && Object.prototype.hasOwnProperty.call(NOT_FOUND_CODES, code)) {
    return getAppErrorMessage(NOT_FOUND_CODES[code]);
  }
  if (Number(status) === 422 && Object.prototype.hasOwnProperty.call(VALIDATION_CODES, code)) {
    return getAppErrorMessage(VALIDATION_CODES[code]);
  }
  if (Number(status) === 403 && Object.prototype.hasOwnProperty.call(TARIFF_CODES, code)) {
    return getAppErrorMessage(TARIFF_CODES[code]);
  }
  if (Number(status) === 409 && Object.prototype.hasOwnProperty.call(CONFLICT_CODES, code)) {
    return getAppErrorMessage(CONFLICT_CODES[code]);
  }
  // A provider-side failure is reported the same way whatever status the backend chose for
  // it (502 and 503 both mean "not our customer's fault, retry shortly").
  if ((Number(status) === 502 || Number(status) === 503) &&
      Object.prototype.hasOwnProperty.call(TRANSIENT_CODES, code)) {
    return getAppErrorMessage(TRANSIENT_CODES[code]);
  }
  return null;
}
