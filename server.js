const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const { WEBHOOK_VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID } = process.env;

// Meta Webhook Verification Endpoint
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Accept token check against process.env or fallback token
  const validToken = WEBHOOK_VERIFY_TOKEN || 'my_secret_token_000';

  if (mode === 'subscribe' && token === validToken) {
    console.log('Webhook successfully verified!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming Message Handler
app.post('/webhook', async (req, res) => {
  // Always return 200 immediately so Meta doesn't time out
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const messageText = message.text?.body || '';

    console.log(`Received message from ${from}: ${messageText}`);

    await sendWhatsAppMessage(from, `Hello! Thanks for reaching out to Apex Realty. We received your message: "${messageText}". An agent will assist you shortly.`);
  } catch (err) {
    console.error('Error processing webhook event:', err.message);
  }
});

async function sendWhatsAppMessage(to, text) {
  if (!PHONE_NUMBER_ID || !WHATSAPP_TOKEN) {
    console.error('Missing PHONE_NUMBER_ID or WHATSAPP_TOKEN in environment variables.');
    return;
  }

  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }
      }
    );
    console.log(`Message successfully sent to ${to}`);
  } catch (err) {
    console.error('WhatsApp Send Error:', err.response?.data || err.message);
  }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
