/* Formatted on 4/20/2026 8:44:07 PM (QP5 v5.227.12220.39754) */
SELECT DISTINCT om.patient_id,
                om.attendance_type,
                DECODE (om.attendance_type,  'I', 'Inpatient',  'D', 'Day case',  'O', 'Outpatient',  'E', 'Emergency') AS attendance_type_desc,
                om.episode_no,
                om.hl7_encounter AS visit_no,
                om.service_dept,
                TO_CHAR (om.order_date, 'YYYYMMDDHH24MISS') AS order_date,
                om.status AS order_status,
                om.orderer_staff_id,
                om.master_order_no
  FROM orders_master om
       JOIN order_lines ol ON om.master_order_no = ol.master_order_no
       JOIN lab_master lm ON om.patient_id = lm.patient_id
       JOIN lab_test lt
          ON     lt.lab_id = lm.lab_id
             AND lt.order_line = ol.order_line
 WHERE     ol.status <> 'V'
       AND NVL (ol.of_order_source, 'X') <> 'AYENATI'
       AND lt.status IN ('D', 'O')
       --AND lt.int_sent = 'N'
       AND om.patient_id = :patientId --837655 
       AND om.episode_no = :episodeNo --1
       --AND om.order_date >= :p_start_date
       --AND om.order_date <= :p_end_date