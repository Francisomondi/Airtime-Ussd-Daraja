import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import connectDB from './config/db.js';
import ussdRoutes from './routes/ussdRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

// Load environment variables as early as possible
dotenv.config();

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.urlencoded({ extended: false })); // For USSD (form-encoded)
app.use(bodyParser.json());                         // For Daraja callbacks (JSON)

// Trust proxy if behind reverse proxy (e.g., Render, Heroku, ngrok with HTTPS)
app.set('trust proxy', 1);

// Routes
app.use('/ussd', ussdRoutes);           // Better: explicit path
app.use('/payment-callback', paymentRoutes);

// Health check endpoint (useful for monitoring & deployment platforms)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'USSD Airtime App is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('USSD Airtime Top-Up Service with M-Pesa STK Push 🚀\nVisit /health for status.');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('END Route not found');
});

// Global error handler (catches unhandled errors in routes)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('END Service error. Please try again later.');
});

// Graceful shutdown
const server = app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${server.address().port}`);
  console.log(`Health check: http://localhost:${server.address().port}/health`);
});

// Handle shutdown signals
process.on('SIGTERM', shutDown);
process.on('SIGINT', shutDown);

function shutDown() {
  console.log('Received shutdown signal. Closing server...');
  server.close(async () => {
    console.log('Server closed.');
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed.');
    } catch (err) {
      console.error('Error closing MongoDB:', err);
    }
    process.exit(0);
  });
}