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
  | 'generationOutcomeUnknown'
  | 'generationCostUnconfirmed'
  | 'generationNotCharged'
  | 'generationSaveFailed'
  | 'aiOutputInvalid'
  | 'loginLockoutMigrationMissing'
  | 'loginLockoutUnavailable'
  | 'emailRequeueMigrationMissing'
  | 'paymentProviderUnavailable'
  | 'paymentLinkNotSaved'
  | 'paymentOrderPreparationFailed'
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
  | 'websiteUnreachable'
  | 'accountDeletionUnavailable'
  | 'publicationReconciliationRequired'
  | 'pinterestReconnectRequired'
  | 'pinterestPublicationRejected'
  | 'pinterestRefreshInProgress'
  | 'paymentsNotConfigured'
  | 'paymentNotStarted'
  | 'imageAlreadyStored'
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
    generationOutcomeUnknown: "The previous generation has not been confirmed yet, so we did not start another one. Check the review queue in a minute, and try again if nothing appears.",
    generationCostUnconfirmed: "The generation could not be completed and no pins were created. Try again in a few minutes.",
    generationNotCharged: "Nothing was charged for this generation: the reserved credits are back in your balance. Try again — the second attempt starts from scratch.",
    generationSaveFailed: "The images were generated, but saving them failed. Your credits for this run are still reserved and a new run would generate — and charge — again, so write to support before retrying.",
    aiOutputInvalid: "The model answered with something we could not use, so this attempt was stopped. Nothing was charged for it — try again.",
    loginLockoutMigrationMissing: "The login lockout is not available: migration 164 has not been applied in this environment. Until it is, nobody is locked out after repeated failed sign-ins.",
    loginLockoutUnavailable: "The login lockout service did not answer, so the lock state could not be read or cleared. Try again in a minute.",
    emailRequeueMigrationMissing: "Email requeue is not available: migration 165 has not been applied in this environment. Until it is, a dead transactional email cannot be put back in the queue.",
    paymentProviderUnavailable: "The payment service is not responding right now. Nothing has been charged - try again in a few minutes.",
    paymentLinkNotSaved: "Your invoice was created but we could not save its link. Do not start another payment - contact support and we will find your invoice by email.",
    paymentOrderPreparationFailed: "We could not prepare your order safely, and nothing was sent to the payment provider. Try again in a few minutes.",
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
    websiteUnreachable: "The site could not be read: it is unreachable or blocks automated checks. Open the address in a browser — if it opens there, the site is refusing automated access.",
    accountDeletionUnavailable: "Account deletion is not available in this installation yet. Your data has not been touched — write to support and the request will be handled manually.",
    publicationReconciliationRequired: "We could not confirm whether this pin reached Pinterest. Do not publish it again — a repeat could create a duplicate. We are checking the result and will update the calendar.",
    pinterestReconnectRequired: "The Pinterest connection could not be saved. Connect Pinterest again — until then publishing is not possible.",
    paymentsNotConfigured: "Payments are temporarily unavailable in this installation. Nothing was charged — try again later or write to support.",
    paymentNotStarted: "The payment could not be created and nothing was charged. Try again in a minute, or write to support if it repeats.",
    imageAlreadyStored: "The image is already saved — you do not need to upload it again. The link to it is temporarily unavailable; try again in a minute.",
    pinterestPublicationRejected: "Pinterest refused this pin (board, image or text). Change the pin and try again — repeating it unchanged is refused for the same reason.",
    pinterestRefreshInProgress: "Pinterest access is being refreshed right now. Try again in a few seconds — nothing was lost.",
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
    generationOutcomeUnknown: "Результат предыдущей генерации ещё не подтверждён, поэтому новая не запущена. Проверьте очередь проверки через минуту — если ничего не появилось, попробуйте снова.",
    generationCostUnconfirmed: "Генерация не завершилась, пины не созданы. Повторите попытку через несколько минут.",
    generationNotCharged: "За эту генерацию ничего не списано: зарезервированные кредиты вернулись на баланс. Попробуйте снова — вторая попытка начинается с нуля.",
    generationSaveFailed: "Изображения сгенерированы, но сохранить их не удалось. Кредиты за этот запуск всё ещё зарезервированы, а новый запуск сгенерирует и спишет их заново — напишите в поддержку, прежде чем повторять.",
    aiOutputInvalid: "Нейросеть ответила так, что использовать это нельзя, поэтому попытка остановлена. За неё ничего не списано — попробуйте снова.",
    loginLockoutMigrationMissing: "Замок входа недоступен: миграция 164 не применена в этом окружении. Пока её нет, блокировка после неудачных попыток входа не работает.",
    loginLockoutUnavailable: "Сервис замка входа не ответил, поэтому состояние блокировки не удалось ни прочитать, ни снять. Повторите через минуту.",
    emailRequeueMigrationMissing: "Переотправка писем недоступна: миграция 165 не применена в этом окружении. Пока её нет, потерянное письмо нельзя вернуть в очередь.",
    paymentProviderUnavailable: "Платёжный сервис сейчас не отвечает. Деньги не списаны — повторите попытку через несколько минут.",
    paymentLinkNotSaved: "Счёт создан, но ссылку на него сохранить не удалось. Не создавайте новый платёж — напишите в поддержку, мы найдём счёт по email.",
    paymentOrderPreparationFailed: "Не удалось безопасно подготовить заказ, провайдеру ничего не отправлялось. Повторите попытку через несколько минут.",
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
    websiteUnreachable: "Не удалось прочитать сайт: он недоступен или закрыт от автоматической проверки. Откройте адрес в браузере — если он открывается, значит сайт блокирует автоматический доступ.",
    accountDeletionUnavailable: "Удаление аккаунта в этой установке пока не включено. Ваши данные не тронуты — напишите в поддержку, и запрос выполнят вручную.",
    publicationReconciliationRequired: "Не удалось подтвердить, дошёл ли пин до Pinterest. Не публикуйте его повторно — повтор может создать дубликат. Мы сверяем результат и обновим календарь.",
    pinterestReconnectRequired: "Не удалось сохранить подключение Pinterest. Подключите Pinterest заново — до этого публикация невозможна.",
    paymentsNotConfigured: "Оплата в этой установке временно недоступна. Деньги не списаны — попробуйте позже или напишите в поддержку.",
    paymentNotStarted: "Платёж не создан, деньги не списаны. Повторите через минуту или напишите в поддержку, если это повторится.",
    imageAlreadyStored: "Изображение уже сохранено — загружать его повторно не нужно. Ссылка на него временно недоступна; повторите через минуту.",
    pinterestPublicationRejected: "Pinterest отклонил этот пин (доска, изображение или текст). Исправьте пин и повторите — тот же пин отклонят снова.",
    pinterestRefreshInProgress: "Доступ к Pinterest сейчас обновляется. Повторите через несколько секунд — ничего не потеряно.",
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
    generationOutcomeUnknown: "La generación anterior aún no está confirmada, así que no iniciamos otra. Revisa la cola de revisión en un minuto y vuelve a intentarlo si no aparece nada.",
    generationCostUnconfirmed: "La generación no pudo completarse y no se creó ningún pin. Inténtalo de nuevo en unos minutos.",
    generationNotCharged: "No se ha cobrado nada por esta generación: los créditos reservados han vuelto a tu saldo. Inténtalo de nuevo; el segundo intento empieza desde cero.",
    generationSaveFailed: "Las imágenes se generaron, pero no se pudieron guardar. Tus créditos de esta ejecución siguen reservados y una nueva ejecución volvería a generar y a cobrar, así que escribe al soporte antes de reintentar.",
    aiOutputInvalid: "El modelo respondió con algo que no podemos usar, así que esta tentativa se detuvo. No se ha cobrado nada por ella; inténtalo de nuevo.",
    loginLockoutMigrationMissing: "El bloqueo de acceso no está disponible: la migración 164 no se ha aplicado en este entorno. Mientras falte, nadie queda bloqueado tras varios intentos fallidos.",
    loginLockoutUnavailable: "El servicio de bloqueo de acceso no respondió, así que no se pudo leer ni borrar el estado del bloqueo. Inténtalo de nuevo en un minuto.",
    emailRequeueMigrationMissing: "La reencolación de correos no está disponible: la migración 165 no se ha aplicado en este entorno. Mientras falte, un correo perdido no puede volver a la cola.",
    paymentProviderUnavailable: "El servicio de pago no responde en este momento. No se ha cobrado nada: inténtalo de nuevo en unos minutos.",
    paymentLinkNotSaved: "La factura se creó, pero no pudimos guardar su enlace. No inicies otro pago: escribe al soporte y la encontraremos por tu email.",
    paymentOrderPreparationFailed: "No pudimos preparar tu pedido de forma segura y no se envió nada al proveedor de pago. Inténtalo de nuevo en unos minutos.",
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
    websiteUnreachable: "No se pudo leer el sitio: no está disponible o bloquea las comprobaciones automáticas. Abre la dirección en el navegador; si allí se abre, el sitio está bloqueando el acceso automático.",
    accountDeletionUnavailable: "La eliminación de la cuenta aún no está disponible en esta instalación. Tus datos no se han tocado: escribe a soporte y la solicitud se tramitará manualmente.",
    publicationReconciliationRequired: "No se pudo confirmar si el pin llegó a Pinterest. No lo publiques otra vez: una repetición puede crear un duplicado. Estamos verificando el resultado y actualizaremos el calendario.",
    pinterestReconnectRequired: "No se pudo guardar la conexión con Pinterest. Vuelve a conectar Pinterest; hasta entonces no se puede publicar.",
    paymentsNotConfigured: "Los pagos no están disponibles temporalmente en esta instalación. No se ha cobrado nada; inténtalo más tarde o escribe a soporte.",
    paymentNotStarted: "No se pudo crear el pago y no se ha cobrado nada. Inténtalo de nuevo en un minuto o escribe a soporte si se repite.",
    imageAlreadyStored: "La imagen ya está guardada: no hace falta subirla otra vez. El enlace no está disponible temporalmente; inténtalo de nuevo en un minuto.",
    pinterestPublicationRejected: "Pinterest rechazó este pin (tablero, imagen o texto). Corrige el pin y vuelve a intentarlo; sin cambios lo rechazará otra vez.",
    pinterestRefreshInProgress: "El acceso a Pinterest se está actualizando ahora. Inténtalo de nuevo en unos segundos; no se ha perdido nada.",
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
    generationOutcomeUnknown: "A geração anterior ainda não foi confirmada, então não iniciamos outra. Verifique a fila de revisão em um minuto e tente novamente se nada aparecer.",
    generationCostUnconfirmed: "A geração não foi concluída e nenhum pin foi criado. Tente novamente em alguns minutos.",
    generationNotCharged: "Nada foi cobrado por esta geração: os créditos reservados voltaram ao seu saldo. Tente novamente — a segunda tentativa começa do zero.",
    generationSaveFailed: "As imagens foram geradas, mas não foi possível salvá-las. Os seus créditos desta execução continuam reservados e uma nova execução voltaria a gerar e a cobrar — escreva ao suporte antes de tentar novamente.",
    aiOutputInvalid: "O modelo respondeu algo que não podemos usar, por isso esta tentativa foi interrompida. Nada foi cobrado por ela — tente novamente.",
    loginLockoutMigrationMissing: "O bloqueio de acesso não está disponível: a migração 164 não foi aplicada neste ambiente. Enquanto faltar, ninguém é bloqueado após tentativas falhadas.",
    loginLockoutUnavailable: "O serviço de bloqueio de acesso não respondeu, por isso não foi possível ler nem limpar o estado do bloqueio. Tente novamente num minuto.",
    emailRequeueMigrationMissing: "O reenfileiramento de e-mails não está disponível: a migração 165 não foi aplicada neste ambiente. Enquanto faltar, um e-mail perdido não pode voltar à fila.",
    paymentProviderUnavailable: "O serviço de pagamento não está respondendo agora. Nada foi cobrado — tente novamente em alguns minutos.",
    paymentLinkNotSaved: "A fatura foi criada, mas não conseguimos salvar o link dela. Não inicie outro pagamento — fale com o suporte e a encontraremos pelo seu email.",
    paymentOrderPreparationFailed: "Não conseguimos preparar seu pedido com segurança e nada foi enviado ao provedor de pagamento. Tente novamente em alguns minutos.",
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
    websiteUnreachable: "Não foi possível ler o site: está indisponível ou bloqueia verificações automáticas. Abra o endereço no navegador — se abrir aí, o site está a bloquear o acesso automático.",
    accountDeletionUnavailable: "A eliminação da conta ainda não está disponível nesta instalação. Os seus dados não foram tocados — escreva para o suporte e o pedido será tratado manualmente.",
    publicationReconciliationRequired: "Não foi possível confirmar se o pin chegou ao Pinterest. Não o publique novamente — repetir pode criar um duplicado. Estamos a verificar o resultado e atualizaremos o calendário.",
    pinterestReconnectRequired: "Não foi possível guardar a ligação ao Pinterest. Ligue o Pinterest novamente — até lá não é possível publicar.",
    paymentsNotConfigured: "Os pagamentos estão temporariamente indisponíveis nesta instalação. Nada foi cobrado — tente mais tarde ou escreva para o suporte.",
    paymentNotStarted: "O pagamento não foi criado e nada foi cobrado. Tente novamente dentro de um minuto ou escreva para o suporte se repetir.",
    imageAlreadyStored: "A imagem já está guardada — não é necessário carregá-la novamente. A ligação está temporariamente indisponível; tente novamente dentro de um minuto.",
    pinterestPublicationRejected: "O Pinterest recusou este pin (painel, imagem ou texto). Corrija o pin e tente de novo — sem alterações será recusado outra vez.",
    pinterestRefreshInProgress: "O acesso ao Pinterest está a ser atualizado agora. Tente novamente dentro de alguns segundos — nada foi perdido.",
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
    generationOutcomeUnknown: "Die vorherige Generierung ist noch nicht bestätigt, deshalb haben wir keine neue gestartet. Prüfe die Prüf-Warteschlange in einer Minute und versuche es erneut, wenn nichts erscheint.",
    generationCostUnconfirmed: "Die Generierung konnte nicht abgeschlossen werden und es wurden keine Pins erstellt. Versuche es in ein paar Minuten erneut.",
    generationNotCharged: "Für diese Generierung wurde nichts belastet: Die reservierten Credits sind wieder auf Ihrem Guthaben. Versuchen Sie es erneut — der zweite Versuch beginnt von vorn.",
    generationSaveFailed: "Die Bilder wurden erzeugt, konnten aber nicht gespeichert werden. Ihre Credits für diesen Lauf sind weiterhin reserviert, und ein neuer Lauf würde erneut erzeugen und belasten — schreiben Sie dem Support, bevor Sie es erneut versuchen.",
    aiOutputInvalid: "Das Modell hat etwas geantwortet, das wir nicht verwenden können; dieser Versuch wurde beendet. Es wurde nichts dafür belastet — versuchen Sie es erneut.",
    loginLockoutMigrationMissing: "Die Login-Sperre ist nicht verfügbar: Migration 164 wurde in dieser Umgebung nicht eingespielt. Solange sie fehlt, wird nach fehlgeschlagenen Anmeldungen niemand gesperrt.",
    loginLockoutUnavailable: "Der Dienst der Login-Sperre antwortete nicht, daher konnte der Sperrzustand weder gelesen noch aufgehoben werden. Versuchen Sie es in einer Minute erneut.",
    emailRequeueMigrationMissing: "Das erneute Einreihen von E-Mails ist nicht verfügbar: Migration 165 wurde in dieser Umgebung nicht eingespielt. Solange sie fehlt, kann eine verlorene E-Mail nicht zurück in die Warteschlange.",
    paymentProviderUnavailable: "Der Zahlungsdienst antwortet gerade nicht. Es wurde nichts belastet - versuche es in ein paar Minuten erneut.",
    paymentLinkNotSaved: "Die Rechnung wurde erstellt, aber wir konnten ihren Link nicht speichern. Starte keine zweite Zahlung - schreibe dem Support, wir finden sie über deine E-Mail.",
    paymentOrderPreparationFailed: "Wir konnten deine Bestellung nicht sicher vorbereiten, an den Zahlungsanbieter wurde nichts gesendet. Versuche es in ein paar Minuten erneut.",
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
    websiteUnreachable: "Die Website konnte nicht gelesen werden: Sie ist nicht erreichbar oder blockiert automatische Prüfungen. Öffnen Sie die Adresse im Browser — öffnet sie sich dort, blockiert die Website den automatischen Zugriff.",
    accountDeletionUnavailable: "Die Kontolöschung ist in dieser Installation noch nicht verfügbar. Ihre Daten wurden nicht angetastet — schreiben Sie dem Support, dann wird die Anfrage manuell bearbeitet.",
    publicationReconciliationRequired: "Ob der Pin Pinterest erreicht hat, konnte nicht bestätigt werden. Veröffentlichen Sie ihn nicht erneut — eine Wiederholung kann ein Duplikat erzeugen. Wir prüfen das Ergebnis und aktualisieren den Kalender.",
    pinterestReconnectRequired: "Die Pinterest-Verbindung konnte nicht gespeichert werden. Verbinden Sie Pinterest erneut — bis dahin ist keine Veröffentlichung möglich.",
    paymentsNotConfigured: "Zahlungen sind in dieser Installation vorübergehend nicht verfügbar. Es wurde nichts belastet — versuchen Sie es später erneut oder schreiben Sie dem Support.",
    paymentNotStarted: "Die Zahlung konnte nicht erstellt werden, es wurde nichts belastet. Versuchen Sie es in einer Minute erneut oder schreiben Sie dem Support, wenn es sich wiederholt.",
    imageAlreadyStored: "Das Bild ist bereits gespeichert — Sie müssen es nicht erneut hochladen. Der Link ist vorübergehend nicht verfügbar; versuchen Sie es in einer Minute erneut.",
    pinterestPublicationRejected: "Pinterest hat diesen Pin abgelehnt (Board, Bild oder Text). Korrigieren Sie den Pin und versuchen Sie es erneut — unverändert wird er wieder abgelehnt.",
    pinterestRefreshInProgress: "Der Pinterest-Zugang wird gerade erneuert. Versuchen Sie es in einigen Sekunden erneut — es ist nichts verloren.",
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
    generationOutcomeUnknown: "La génération précédente n'est pas encore confirmée, nous n'en avons donc pas lancé une autre. Vérifiez la file de relecture dans une minute et réessayez si rien n'apparaît.",
    generationCostUnconfirmed: "La génération n'a pas pu être terminée et aucune épingle n'a été créée. Réessayez dans quelques minutes.",
    generationNotCharged: "Rien n’a été débité pour cette génération : les crédits réservés sont revenus sur votre solde. Réessayez — la seconde tentative repart de zéro.",
    generationSaveFailed: "Les images ont été générées, mais leur enregistrement a échoué. Vos crédits pour cette exécution restent réservés et une nouvelle exécution régénérerait — et facturerait — de nouveau : écrivez au support avant de réessayer.",
    aiOutputInvalid: "Le modèle a répondu quelque chose que nous ne pouvons pas utiliser : cette tentative a été arrêtée. Rien n’a été débité pour elle — réessayez.",
    loginLockoutMigrationMissing: "Le verrouillage de connexion n’est pas disponible : la migration 164 n’a pas été appliquée dans cet environnement. Tant qu’elle manque, personne n’est bloqué après plusieurs échecs.",
    loginLockoutUnavailable: "Le service de verrouillage de connexion n’a pas répondu : l’état du verrouillage n’a pu être ni lu ni levé. Réessayez dans une minute.",
    emailRequeueMigrationMissing: "La remise en file des e-mails n’est pas disponible : la migration 165 n’a pas été appliquée dans cet environnement. Tant qu’elle manque, un e-mail perdu ne peut pas revenir dans la file.",
    paymentProviderUnavailable: "Le service de paiement ne répond pas pour le moment. Rien n'a été débité : réessayez dans quelques minutes.",
    paymentLinkNotSaved: "La facture a été créée, mais nous n'avons pas pu enregistrer son lien. Ne lancez pas un autre paiement : écrivez au support et nous la retrouverons grâce à votre email.",
    paymentOrderPreparationFailed: "Nous n'avons pas pu préparer votre commande en toute sécurité et rien n'a été envoyé au prestataire de paiement. Réessayez dans quelques minutes.",
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
    websiteUnreachable: "Impossible de lire le site : il est injoignable ou bloque les vérifications automatiques. Ouvrez l’adresse dans un navigateur — si elle s’ouvre, le site bloque l’accès automatique.",
    accountDeletionUnavailable: "La suppression de compte n’est pas encore disponible dans cette installation. Vos données n’ont pas été touchées — écrivez au support, la demande sera traitée manuellement.",
    publicationReconciliationRequired: "Impossible de confirmer si l’épingle a atteint Pinterest. Ne la republiez pas — une répétition peut créer un doublon. Nous vérifions le résultat et mettrons le calendrier à jour.",
    pinterestReconnectRequired: "La connexion Pinterest n’a pas pu être enregistrée. Reconnectez Pinterest — d’ici là aucune publication n’est possible.",
    paymentsNotConfigured: "Les paiements sont temporairement indisponibles dans cette installation. Rien n’a été débité — réessayez plus tard ou écrivez au support.",
    paymentNotStarted: "Le paiement n’a pas pu être créé et rien n’a été débité. Réessayez dans une minute ou écrivez au support si cela se répète.",
    imageAlreadyStored: "L’image est déjà enregistrée — inutile de la téléverser à nouveau. Le lien est temporairement indisponible ; réessayez dans une minute.",
    pinterestPublicationRejected: "Pinterest a refusé cette épingle (tableau, image ou texte). Corrigez-la et réessayez — sans changement elle sera refusée de nouveau.",
    pinterestRefreshInProgress: "L’accès Pinterest est en cours d’actualisation. Réessayez dans quelques secondes — rien n’est perdu.",
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
    generationOutcomeUnknown: "上一次生成尚未确认，因此我们没有启动新的生成。请稍后查看待审核列表，如果没有结果再重试。",
    generationCostUnconfirmed: "生成未能完成，没有创建任何 Pin。请几分钟后重试。",
    generationNotCharged: "本次生成没有扣费：预留的积分已退回余额。请重试，第二次将从头开始。",
    generationSaveFailed: "图片已生成，但保存失败。本次运行的积分仍处于预留状态，重新运行会再次生成并再次扣费——请先联系客服再重试。",
    aiOutputInvalid: "模型返回了无法使用的内容，本次尝试已停止，没有扣费。请重试。",
    loginLockoutMigrationMissing: "登录锁定不可用：此环境尚未应用迁移 164。在迁移之前，多次登录失败不会被锁定。",
    loginLockoutUnavailable: "登录锁定服务没有响应，因此无法读取或解除锁定状态。请在一分钟后重试。",
    emailRequeueMigrationMissing: "邮件重新入队不可用：此环境尚未应用迁移 165。在迁移之前，丢失的邮件无法回到队列。",
    paymentProviderUnavailable: "支付服务暂时无法响应，尚未扣款。请几分钟后重试。",
    paymentLinkNotSaved: "账单已创建，但我们无法保存其链接。请不要再次发起支付，请联系客服，我们会通过邮箱找到这笔账单。",
    paymentOrderPreparationFailed: "我们无法安全地准备您的订单，也没有向支付服务商发送任何内容。请几分钟后重试。",
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
    websiteUnreachable: "无法读取该网站：网站不可访问，或阻止自动检查。请在浏览器中打开该地址——如果浏览器能打开，说明网站阻止了自动访问。",
    accountDeletionUnavailable: "此安装尚未启用账户删除。您的数据未被改动——请联系支持，请求将人工处理。",
    publicationReconciliationRequired: "无法确认该 Pin 是否已到达 Pinterest。请勿再次发布——重复发布可能产生重复内容。我们正在核对结果，并会更新日历。",
    pinterestReconnectRequired: "无法保存 Pinterest 连接。请重新连接 Pinterest，在此之前无法发布。",
    paymentsNotConfigured: "此安装的支付功能暂时不可用。未扣款——请稍后重试或联系支持。",
    paymentNotStarted: "无法创建支付，未扣款。请一分钟后重试，若再次出现请联系支持。",
    imageAlreadyStored: "图片已保存，无需重新上传。链接暂时不可用，请一分钟后重试。",
    pinterestPublicationRejected: "Pinterest 拒绝了这个 Pin（画板、图片或文字）。请修正后重试，原样重复仍会被拒绝。",
    pinterestRefreshInProgress: "Pinterest 访问权限正在刷新。请几秒后重试，数据没有丢失。",
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
  website_unreachable: 'websiteUnreachable',
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
/**
 * Payment failures are the class where the customer must understand the exact situation:
 * nothing was sent, an invoice exists without a link, or the service is down. The cheapest wrong
 * reaction to "we could not save your invoice link" is starting a second payment.
 */
