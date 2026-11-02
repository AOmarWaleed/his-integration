import express from 'express';
import {
  handleOldAdtVersion,
  handleAdtMsg
} from '../controllers/adtController.js';
import { authenticateToken } from '../controllers/authenticateTokenController.js';
import { facilityAndConnection } from '../middleware/facilityAndConnection.js';


const router = express.Router();

router.get("/",facilityAndConnection ,handleAdtMsg);







// !SEND OLDVERSION BATCH END POINT WITH START AND END DATES
router.get("/:startDate/:endDate/:messageType", handleOldAdtVersion);

export default router;