import express from 'express';

import { handleSsoLogin, prepareLoginSSOData } from '../controllers/ssoController.js';


const router = express.Router();

router.get('/prepare-login', prepareLoginSSOData, handleSsoLogin);



router.get('/login', handleSsoLogin);
router.post('/login', handleSsoLogin);


export default router;