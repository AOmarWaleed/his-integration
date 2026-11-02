/* Formatted on 4/20/2026 9:52:22 PM (QP5 v5.227.12220.39754) */
SELECT ol.order_line,
       ol.line_order_date,
       im.description,
       im.ios_user,
       im.ios,
       TO_CHAR (ol.line_order_date, 'YYYYMMDDHH24MISS') || '+0300' AS formatted_order_date
  FROM order_lines ol
       JOIN ios_master im ON ol.ios = im.ios
       JOIN service_dept d ON d.service_dept = im.service_dept
       JOIN orders_master om ON om.master_order_no = ol.master_order_no
       JOIN patient_master pm ON pm.patient_id = om.patient_id
 WHERE     ol.status = 'D'
       AND ol.master_order_no = :p_master_order_no