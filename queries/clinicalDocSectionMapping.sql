


SELECT m.oasis_code , m.ext_code , m.oasis_code1,m.ext_code1
  FROM EXTERNAL_CODES_MAPPING m
 WHERE     M.SOURCE = 'NPHIES CLINICAL'
       AND M.EXT_TYPE = :p_ext_type -- doc type
       and m.ext_code = :p_ext_code --section name
       ORDER BY AMEND_LAST_DATE desc


