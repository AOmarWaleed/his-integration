/* Formatted on 5/11/2026 10:53:18 AM (QP5 v5.227.12220.39754) */
SELECT
     ol.order_line,
     ol.line_order_date as trans_date,
     ol.line_order_date,
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
     om.master_order_no,
     om.hl7_encounter AS visit_no,
     TO_CHAR (SYSDATE, 'YYYYMMDDHH24MISS') || '+0300' AS current_date_time,
     TO_CHAR (ol.line_order_date, 'YYYYMMDDHH24MISS') || '+0300' AS formatted_order_date,
     xr.report_id,
     xr.report_id as value_to_update_status,
     xr.actual_report_text,
     xr.interesting_case_flag,
     xr.wrote_staff_id radiologiest_staff_id,
     xr.transcriptionist_id,
     xr.patient_id,
     xr.verified_staff_id,
     xr.wrote_datetime as CREATION_DATE,
     xi.modality_id modality
FROM
     order_lines ol
     JOIN ios_master im ON ol.ios = im.ios
     JOIN service_dept d ON d.service_dept = im.service_dept
     JOIN orders_master om ON om.master_order_no = ol.master_order_no
     JOIN xy_attendance_ios_details xd ON xd.order_line = ol.order_line
     JOIN xy_ios xi ON xi.ios_main = im.ios_main
     JOIN xy_modalities xm ON xm.modality_id = xi.modality_id
     JOIN xy_reports xr ON xr.report_id = xd.report_id
WHERE
     d.dept_type = 'XRY'
     AND ol.status = 'D'
     AND om.order_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY')
     AND (
          :p_patient_id IS NULL
          OR om.patient_id = :p_patient_id
     )
     AND (
          :p_episode_no IS NULL
          OR om.episode_no = :p_episode_no
     )
     AND ol.order_line = NVL (:p_order_line, ol.order_line)
     AND (
          :p_start_date IS NULL
          OR om.order_date >= TO_DATE (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR om.order_date <= TO_DATE (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND ol.nphies_cs_sent = 'S'
      AND (
          (:p_status is null and  xr.nphies_cs_sent IS NULL)
          OR ( xr.nphies_cs_sent = :p_status)
     )