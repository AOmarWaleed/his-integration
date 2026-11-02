/* Formatted on 5/5/2026 3:20:32 PM (QP5 v5.227.12220.39754) */
SELECT
     /*+ USE_NL(om ol lt lm lis) LabOrder */
     ol.amend_last_date as trans_date,
     lm.lab_id AS lab_id,
     lm.patient_id AS patient_id,
     lm.lab_id_seq AS sample_id,
     lt.status AS lab_status,
     TO_CHAR (lm.lab_date, 'YYYYMMDDHH24MISS') AS sample_date,
     CASE
          lt.status
          WHEN 'C' THEN 'DC'
          WHEN 'P' THEN 'IP'
          WHEN 'F' THEN 'CM'
          ELSE lt.status
     END AS sample_status,
     lt.order_line AS order_line,
     lt.order_line AS value_to_update_status,
     lt.lab_dept_no AS dept_no,
     om.attendance_type AS attendance_type,
     CASE
          om.attendance_type
          WHEN 'I' THEN 'Inpatient'
          WHEN 'D' THEN 'Day case'
          WHEN 'O' THEN 'Outpatient'
          WHEN 'E' THEN 'Emergency'
     END AS attendance_type_desc,
     om.episode_no AS episode_no,
     om.hl7_encounter AS visit_no,
     ol.ios AS ios,
     om.service_dept AS service_dept,
     ol.master_order_no AS master_order_no,
     TO_CHAR (ol.amend_last_date, 'YYYYMMDDHH24MISS') AS order_date,
     ol.order_work_entity AS order_work_entity,
     om.status AS order_status,
     ol.urgent_flag AS urgent_flag,
     om.orderer_staff_id AS orderer_staff_id,
     lis.specimen_code AS specimen_code,
     lm.lab_date AS specimen_collection_time,
     lis.short_name AS specimen_short_name,
     lis.chart_description AS specimen_description,
     OL.LINE_ORDER_DATE creation_date
FROM
     orders_master om
     JOIN order_lines ol ON om.master_order_no = ol.master_order_no
     JOIN lab_master lm ON om.patient_id = lm.patient_id
     JOIN lab_test lt ON lt.lab_id = lm.lab_id
     AND lt.order_line = ol.order_line
     JOIN lab_ios lis ON lis.ios = ol.ios --join staff_master_data sm on SM.STAFF_ID = OM.ORDERER_STAFF_ID
WHERE
     ol.status <> 'V'
     AND NVL (ol.of_order_source, 'X') <> 'AYENATI'
     AND lt.status IN ('D', 'O')
     AND lt.int_sent IN ('N', :p_status)
     AND om.patient_id = NVL (:p_patient_id, om.patient_id)
     AND om.episode_no = NVL (:p_episode_no, om.episode_no)
     AND ol.order_line = NVL (:p_order_line, ol.order_line)
     AND om.order_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY')
     AND (
          :p_start_date IS NULL
          OR om.order_date >= TO_TIMESTAMP (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR om.order_date <= TO_TIMESTAMP (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )