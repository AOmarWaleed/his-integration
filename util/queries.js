export const QUERIES = {
  A01: {
    label: "A01",
    messageType: "ADT^A01",
    generateAfterQuery: () => {
      return `UPDATE patient_ad
SET    int_sent = :status
WHERE  admission_no = :generated_function_argument`;
    },
    query:`
   SELECT /*+ A0_1 */
       pa.admission_no              AS admission_no
      ,pa.admission_no              AS generated_function_argument    
      ,pa.patient_id                AS patient_id
      ,pfm.user_file_id             AS user_file_id
      ,To_Char(pd.when_died,'YYYYMMDDHH24MISS') AS death_date
      ,Decode(pd.when_died,NULL,'N','Y') AS death_flag
      ,pa.episode_no                AS episode_no
      ,To_Char(pa.amend_last_date,'YYYYMMDDHH24MISS') AS trx_date
      ,To_Char(Sysdate,'YYYYMMDDHH24MISS') AS currentdate
      ,'I'||pa.admission_no         AS visit_no
      ,'I'                          AS attendance_type
      ,pa.patient_admission_category AS admission_type
      ,pa.admission_department      AS admission_source
      ,To_Char(pa.admit_date,'YYYYMMDDHH24MISS') AS admit_date
      ,admit_date                   AS trans_date
      ,we.work_entity               AS work_entity
      ,we.short_name                AS work_entity_short_name
      ,rm.room_no                   AS room_no
      ,bd.bed_location              AS bed_location
      ,pa.reason_for_admit          AS reason_for_admit
      ,ar.description               AS reason_for_admit_description
      ,pa.icd_code                  AS icd_code
      ,dd.description               AS icd_code_description
FROM    patient_ad pa 
INNER JOIN bed_details bd ON pa.patient_id = bd.patient_id 
                          AND pa.admission_no = bd.admission_no
INNER JOIN work_entities_data we ON bd.work_entity = we.work_entity
INNER JOIN bed_slots_master bsm ON bd.bed_location = bsm.bed_location
INNER JOIN room_master rm ON bsm.room_no = rm.room_no
LEFT JOIN diagnosis_desc dd ON dd.diag_code = pa.icd_code 
                            AND dd.language_id = Oasis.User_Language
LEFT JOIN admission_reasons ar ON ar.reason_code = pa.reason_for_admit
LEFT JOIN patient_file_master pfm ON pfm.patient_id = pa.patient_id 
                                  AND pfm.med_rec_type = 1113 
                                  AND pfm.volume_id = 1
LEFT OUTER JOIN deaths pd ON pd.patient_id = pa.patient_id
WHERE  1=1
AND pa.int_sent IN ('N',NVL(:p_int_sent, 'N'))
AND    pa.episode_no IS NOT NULL
AND    bd.current_record ='Y'
AND rownum <= :rownum_max
AND pa.admit_date >= :p_date
AND (:startDate IS NULL OR pa.admit_date >= :startDate)
AND (:endDate IS NULL OR pa.admit_date <= :endDate)
AND pa.patient_id = NVL(:p_patient_id, pa.patient_id)
AND pa.episode_no = NVL(:p_episode_no, pa.episode_no)

    `,
    
  },

  // !! manual with db  (change the query to filter with end_date)
  A02: {
    label: "A02",
    messageType: "ADT^A02",
    generateAfterQuery: () => {
      return `UPDATE BED_DETAILS 
SET   int_sent = :status  
WHERE rowid =   :generated_function_argument `;
    },
    query:` 
   SELECT  /*+ ِA02 */
        bd.admission_no                                AS admission_no 
       ,bd.patient_id                                  AS patient_id 
       ,To_Char(Sysdate,'YYYYMMDDHH24MISS')            AS currentdate 
       ,To_Char(pa.admit_date,'YYYYMMDDHH24MISS')      AS admit_date 
       ,pa.admit_date                                  AS trans_date
       ,''                                             AS race 
       ,bd.episode_no                                  AS episode_no 
       ,To_Char(bd.amend_last_date,'YYYYMMDDHH24MISS') AS trx_date 
       ,bdold.bd_rowid                                 AS bd_rowid 
       ,bdold.bd_rowid                                 AS generated_function_argument 
       ,pfm.user_file_id                               AS user_file_id 
       ,bdold.work_entity                              AS prior_work_entity 
       ,bdold.description                              AS prior_work_entity_name
       ,bdold.short_name                               AS prior_work_entity_short_name 
       ,bdold.bed_location                             AS prior_bed_location 
       ,bdold.room_no                                  AS prior_room_no 
       ,bd.work_entity                                 AS work_entity 
       ,we.description                                 AS work_entity_name
       ,we.short_name                                  AS work_entity_short_name 
       ,bd.bed_location                                AS bed_location 
       ,rm.room_no                                     AS room_no 
       ,'I'||pa.admission_no                           AS visit_no 
       ,'I'                                            AS attendance_type
       ,pa.patient_admission_category                  AS admission_type
       ,To_Char(pd.when_died,'YYYYMMDDHH24MISS')       AS death_date 
       ,Decode(pd.when_died,NULL,'N','Y')              AS death_flag 
FROM  patient_ad pa 
 INNER JOIN bed_details bd ON bd.patient_id = pa.patient_id AND bd.admission_no = pa.admission_no
 INNER JOIN work_entities we ON we.work_entity = bd.work_entity
 LEFT JOIN patient_file_master pfm ON pfm.patient_id = pa.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
 LEFT JOIN bed_slots_master bsm ON bsm.bed_location = bd.bed_location
 LEFT JOIN room_master rm ON rm.room_no = bsm.room_no
 LEFT OUTER JOIN deaths pd ON pd.patient_id = pa.patient_id
 INNER JOIN (SELECT bd.patient_id
                   ,bd.admission_no
                   ,bd.work_entity
                   ,we.description
                   ,we.short_name
                   ,bd.bed_location
                   ,bd.start_date
                   ,bd.end_date
                   ,rm.room_no
                   ,bd.rowid AS bd_rowid
              FROM bed_details bd
                   INNER JOIN work_entities we ON we.work_entity = bd.work_entity
                   LEFT JOIN bed_slots_master bsm ON bsm.bed_location = bd.bed_location
                   LEFT JOIN room_master rm ON rm.room_no = bsm.room_no
              WHERE bd.int_sent IN ('N', NVL(:p_int_sent, 'N'))) bdold 
      ON bdold.patient_id = pa.patient_id 
     AND bdold.admission_no = pa.admission_no
     AND bd.trans_from_work_entity = bdold.work_entity
     AND Nvl(bd.trans_from_bed_location, Nvl(bdold.bed_location, -1)) = Nvl(bdold.bed_location, Nvl(bd.trans_from_bed_location, -1))
     AND bd.start_date >= bdold.start_date
WHERE 1 = 1
  AND pd.episode_no IS NOT NULL
  AND rownum <= :rownum_max
  AND pa.admit_date >= :p_date
  AND (:startDate IS NULL OR pa.admit_date >= :startDate)
  AND (:endDate IS NULL OR pa.admit_date <= :endDate)
  AND pa.patient_id = NVL(:p_patient_id, pa.patient_id)
  AND pa.episode_no = NVL(:p_episode_no, pa.episode_no)
    
   `,
   
  },

  // ! Discharge
  A03_ER: {
    label: "A03_ER",
    messageType: "ADT^A03",
    generateAfterQuery: () => {
      return `UPDATE patient_emergency_visit
SET    int_sent = :status
WHERE  er_visit_id = :generated_function_argument`;
    },
    query:
    // PV1-45 = discharge_date
    ` SELECT /*+ A03_ER */
       DISTINCT pev.er_visit_id AS er_visit_id
      ,pev.er_visit_id AS generated_function_argument
      ,pev.patient_id AS patient_id
      ,pfm.user_file_id AS user_file_id
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag      
      ,pev.work_entity AS work_entity
      ,we.short_name AS work_entity_short_name
      ,'E' AS attendance_type
      ,'E' || pev.er_visit_id AS visit_no
      ,pev.episode_no AS episode_no
      ,TO_CHAR(NVL(pev.time_treatment_started, pev.time_arrived), 'YYYYMMDDHH24MISS') AS admit_date
      ,pev.time_arrived  AS trans_date
      ,TO_CHAR(NVL(pev.time_complete, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date
      ,TO_CHAR(pev.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date    
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
FROM    patient_emergency_visit pev 
       INNER JOIN work_entities_data we ON pev.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pev.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT OUTER JOIN deaths pd ON pd.patient_id = pev.patient_id
WHERE  1 =1 
       AND pev.int_sent IN ('D', NVL(:p_int_sent, 'D'))
       AND pev.episode_no IS NOT NULL
       AND rownum <= :rownum_max
       AND pev.time_arrived >= :p_date
       AND (:startDate IS NULL OR pev.time_arrived >= :startDate)
       AND (:endDate IS NULL OR pev.time_arrived <= :endDate)
       AND pev.patient_id = NVL(:p_patient_id, pev.patient_id)
       AND pev.episode_no = NVL(:p_episode_no, pev.episode_no)
`,
  
  },
  
  A03_IP: {
    label: "A03_IP",
    messageType: "ADT^A03",
    generateAfterQuery: () => {
      return `UPDATE patient_ad
SET    int_sent = :status
WHERE  admission_no = :generated_function_argument`;
    },
    query:`
 SELECT /*+ A03_IP */
             pa.admission_no
            ,pa.admission_no AS generated_function_argument 
            ,pa.patient_id
            ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
            ,TO_CHAR(pa.admit_date, 'YYYYMMDDHH24MISS') AS admit_date
            ,pa.admit_date AS trans_date
            ,'' AS race
            ,pa.episode_no
            ,TO_CHAR(pa.amend_last_date, 'YYYYMMDDHH24MISS') AS int_date
            ,TO_CHAR(pa.physical_discharge_date, 'YYYYMMDDHH24MISS') AS discharge_date
            ,pfm.user_file_id
            ,we.short_name AS work_entity_short_name
            ,we.work_entity
            ,rm.room_no
            ,bd.bed_location
            ,'I' || pa.admission_no AS visit_no
            ,'I' AS attendance_type
            ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
            ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
            ,pa.patient_admission_category AS admission_type
           FROM    patient_ad pa 
             INNER JOIN bed_details bd ON pa.patient_id = bd.patient_id AND pa.admission_no = bd.admission_no
             INNER JOIN work_entities we ON bd.work_entity = we.work_entity
             LEFT JOIN patient_file_master pfm ON pfm.patient_id = pa.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
             LEFT OUTER JOIN deaths pd ON pd.patient_id = pa.patient_id
             LEFT JOIN bed_slots_master bsm ON bsm.bed_location = bd.bed_location
             LEFT JOIN room_master rm ON rm.room_no = bsm.room_no
      WHERE  1 = 1 
             AND bd.current_record || '' = 'D'
             AND bd.bed_detail_id = (
                 SELECT MAX(bed_detail_id) 
                 FROM bed_details 
                 WHERE admission_no = pa.admission_no
             )
             AND pa.int_sent  IN ('D', NVL(:p_int_sent, 'D'))
             AND pa.episode_no IS NOT NULL
             AND rownum <= :rownum_max
             AND pa.admit_date >= :p_date
             AND (:startDate IS NULL OR pa.admit_date >= :startDate)
             AND (:endDate IS NULL OR pa.admit_date <= :endDate)
             AND pa.episode_no = NVL(:p_episode_no, pa.episode_no)
             AND pa.patient_id = NVL(:p_patient_id, pa.patient_id)
`,
   
  },
  
  // ! not exist
  A03_OPD: {
    label: "A03_OPD",
    messageType: "ADT^A03",
    generateAfterQuery: () => {
      return `UPDATE appointments
SET    int_sent = :status
WHERE  appointment_id = :generated_function_argument`;
    },
    query:`
    SELECT /*+ A03_OPD */
       a.appointment_id AS appointment_id
      ,a.appointment_id AS generated_function_argument
      ,a.patient_id AS patient_id
      , a.start_date AS trans_date
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(NVL(a.start_date, TO_DATE(a.julian_date, 'J')), 'YYYYMMDDHH24MISS') AS admit_date
      ,a.work_entity AS work_entity
      ,'' AS race
      ,a.episode_no AS episode_no 
      ,TO_CHAR(a.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
      ,pfm.user_file_id AS user_file_id
      ,TO_CHAR(NVL(a.end_date, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date
      ,'O' AS attendance_type
      ,'O' || a.appointment_id AS visit_no
      ,we.short_name AS work_entity_short_name
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag  
      ,a.consultant AS consultant_id
FROM    appointments a
       INNER JOIN work_entities_data we ON a.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = a.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT OUTER JOIN deaths pd ON pd.patient_id = a.patient_id
WHERE  1=1
      AND a.int_sent IN ('D' , NVL(:p_int_sent, 'D'))
      AND a.episode_no IS NOT NULL
      and rownum <= :rownum_max
      AND a.start_date >= :p_date
      AND (:startDate IS NULL OR a.start_date >= :startDate)
      AND (:endDate IS NULL OR a.start_date <= :endDate)
      AND a.episode_no = NVL(:p_episode_no, a.episode_no)
      AND a.patient_id = NVL(:p_patient_id, a.patient_id)

`,
   
  },

  A04_OPD: {
    label: "A04_OPD",
    messageType: "ADT^A04",
    generateAfterQuery: () => {
      return `UPDATE appointments
SET    int_sent = :status
WHERE  appointment_id = :generated_function_argument
`;
    },
    query: `
    /*+ A04_OPD  */
SELECT a.appointment_id AS appointment_id,
       a.appointment_id AS generated_function_argument,
       a.patient_id AS patient_id,
       a.start_date AS trans_date,
       TO_CHAR (pd.when_died, 'YYYYMMDDHH24MISS') AS death_date,
       DECODE (pd.when_died, NULL, 'N', 'Y') AS death_flag,
       TO_CHAR (SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate,
       a.work_entity AS work_entity,
       we.short_name AS work_entity_short_name,
       a.episode_no AS episode_no,
       TO_CHAR(NVL(a.end_date, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date,
       'O' AS attendance_type,
       'O' || a.appointment_id AS visit_no,
       TO_CHAR (NVL (start_date, TO_DATE (a.julian_date, 'J')), 'YYYYMMDDHH24MISS') AS admit_date,
       TO_CHAR (a.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
  FROM appointments a 
       INNER JOIN work_entities_data we ON a.work_entity = we.work_entity
       LEFT OUTER JOIN deaths pd ON pd.patient_id = a.patient_id
 WHERE 1 = 1
   AND a.episode_no IS NOT NULL
   AND a.int_sent IN ('N' , NVL(:p_int_sent, 'N')) 
   AND rownum <= :rownum_max
   AND a.start_date >= :p_date
   AND (:startDate IS NULL OR a.start_date >= :startDate)  
   AND (:endDate IS NULL OR a.start_date <= :endDate)
   AND a.episode_no = NVL(:p_episode_no, a.episode_no)
   AND a.patient_id = NVL(:p_patient_id, a.patient_id)

   
    `,
   
  },
  
  A04_ER: {
    label: "A04_ER",
    messageType: "ADT^A04",
    generateAfterQuery: () => {
      return `UPDATE patient_emergency_visit
SET    int_sent = :status
WHERE  er_visit_id = :generated_function_argument`;
    },
    query: `
  SELECT /*+ A04_ER */
       pev.er_visit_id AS er_visit_id
       ,pev.er_visit_id AS generated_function_argument
      ,pev.patient_id AS patient_id
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(pev.amend_last_date, 'YYYYMMDDHH24MISS') AS int_date
      ,pev.work_entity AS work_entity
      ,we.short_name AS work_entity_short_name
      ,pev.episode_no AS episode_no
      ,'E' AS attendance_type
      ,'E' || pev.er_visit_id AS visit_no
      ,pev.time_arrived AS trans_date
      ,TO_CHAR(NVL(pev.time_treatment_started, pev.time_arrived), 'YYYYMMDDHH24MISS') AS admit_date
FROM    patient_emergency_visit pev
       INNER JOIN er_pat_staff eps ON pev.er_visit_id = eps.er_visit_id
       INNER JOIN work_entities_data we ON pev.work_entity = we.work_entity
       LEFT OUTER JOIN deaths pd ON pd.patient_id = pev.patient_id
WHERE  1 =1 
       AND eps.end_time IS NULL
       AND pev.episode_no IS NOT NULL
       AND pev.int_sent IN ('N' , NVL(:p_int_sent, 'N')) 
       AND rownum <= :rownum_max
       AND pev.time_arrived >= :p_date 
      AND (:startDate IS NULL OR pev.time_arrived >= :startDate)
      AND (:endDate IS NULL OR pev.time_arrived <= :endDate)
      AND pev.episode_no = NVL(:p_episode_no, pev.episode_no)
      AND pev.patient_id = NVL(:p_patient_id, pev.patient_id)
  
    `,
   
  },

  // !! Not exist in app ( when cancel it marked as discharged )
  A11_ER: {
    label: "A11_ER",
    messageType: "ADT^A11",
    generateAfterQuery: () => {
      return `UPDATE patient_emergency_visit
SET    int_sent = :status
WHERE  er_visit_id = :generated_function_argument`;
    },
    query:`
    SELECT /*+ A11_ER */
      pev.er_visit_id AS er_visit_id
      ,pev.er_visit_id AS generated_function_argument
      ,pev.patient_id AS patient_id
      ,pev.time_arrived AS trans_date
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate      
      ,TO_CHAR(NVL(pev.time_treatment_started, pev.time_arrived), 'YYYYMMDDHH24MISS') AS admit_date
      ,pev.work_entity AS work_entity
      ,'' AS race
      ,pev.episode_no AS episode_no
      ,TO_CHAR(pev.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
      ,pfm.user_file_id AS user_file_id
      ,TO_CHAR(NVL(pev.time_complete, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date
      ,'E' AS attendance_type
      ,'E' || pev.er_visit_id AS visit_no
      ,we.short_name AS work_entity_short_name
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
FROM    patient_emergency_visit pev
       INNER JOIN work_entities_data we ON pev.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pev.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT OUTER JOIN deaths pd ON pd.patient_id = pev.patient_id
WHERE  1 = 1 
 AND pev.int_sent IN ('C' , NVL(:p_int_sent, 'C'))
 AND rownum <= :rownum_max
  AND pev.time_arrived >= :p_date
  AND pev.episode_no IS NOT NULL
  AND pev.episode_no = NVL(:p_episode_no, pev.episode_no)
  AND pev.patient_id = NVL(:p_patient_id, pev.patient_id)
  AND (:startDate IS NULL OR pev.time_arrived >= :startDate)
  AND (:endDate IS NULL OR pev.time_arrived <= :endDate)

    `,
    queryResend : function(newStatus = ''){
      if (!newStatus) return this.query;
      // return this.query.replace(`pev.int_sent = 'C'` , `pev.int_sent in ('C' , '${newStatus}') `)
       return this.query.replace(
        `pev.int_sent = 'C'`, 
        `(pev.int_sent IN ('C', '${newStatus}') OR pev.int_sent IS NULL)`
      );
    },
    getEpisodeCondition : (fieldName  )=>{
      return ` AND pev.episode_no = :${fieldName} `
    }
  },
  
  A11_IP: {
    label: "A11_IP",
    messageType: "ADT^A11",
    generateAfterQuery: () => {
      return `UPDATE patient_ad
SET    int_sent = :status
WHERE  admission_no = :generated_function_argument`;
    },
    query:`
    
    SELECT /*+ A11_IP */
       pa.admission_no AS admission_no
       ,pa.admission_no AS generated_function_argument
      ,pa.patient_id AS patient_id
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(pa.admit_date, 'YYYYMMDDHH24MISS') AS admit_date
      ,'' AS race
      ,pa.episode_no AS episode_no
      ,TO_CHAR(pa.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
      ,TO_CHAR(pa.physical_discharge_date, 'YYYYMMDDHH24MISS') AS discharge_date
      ,pfm.user_file_id AS user_file_id
      ,'I' || pa.admission_no AS visit_no
      ,'I' AS attendance_type
      ,pa.patient_admission_category AS admission_type
      ,pa.admit_date AS trans_date
      ,we.short_name AS work_entity_short_name
      ,we.work_entity AS work_entity      
      ,bd.room_no AS room_no
      ,bd.bed_location AS bed_location
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
FROM    patient_ad pa 
       INNER JOIN bed_details bd ON pa.admission_no = bd.admission_no
       INNER JOIN work_entities_data we ON bd.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pa.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT JOIN bed_slots_master bsm ON bsm.bed_location = bd.bed_location
              LEFT OUTER JOIN deaths pd ON pd.patient_id = pa.patient_id
WHERE  1=1
       AND bd.bed_detail_id = (
           SELECT MAX(bed_detail_id) 
           FROM bed_details 
           WHERE admission_no = pa.admission_no 
             AND current_record || '' = 'D'
       )
       AND pa.int_sent IN ('C' , NVL(:p_int_sent, 'C'))
       AND rownum <= :rownum_max
       AND pa.episode_no IS NOT NULL
       AND pa.admit_date >= :p_date
       AND (:startDate IS NULL OR pa.admit_date >= :startDate)
       AND (:endDate IS NULL OR pa.admit_date <= :endDate)
       AND pa.episode_no = NVL(:p_episode_no, pa.episode_no)
       AND pa.patient_id = NVL(:p_patient_id, pa.patient_id)

    `,
   
  },

  // !! Not exist in app (  only IP exist  )
  A13_ER: {
    label: "A13_ER",
    messageType: "ADT^A13",
    generateAfterQuery: () => {
      return `UPDATE patient_emergency_visit
SET    int_sent = :status
WHERE  er_visit_id = :generated_function_argument`;
    },
    query:`
   
    SELECT /*+ A13_ER */
       pev.er_visit_id AS er_visit_id
       ,pev.er_visit_id AS generated_function_argument
      ,pev.patient_id AS patient_id
      ,pev.time_arrived AS trans_date
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(NVL(pev.time_treatment_started, pev.time_arrived), 'YYYYMMDDHH24MISS') AS admit_date
      ,pev.work_entity AS work_entity
      ,'' AS race
      ,pev.episode_no AS episode_no
      ,TO_CHAR(pev.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
      ,pfm.user_file_id AS user_file_id
      ,TO_CHAR(NVL(pev.time_complete, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date
      ,'E' AS attendance_type
      ,'E' || pev.er_visit_id AS visit_no
      ,we.short_name AS work_entity_short_name
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
FROM   patient_emergency_visit pev 
       INNER JOIN er_pat_staff eps ON pev.er_visit_id = eps.er_visit_id
       INNER JOIN work_entities_data we ON pev.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pev.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT OUTER JOIN deaths pd ON pd.patient_id = pev.patient_id
WHERE  1=1
       AND eps.end_time IS NULL
       AND pev.int_sent IN ('R' , NVL(:p_int_sent, 'R'))
       AND pev.episode_no IS NOT NULL
       AND pev.episode_no = NVL(:p_episode_no, pev.episode_no)
       AND pev.patient_id = NVL(:p_patient_id, pev.patient_id)
       AND rownum <= :rownum_max
       AND pev.time_arrived >= :p_date
       AND (:startDate IS NULL OR pev.time_arrived >= :startDate)
      AND (:endDate IS NULL OR pev.time_arrived <= :endDate)
   
    `,
   
  },
  
  A13_IP: {
    label: "A13_IP",
    messageType: "ADT^A13",
    generateAfterQuery: () => {      
      return `UPDATE patient_ad
SET    int_sent = :status
WHERE   admission_no = :generated_function_argument`;
    },
    query:`
    
    
SELECT /*+ A13_IP */
       pa.admission_no AS admission_no
        ,pa.admission_no AS generated_function_argument
      ,pa.patient_id AS patient_id
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(pa.admit_date, 'YYYYMMDDHH24MISS') AS admit_date
      ,'' AS race
      ,pa.episode_no AS episode_no
      , pa.admit_date AS trans_date
      ,TO_CHAR(pa.amend_last_date, 'YYYYMMDDHH24MISS') AS rcm_date
      ,TO_CHAR(pa.physical_discharge_date, 'YYYYMMDDHH24MISS') AS discharge_date
      ,pfm.user_file_id AS user_file_id
      ,'I' AS attendance_type
      ,pa.patient_admission_category AS admission_type
      ,'I' || pa.admission_no AS visit_no
      ,we.short_name AS work_entity_short_name
      ,we.work_entity AS work_entity      
      ,rm.room_no AS room_no
      ,bd.bed_location AS bed_location
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
FROM  patient_ad pa 
       INNER JOIN bed_details bd ON pa.admission_no = bd.admission_no
       INNER JOIN work_entities_data we ON bd.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pa.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT JOIN bed_slots_master bsm ON bsm.bed_location = bd.bed_location
       LEFT JOIN room_master rm ON rm.room_no = bsm.room_no
       LEFT OUTER JOIN deaths pd ON pd.patient_id = pa.patient_id
WHERE  1=1
       AND bd.bed_detail_id = (
           SELECT MAX(bed_detail_id) 
           FROM bed_details 
           WHERE admission_no = pa.admission_no 
             AND current_record || '' = 'D'
       )
       AND pa.int_sent IN ('R' , NVL(:p_int_sent, 'R'))
       AND pa.episode_no = NVL(:p_episode_no, pa.episode_no)
       AND pa.patient_id = NVL(:p_patient_id, pa.patient_id)
       AND rownum <= :rownum_max
       AND pa.episode_no IS NOT NULL
       AND pa.admit_date >= :p_date
      AND (:startDate IS NULL OR pa.admit_date >= :startDate)  
      AND (:endDate IS NULL OR pa.admit_date <= :endDate)
    
    `,
    
  },
  
  A13_OPD: {
    label: "A13_OPD",
    messageType: "ADT^A13",
    generateAfterQuery: () => {
      return `UPDATE appointments
SET    int_sent = :status
WHERE  appointment_id = :generated_function_argument`;
    },
    query:`
    SELECT /*+ A13_OPD */
       a.appointment_id AS appointment_id
        ,a.appointment_id AS generated_function_argument
      ,a.patient_id AS patient_id
      ,a.start_date AS trans_date
      ,TO_CHAR(SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate
      ,TO_CHAR(NVL(start_date, TO_DATE(a.julian_date, 'J')), 'YYYYMMDDHH24MISS') AS admit_date
      ,a.work_entity AS work_entity
      ,'' AS race
      ,a.episode_no AS episode_no
      ,TO_CHAR(a.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
      ,pfm.user_file_id AS user_file_id
      ,TO_CHAR(NVL(a.end_date, SYSDATE), 'YYYYMMDDHH24MISS') AS discharge_date
      ,'O' AS attendance_type
      ,'O' || a.appointment_id AS visit_no 
      ,we.short_name AS work_entity_short_name
      ,TO_CHAR(pd.when_died, 'YYYYMMDDHH24MISS') AS death_date
      ,DECODE(pd.when_died, NULL, 'N', 'Y') AS death_flag
FROM   appointments a 
       INNER JOIN work_entities_data we ON a.work_entity = we.work_entity
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = a.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
       LEFT OUTER JOIN deaths pd ON pd.patient_id = a.patient_id
WHERE  1=1
       AND a.int_sent IN ('R' , NVL(:p_int_sent, 'R'))
       AND a.episode_no = NVL(:p_episode_no, a.episode_no)
       AND a.patient_id = NVL(:p_patient_id, a.patient_id)
       and rownum <= :rownum_max
       AND a.start_date >= :p_date
       AND a.episode_no IS NOT NULL
       AND (:startDate IS NULL OR a.start_date >= :startDate)
      AND (:endDate IS NULL OR a.start_date <= :endDate)

    `,
   
  },
};



