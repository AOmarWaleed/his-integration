SELECT
    /*+MED_PRESCRIPTION_LINES*/
    ol.order_line,
    ol.ios,
    ol.status,
    ol.nphies_cs_sent,
    --DECODE (ol.status,  'R', 'active',  'O', 'active',  'C', 'cancelled',  'D', 'completed') prescription_status,
    CASE
        WHEN ol.nphies_cs_sent IN ('S', 'DS')
        AND ol.status = 'C' THEN 'cancelled'
        ELSE 'active' --WHEN nvl(ol.nphies_cs_sent,'E') in ('E','F') THEN 'active'
    END prescription_status,
    imn.description,
    imn.inventory_ios,
    imn.product_code,
    ims.ios_main,
    imn.service_type ios_service_type,
    imn.national_drug_coding,
    NVL (imn.national_drug_coding, ims.ios_user) service_code,
    imn.product_category_code,
    ims.service_dept,
    imn.drug_dispensing_type,
    imn.scientific_code,
    DECODE (
        imn.drug_dispensing_type,
        'B',
        'PAT_REQ',
        'GENERIC'
    ) selection_reason,
    ol.units_ordered,
    ol.units_given,
    ol.amend_by_user,
    ol.dosage_code,
    ol.dosage_narrative,
    order_utl.GET_MEDICATION_ORDER_DESC (ol.order_line) dosage_desc,
    ol.urgent_flag,
    ol.std_price,
    ol.reason_for_ios,
    imn.service_type,
    ol.line_order_date,
    ol.line_expiry_date,
    m.cautionary_id,
    c.description cautionary_description,
    imn.controlled_indicator,
    m.medicine_category,
    DECODE (UPPER (cd.description), 'CONTROLED', 'C', 'U') Medication_category_code,
    DECODE (
        UPPER (cd.description),
        'CONTROLED',
        'Controlled',
        'Uncontrolled'
    ) Medication_category_desc
FROM
    order_lines ol
    JOIN ios_master_data ims ON ol.ios = ims.ios
    JOIN ios_main_data imn ON imn.ios_main = ims.ios_main
    JOIN orders_master om ON om.master_order_no = ol.master_order_no
    JOIN ph_ios_medicine m ON m.ios_main = imn.ios_main
    LEFT OUTER JOIN ph_cautionary_advisory_labels c ON c.cautionary_id = m.cautionary_id
    LEFT OUTER JOIN codes_data cd ON cd.code = m.medicine_category
    AND cd.code_type = 384
WHERE
    om.master_order_no = :p_master_order_no
    AND INSTR (
          :p_pharmacy_category,
          ',' || IMS.PRODUCT_CATEGORY_CODE || ','
     ) > 0
    AND ol.order_line = NVL (:p_order_line, ol.order_line) --       AND ol.status NOT IN ('P', 'Q', 'C')
    --       AND ol.nphies_cs_sent IS NULL
    AND (
        (ol.nphies_cs_sent = :p_status)
        OR (
            :p_status IS NULL
            AND (
                (
                    ol.nphies_cs_sent IS NULL
                    AND ol.status NOT IN ('P', 'Q', 'C')
                )
                OR (
                    ol.status = 'C'
                    AND ol.nphies_cs_sent IN ('S', 'DS')
                ) --OR (ol.status = 'D' AND NVL (ol.nphies_cs_sent, 'S') = 'S')
            )
        )
    ) --S => Sent , CS Cancel Sent , DS => Completed Sent