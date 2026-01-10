import axios from 'axios';
import AfricasTalking from 'africastalking';
import dotenv from 'dotenv';

dotenv.config();

const at = AfricasTalking({
  apiKey: process.env.AT_API_KEY,
  username: process.env.AT_USERNAME,
});

export const airtime = at.AIRTIME;

// Helper: Get Daraja Token
async function getDarajaToken() {
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  const auth = Buffer.from(`${process.env.DARAJA_CONSUMER_KEY}:${process.env.DARAJA_CONSUMER_SECRET}`).toString('base64');

  const { data } = await axios.get(url, {
    headers: { Authorization: `Basic ${auth}` },
  });
  return data.access_token;
}

// Helper: Generate Timestamp
export function getTimestamp() {
  const now = new Date();
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

// Initiate STK Push
export async function initiateSTKPush(phoneNumber, amount) {
  const token = await getDarajaToken();
  const timestamp = getTimestamp();
  const password = Buffer.from(
    `${process.env.DARAJA_SHORTCODE}${process.env.DARAJA_PASSKEY}${timestamp}`
  ).toString('base64');

  const stkUrl = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  const callbackUrl = `${process.env.BASE_URL}/payment-callback`;

  const { data } = await axios.post(stkUrl, {
    BusinessShortCode: process.env.DARAJA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phoneNumber.replace('+254', '254'),
    PartyB: process.env.DARAJA_SHORTCODE,
    PhoneNumber: phoneNumber.replace('+254', '254'),
    CallBackURL: callbackUrl,
    AccountReference: 'QuickAirtime',
    TransactionDesc: 'Airtime Purchase',
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });

  return data.CheckoutRequestID;
}