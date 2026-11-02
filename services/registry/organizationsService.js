import axios from 'axios';
import { getAccessToken, getEnvironmentConfig, clearToken } from './token.js';

export const searchOrganizations = async (params, environment = 'test') => {
  try {
    // Validate at least one parameter is provided
    if (!params.organizationId && !params.licenseNumber && !params.sehaId) {
      throw new Error('Organizations search requires at least one: organizationId, licenseNumber, or sehaId');
    }

    clientLogger.info(`Searching organization in ${environment} environment`);

    // Get access token
    const { token } = await getAccessToken(environment);
    const config = await getEnvironmentConfig(environment);

    // TODO: This endpoint might need to be configurable
    //! INSERT INTO conf (conf_key, conf_value, description, module_id) 
    //! VALUES ('CRS_ORGANIZATIONS_ENDPOINT', '/establishments/registry/v2/organizations', 'Organizations Registry Endpoint', 3);
    const organizationsEndpoint = '/establishments/registry/v2/organizations';

    // Prepare query parameters
    const queryParams = {};
    if (params.organizationId) queryParams.organizationId = params.organizationId;
    if (params.licenseNumber) queryParams.licenseNumber = params.licenseNumber;
    if (params.sehaId) queryParams.sehaId = params.sehaId;

    // Send request
    const response = await axios({
      method: 'GET',
      url: `${config.baseUrl}${organizationsEndpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Organization-ID': config.organizationId
      },
      params: queryParams
    });

    clientLogger.info('Organization found successfully');
    
    return {
      success: true,
      registryType: 'organizations',
      environment,
      data: response.data
    };

  } catch (error) {
    // Retry once if token is invalid
    if (error.response?.status === 403 && 
        error.response?.data?.fault?.faultstring?.includes('Invalid Access Token')) {
      clientLogger.info('Token invalid, clearing cache and retrying...');
      clearToken();
      return searchOrganizations(params, environment);
    }
    
    throw error;
  }
};

export const searchOrganizationsById = (organizationId, environment) => 
  searchOrganizations({ organizationId }, environment);

export const searchOrganizationsByLicenseNumber = (licenseNumber, environment) => 
  searchOrganizations({ licenseNumber }, environment);

export const searchOrganizationsBySehaId = (sehaId, environment) => 
  searchOrganizations({ sehaId }, environment);