import { Router } from 'express';
import { handlePaymentCallback } from '../controllers/paymentController.js';

const router = Router();

router.post('/', handlePaymentCallback);

export default router;