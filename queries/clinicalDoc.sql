SELECT /*+ clinical_notes*/
     d.doc_type,
     ecm.ext_code clinical_note_title,
     d.status AS order_status,
     document_id,
     document_id AS order_line,
     document_id AS value_to_update_status,
     document_id AS master_order_no,
     doc_request_no,
     patient_id,
     episode_no,
     encounter_id,
     doc_subject,
     doc_text,
     status,
     author,
     created_date ,
     created_date as trans_date,
     transcriptionist,
     action_start,
     action_end,
     d.AMEND_LAST_DATE CREATION_DATE
FROM
     documents d
     JOIN external_codes_mapping ecm ON ecm.mapping_type = 'TRANSCRIPTION'
     AND TO_NUMBER (ecm.oasis_code) = d.doc_type
WHERE
     1 = 1 
     AND d.created_date >= TO_DATE (:p_publish_date, 'DD-MM-YYYY') 
     AND d.document_id = NVL (:p_document_id, d.document_id)
     AND (
          d.nphies_cs_sent = :p_status
          OR d.nphies_cs_sent IS NULL
     ) 
     AND d.patient_id = NVL (:p_patient_id, d.patient_id)
     AND d.episode_no = NVL (:p_episode_no, d.episode_no)
     AND (
          :p_start_date IS NULL
          OR d.created_date >= TO_TIMESTAMP (:p_start_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     )
     AND (
          :p_end_date IS NULL
          OR d.created_date <= TO_TIMESTAMP (:p_end_date, 'YYYY-MM-DD"T"HH24:MI:SS')
     ) 
     AND  rownum <= :rownum_max
    -- AND D.STATUS = 'A'
ORDER BY
     d.created_date