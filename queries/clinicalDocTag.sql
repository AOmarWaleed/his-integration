SELECT ms.sql_statement query, LTRIM (RTRIM (ms.mark)) tag
  FROM marker_sql ms
 WHERE MS.MARK = :p_tag
