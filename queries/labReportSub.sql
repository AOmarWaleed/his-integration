SELECT rownum AS serial_no,
           im.ios        AS ios,
           im.description AS description,
           TO_CHAR(lr.amend_last_date, 'DD-MM-YYYY HH24:MI') AS result_date,
           TO_CHAR(lr.amend_last_date, 'YYYYMMDDHH24MISS')   AS result_date_hours,
           lr.conclusion AS conclusion,
           li.unit_of_measure AS unit_of_measure,
           CASE
               WHEN li.result_type IN ('D','C','S') THEN
                   (SELECT description FROM user_codes uc WHERE uc.code = lr.result_code)
               WHEN li.result_type IN ('N','I') THEN
                   DECODE(lr.result_num, NULL,
                       REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                           lr.line_text,'\\','\\E\\'),'~','\\R\\'),'^','\\S\\'),'&','\\T\\'),'|','\\F\\'),CHR(13),'\\.br\\'),CHR(10),'\\.br\\'),
                       TO_CHAR(lr.result_num))
               WHEN li.result_type = 'F' THEN
                   REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                       lr.line_text,'\\','\\E\\'),'~','\\R\\'),'^','\\S\\'),'&','\\T\\'),'|','\\F\\'),CHR(13),'\\.br\\'),CHR(10),'\\.br\\')
               ELSE NULL
           END AS result,
           li.result_type         AS result_type,
           lr.start_numeric_value AS start_numeric_value,
           lr.end_numeric_value   AS end_numeric_value
      FROM lab_results lr
      JOIN lab_test lt ON lr.order_line = lt.order_line
      JOIN ios_master im ON lr.ios = im.ios
      JOIN lab_ios li ON lr.ios = li.ios
     WHERE lr.order_line = :orderLine
       AND (lr.result_code IS NOT NULL OR lr.result_num IS NOT NULL OR lr.line_text IS NOT NULL)