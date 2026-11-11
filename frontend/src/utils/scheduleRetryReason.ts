const MESSAGES: Record<string, Record<string, string>> = {
  account_unavailable: {
    ru: 'Pinterest-аккаунт отключён или недоступен. Переподключите его, затем обновите расписание.',
    en: 'The Pinterest account is disconnected or unavailable. Reconnect it, then refresh the schedule.',
    es: 'La cuenta de Pinterest está desconectada o no disponible. Vuelve a conectarla y actualiza la programación.',
    pt: 'A conta do Pinterest está desconectada ou indisponível. Reconecte-a e atualize a programação.',
    de: 'Das Pinterest-Konto ist getrennt oder nicht verfügbar. Verbinde es erneut und aktualisiere den Zeitplan.',
    fr: 'Le compte Pinterest est déconnecté ou indisponible. Reconnectez-le, puis actualisez le calendrier.',
    zh: 'Pinterest 账号已断开连接或不可用。请重新连接，然后刷新日程。',
  },
  board_missing: {
    ru: 'В расписании не указана доска Pinterest. Выберите доску и создайте расписание заново.',
    en: 'No Pinterest board is selected. Choose a board and create the schedule again.',
    es: 'No hay un tablero de Pinterest seleccionado. Elige uno y crea la programación de nuevo.',
    pt: 'Nenhuma pasta do Pinterest foi selecionada. Escolha uma e crie o agendamento novamente.',
    de: 'Es ist kein Pinterest-Board ausgewählt. Wähle ein Board und erstelle den Zeitplan erneut.',
    fr: 'Aucun tableau Pinterest n’est sélectionné. Choisissez-en un et recréez la programmation.',
    zh: '未选择 Pinterest 画板。请选择画板并重新创建日程。',
  },
  pin_unavailable: {
    ru: 'Исходный пин или его изображение больше недоступны. Повтор заблокирован.',
    en: 'The source Pin or its image is no longer available. Retry is blocked.',
    es: 'El Pin original o su imagen ya no están disponibles. No se puede reintentar.',
    pt: 'O Pin original ou sua imagem não está mais disponível. Não é possível tentar novamente.',
    de: 'Der ursprüngliche Pin oder sein Bild ist nicht mehr verfügbar. Ein erneuter Versuch ist gesperrt.',
    fr: 'Le Pin d’origine ou son image n’est plus disponible. Une nouvelle tentative est bloquée.',
    zh: '原始 Pin 或其图片已不可用，无法重试。',
  },
  publication_exists: {
    ru: 'Публикация уже зарегистрирована. Повтор заблокирован, чтобы не создать дубликат.',
    en: 'A publication is already registered. Retry is blocked to prevent a duplicate.',
    es: 'Ya existe un registro de publicación. El reintento está bloqueado para evitar duplicados.',
    pt: 'Já existe um registro de publicação. A nova tentativa foi bloqueada para evitar duplicatas.',
    de: 'Eine Veröffentlichung ist bereits registriert. Ein erneuter Versuch ist zur Vermeidung von Duplikaten gesperrt.',
    fr: 'Une publication est déjà enregistrée. La nouvelle tentative est bloquée pour éviter un doublon.',
    zh: '该发布已登记。为避免重复内容，已禁止重试。',
  },
  attempt_identity_mismatch: {
    ru: 'Данные предыдущей попытки не совпадают с аккаунтом или доской. Нужна сверка; повтор заблокирован.',
    en: 'The previous attempt does not match this account or board. Reconciliation is required; retry is blocked.',
    es: 'El intento anterior no coincide con esta cuenta o tablero. Se requiere una verificación; el reintento está bloqueado.',
    pt: 'A tentativa anterior não corresponde a esta conta ou pasta. É necessária uma conferência; a repetição está bloqueada.',
    de: 'Der vorherige Versuch stimmt nicht mit diesem Konto oder Board überein. Eine Prüfung ist erforderlich; Wiederholung gesperrt.',
    fr: 'La tentative précédente ne correspond pas à ce compte ou tableau. Une vérification est nécessaire ; nouvel essai bloqué.',
    zh: '上一次尝试与此账号或画板不匹配。需要核对，已禁止重试。',
  },
  attempt_not_retryable: {
    ru: 'Pinterest мог уже принять публикацию. Безопасность повтора не подтверждена.',
    en: 'Pinterest may already have accepted the publication. A safe retry is not confirmed.',
    es: 'Es posible que Pinterest ya haya aceptado la publicación. No se ha confirmado que sea seguro reintentar.',
    pt: 'O Pinterest pode já ter aceitado a publicação. Não foi confirmado que seja seguro tentar novamente.',
    de: 'Pinterest hat den Beitrag möglicherweise bereits angenommen. Ein sicherer erneuter Versuch ist nicht bestätigt.',
    fr: 'Pinterest a peut-être déjà accepté la publication. La sécurité d’une nouvelle tentative n’est pas confirmée.',
    zh: 'Pinterest 可能已接收该发布，尚未确认重试是否安全。',
  },
  active_schedule_exists: {
    ru: 'Для этого пина уже есть активное расписание в аккаунте. Сначала проверьте существующую запись.',
    en: 'This Pin already has an active schedule for the account. Check the existing entry first.',
    es: 'Este Pin ya tiene una programación activa para la cuenta. Comprueba primero esa entrada.',
    pt: 'Este Pin já tem um agendamento ativo para a conta. Verifique primeiro o registro existente.',
    de: 'Für diesen Pin besteht bereits ein aktiver Zeitplan für das Konto. Prüfe zuerst den vorhandenen Eintrag.',
    fr: 'Ce Pin possède déjà une programmation active pour ce compte. Vérifiez d’abord l’entrée existante.',
    zh: '此账号下该 Pin 已有有效日程，请先检查现有记录。',
  },
  metadata_unavailable: {
    ru: 'Не удалось проверить журнал публикаций. Обновите расписание позже; повтор пока заблокирован.',
    en: 'The publication journal could not be checked. Refresh the schedule later; retry is blocked for now.',
    es: 'No se pudo comprobar el registro de publicaciones. Actualiza la programación más tarde; el reintento está bloqueado.',
    pt: 'Não foi possível verificar o histórico de publicações. Atualize a programação mais tarde; a repetição está bloqueada.',
    de: 'Das Veröffentlichungsprotokoll konnte nicht geprüft werden. Aktualisiere den Zeitplan später; Wiederholung vorerst gesperrt.',
    fr: 'Le journal des publications n’a pas pu être vérifié. Actualisez plus tard ; nouvel essai temporairement bloqué.',
    zh: '无法检查发布记录。请稍后刷新日程，目前已禁止重试。',
  },
  not_failed: {
    ru: 'Статус публикации уже изменился. Обновите расписание.',
    en: 'The publication status has changed. Refresh the schedule.',
    es: 'El estado de la publicación ha cambiado. Actualiza la programación.',
    pt: 'O status da publicação foi alterado. Atualize a programação.',
    de: 'Der Veröffentlichungsstatus hat sich geändert. Aktualisiere den Zeitplan.',
    fr: 'Le statut de la publication a changé. Actualisez le calendrier.',
    zh: '发布状态已更改。请刷新日程。',
  },
};

const FALLBACK: Record<string, string> = {
  ru: 'Безопасный повтор не подтверждён сервером. Обновите расписание или обратитесь в поддержку.',
  en: 'The server could not confirm that retrying is safe. Refresh the schedule or contact support.',
  es: 'El servidor no pudo confirmar que sea seguro reintentar. Actualiza la programación o contacta con soporte.',
  pt: 'O servidor não confirmou que é seguro tentar novamente. Atualize a programação ou contate o suporte.',
  de: 'Der Server konnte einen sicheren erneuten Versuch nicht bestätigen. Aktualisiere den Zeitplan oder kontaktiere den Support.',
  fr: 'Le serveur n’a pas pu confirmer qu’une nouvelle tentative est sûre. Actualisez le calendrier ou contactez l’assistance.',
  zh: '服务器无法确认重试是否安全。请刷新日程或联系支持。',
};

export function getScheduleRetryReasonMessage(reason: unknown, language: string): string {
  if (typeof reason !== 'string' || !reason.trim()) return FALLBACK[language] || FALLBACK.en;
  const messages = MESSAGES[reason];
  return messages?.[language] || messages?.en || FALLBACK[language] || FALLBACK.en;
}
