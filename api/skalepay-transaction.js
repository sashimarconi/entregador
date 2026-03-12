function toCents(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Math.round(value >= 1000 ? value : value * 100);
  const normalized = String(value).replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return fallback;
  return Math.round(parsed >= 1000 ? parsed : parsed * 100);
}

function pick(obj, keys, defaultValue = null) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
  return defaultValue;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.SKALEPAY_SECRET;
  if (!secret) {
    return res.status(500).json({ error: "SKALEPAY_SECRET is not configured in environment variables" });
  }

  try {
    const incoming = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};

    // Build amount (in cents)
    let amount = toCents(pick(incoming, ["amount", "amountTotal", "totalPriceInCents", "price", "valor"], 0));
    if (!amount && Array.isArray(incoming.products)) {
      amount = incoming.products.reduce((s, p) => s + toCents(p.price || p.priceInCents || 0), 0);
    }

    // Fallback: sum price from single product
    if (!amount && incoming.product) amount = toCents(incoming.product.price || incoming.product.priceInCents || 0);

    const customer = {
      name: String(pick(incoming, ["name", "cliente", "customerName", "customer.name", "buyerName"], "Cliente")),
      email: String(pick(incoming, ["email", "customerEmail", "buyer.email"], "cliente@sem-email.com")),
      document: pick(incoming, ["document", "cpf", "cnpj"], null),
      phone: pick(incoming, ["phone", "telefone", "telefoneCelular", "mobile"], null)
    };

    const items = Array.isArray(incoming.products)
      ? incoming.products.map((p, i) => ({ id: String(p.id || p.productId || `item-${i + 1}`), name: String(p.name || p.productName || `Produto ${i + 1}`), quantity: Number(p.quantity || 1) || 1, amount: toCents(p.price || p.priceInCents || 0) }))
      : incoming.product
      ? [{ id: pick(incoming.product, ["id"], "item-1"), name: pick(incoming.product, ["name", "productName"], "Produto 1"), quantity: Number(pick(incoming.product, ["quantity"], 1)) || 1, amount: toCents(pick(incoming.product, ["price", "priceInCents"], 0)) }]
      : [];

    const skaleBody = {
      amount: amount,
      paymentMethod: "pix",
      customer: customer,
      items: items,
      pix: {
        // expiresIn seconds (optional) - set 1 hour by default
        expiresIn: pick(incoming, ["pixExpiresIn", "expiresIn"], 3600)
      }
    };

    const postbackUrl = process.env.SKALEPAY_POSTBACK;
    if (postbackUrl) skaleBody.postbackUrl = postbackUrl;

    // Attach metadata if exists
    if (incoming.orderId || incoming.metadata) {
      skaleBody.metadata = incoming.metadata || JSON.stringify({ orderId: incoming.orderId });
    }

    const auth = "Basic " + Buffer.from(secret + ":x").toString("base64");

    const response = await fetch("https://api.conta.skalepay.com.br/v1/transactions", {
      method: "POST",
      headers: {
        authorization: auth,
        "Content-Type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(skaleBody)
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : { ok: response.ok };
    } catch (err) {
      data = { raw: text };
    }

    return res.status(response.status).json({ success: response.ok, status: response.status, transaction: data, sentPayload: skaleBody });
  } catch (error) {
    return res.status(500).json({ success: false, error: "Failed to create SkalePay transaction", details: error instanceof Error ? error.message : String(error) });
  }
};
