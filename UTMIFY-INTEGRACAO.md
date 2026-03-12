# Integracao Utmify

## 1) Frontend (pixel + UTM)
Ja aplicado nas paginas do funil:
- `index.html`
- `informacoesconfirmadas.shop/index.html`
- `informacoesconfirmadas.shop/cadastro.html`
- `informacoesconfirmadas.shop/cadastrod41d.html`
- `informacoesconfirmadas.shop/municipiosd41d.html`
- `informacoesconfirmadas.shop/recebord41d.html`
- `informacoesconfirmadas.shop/entregad41d.html`
- `informacoesconfirmadas.shop/finalizacaod41d.html`

Scripts usados:

```html
<script>
  window.pixelId = "69aa408a358a3d814af0f9c5";
  var a = document.createElement("script");
  a.setAttribute("async", "");
  a.setAttribute("defer", "");
  a.setAttribute("src", "https://cdn.utmify.com.br/scripts/pixel/pixel.js");
  document.head.appendChild(a);
</script>
<script src="https://cdn.utmify.com.br/scripts/utms/latest.js" data-utmify-prevent-xcod-sck data-utmify-prevent-subids async defer></script>
```

## 2) Endpoint de vendas (paid/approved/refunded)
Criado endpoint serverless:
- `api/utmify-order.js`

Esse endpoint:
- Recebe `POST` do checkout/webhook
- Normaliza payload para o formato da Utmify
- Envia para `https://api.utmify.com.br/api-credentials/orders`
- Usa `x-api-token` via variavel de ambiente

## 3) Variavel de ambiente (obrigatoria)
Configurar no projeto Vercel:
- `UTMIFY_API_TOKEN=SEU_TOKEN_DA_UTMIFY`

Use o token da sua conta Utmify no valor da variavel `UTMIFY_API_TOKEN`.

## 4) Webhook do checkout
No seu checkout/gateway, configure o webhook para:
- `https://SEU_DOMINIO/api/utmify-order`

E envie eventos de:
- `waiting_payment`
- `paid` (aprovado)
- `refunded`/`chargedback` quando houver

## 5) Teste rapido
Enviar teste com cURL:

```bash
curl -X POST https://SEU_DOMINIO/api/utmify-order \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-123",
    "platform": "MercadoEntregadores",
    "paymentMethod": "pix",
    "status": "paid",
    "createdAt": "2026-03-07 12:00:00",
    "approvedDate": "2026-03-07 12:05:00",
    "refundedAt": null,
    "customer": {
      "name": "Teste Usuario",
      "email": "teste@exemplo.com",
      "phone": "11999999999",
      "document": "12345678901",
      "country": "BR"
    },
    "products": [
      {
        "id": "kit-01",
        "name": "Kit de Seguranca",
        "planId": null,
        "planName": null,
        "quantity": 1,
        "priceInCents": 1990
      }
    ],
    "trackingParameters": {
      "src": null,
      "sck": null,
      "utm_source": "FB",
      "utm_campaign": "CAMPANHA_TESTE",
      "utm_medium": "ABO",
      "utm_content": "CRIATIVO_1",
      "utm_term": "reels"
    },
    "commission": {
      "totalPriceInCents": 1990,
      "gatewayFeeInCents": 200,
      "userCommissionInCents": 1790,
      "currency": "BRL"
    }
  }'
```
