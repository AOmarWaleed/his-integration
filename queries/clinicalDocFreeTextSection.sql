/* Formatted on 8/25/2026 4:39:48 PM (QP5 v5.227.12220.39754) */
  SELECT dst.type_seq,
         dst.subject_type,
         dst.description,
         dt.doc_text,
         dt.created_by_user,
         dt.amend_by_user
    FROM document_texts dt
         JOIN document_subject_types dst ON dt.subject_type = dst.subject_type
         JOIN document_types t ON t.doc_type = dst.doc_type
         JOIN documents d ON d.document_id = dt.document_id
   WHERE     1 = 1
         AND dt.document_id = :p_document_id --11157
         AND DST.SUBJECT_TYPE = :p_subject_type --139
ORDER BY dst.type_seq