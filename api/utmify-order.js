const UTMIFY_ENDPOINT = "https://api.utmify.com.br/api-credentials/orders";

function toUtcSqlString(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes()) +
    ":" +
    pad(date.getUTCSeconds())
  );
}

function toCents(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") {
    return Math.round(value >= 1000 ? value : value * 100);
  }

  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return fallback;
  return Math.round(parsed >= 1000 ? parsed : parsed * 100);
}

function pick(obj, keys, defaultValue = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
      return obj[key];
    }
  }
  return defaultValue;
}

function mapStatus(input) {
  const value = String(input || "").toLowerCase();

  if (["paid", "approved", "aprovado", "aprovada", "completed", "success"].includes(value)) {
    return "paid";
  }
  if (["waiting_payment", "pending", "waiting", "aguardando", "pix_generated"].includes(value)) {
    return "waiting_payment";
  }
  if (["refunded", "refund", "reembolsado", "reembolsada"].includes(value)) {
    return "refunded";
  }
  if (["chargedback", "chargeback"].includes(value)) {
    return "chargedback";
  }
  if (["refused", "failed", "cancelled", "canceled", "recusado"].includes(value)) {
    return "refused";
  }

  return "waiting_payment";
}

function mapPaymentMethod(input) {
  const value = String(input || "").toLowerCase();

  if (["pix"].includes(value)) return "pix";
  if (["credit_card", "card", "cartao", "cartao_credito", "credito"].includes(value)) return "credit_card";
  if (["boleto"].includes(value)) return "boleto";
  if (["paypal"].includes(value)) return "paypal";
  if (["free_price", "free"].includes(value)) return "free_price";

  return "pix";
}

function normalizePayload(input) {
  const body = input || {};
  const customerSource = body.customer || body.buyer || body.client || {};
  const trackingSource = body.trackingParameters || body.tracking || body.utm || {};
  const productList = Array.isArray(body.products)
    ? body.products
    : body.product
      ? [body.product]
      : [
          {
            id: pick(body, ["productId", "produtoId"], "kit-seguranca"),
            name: pick(body, ["productName", "produto", "offerName"], "Kit de Seguranca"),
            planId: null,
            planName: null,
            quantity: Number(pick(body, ["quantity", "qty"], 1)) || 1,
            priceInCents: toCents(
              pick(body, ["priceInCents", "price", "amount", "amountTotal", "valor"]),
              0
            )
          }
        ];

  const totalPriceInCents = toCents(
    pick(body, ["totalPriceInCents", "amountTotal", "amount", "price", "valor"]),
    productList.reduce((sum, product) => sum + toCents(product.priceInCents, 0), 0)
  );

  const gatewayFeeInCents = toCents(
    pick(body, ["gatewayFeeInCents", "feeInCents", "gatewayFee", "fee", "tax"]),
    0
  );

  const userCommissionInCents = toCents(
    pick(body, ["userCommissionInCents", "netInCents", "netAmount", "commission"]),
    Math.max(totalPriceInCents - gatewayFeeInCents, 1)
  );

  const status = mapStatus(pick(body, ["status", "paymentStatus", "event", "type"], "waiting_payment"));

  return {
    orderId: String(pick(body, ["orderId", "order_id", "id", "reference"], `ord_${Date.now()}`)),
    platform: String(pick(body, ["platform"], "MercadoEntregadores")),
    paymentMethod: mapPaymentMethod(pick(body, ["paymentMethod", "payment_method", "paymentType", "method"], "pix")),
    status,
    createdAt: toUtcSqlString(pick(body, ["createdAt", "created_at", "dateCreated", "timestamp"], new Date().toISOString())),
    approvedDate: status === "paid"
      ? toUtcSqlString(pick(body, ["approvedDate", "approved_at", "paidAt", "paid_at"], new Date().toISOString()))
      : toUtcSqlString(pick(body, ["approvedDate", "approved_at", "paidAt", "paid_at"], null)),
    refundedAt: status === "refunded" || status === "chargedback"
      ? toUtcSqlString(pick(body, ["refundedAt", "refunded_at", "refundDate"], new Date().toISOString()))
      : toUtcSqlString(pick(body, ["refundedAt", "refunded_at", "refundDate"], null)),
    customer: {
      name: String(pick(customerSource, ["name", "fullName", "nome"], "Cliente")),
      email: String(pick(customerSource, ["email"], "cliente@sem-email.com")),
      phone: pick(customerSource, ["phone", "telefone", "mobile"], null),
      document: pick(customerSource, ["document", "cpf", "cnpj"], null),
      country: pick(customerSource, ["country"], "BR"),
      ip: pick(customerSource, ["ip"], body.ip || null)
    },
    products: productList.map((product, index) => ({
      id: String(pick(product, ["id", "productId"], `item-${index + 1}`)),
      name: String(pick(product, ["name", "productName"], `Produto ${index + 1}`)),
      planId: pick(product, ["planId"], null),
      planName: pick(product, ["planName"], null),
      quantity: Number(pick(product, ["quantity"], 1)) || 1,
      priceInCents: toCents(pick(product, ["priceInCents", "price", "amount"]), 0)
    })),
    trackingParameters: {
      src: pick(trackingSource, ["src"], pick(body, ["src"], null)),
      sck: pick(trackingSource, ["sck"], pick(body, ["sck"], null)),
      utm_source: pick(trackingSource, ["utm_source"], pick(body, ["utm_source"], null)),
      utm_campaign: pick(trackingSource, ["utm_campaign"], pick(body, ["utm_campaign"], null)),
      utm_medium: pick(trackingSource, ["utm_medium"], pick(body, ["utm_medium"], null)),
      utm_content: pick(trackingSource, ["utm_content"], pick(body, ["utm_content"], null)),
      utm_term: pick(trackingSource, ["utm_term"], pick(body, ["utm_term"], null))
    },
    commission: {
      totalPriceInCents,
      gatewayFeeInCents,
      userCommissionInCents,
      currency: pick(body.commission || {}, ["currency"], pick(body, ["currency"], "BRL"))
    },
    isTest: Boolean(body.isTest)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiToken = process.env.UTMIFY_API_TOKEN;
  if (!apiToken) {
    return res.status(500).json({
      error: "UTMIFY_API_TOKEN is not configured in environment variables"
    });
  }

  try {
    const incomingBody = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const payload = normalizePayload(incomingBody);

    const utmifyResponse = await fetch(UTMIFY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-token": apiToken
      },
      body: JSON.stringify(payload)
    });

    const responseText = await utmifyResponse.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : { ok: utmifyResponse.ok };
    } catch (_error) {
      responseData = { raw: responseText };
    }

    return res.status(utmifyResponse.status).json({
      success: utmifyResponse.ok,
      status: utmifyResponse.status,
      utmify: responseData,
      sentPayload: payload
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: "Failed to send order to Utmify",
      details: error instanceof Error ? error.message : String(error)
    });
  }
};
