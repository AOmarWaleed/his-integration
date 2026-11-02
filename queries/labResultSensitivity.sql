  SELECT ROWNUM AS serial_no,
         lab.anti_biotic_id,
         lab.anti_biotic_short_name AS anti_biotic_short_name,
         lab.description AS anti_biotic_description,
         c.description AS senstivity_result_desc
    FROM lab_result_senstivity lrs, lab_anti_biotics lab, codes c
   WHERE     lrs.anti_biotic_id = lab.anti_biotic_id
         AND c.user_code(+) = TO_CHAR (lrs.senstivity_result)
         AND c.code_type = 431
         AND lrs.lab_result = :labresultid
         AND lrs.organism_id = :organismid
ORDER BY 1