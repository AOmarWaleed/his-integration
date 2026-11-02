/* Formatted on 4/20/2026 9:49:56 PM (QP5 v5.227.12220.39754) */
SELECT pm.patient_id,
       om.episode_no,
       pat.get_patient_file_id (pm.patient_id) AS mrn,
       om.orderer_staff_id,
       om.attendance_type,
       om.master_order_no
  FROM order_lines ol
       JOIN ios_master im ON ol.ios = im.ios
       JOIN service_dept d ON d.service_dept = im.service_dept
       JOIN orders_master om ON om.master_order_no = ol.master_order_no
       JOIN patient_master pm ON pm.patient_id = om.patient_id
 WHERE     d.dept_type = 'XRY'
       AND ol.status = 'D'
       and rownum < :p_max_records
       AND (:p_patient_id IS NULL OR om.patient_id = :p_patient_id)
       AND (:p_episode_no IS NULL OR om.episode_no = :p_episode_no)
       AND (:p_start_date IS NULL OR om.order_date >= TRUNC(:p_start_date))
       AND (:p_end_date IS NULL OR om.order_date < TRUNC(:p_end_date) + 1)
       