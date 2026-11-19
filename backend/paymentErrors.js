"use strict";

const { httpError } = require("./validate");

/**
 * Payment failures are the one class of error where the customer must understand the exact
 * situation: "nothing was sent", "the invoice exists but you have no link", or "the service is
 * down". All three were Russian-only, which meant a non-Russian customer reading an
 * incomprehensible error on the checkout screen - and the cheapest wrong reaction to
 * "we could not save your invoice link" is to start a second payment.
 *
 * The message stays Russian (logs, older clients and the owner's own reading), the code travels
 * beside it and the client turns it into the customer's language.
 */
function paymentError(status, message, code) {
  const error = httpError(status, message);
  error.details = { code };
  return error;
}

/** The provider could not be reached, or refused to confirm the invoice. */
function paymentProviderUnavailable(message = "Платёжный сервис не отвечает — попробуйте позже", status = 502) {
  return paymentError(status, message, "payment_provider_unavailable");
}

/** An invoice exists at the provider, but its link could not be stored for the customer. */
function paymentLinkNotSaved(message = "Счёт создан, но не удалось сохранить ссылку. Не создавайте новый платёж; обратитесь в поддержку.") {
  return paymentError(503, message, "payment_link_not_saved");
}

/** Nothing reached the provider, but the local order cannot be trusted. */
function paymentOrderPreparationFailed(message = "Не удалось безопасно подготовить заказ. Счёт провайдеру не отправлялся; статус заказа требует проверки.") {
  return paymentError(503, message, "payment_order_preparation_failed");
}

module.exports = {
  paymentError,
  paymentProviderUnavailable,
  paymentLinkNotSaved,
  paymentOrderPreparationFailed,
};