/**
 * 409 is used both for "still running" (which the polling layer waits out) and for "the
 * previous outcome is unconfirmed, so a new run is blocked". The second is a real answer the
 * customer must understand, not something to retry blindly.
 */
const GENERATION_CODES: Record<string, AppErrorMessageKey> = {
  generation_outcome_unknown: 'generationOutcomeUnknown',
  regeneration_outcome_unknown: 'generationOutcomeUnknown',
};

const PAYMENT_CODES: Record<string, AppErrorMessageKey> = {
  payment_provider_unavailable: 'paymentProviderUnavailable',
  payment_link_not_saved: 'paymentLinkNotSaved',
  payment_order_preparation_failed: 'paymentOrderPreparationFailed',
  payments_not_configured: 'paymentsNotConfigured',
};

/**
 * The one payment code that answers 500: the invoice was never created. It names a fact about the
 * money, so the customer must read it whatever status class carries it - and the rest of the payment
 * codes keep their 502/503 rule, because a 500 there would be our own bug rather than a payment state.
 */
const PAYMENT_NOT_STARTED_CODES: Record<string, AppErrorMessageKey> = {
  payment_not_started: 'paymentNotStarted',
};

const TARIFF_CODES: Record<string, AppErrorMessageKey> = {
  tariff_required: 'tariffRequired',
  tariff_insufficient: 'tariffInsufficient',
};

