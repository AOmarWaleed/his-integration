SELECT
     /*+MED_PRESCRIPTION*/
     DISTINCT om.master_order_no master_no,
     om.order_date req_creation_date,
     om.order_date AS trans_date,
     om.patient_id,
     om.episode_no,
     om.orderer_staff_id,
     om.attendance_type encounter_type,
     DECODE (
          om.attendance_type,
          'I',
          'Inpatient',
          'O',
          'Outpatient',
          'E',
          'Emergency',
          'D',
          'Daycase'
     ) encounter_type_desc,
     om.hl7_encounter encounter_identifier,
     pe.start_date,
     pe.end_date,
     om.patient_diagnosis_id
FROM
     orders_master om
     JOIN order_lines ol ON om.master_order_no = ol.master_order_no
     JOIN ios_master_data ims ON ims.ios = ol.ios
     JOIN ph_ios_medicine m ON m.ios_main = ims.ios_main
     JOIN patient_episodes pe ON pe.patient_id = om.patient_id
     AND pe.episode_no = om.episode_no
WHERE
     1 = 1
     AND ol.line_order_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY')
     AND INSTR (
          :p_pharmacy_category,
          ',' || IMS.PRODUCT_CATEGORY_CODE || ','
     ) > 0
     AND om.patient_id = NVL (:p_patient_id, om.patient_id)
     AND om.episode_no = NVL (:p_episode_no, om.episode_no)
     AND ol.order_line = NVL (:p_order_line, ol.order_line)
     AND (
          :p_start_date IS NULL
          OR ol.line_order_date >= TO_TIMESTAMP (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR ol.line_order_date <= TO_TIMESTAMP (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          (ol.nphies_cs_sent = :p_status)
          OR (
               :p_status IS NULL
               AND (
                    (
                         ol.nphies_cs_sent IS NULL
                         AND ol.status NOT IN ('P', 'Q', 'C')
                    )
                    OR (
                         ol.status = 'C'
                         AND ol.nphies_cs_sent IN ('S', 'DS')
                    ) --OR (ol.status = 'D' AND NVL (ol.nphies_cs_sent, 'S') = 'S')
               )
          )
     ) --S => Sent , CS Cancel Sent , DS => Completed Sent
ORDER BY
     om.master_order_no