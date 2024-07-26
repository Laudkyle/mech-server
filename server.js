require('dotenv').config()
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Service request schema
const serviceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  model: { type: String, required: true },
  type: { type: String, required: true },
  location: { type: String, required: true },
  timestamp: { type: String, required: true },
});

const Service = mongoose.model('Service', serviceSchema);

// Create HTTP server and WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store WebSocket connections
const clients = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    console.log('Received message:', message);
    const parsedMessage = JSON.parse(message);

    if (parsedMessage.rtype === 'register') {
      // Register the client with their role and ID
      clients.set(ws, { role: parsedMessage.role, id: parsedMessage.id });
    } else if (parsedMessage.rtype === 'confirmation') {
      // Handle confirmation message
      broadcastToUser(parsedMessage.requestUserId, JSON.stringify(parsedMessage));
    }
  });

  ws.on('close', (code, reason) => {
    console.log(`WebSocket connection closed: ${code} - ${reason}`);
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Broadcast message to all mechanic clients
const broadcastToMechanics = (message) => {
  clients.forEach((client, ws) => {
    if (client.role === 'mechanic' && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
};

// Send message to a specific user
const broadcastToUser = (userId, message) => {
  clients.forEach((client, ws) => {
    if (client.role === 'user' && client.id === userId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
};

// Add a new service request
app.post('/add-service', async (req, res) => {
  const { id, userId, model, type, location, timestamp } = req.body;
  const newService = new Service({ id, userId, model, type, location, timestamp });

  try {
    await newService.save();
    res.status(201).send(newService);

    // Broadcast new service request to all mechanic clients
    const message = JSON.stringify({
      rtype: 'service_request',
      userId,
      model,
      type,
      location,
      timestamp,
    });
    broadcastToMechanics(message);
  } catch (error) {
    console.error("Error adding service request:", error);
    res.status(500).send({ error: "Internal Server Error", details: error.message });
  }
});

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
