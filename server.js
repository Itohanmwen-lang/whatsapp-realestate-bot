import express from 'express';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'my_secret_token_000';

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const message = value?.messages?.[0];

    if (!message) return;

    const incomingPhoneNumberId = value.metadata?.phone_number_id;
    const leadPhone = message.from;
    const messageText = (message.text?.body || '').trim().toLowerCase();

    // 1. Fetch Agent matching this WhatsApp Phone Number ID
    const agent = await prisma.agent.findUnique({
      where: { phoneNumberId: incomingPhoneNumberId },
      include: { properties: true }
    });

    if (!agent || !agent.whatsappAccessToken) {
      console.error(`No agent or token found for ID: ${incomingPhoneNumberId}`);
      return;
    }

    // 2. Log Lead
    await prisma.lead.upsert({
      where: { id: `${agent.id}_${leadPhone}` },
      update: {},
      create: {
        id: `${agent.id}_${leadPhone}`,
        agentId: agent.id,
        phone: leadPhone
      }
    });

    // 3. Dynamic Response Logic
    let responseText = `Hello! Welcome to *${agent.name}* Real Estate Services.\n\nReply with *1* to see available property listings.`;

    if (messageText === '1') {
      if (agent.properties.length === 0) {
        responseText = "We currently have no properties available. Please check back later!";
      } else {
        responseText = "🏡 *Our Available Listings:*\n\n";
        agent.properties.forEach((prop, index) => {
          responseText += `${index + 1}. *${prop.title}*\n📍 ${prop.location}\n💰 ${prop.price}\n\n`;
        });
      }
    }

    // 4. Send WhatsApp Message
    await sendWhatsAppMessage(
      agent.phoneNumberId,
      agent.whatsappAccessToken,
      leadPhone,
      responseText
    );

  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

async function sendWhatsAppMessage(phoneNumberId, token, to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  } catch (err) {
    console.error('Send message error:', err.response?.data || err.message);
  }
}

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