const TRANSIENT_CODES: Record<string, AppErrorMessageKey> = {
  account_deletion_unavailable: 'accountDeletionUnavailable',
  image_already_stored: 'imageAlreadyStored',
  publication_reconciliation_required: 'publicationReconciliationRequired',
  pinterest_reconnect_required: 'pinterestReconnectRequired',
  pinterest_publication_rejected: 'pinterestPublicationRejected',
  pinterest_refresh_in_progress: 'pinterestRefreshInProgress',
  gptunnel_text_cost_missing: 'generationCostUnconfirmed',
  pinterest_unavailable: 'pinterestUnavailable',
  pinterest_rate_limited: 'pinterestRateLimited',
};

export function getLocalizedApiError(code: unknown, status: unknown): string | null {
  if (typeof code !== 'string') return null;
  if (code === 'insufficient_credits' && Number(status) === 402) {
    return getAppErrorMessage('insufficientCredits');
  }
  // "Nothing was charged" is true on any failure status the generation route can choose - 402, 422,
  // 500, 502 - so this one is not gated by the status class, only by being a failure.
  // Operator refusals that carry an instruction, not just "try later" (section 120).
  if ([500, 502, 503].includes(Number(status))) {
    if (code === 'login_lockout_migration_missing') return getAppErrorMessage('loginLockoutMigrationMissing');
    if (code === 'login_lockout_unavailable') return getAppErrorMessage('loginLockoutUnavailable');
    if (code === 'email_requeue_migration_missing') return getAppErrorMessage('emailRequeueMigrationMissing');
  }
  // The model gave unusable output: no image was requested for it, so nothing was charged (section 119).
  if (code === 'ai_output_invalid' && [502, 503].includes(Number(status))) {
    return getAppErrorMessage('aiOutputInvalid');
  }
  // The images exist but could not be saved: the reservation is held, a blind retry charges again.
  if (code === 'generation_save_failed' && [500, 502, 503].includes(Number(status))) {
    return getAppErrorMessage('generationSaveFailed');
  }
  if (code === 'generation_not_charged' && [402, 422, 500, 502, 503].includes(Number(status))) {
    return getAppErrorMessage('generationNotCharged');
  }
  if (Number(status) === 404 && Object.prototype.hasOwnProperty.call(NOT_FOUND_CODES, code)) {
    return getAppErrorMessage(NOT_FOUND_CODES[code]);
  }
  if (Number(status) === 422 && Object.prototype.hasOwnProperty.call(VALIDATION_CODES, code)) {
    return getAppErrorMessage(VALIDATION_CODES[code]);
  }
  // An unconfirmed outcome is the same fact whether the route fenced it with a 409 (a repeat was
  // refused) or reported it with a 500/502 (the run failed after the provider was asked). Section 116:
  // the credits stay reserved in that case, so the customer must not read "nothing was charged".
  if ([409, 500, 502, 503].includes(Number(status)) &&
      Object.prototype.hasOwnProperty.call(GENERATION_CODES, code)) {
    return getAppErrorMessage(GENERATION_CODES[code]);
  }
  if ((Number(status) === 502 || Number(status) === 503) &&
      Object.prototype.hasOwnProperty.call(PAYMENT_CODES, code)) {
    return getAppErrorMessage(PAYMENT_CODES[code]);
  }
  // "Nothing was charged" is the same fact whatever integer carries it: our own failure to create
  // the invoice (500) and a provider that answered with an unusable link (502) both mean it.
  if ([500, 502, 503].includes(Number(status)) &&
      Object.prototype.hasOwnProperty.call(PAYMENT_NOT_STARTED_CODES, code)) {
    return getAppErrorMessage(PAYMENT_NOT_STARTED_CODES[code]);
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
