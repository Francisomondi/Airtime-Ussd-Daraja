import { Router } from 'express';
import { handleUSSD } from '../controllers/ussdController.js';

const router = Router();

router.post('/', handleUSSD);

export default router;