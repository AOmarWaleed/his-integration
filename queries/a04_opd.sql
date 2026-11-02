/* Formatted on 2/9/2026 4:27:46 PM (QP5 v5.227.12220.39754) */
SELECT a.appointment_id AS appointment_id,
       a.patient_id AS patient_id,
       a.ROWID,
       A.INT_SENT,
       pmd.healthid,
       pfm.user_file_id AS user_file_id,
       pmd.pat_name_1 AS pat_name_1,
       pmd.pat_name_2 AS pat_name_others,
       pmd.pat_name_family AS pat_name_family,
       pmd.pat_name_3 AS pat_name_suffix,
       cpat.description AS pat_name_prefix,
       TO_CHAR (pmd.date_of_birth, 'YYYYMMDD') AS DOB,
       pmd.scnd_pat_name_1 AS pat_name_1_a,
       pmd.scnd_pat_name_2 AS pat_name_others_a,
       pmd.scnd_pat_name_3 AS pat_name_suffix_a,
       pmd.scnd_pat_name_family AS pat_name_family_a,
          pmd.scnd_pat_name_1
       || DECODE (pmd.scnd_pat_name_2, NULL, '', ' ')
       || pmd.scnd_pat_name_2
       || DECODE (pmd.scnd_pat_name_3, NULL, '', ' ')
       || pmd.scnd_pat_name_3
       || DECODE (pmd.scnd_pat_name_family, NULL, '', ' ')
       || pmd.scnd_pat_name_family
          AS pat_name_ar,
       DECODE (pmd.sex,  'U', 'O',  NULL, 'O',  pmd.sex) AS sex,
       pmd.mothers_name_1 AS mother_name,
       mrtl.user_code AS marital_status,
       rlgn.user_code AS religion_code,
       '' AS race,
       pmd.phone_1 AS business_phone,
       pmd.phone_2 AS home_phone,
       ocptn.user_code AS occupation_code,
       pmd.patient_category AS patient_category,
       pmd.registration_type AS registration_type,
       TO_CHAR (pd.when_died, 'YYYYMMDDHH24MISS') AS death_date,
       DECODE (pd.when_died, NULL, 'N', 'Y') AS death_flag,
       TO_CHAR (SYSDATE, 'YYYYMMDDHH24MISS') AS currentdate,
       nat.user_code AS nationality_code,
       a.consultant AS consultant_id,
       sm.staff_name_1 AS consultant_name_1,
       sm.staff_name_2 AS consultant_name_others,
       sm.staff_name_3 AS consultant_name_suffix,
       cstf.description AS consultant_name_prefix,
       sm.staff_name_family AS consultant_name_family,
       a.work_entity AS work_entity,
       we.short_name AS work_entity_short_name,
       a.episode_no AS episode_no,
       'O' AS attendance_type,
       'O' || a.appointment_id AS visit_no,
       TO_CHAR (NVL (start_date, TO_DATE (a.julian_date, 'J')), 'YYYYMMDDHH24MISS') AS admit_date,
       message_id.NEXTVAL AS message_control_id,
       TO_CHAR (a.amend_last_date, 'YYYYMMDDHH24MISS') AS trx_date
  FROM patient_master_data pmd
       INNER JOIN appointments a ON pmd.patient_id = a.patient_id
       INNER JOIN staff_master sm ON a.consultant = sm.staff_id
       INNER JOIN work_entities_data we ON a.work_entity = we.work_entity
       LEFT JOIN codes_data cpat ON cpat.code = pmd.title
       LEFT JOIN codes_data cstf ON cstf.code = sm.title
       LEFT JOIN codes_data nat ON nat.code = pmd.nationality_code
       LEFT JOIN codes_data rlgn ON rlgn.code = pmd.religion_code
       LEFT JOIN codes_data mrtl ON mrtl.code = pmd.marital_code
       LEFT JOIN codes_data ocptn ON ocptn.code = pmd.occupation_code
       LEFT JOIN deaths pd ON pd.patient_id = pmd.patient_id
       LEFT JOIN patient_file_master pfm ON pfm.patient_id = pmd.patient_id AND pfm.med_rec_type = 1113 AND pfm.volume_id = 1
 WHERE pmd.healthid IS NOT NULL AND a.int_sent = 'N'