/* Formatted on 8/23/2026 1:10:47 PM (QP5 v5.227.12220.39754) */
SELECT
     DISTINCT om.master_order_no master_no,
     ol.order_line,
     dl.delivery_line,
     --transaction_id
     om.order_date req_creation_date,
     om.order_date as trans_date,
     om.patient_id,
     om.episode_no,
     om.orderer_staff_id,
     om.attendance_type encounter_type,
     om.hl7_encounter encounter_identifier,
     pe.start_date,
     pe.end_date,
     dc.delivery_date
FROM
     orders_master om
     JOIN order_lines ol ON om.master_order_no = ol.master_order_no
     JOIN ios_master_data ims ON ims.ios = ol.ios
     JOIN ph_ios_medicine m ON m.ios_main = ims.ios_main
     JOIN patient_episodes pe ON pe.patient_id = om.patient_id
     AND pe.episode_no = om.episode_no
     JOIN delivery_lines dl ON dl.order_line = ol.order_line
     JOIN delivery_charge dc ON dc.delivery_line = dl.delivery_line
WHERE
     1 = 1
     AND ol.line_order_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY')
     AND INSTR (
          :p_pharmacy_category,
          ',' || IMS.PRODUCT_CATEGORY_CODE || ','
     ) > 0
     AND ol.nphies_cs_sent in ('S', 'DS') -- update dl.nphies_cs_sent = 'S' not ol
     AND (
          ol.status NOT IN ('P', 'Q')
          OR (
               ol.status = 'C'
               AND ol.nphies_cs_sent = 'S'
          )
     ) 
     --AND NVL (dc.cancel_flag, 'x') NOT IN ('R', 'C')
     --   AND (   dc.package_id IS NULL
     --        OR (    dc.package_id IS NOT NULL
     --            AND NVL (dc.package_deal_flag, 'N') = 'N'))
     AND om.patient_id = NVL (:p_patient_id, om.patient_id)
     AND om.episode_no = NVL (:p_episode_no, om.episode_no)
     AND (
          :p_start_date IS NULL
          OR ol.line_order_date >= TO_TIMESTAMP (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR ol.line_order_date <= TO_TIMESTAMP (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          (dl.nphies_cs_sent = :p_status)
          OR (
               :p_status IS NULL
               AND dl.nphies_cs_sent IS NULL
          )
     )
     AND dl.delivery_line = NVL (:p_delivery_line, dl.delivery_line)