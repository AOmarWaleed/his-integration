SELECT rownum AS serial_no,
  lrco.organism_id,
  lrco.lab_result,
  lo.organism_short_name,
  lo.description AS organism_description,
  lrco.culture_code
  FROM lab_result_culture_organisms lrco, lab_organisms lo
  WHERE lrco.organism_id = lo.organism_id AND lrco.lab_result = :labResultId