export const HL7_PROCESSORS = {
  A04: {
    label: "A04",
    messageType: "ADT^A04",
    query: `SELECT 
              pmd.*, 
              p_id.* 
            FROM patient_master_data pmd 
            INNER JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pmd.CREATION_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pmd.CREATION_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
            ORDER BY pmd.CREATION_DATE`,
  },
  A08: {
    label: "A08",
    messageType: "ADT^A08",
    query: `SELECT 
              pmd.*, 
              p_id.* 
            FROM patient_master_data pmd 
            INNER JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pmd.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pmd.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
            ORDER BY pmd.AMEND_LAST_DATE`,
  },
  A01: {
    label: "A01",
    messageType: "ADT^A01",
    query: `SELECT 
              pe.*,
              pmd.*,
              p_id.*
            FROM patient_episodes pe
            JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
            JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID
            WHERE pe.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
              AND pe.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A03: {
    label: "A03",
    messageType: "ADT^A03",
    query: `SELECT 
              pe.*, 
              pmd.*, 
              p_id.* 
            FROM patient_episodes pe 
            JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID 
            JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID 
            WHERE pe.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
              AND pe.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A011: {
    label: "A011",
    messageType: "ADT^A011",
    query: `SELECT
        pe.episode_no visit_no ,
        pg.ATTENDANCE_TYPE ,
        pe.start_date,
        pg.ELIGIBILITY_STATUS ,
        pg.*,
        pmd.*
  FROM patient_episodes pe
  JOIN OASIS.PATIENT_ELIGIBILITY pg ON
      pg.patient_id = pe.patient_id
      AND pg.EPISODE_NO = pe.EPISODE_NO
  JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
  WHERE
      pg.ELIGIBILITY_STATUS = 'C'
      AND pg.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
      AND pg.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  A013: {
    label: "A013",
    messageType: "ADT^A013",
    query: `SELECT
        pe.episode_no visit_no ,
        pg.ATTENDANCE_TYPE ,
        pe.start_date,
        pg.ELIGIBILITY_STATUS ,
        pg.*,
        pmd.*
  FROM patient_episodes pe
  JOIN OASIS.PATIENT_ELIGIBILITY pg ON
      pg.patient_id = pe.patient_id
      AND pg.EPISODE_NO = pe.EPISODE_NO
  JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
  WHERE
      pg.ELIGIBILITY_STATUS = 'C'
      AND pg.AMEND_LAST_DATE >=  TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
      AND pg.AMEND_LAST_DATE <=  TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')`,
  },
  // !!!!!!! start ordering msgs
  O01: {
    label: "O01",
    messageType: "ORM^O01",

    query: `SELECT 
    om.status as OM_STATUS,
    patient_id,
    episode_no,
    ol.*,
    TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,
    om.MASTER_ORDER_NO,
    om.SERVICE_DEPT,
    om.ADMISSION_NO,
    im.IOS_MAIN
FROM OASIS.ORDERS_MASTER om
JOIN OASIS.ORDER_LINES ol ON ol.MASTER_ORDER_NO = om.MASTER_ORDER_NO
JOIN IOS_MASTER im ON im.IOS = ol.IOS
LEFT JOIN ios_master_data ims ON ims.ios = ol.ios
LEFT JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
WHERE     ol.AMEND_LAST_DATE >= TO_DATE (:startDate, 'YYYY-MM-DD"T"HH24:MI:SS')
       AND ol.AMEND_LAST_DATE <= TO_DATE (:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
       AND imn.service_type != 'MED'
  `,
  },
  O11: {
    label: "O11",
    messageType: "RDE^O11",

    query: ` 
    SELECT /*+all_rows*/
    patient_id,
    ol.*,
    TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,

    om.master_order_no,
    om.service_dept,
    om.admission_no,
    om.EPISODE_NO,
    ol.order_line as order_line_id,
    ROW_NUMBER() OVER (PARTITION BY om.patient_id, om.episode_no ORDER BY ol.order_line) as item_no,
    ROUND((NVL(ol.units_ordered, 0) * NVL(d.no_of_days, 0)) / NULLIF(d.times, 0), 2) as supply_period,
    ol.status,
    ROUND(d.admin_qty, 6) as unit,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as unit_type_raw,
    d.times as dosage_times,
    dc.description as per,
    dc.description as dosage,
    imn.scientific_code as prescribed_code,
    CASE 
        WHEN imn.drug_dispensing_type = 'B' THEN 'PAT_REQ'
        ELSE 'GENERIC'
    END as selection_reason_raw,
    COALESCE(ol.reason_for_ios, 'Standard dosage') as dosage_institution_text,
    d.dosage_start_datetime as repeat_start,
    dc.description as patient_instruction,
    d.dosage_start_datetime + d.no_of_days as repeat_end,
    REPLACE(TO_CHAR(d.no_of_days), ',', '.') as duration_value,
    'd' as duration_unit,
    d.no_of_periods as frequency,
    d.no_of_days as dosage_period,
    'd' as period_unit,
    d.admin_qty as dose_rate_value,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as dose_rate_code,
    d.route as route_raw,
    (SELECT m.strength || LOWER(m.measure) 
     FROM ph_ios_medicine m 
     WHERE m.ios_main = imn.ios_main 
       AND ROWNUM = 1) as strength,
    om.patient_id,
    om.episode_no,
    om.status AS OM_STATUS,
    imn.drug_dispensing_type,
    imn.sales_uom_code,
    ims.IOS_MAIN
FROM orders_master om
JOIN order_lines ol ON om.master_order_no = ol.master_order_no
JOIN ios_master_data ims ON ol.ios = ims.ios
JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
JOIN ph_dosage_master d ON ol.order_line = d.order_line
JOIN dosage_codes dc ON d.dosage_code = dc.dosage_code
WHERE ol.status NOT IN ('D', 'C', 'P', 'Q')
    --AND imn.service_type = 'MED'
    --AND imn.scientific_code IS NOT NULL
    AND ol.AMEND_LAST_DATE BETWEEN TO_DATE(:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') 
                    AND TO_DATE(:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
    --AND om.patient_id = NVL(:p_patient_id, om.patient_id)
    --AND om.episode_no = NVL(:p_episode_no, om.episode_no)
ORDER BY om.patient_id, om.episode_no, ol.order_line
    
    
    
    `,
  },
  R01: {
    label: "R01",
    messageType: "ORU^R01",

    query: `
SELECT /*+all_rows*/ DISTINCT 
  ol.ORDER_LINE,
  om.MASTER_ORDER_NO,
  ol.IOS,
   ol.line_order_date,
  ol.STATUS,
  ol.URGENT_FLAG,
  ol.CREATION_DATE,
  ol.PACS_ORDER_STARTED_DATE,
  ol.PACS_ORDER_COMPLETED_DATE,
  ol.CONSULTANT_ID,
  ol.ORDER_BY_TYPE,
  ol.STAFF_ID,
  ol.DOSAGE_CODE,
  ol.REASON_FOR_IOS,
    ol.UNITS_ORDERED,
  om.SERVICE_DEPT,
  om.ADMISSION_NO,
  ol.LINE_EXPIRY_DATE,
  ol.FILLER_ORDER_MASTER,
  ol.OF_ORDER_NO,
  om.MASTER_ORDER_NO,
  om.STATUS AS OM_STATUS,
--  om.ORDER_DATE,
  TO_CHAR(ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,
  om.CONSULTANT_RELATED,
  om.ATTENDANCE_TYPE,
  om.ADMISSION_NO,
  om.HL7_VISIT_NO,
  om.ORDERER_STAFF_ID,
  om.EPISODE_NO,
  lt.MACHINE_NO,
  lt.HOSPITAL_ID,
   iol.IOS_MAIN,
   --iol.DESCRIPTION AS OBSERVATION_TEXT,
   --lr.LINE_TEXT AS OBSERVATION_TEXT,
   --lr.RESULT_NUM,
NVL(TO_CHAR(lr.RESULT_NUM), lr.LINE_TEXT) AS RESULT_NUM,
  --iol.BRAND_GENERIC_ID,
  iol.PRODUCT_CODE,
  ld.LAB_ID,
  ld.LAB_DEPT_NO,
  ld.STAFF_ID,
  ld.RELEASE_FLAG,
  ld.HOSPITAL_ID,
    lm.LAB_ID,
  lm.PATIENT_ID,
  lm.LAB_DATE,
  lm.HOSPITAL_ID,
  lr.RESULT_CODE,
  lr.START_NUMERIC_VALUE,
  lr.END_NUMERIC_VALUE,
  lr.HOSPITAL_ID,
  lr.LAB_RESULT AS HIS_LAB_ID, 
  om.status AS om_status,
  ilr.description AS OBSERVATION_TEXT,
  ilr.ios_main AS OBSERVATION_ID,
  ROWNUM "OBX1_set_id",
  CASE WHEN lr.result_num IS NOT NULL THEN 'NM' ELSE 'ST' END  AS VALUE_TYPE,
        u.description AS UNIT,
        c.description conclusion
FROM lab_test lt
        JOIN lab_department ld ON ld.lab_id = lt.lab_id
        JOIN lab_master lm ON lm.lab_id = lt.lab_id
        JOIN lab_results lr ON lr.order_line = lt.order_line
        JOIN order_lines ol ON ol.order_line = lt.order_line
        JOIN orders_master om ON ol.master_order_no = om.master_order_no
        JOIN ios_master iol ON iol.ios = ol.ios
        JOIN ios_master ilr ON ilr.ios = lr.ios
        JOIN lab_ios li ON li.ios = lr.ios
        LEFT OUTER JOIN codes_data u ON u.code_type = 409 AND li.unit_of_measure = u.code
        LEFT OUTER JOIN codes_data c ON c.code_type = 10048 AND lr.conclusion = c.code
 WHERE     lt.status = 'F'
       AND NVL (ld.release_flag, 'N') = 'Y'
       AND lm.lab_date BETWEEN TO_DATE (:startDate, 'YYYY-MM-DD"T"HH24:MI:SS') AND TO_DATE (:endDate, 'YYYY-MM-DD"T"HH24:MI:SS')
    `,
  },
};
const HL7_PROCESSORS_SPECIFIC_PATIENT = {
  A04: {
    label: "A04",
    messageType: "ADT^A04",
    query: ` SELECT pmd.*, p_id.*
    FROM patient_master_data pmd
    JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID
    WHERE pmd.PATIENT_ID = :patientId`,
  },
  A08: {
    label: "A08",
    messageType: "ADT^A08",
    query: `
    SELECT pmd.*, p_id.*
    FROM patient_master_data pmd
    JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID
    WHERE pmd.PATIENT_ID = :patientId
    `,
  },
  A01: {
    label: "A01",
    messageType: "ADT^A01",
    query: `SELECT pe.*, pmd.*, p_id.*
    FROM patient_episodes pe
    JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
    JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID
    WHERE pe.PATIENT_ID = :patientId
      AND pe.EPISODE_NO = NVL(:episodeNo, pe.EPISODE_NO)`,
  },
  A03: {
    label: "A03",
    messageType: "ADT^A03",
    query: ` SELECT pe.*, pmd.*, p_id.*
    FROM patient_episodes pe
    JOIN patient_master_data pm.*
    FROM patient_master_data pmd
    JOIN patient_ids p_id ON pmd.PATIENT_ID = p_id.PATIENT_ID
    WHERE pmd.PATIENT_ID = :patd ON pe.PATIENT_ID = pmd.PATIENT_ID
    JOIN patient_ids p_id ON pe.PATIENT_ID = p_id.PATIENT_ID
    WHERE pe.PATIENT_ID = :patientId
      AND pe.EPISODE_NO = NVL(:episodeNo, pe.EPISODE_NO)`,
  },
  A011: {
    label: "A011",
    messageType: "ADT^A011",
    query: `SELECT
      pe.episode_no AS visit_no,
      pg.ATTENDANCE_TYPE,
      pe.start_date,
      pg.ELIGIBILITY_STATUS,
      pg.*,
      pmd.*
    FROM patient_episodes pe
    JOIN OASIS.PATIENT_ELIGIBILITY pg
      ON pg.patient_id = pe.patient_id
     AND pg.EPISODE_NO = pe.EPISODE_NO
    JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
    WHERE pg.patient_id = :patientId
      AND pg.EPISODE_NO = NVL(:episodeNo, pg.EPISODE_NO)
      AND pg.ELIGIBILITY_STATUS = 'C'`,
  },
  A013: {
    label: "A013",
    messageType: "ADT^A013",
    query: `SELECT
      pe.episode_no AS visit_no,
      pg.ATTENDANCE_TYPE,
      pe.start_date,
      pg.ELIGIBILITY_STATUS,
      pg.*,
      pmd.*
    FROM patient_episodes pe
    JOIN OASIS.PATIENT_ELIGIBILITY pg
      ON pg.patient_id = pe.patient_id
     AND pg.EPISODE_NO = pe.EPISODE_NO
    JOIN patient_master_data pmd ON pe.PATIENT_ID = pmd.PATIENT_ID
    WHERE pg.patient_id = :patientId
      AND pg.EPISODE_NO = NVL(:episodeNo, pg.EPISODE_NO)
      AND pg.ELIGIBILITY_STATUS = 'C'`,
  },
  // !!!!!!! start ordering msgs
  O01: {
    label: "O01",
    messageType: "ORM^O01",

    query: ` SELECT
      om.status AS OM_STATUS,
      om.patient_id,
      om.episode_no,
      ol.*,
      TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,
      om.MASTER_ORDER_NO,
      om.SERVICE_DEPT,
      om.ADMISSION_NO,
      im.IOS_MAIN
    FROM OASIS.ORDERS_MASTER om
    JOIN OASIS.ORDER_LINES ol ON ol.MASTER_ORDER_NO = om.MASTER_ORDER_NO
    JOIN IOS_MASTER im ON im.IOS = ol.IOS
    LEFT JOIN ios_master_data ims ON ims.ios = ol.ios
    LEFT JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
    WHERE om.patient_id = :patientId
      AND om.episode_no = NVL(:episodeNo, om.episode_no)
      AND imn.service_type != 'MED'
  `,
  },
  O11: {
    label: "O11",
    messageType: "RDE^O11",
    query: ` 
    SELECT /*+all_rows*/
    patient_id,
    ol.*,
    TO_CHAR(om.ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,
    om.master_order_no,
    om.service_dept,
    om.admission_no,
    om.EPISODE_NO,
    ol.order_line as order_line_id,
    ROW_NUMBER() OVER (PARTITION BY om.patient_id, om.episode_no ORDER BY ol.order_line) as item_no,
    ROUND((NVL(ol.units_ordered, 0) * NVL(d.no_of_days, 0)) / NULLIF(d.times, 0), 2) as supply_period,
    ol.status,
    ROUND(d.admin_qty, 6) as unit,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as unit_type_raw,
    d.times as dosage_times,
    dc.description as per,
    dc.description as dosage,
    imn.scientific_code as prescribed_code,
    CASE 
        WHEN imn.drug_dispensing_type = 'B' THEN 'PAT_REQ'
        ELSE 'GENERIC'
    END as selection_reason_raw,
    COALESCE(ol.reason_for_ios, 'Standard dosage') as dosage_institution_text,
    d.dosage_start_datetime as repeat_start,
    dc.description as patient_instruction,
    d.dosage_start_datetime + d.no_of_days as repeat_end,
    REPLACE(TO_CHAR(d.no_of_days), ',', '.') as duration_value,
    'd' as duration_unit,
    d.no_of_periods as frequency,
    d.no_of_days as dosage_period,
    'd' as period_unit,
    d.admin_qty as dose_rate_value,
    CASE 
        WHEN d.admin_type = 'M' THEN 'ML'
        WHEN d.admin_type = 'D' THEN 'DROPS'
        WHEN d.admin_type = 'U' THEN imn.sales_uom_code
        ELSE d.admin_type
    END as dose_rate_code,
    d.route as route_raw,
    (SELECT m.strength || LOWER(m.measure) 
     FROM ph_ios_medicine m 
     WHERE m.ios_main = imn.ios_main 
       AND ROWNUM = 1) as strength,
    om.patient_id,
    om.episode_no,
    om.status AS OM_STATUS,
    imn.drug_dispensing_type,
    imn.sales_uom_code,
    ims.IOS_MAIN
FROM orders_master om
JOIN order_lines ol ON om.master_order_no = ol.master_order_no
JOIN ios_master_data ims ON ol.ios = ims.ios
JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
JOIN ph_dosage_master d ON ol.order_line = d.order_line
JOIN dosage_codes dc ON d.dosage_code = dc.dosage_code
WHERE ol.status NOT IN ('D', 'C', 'P', 'Q')
    --AND imn.service_type = 'MED'
    --AND imn.scientific_code IS NOT NULL
    AND om.patient_id = :patientId
    AND om.episode_no = NVL(:episodeNo, om.episode_no)
ORDER BY om.patient_id, om.episode_no, ol.order_line
    
    
    
    `,
  },
  R01: {
    label: "R01",
    messageType: "ORU^R01",

    query: `
SELECT /*+all_rows*/ DISTINCT 
  ol.ORDER_LINE,
  om.MASTER_ORDER_NO,
  ol.IOS,
   ol.line_order_date,
  ol.STATUS,
  ol.URGENT_FLAG,
  ol.CREATION_DATE,
  ol.PACS_ORDER_STARTED_DATE,
  ol.PACS_ORDER_COMPLETED_DATE,
  ol.CONSULTANT_ID,
  ol.ORDER_BY_TYPE,
  ol.STAFF_ID,
  ol.DOSAGE_CODE,
  ol.REASON_FOR_IOS,
    ol.UNITS_ORDERED,
  om.SERVICE_DEPT,
  om.ADMISSION_NO,
  ol.LINE_EXPIRY_DATE,
  ol.FILLER_ORDER_MASTER,
  ol.OF_ORDER_NO,
  om.MASTER_ORDER_NO,
  om.STATUS AS OM_STATUS,
--  om.ORDER_DATE,
  TO_CHAR(ORDER_DATE, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ORDER_DATE,

  om.CONSULTANT_RELATED,
  om.ATTENDANCE_TYPE,
  om.ADMISSION_NO,
  om.HL7_VISIT_NO,
  om.ORDERER_STAFF_ID,
  om.EPISODE_NO,
  
    lt.MACHINE_NO,
  lt.HOSPITAL_ID,
   iol.IOS_MAIN,
   --iol.DESCRIPTION AS OBSERVATION_TEXT,
   --lr.LINE_TEXT AS OBSERVATION_TEXT,
   --lr.RESULT_NUM,
NVL(TO_CHAR(lr.RESULT_NUM), lr.LINE_TEXT) AS RESULT_NUM,
  --iol.BRAND_GENERIC_ID,
  iol.PRODUCT_CODE,
  ld.LAB_ID,
  ld.LAB_DEPT_NO,
  ld.STAFF_ID,
  ld.RELEASE_FLAG,
  ld.HOSPITAL_ID,
    lm.LAB_ID,
  lm.PATIENT_ID,
  lm.LAB_DATE,
  lm.HOSPITAL_ID,
  lr.RESULT_CODE,
  lr.START_NUMERIC_VALUE,
  lr.END_NUMERIC_VALUE,
  lr.HOSPITAL_ID,
  lr.LAB_RESULT AS HIS_LAB_ID, 
  om.status AS om_status,
  ilr.description AS OBSERVATION_TEXT,
  ilr.ios_main AS OBSERVATION_ID,
  ROWNUM "OBX1_set_id",
  CASE WHEN lr.result_num IS NOT NULL THEN 'NM' ELSE 'ST' END  AS VALUE_TYPE,
        u.description AS UNIT,
        c.description conclusion
FROM lab_test lt
        JOIN lab_department ld ON ld.lab_id = lt.lab_id
        JOIN lab_master lm ON lm.lab_id = lt.lab_id
        JOIN lab_results lr ON lr.order_line = lt.order_line
        JOIN order_lines ol ON ol.order_line = lt.order_line
        JOIN orders_master om ON ol.master_order_no = om.master_order_no
        JOIN ios_master iol ON iol.ios = ol.ios
        JOIN ios_master ilr ON ilr.ios = lr.ios

        JOIN lab_ios li ON li.ios = lr.ios
         LEFT OUTER JOIN codes_data u ON u.code_type = 409 AND li.unit_of_measure = u.code
         LEFT OUTER JOIN codes_data c ON c.code_type = 10048 AND lr.conclusion = c.code

 WHERE     lt.status = 'F'
       AND NVL (ld.release_flag, 'N') = 'Y'
 AND lm.patient_id = :patientId
  AND om.episode_no = NVL(:episodeNo, om.episode_no)
       `,
  },
};
