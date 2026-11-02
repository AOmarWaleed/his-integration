"SELECT pd.doc_number AS id_number " +
    "FROM personnel_documents pd, codes c " +
    "WHERE pd.staff_id = '" + consultantId + "' " +
    "AND pd.doc_type = c.code " +
    "AND pd.doc_number IS NOT NULL " +
    "AND c.user_code IN ('" + $cfg('UserCodeStaffNationalId') + "', '" +
                              $cfg('UserCodeStaffIqama') + "', '" +
                              $cfg('UserCodeStaffBorderId') + "', 'H')";