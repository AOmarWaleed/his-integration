import OracleDB from "oracledb";
import { getOracleConnection } from "./config/oracle-dynamic.js";

// ============================================================
// Oracle connection (shared for this module)
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
// EXPERIMENT — Try binding the associative array as OUT
// ============================================================

/**
 * Attempts to bind the PL/SQL associative-array parameter
 * (P_CHECKLIST_QUERY_TAB) as an OUT parameter using the fully
 * qualified type name.
 *
 * This is an EXPERIMENT. The purpose is to observe the exact
 * Oracle/driver error that occurs when binding an associative
 * array declared inside a package spec.
 *
 * @async
 * @function tryBindAssociativeArray
 *
 * @returns {Promise<QueryPatientChecklistResult>} Parsed result.
 *
 * @throws {Error} If the Oracle call fails.
 */
export async function tryBindAssociativeArray() {
  /**
   * PL/SQL block that references the associative array as an OUT bind.
   * @type {string}
   */
  const plsql = `
    BEGIN
      CHECK_LIST.QUERY_PATIENT_CHECKLIST(
        :p_query_tab,
        :p_update_allowed,
        :p_complete_allowed,
        :p_patient_id,
        :p_episode_no,
        :p_answer_session_id,
        :p_checklist_group_id,
        :p_checklist_id,
        :p_chk_lst_answers_master_id,
        :p_recorded_at,
        :p_all_episodes,
        :p_order_by
      );
    END;
  `;

  /**
   * Bind variables.
   *
   * The critical one is `p_query_tab`, which attempts to bind the
   * package-scoped associative array directly.
   *
   * @type {Object}
   */
  const binds = {
    // ===== OUT bind — the associative array (this is the experiment) =====
    p_query_tab: {
      dir: OracleDB.BIND_OUT,
      type: "CHECK_LIST.CHECKLIST_QUERY_TAB",
    },

    // ===== OUT binds — scalars =====
    p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },

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

  return {
    updateAllowed: out.p_update_allowed ?? null,
    completeAllowed: out.p_complete_allowed ?? null,
    rows: out.p_query_tab ?? [],
  };
}

// ============================================================
// Runner
// ============================================================
(async () => {
  try {
    console.log("Attempting to bind the associative array as OUT...\n");

    const result = await tryBindAssociativeArray();

    console.log("=== RESULT ===");
    console.log("updateAllowed   :", result.updateAllowed);
    console.log("completeAllowed :", result.completeAllowed);
    console.log("rows count      :", result.rows.length);
    console.log("-------------------------------");

    result.rows.forEach((row, i) => {
      console.log(
        `[${i + 1}] type=${row.RECORD_TYPE ?? "?"} | data=${row.FORMATTED_DATA ?? ""}`
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