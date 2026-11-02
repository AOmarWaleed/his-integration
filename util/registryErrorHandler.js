import { clientLogger } from "../config/logger.js";

export const handleApiError = (error, req, res) => {
  clientLogger.error('Error:', error.message);
  
  if (error.response) {
    const { status, data } = error.response;
    clientLogger.error('Status:', status);
    clientLogger.error('Data:', data);
    
    // Handle CRS errors as per documentation
    if (status === 403) {
      if (data.fault?.faultstring?.includes('IP is not allowed')) {
        return res.status(403).json({
          success: false,
          error: 'IP_NOT_ALLOWED',
          message: 'Source IP is not whitelisted',
          solution: 'Please whitelist your source IP in the desired environment'
        });
      }
      if (data.fault?.faultstring?.includes('Invalid Access Token')) {
        return res.status(403).json({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Access token is invalid or expired',
          solution: 'Get a new token or check environment compatibility'
        });
      }
    }
    
    if (status === 404 && data.fault?.faultstring?.includes('Authorization is not found')) {
      return res.status(404).json({
        success: false,
        error: 'AUTH_NOT_FOUND',
        message: 'Authorization token not found',
        solution: 'Include Bearer token in request headers'
      });
    }
    
    if (status === 400) {
      if (data.message?.includes('malformed birth date')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DATE',
          message: 'Birth date format is incorrect',
          solution: 'Check date format (YYYY-MM-DD)'
        });
      }
      if (data.message?.includes('patient type is unknown')) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID_TYPE',
          message: 'ID must be National ID or Iqama',
          solution: 'National ID starts with 1, Iqama starts with 2'
        });
      }
      if (data.message?.includes('search input error')) {
        return res.status(400).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'No record found with provided parameters',
          solution: 'Verify the search parameters'
        });
      }
    }
    
    return res.status(status).json({
      success: false,
      ...data,
      details: {
        data: error.response?.data || null,
        params : error.config?.params || null,
      }
    });
  }
  
  if (error.request) {
    return res.status(503).json({
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Cannot connect to CRS service',
      solution: 'Check network connectivity and firewall settings'
    });
  }
  
  return res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: error.message
  });
};