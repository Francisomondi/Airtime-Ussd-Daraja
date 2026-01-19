import Transaction from '../models/Transaction.js';
import { initiateSTKPush } from '../utils/darajaUtils.js';

// For storage / display
const toE164 = (phone) => {
  if (!phone) return phone;
  if (phone.startsWith('+254')) return phone;
  if (phone.startsWith('254')) return `+${phone}`;
  if (phone.startsWith('0')) return `+254${phone.slice(1)}`;
  return phone;
};

// For M-PESA STK Push ONLY
const toMpesaFormat = (phone) => {
  if (!phone) return phone;
  return phone.replace('+', ''); // removes +254 → 254
};

export const handleUSSD = async (req, res) => {
  try {
    const { sessionId, phoneNumber: rawPhoneNumber, text = '' } = req.body;

    // Validate required fields from Africa's Talking
    if (!sessionId || !rawPhoneNumber) {
      return res.status(400).send('END Missing session or phone number');
    }

    const phoneE164 = toE164(rawPhoneNumber);
    const phoneMpesa = toMpesaFormat(phoneE164);
    const userInput = text.trim().split('*').filter(Boolean); // Clean empty parts
    let response = '';

    // Stage 1: Main Menu
    if (userInput.length === 0) {
      response = `CON Welcome to Quick Airtime Top-Up\n1. Buy Airtime\n0. Exit`;
    }
    // Stage 2: Option Selected
    else if (userInput.length === 1) {
      const choice = userInput[0];

      if (choice === '1') {
        response = `CON Enter amount in KES\n(Min: 20, Max: 1000)`;
      } else if (choice === '0') {
        response = `END Thank you for using Quick Airtime! Goodbye 👋`;
      } else {
        response = `END Invalid option. Dial again to restart.`;
      }
    }
    // Stage 3: Amount Entered → Trigger STK Push
    else if (userInput.length === 2) {
      const amountStr = userInput[1].trim();
      const amount = parseInt(amountStr, 10);

      if (isNaN(amount) || amount < 20 || amount > 1000) {
        response = `END Invalid amount.\nPlease enter between KES 20 and 1000.`;
      } else {
        try {
          // Initiate STK Push via Daraja
          const checkoutRequestID = await initiateSTKPush(phoneMpesa, amount);

          // Save transaction record
          await Transaction.create({
            checkoutRequestID,
            sessionId,
            phoneNumber: phoneMpesa,
            amount,
            status: 'pending',
          });

          console.log(`STK Push initiated: ${checkoutRequestID} for ${phoneMpesa} - KES ${amount}`);

          response = `END Payment request sent!\nCheck your phone and approve KES ${amount} to receive airtime instantly.`;
        } catch (error) {
          console.error('STK Push initiation failed:', {
            phone: phoneMpesa,
            amount,
            error: error.response?.data || error.message,
          });

          // User-friendly error
          response = `END Sorry, we couldn't process your request right now.\nPlease try again in a few minutes.`;
        }
      }
    }
    // Fallback for unexpected input depth
    else {
      response = `END Session ended. Too many inputs.\nDial again to start over.`;
    }

    // Always respond with plain text and correct headers
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (unexpectedError) {
    console.error('Unexpected error in USSD handler:', unexpectedError);
    res.set('Content-Type', 'text/plain');
    res.status(500).send('END Service temporarily unavailable. Try again later.');
  }
};