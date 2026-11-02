import { query } from "../config/pgDB.js";
import { clientLogger } from "../config/logger.js";

export const getDefaultFacilityByUserId = async (userId) => {
  
  try {
    clientLogger.info("Authenticated user ID: "+ userId);
    if (!userId) {
      return null;
    }

    const { rows: facilities } = await query(
      `
        select 
UF.user_facility_id , UF.facility_id , UF.default_facility  , UF.user_id , UF."admin" , f.name as facility_name , f.NPHIES_CS_ORG_ID ,
f.his_db_host , f.his_db_port , f.his_db_name , f.his_db_username , f.his_db_password
from user_facility uf
join facility f on f.facility_id  = uf.facility_id
join "user"   u on u.user_id      = uf.user_id
where u.user_id  = $1 
and (UF.default_facility = 'Y' or UF.default_facility = 'y')
;


        
        `,
      [userId], 
    );

    clientLogger.info(`Facilities found for user ${userId}: ${facilities.length}`);

    if (!facilities || facilities.length === 0) {
      return null;
    }

    clientLogger.info(`Default facility for user ${userId}: ${JSON.stringify(facilities[0])}`);
    
    return facilities[0];
  } catch (err) {
    clientLogger.error("Error fetching facility by user ID: " + JSON.stringify(err));
    throw err;
  }
};
