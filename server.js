const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// 1. Webhook Verification (Meta setup)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// 2. Incoming Messages Listener
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // Immediate 200 OK for Meta

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];
    
    if (!message || message.type !== 'text') return;

    const metadata = change.metadata;
    const phoneNumberId = metadata.phone_number_id;
    const fromPhone = message.from;
    const userText = message.text.body.trim().toLowerCase();

    // Fetch matching Agent from Supabase
    const agent = await prisma.agent.findUnique({
      where: { phoneNumberId: phoneNumberId }
    });

    if (!agent || !agent.whatsappAccessToken) {
      console.log(`No active agent found for Phone Number ID: ${phoneNumberId}`);
      return;
    }

    // Process intent & build response
    let responseText = "";

    if (userText.includes("inspection") || userText.includes("book") || userText.includes("agent")) {
      // Record lead in Supabase
      await prisma.lead.create({
        data: {
          agentId: agent.id,
          phone: fromPhone,
          name: change.contacts?.[0]?.profile?.name || "WhatsApp User"
        }
      });

      responseText = `Thanks! Your inspection request has been logged. ${agent.name} will reach out to you directly at this number shortly.`;

    } else {
      // Default: Fetch Agent's listings
      const properties = await prisma.property.findMany({
        where: { agentId: agent.id },
        take: 5
      });

      if (properties.length === 0) {
        responseText = `Welcome to ${agent.name}! We currently have no active listings available. Check back soon!`;
      } else {
        let listingsText = `🏠 *Available Listings from ${agent.name}*\n\n`;
        properties.forEach((prop, i) => {
          listingsText += `*${i + 1}. ${prop.title}*\n`;
          listingsText += `📍 Location: ${prop.location}\n`;
          listingsText += `💰 Price: ${prop.price}\n`;
          listingsText += `📝 ${prop.description}\n\n`;
        });
        listingsText += `Reply *"INSPECTION"* to schedule a physical or virtual viewing!`;
        responseText = listingsText;
      }
    }

    // Reply back via WhatsApp Graph API
    await axios.post(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: fromPhone,
        type: 'text',
        text: { body: responseText }
      },
      {
        headers: {
          Authorization: `Bearer ${agent.whatsappAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

  } catch (error) {
    console.error('Webhook Error:', error.response?.data || error.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bot engine running on port ${PORT}`));
