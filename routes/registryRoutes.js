import express from 'express';
import {
  searchPatientsHandler,
  searchPatientsByHISHandler,
  searchPractitionersHandler,
  searchOrganizationsHandler,
  getTokenHandler,
  clearTokenHandler,
} from '../controllers/registryController.js';


const router = express.Router();

// Search routes
router.get('/patients/search', searchPatientsHandler);
router.get('/patients/searchByHIS' ,  searchPatientsByHISHandler);
router.get('/practitioners/search', searchPractitionersHandler);
router.get('/organizations/search', searchOrganizationsHandler);

// Token management
router.get('/token', getTokenHandler);
router.post('/token/clear', clearTokenHandler);


export default router;