import express from 'express';
import axios from 'axios';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const {
  WEBHOOK_VERIFY_TOKEN = 'my_secret_token_000',
  WHATSAPP_TOKEN,
  PHONE_NUMBER_ID
} = process.env;

// Meta Webhook Verification Endpoint (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook successfully verified!');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming Message Handler (POST)
app.post('/webhook', async (req, res) => {
  // Return 200 immediately to keep Meta happy
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const message = changes?.value?.messages?.[0];

    if (!message) return;

    const from = message.from;
    const messageText = message.text?.body || '';

    await sendWhatsAppMessage(
      from,
      `Hello! Thanks for reaching out to Apex Realty. We received your message: "${messageText}". An agent will assist you shortly.`
    );
  } catch (err) {
    console.error('Webhook payload processing error:', err.message);
  }
});

async function sendWhatsAppMessage(to, text) {
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
  } catch (err) {
    console.error('WhatsApp Send Error:', err.response?.data || err.message);
  }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
