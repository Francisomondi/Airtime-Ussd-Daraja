import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema({
  checkoutRequestID: { type: String, required: true, unique: true },
  sessionId: { type: String },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'success', 'failed'], 
    default: 'pending' 
  },
  mpesaReceiptNumber: { type: String },
}, { timestamps: true });

export default mongoose.model('Transaction', transactionSchema);