import Transaction from '../models/Transaction.js';
import { airtime } from '../utils/darajaUtils.js';

export const handlePaymentCallback = async (req, res) => {
  try {
    const { Body } = req.body;

    // Basic validation – Daraja callbacks must have Body and stkCallback
    if (!Body?.stkCallback) {
      console.warn('Invalid Daraja callback structure', req.body);
      return res.status(200).send('OK'); // Always return 200 to Daraja
    }

    const {
      MerchantRequestID,
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = Body.stkCallback;

    console.log(`Daraja Callback received:`, {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      MerchantRequestID,
    });

    // Find transaction by CheckoutRequestID
    const transaction = await Transaction.findOne({ checkoutRequestID: CheckoutRequestID });

    if (!transaction) {
      console.warn(`No transaction found for CheckoutRequestID: ${CheckoutRequestID}`);
      return res.status(200).send('OK');
    }

    // Update transaction status first (fail-safe)
    if (ResultCode !== 0) {
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        failureReason: ResultDesc || 'Unknown payment failure',
      });
      console.log(`Payment failed for ${transaction.phoneNumber} - ${ResultDesc}`);
      return res.status(200).send('OK');
    }

    // Success case (ResultCode === 0)
    if (!CallbackMetadata?.Item) {
      console.error('Success callback but no metadata items');
      return res.status(200).send('OK');
    }

    const items = CallbackMetadata.Item;

    const amountPaid = items.find(i => i.Name === 'Amount')?.Value;
    const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
    const phonePaid = items.find(i => i.Name === 'PhoneNumber')?.Value?.toString();

    if (!amountPaid || !receipt || !phonePaid) {
      console.error('Missing required metadata in success callback', items);
      return res.status(200).send('OK');
    }

    // Verify amount and phone number match (safety check)
    const amountMatches = Number(amountPaid) === transaction.amount;
    const phoneMatches = phonePaid.endsWith(transaction.phoneNumber.slice(-9));

    if (!amountMatches || !phoneMatches) {
      console.error('Mismatch in payment verification', {
        expectedAmount: transaction.amount,
        receivedAmount: amountPaid,
        expectedPhone: transaction.phoneNumber,
        receivedPhone: phonePaid,
      });
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        failureReason: 'Payment verification mismatch',
      });
      return res.status(200).send('OK');
    }

    // Everything matches → send airtime
    const airtimeOpts = {
      recipients: [{
        phoneNumber: transaction.phoneNumber,
        amount: `KES ${transaction.amount}`,
      }],
    };

    try {
      const result = await airtime.send(airtimeOpts);
      console.log('Airtime send result:', result);

      const firstResponse = result?.responses?.[0];

      if (firstResponse?.status === 'Sent') {
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'success',
          mpesaReceiptNumber: receipt,
          airtimeSentAt: new Date(),
        });
        console.log(`SUCCESS: Airtime sent to ${transaction.phoneNumber} | Receipt: ${receipt}`);
      } else {
        console.error('Airtime send failed:', firstResponse);
        await Transaction.findByIdAndUpdate(transaction._id, {
          status: 'failed',
          failureReason: `Airtime send failed: ${firstResponse?.status || 'Unknown'}`,
        });
      }
    } catch (airtimeError) {
      console.error('Airtime API error:', airtimeError);
      await Transaction.findByIdAndUpdate(transaction._id, {
        status: 'failed',
        failureReason: 'Airtime disbursement failed',
      });
      // Optional: you could add refund logic here later
    }

    return res.status(200).send('OK');
  } catch (criticalError) {
    console.error('Critical error processing Daraja callback:', criticalError);
    // Still acknowledge to Safaricom - NEVER return error status
    return res.status(200).send('OK');
  }
};