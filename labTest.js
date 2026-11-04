import OracleDB from "oracledb";
import { getOracleConnection } from "./config/oracle-dynamic.js";

// ============================================================
// Oracle connection
// ============================================================
const connection = await getOracleConnection({
  facilityId: "7",
  poolScope: "test",
  userParam: "nphies",
  passwordParam: "nphies",
  connectStringParam: `172.20.80.36:1521/test`,
});

// ============================================================
// TYPES (JSDoc)
// ============================================================

/**
 * Shape of a single checklist row returned by the PL/SQL procedure.
 *
 * @typedef {Object} ChecklistRow
 * @property {string} [RECORD_TYPE]          - Row kind: H | Q | A | M | N | R.
 * @property {string} [REPLY_TYPE]           - Reply kind: Y | W | O | D | C | R | T | L | I.
 * @property {number} [CHECK_LIST_ANSWER_ID] - Answer id (present for A/M/N/R rows).
 * @property {string} [FORMATTED_DATA]       - Human-readable text to display.
 * @property {string} [RECORDED]             - Recorded timestamp (string form).
 */

/**
 * Result of the PL/SQL procedure call.
 *
 * @typedef {Object} QueryPatientChecklistResult
 * @property {string|null} updateAllowed   - 'Y' or 'N'.
 * @property {string|null} completeAllowed - 'Y' or 'N'.
 * @property {ChecklistRow[]} rows         - Flattened checklist rows.
 */

// ============================================================
// Function: Calls CHECK_LIST.QUERY_PATIENT_CHECKLIST
// ============================================================

/**
 * Executes CHECK_LIST.QUERY_PATIENT_CHECKLIST procedure and converts
 * the internal associative array into a JSON structure for Node.js.
 *
 * @async
 * @function tryBindAssociativeArray
 * @returns {Promise<QueryPatientChecklistResult>}
 */
export async function tryBindAssociativeArray() {
  const plsql = `
    DECLARE
      v_query_tab         CHECK_LIST.CHECKLIST_QUERY_TAB;
      v_update_allowed    VARCHAR2(32767);
      v_complete_allowed  VARCHAR2(32767);
      v_json              CLOB;
      v_idx               PLS_INTEGER;
    BEGIN
      CHECK_LIST.QUERY_PATIENT_CHECKLIST(
        P_CHECKLIST_QUERY_TAB        => v_query_tab,
        P_UPDATE_ALLOWED             => v_update_allowed,
        P_COMPLETE_ALLOWED           => v_complete_allowed,
        P_PATIENT_ID                 => :p_patient_id,
        P_EPISODE_NO                 => :p_episode_no,
        P_ANSWER_SESSION_ID          => :p_answer_session_id,
        P_CHECKLIST_GROUP_ID         => :p_checklist_group_id,
        P_CHECKLIST_ID               => :p_checklist_id,
        P_CHK_LST_ANSWERS_MASTER_ID  => :p_chk_lst_answers_master_id,
        P_RECORDED_AT                => :p_recorded_at,
        P_ALL_EPISODES               => :p_all_episodes,
        P_ORDER_BY                   => :p_order_by
      );

      :p_update_allowed   := v_update_allowed;
      :p_complete_allowed := v_complete_allowed;

      DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
      DBMS_LOB.WRITEAPPEND(v_json, 1, '[');

      v_idx := v_query_tab.FIRST;
      WHILE v_idx IS NOT NULL LOOP
        IF v_idx > v_query_tab.FIRST THEN
          DBMS_LOB.WRITEAPPEND(v_json, 1, ',');
        END IF;

        DECLARE
          v_item VARCHAR2(32767);
          v_clean_data VARCHAR2(32767);
        BEGIN
          v_clean_data := REPLACE(
                            REPLACE(
                              REPLACE(
                                REPLACE(NVL(v_query_tab(v_idx).FORMATTED_DATA, ''), '\\', '\\\\'),
                              '"', '\\"'),
                            CHR(10), '\\n'),
                          CHR(13), '');

          v_item := '{"RECORD_TYPE":"' || NVL(v_query_tab(v_idx).RECORD_TYPE, '') || '"'
                 || ',"REPLY_TYPE":"' || NVL(v_query_tab(v_idx).REPLY_TYPE, '') || '"'
                 || ',"RECORDED":"' || NVL(v_query_tab(v_idx).RECORDED, '') || '"'
                 || ',"CHECK_LIST_ANSWER_ID":' || NVL(TO_CHAR(v_query_tab(v_idx).CHECK_LIST_ANSWER_ID), 'null')
                 || ',"FORMATTED_DATA":"' || v_clean_data || '"}';

          DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
        END;

        v_idx := v_query_tab.NEXT(v_idx);
      END LOOP;

      DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
      :p_rows_json := v_json;
    END;
  `;

  const binds = {
    // ===== OUT binds =====
    p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_rows_json:        { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },

    // ===== IN binds =====
    p_patient_id:                { dir: OracleDB.BIND_IN, val: 3713, type: OracleDB.NUMBER },
    p_episode_no:                { dir: OracleDB.BIND_IN, val: 1,    type: OracleDB.NUMBER },
    p_answer_session_id:         { dir: OracleDB.BIND_IN, val: null, type: OracleDB.NUMBER },
    p_checklist_group_id:        { dir: OracleDB.BIND_IN, val: null, type: OracleDB.NUMBER },
    p_checklist_id:              { dir: OracleDB.BIND_IN, val: null, type: OracleDB.NUMBER },
    p_chk_lst_answers_master_id: { dir: OracleDB.BIND_IN, val: null, type: OracleDB.NUMBER },
    p_recorded_at:               { dir: OracleDB.BIND_IN, val: null, type: OracleDB.DATE },
    p_all_episodes:              { dir: OracleDB.BIND_IN, val: "A",  type: OracleDB.STRING },
    p_order_by:                  { dir: OracleDB.BIND_IN, val: "C",  type: OracleDB.STRING },
  };

  const result = await connection.execute(plsql, binds, { autoCommit: false });
  const out = result.outBinds;

  let jsonString = "";
  if (out.p_rows_json) {
    jsonString = typeof out.p_rows_json.getData === "function"
      ? await out.p_rows_json.getData()
      : out.p_rows_json;
  }

  const rows = JSON.parse(jsonString || "[]");

  return {
    updateAllowed: out.p_update_allowed ?? null,
    completeAllowed: out.p_complete_allowed ?? null,
    rows,
  };
}

// ============================================================
// Runner
// ============================================================
(async () => {
  try {
    console.log("Calling CHECK_LIST.QUERY_PATIENT_CHECKLIST...\n");

    const result = await tryBindAssociativeArray();

    console.log("=== RESULT ===");
    console.log("updateAllowed   :", result.updateAllowed);
    console.log("completeAllowed :", result.completeAllowed);
    console.log("rows count      :", result.rows.length);
    console.log("-------------------------------");

    result.rows.forEach((row, i) => {
      console.log(
        `[${i + 1}] type=${row.RECORD_TYPE ?? "?"} | reply=${row.REPLY_TYPE ?? "-"} | data=${row.FORMATTED_DATA ?? ""}`
      );
    });
  } catch (err) {
    console.error("\n=== ERROR ===");
    console.error("code    :", err.code);
    console.error("message :", err.message);
    if (err.errorNum) console.error("oraNum  :", err.errorNum);
  } finally {
    process.exit(0);
  }
})();
