/* Formatted on 5/6/2026 4:01:00 PM (QP5 v5.227.12220.39754) */
SELECT
     ol.order_line,
     ol.order_line as value_to_update_status,
     ol.line_order_date,
     ol.line_order_date as trans_date,
     im.description,
     im.ios_user,
     im.ios,
     om.patient_id,
     om.episode_no,
     pat.get_patient_file_id (om.patient_id) AS mrn,
     om.orderer_staff_id,
     om.attendance_type,
     CASE
          om.attendance_type
          WHEN 'I' THEN 'Inpatient'
          WHEN 'D' THEN 'Day case'
          WHEN 'O' THEN 'Outpatient'
          WHEN 'E' THEN 'Emergency'
     END AS attendance_type_desc,
     om.hospital_id,
     om.hl7_encounter AS visit_no,
     om.master_order_no,
     TO_CHAR (SYSDATE, 'YYYYMMDDHH24MISS') || '+0300' AS current_date_time,
     TO_CHAR (ol.line_order_date, 'YYYYMMDDHH24MISS') || '+0300' AS formatted_order_date,
     xi.modality_id modality,
     OL.LINE_ORDER_DATE creation_date
FROM
     order_lines ol
     JOIN ios_master im ON ol.ios = im.ios
     JOIN service_dept d ON d.service_dept = im.service_dept
     JOIN orders_master om ON om.master_order_no = ol.master_order_no
     JOIN xy_ios xi ON xi.ios_main = im.ios_main --JOIN xy_modalities xm ON xm.modality_id = xi.modality_id
WHERE
     d.dept_type = 'XRY'
     AND ol.status = 'D'
     AND (
          :p_patient_id IS NULL
          OR om.patient_id = :p_patient_id
     )
     AND (
          :p_episode_no IS NULL
          OR om.episode_no = :p_episode_no
     )
     AND ol.order_line = NVL (:p_order_line, ol.order_line)
     AND om.order_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY')
     AND (
          :p_start_date IS NULL
          OR om.order_date >= TO_DATE (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR om.order_date <= TO_DATE (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          (:p_status is null and ol.nphies_cs_sent IS NULL)
          OR (ol.nphies_cs_sent = :p_status)
     )