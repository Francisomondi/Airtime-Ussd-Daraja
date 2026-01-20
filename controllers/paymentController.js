import Transaction from '../models/Transaction.js';
import { airtime, sms } from '../utils/darajaUtils.js';

/**
 * M-PESA STK Push Callback Handler
 * Production-ready for USSD airtime purchase
 */
export const handlePaymentCallback = async (req, res) => {
  try {
    const { Body } = req.body;

    // 1️⃣ Validate callback structure
    if (!Body?.stkCallback) {
      console.warn('Invalid Daraja callback structure', req.body);
      return res.status(200).send('OK'); // Always acknowledge Daraja
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = Body.stkCallback;

    console.log('Daraja Callback received:', {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      MerchantRequestID,
    });

    // 2️⃣ Find transaction
    const transaction = await Transaction.findOne({ checkoutRequestID: CheckoutRequestID });
    if (!transaction) {
      console.warn(`No transaction found for CheckoutRequestID: ${CheckoutRequestID}`);
      return res.status(200).send('OK');
    }

    // Save raw callback for audit
    transaction.rawCallback = req.body;

    // 3️⃣ Handle failed payment
    if (ResultCode !== 0) {
      transaction.status = 'failed';
      transaction.failureReason = ResultDesc || 'Unknown payment failure';
      transaction.completedAt = new Date();
      await transaction.save();
      console.log(`Payment failed for ${transaction.phoneNumber}: ${ResultDesc}`);
      return res.status(200).send('OK');
    }

    // 4️⃣ Success callback – check metadata
    if (!CallbackMetadata?.Item) {
      console.error('Success callback but no metadata items', req.body);
      return res.status(200).send('OK');
    }

    const items = CallbackMetadata.Item;
    const amountPaid = items.find(i => i.Name === 'Amount')?.Value;
    const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phonePaid = items.find(i => i.Name === 'PhoneNumber')?.Value?.toString();

    if (!amountPaid || !receipt || !phonePaid) {
      console.error('Missing required metadata', items);
      return res.status(200).send('OK');
    }

    // 5️⃣ Verify amount and phone
    const amountMatches = Number(amountPaid) === transaction.amount;
    const phoneMatches = phonePaid.endsWith(transaction.phoneNumber.slice(-9));

    if (!amountMatches || !phoneMatches) {
      console.error('Payment verification mismatch', {
        expectedAmount: transaction.amount,
        receivedAmount: amountPaid,
        expectedPhone: transaction.phoneNumber,
        receivedPhone: phonePaid,
      });

      transaction.status = 'failed';
      transaction.failureReason = 'Payment verification mismatch';
      transaction.completedAt = new Date();
      await transaction.save();
      return res.status(200).send('OK');
    }

    // 6️⃣ Update transaction status
    transaction.status = 'success';
    transaction.amountPaid = Number(amountPaid);
    transaction.mpesaReceiptNumber = receipt;
    transaction.transactionDate = new Date();
    transaction.completedAt = new Date();
    await transaction.save();

    // 7️⃣ Prevent double airtime sends
    if (transaction.airtimeStatus === 'sent') {
      console.log('Airtime already sent for this transaction. Skipping.');
      return res.status(200).send('OK');
    }

    // 8️⃣ Send airtime via Africa's Talking
    try {
      const airtimeResult = await airtime.send({
        recipients: [{
          phoneNumber: transaction.phoneNumber,
          amount: `KES ${transaction.amountPaid}`,
        }],
      });

      const firstResp = airtimeResult?.responses?.[0];
      if (firstResp?.status === 'Sent') {
        transaction.airtimeStatus = 'sent';
        transaction.airtimeSentAt = new Date();
        console.log(`Airtime sent to ${transaction.phoneNumber} | Receipt: ${receipt}`);
      } else {
        transaction.airtimeStatus = 'failed';
        transaction.failureReason = `Airtime failed: ${firstResp?.status || 'Unknown'}`;
        console.error('Airtime send failed', firstResp);
      }

      await transaction.save();
    } catch (airtimeError) {
      transaction.airtimeStatus = 'failed';
      transaction.failureReason = 'Airtime disbursement failed';
      await transaction.save();
      console.error('Airtime API error', airtimeError);
    }

    // 9️⃣ Send SMS confirmation if airtime sent
    if (transaction.airtimeStatus === 'sent') {
      try {
        const smsResult = await sms.send({
          to: transaction.phoneNumber,
          message: `You have received KES ${transaction.amountPaid} airtime. Ref: ${transaction.mpesaReceiptNumber}`,
        });
        console.log('SMS confirmation sent:', smsResult);
      } catch (smsError) {
        console.error('SMS send failed:', smsError.response?.data || smsError.message);
      }
    }

    return res.status(200).send('OK');
  } catch (criticalError) {
    console.error('Critical error in payment callback:', criticalError);
    return res.status(200).send('OK'); // Always acknowledge Daraja
  }
};
