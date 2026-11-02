SELECT
	ms.sql_statement query,
	LTRIM (RTRIM (ms.mark)) tag
FROM
	marker_sql ms
WHERE
	ms.used_in_all_documents = 'Y'
	OR EXISTS
             (
	SELECT
		NULL
	FROM
		template_markers tm,
		document_type_templates dtt
	WHERE
		tm.doc_template_id = dtt.doc_template_id
		AND tm.marker_id = ms.marker_id
		AND dtt.doc_template_id = :p_doc_template_id)
	OR EXISTS
             (
	SELECT
		NULL
	FROM
		template_markers tm,
		doc_template_work_entities dtwe
	WHERE
		tm.doc_template_id = dtwe.doc_template_id
		AND tm.marker_id = ms.marker_id
		AND dtwe.doc_template_id = :p_doc_template_id)
