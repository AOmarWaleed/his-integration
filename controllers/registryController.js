import { searchPatients } from "../services/registry/patientsService.js";
import { searchPractitioners } from "../services/registry/practitionersService.js";
import { searchOrganizations } from "../services/registry/organizationsService.js";
import { getAccessToken, clearToken } from "../services/registry/token.js";
import { handleApiError } from "../util/registryErrorHandler.js";

export const searchPatientsHandler = async (req, res) => {
  try {
    const result = await searchPatients(req.query);
    res.json(result);
  } catch (error) {
    handleApiError(error, req, res);
  }
};
export const searchPatientsByHISHandler = async (req, res) => {
  try {
    
    const result = await searchPatients({
      dob: req.query.dob,
      nid: req.query.nid,
      nidType: req.query.providerType,
    });

    // console.log(result);
    

    res.json({
      ClientIdentifierId: "",
      IdType: "",
      IdNumber: req.query.nid,
      DateOfBirth: req.query.dob,
      DateOfBirthH: "",
      Age: "",
      FirstNameEn: "",
      SecondNameEn: "",
      ThirdNameEn: "",
      LastNameEn: "",
      HealthId: result?.data?.data?.HealthId,
      FirstNameAr: "",
      SecondNameAr: "",
      ThirdNameAr: "",
      LastNameAr: "",
      Gender: "",
      Nationality: "",
      NationalityCode: "",
      Occupation: "",
      MaritalStatus: "",
      MaritalStatusCode: "",
      PatientStatus: "",
      PlaceofBirth: "",
    });
  } catch (error) {
    handleApiError(error, req, res);
  }
};

export const searchPractitionersHandler = async (req, res) => {
  try {
    const result = await searchPractitioners(req.query);
    res.json(result);
  } catch (error) {
    handleApiError(error, req, res);
  }
};

export const searchOrganizationsHandler = async (req, res) => {
  try {
    const result = await searchOrganizations(req.query);
    res.json(result);
  } catch (error) {
    handleApiError(error, req, res);
  }
};

// Token management handlers for testing purposes
export const getTokenHandler = async (req, res) => {
  try {
    const { token } = await getAccessToken();

    res.json({
      success: true,
      message: "Token retrieved successfully",
      token: token,
    });
  } catch (error) {
    handleApiError(error, req, res);
  }
};

export const clearTokenHandler = async (req, res) => {
  clearToken();
  res.json({
    success: true,
    message: "Token cache cleared",
  });
};
