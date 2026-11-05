import OracleDB from "oracledb";
import { getOracleConnection } from "./config/oracle-dynamic.js";

// ============================================================
// Oracle connection configuration
// ============================================================
const connection = await getOracleConnection({
  facilityId: "7",
  poolScope: "test",
  userParam: "nphies",
  passwordParam: "nphies",
  connectStringParam: `172.20.80.36:1521/test`,
});

/**
 * Helper to convert outBind CLOB/String to JS string.
 */
async function lobToString(bindVal) {
  if (!bindVal) return "";
  if (typeof bindVal === "string") return bindVal;
  if (typeof bindVal.getData === "function") {
    return await bindVal.getData();
  }
  return String(bindVal);
}

// ============================================================
// 1. GET_PATIENT_CHECKLISTS (List of filled forms)
// ============================================================
export async function getPatientChecklists({
  patientId = 3713,
  episodeNo = null,
  status = "A",
  filter = "A",
} = {}) {
  const plsql = `
    DECLARE
      v_tab        CHECK_LIST.PATIENT_CHECKLIST_TAB;
      v_json       CLOB;
      v_idx        PLS_INTEGER;
    BEGIN
      CHECK_LIST.GET_PATIENT_CHECKLISTS (
        P_PAT_CHECKLIST_TAB     => v_tab,
        P_PATIENT_ID            => :p_patient_id,
        P_CHECK_LIST_GROUP_ID   => NULL,
        P_CHECK_LIST_TYPE_ID    => NULL,
        P_ENCOUNTER_ID_GROUP    => :p_episode_no,
        P_FILTER                => :p_filter,
        P_SERVICE_DEPT          => -1,
        P_STATUS                => :p_status,
        P_START_DATE            => NULL,
        P_END_DATE              => NULL
      );

      DBMS_LOB.CREATETEMPORARY(v_json, TRUE);
      DBMS_LOB.WRITEAPPEND(v_json, 1, '[');

      v_idx := v_tab.FIRST;
      WHILE v_idx IS NOT NULL LOOP
        IF v_idx > v_tab.FIRST THEN
          DBMS_LOB.WRITEAPPEND(v_json, 1, ',');
        END IF;

        DECLARE
          v_item VARCHAR2(4000);
          v_clean_group VARCHAR2(4000);
          v_clean_desc VARCHAR2(4000);
        BEGIN
          v_clean_group := REPLACE(REPLACE(REPLACE(REPLACE(NVL(v_tab(v_idx).CHECK_LIST_GROUP_DESC, ''), '\\', '\\\\'), '"', '\\"'), CHR(10), ' '), CHR(13), '');
          v_clean_desc  := REPLACE(REPLACE(REPLACE(REPLACE(NVL(v_tab(v_idx).CHECKLIST_DESCRIPTION, ''), '\\', '\\\\'), '"', '\\"'), CHR(10), ' '), CHR(13), '');

          v_item := '{"answerSessionId":' || NVL(TO_CHAR(v_tab(v_idx).ANSWER_SESSION_ID), 'null')
                 || ',"answersMasterId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_ANSWERS_MASTER_ID), 'null')
                 || ',"recordedAt":"' || TO_CHAR(v_tab(v_idx).RECORDED_AT, 'YYYY-MM-DD HH24:MI:SS') || '"'
                 || ',"groupId":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_GROUP_ID), '0')
                 || ',"groupDesc":"' || v_clean_group || '"'
                 || ',"checklistType":' || NVL(TO_CHAR(v_tab(v_idx).CHECK_LIST_TYPE), '0')
                 || ',"checklistDesc":"' || v_clean_desc || '"'
                 || ',"episodeNo":"' || NVL(v_tab(v_idx).ENCOUNTER_ID_GROUP, '') || '"'
                 || ',"encounterId":"' || NVL(v_tab(v_idx).ENCOUNTER_ID, '') || '"'
                 || ',"checklistStatus":"' || NVL(v_tab(v_idx).CHECK_LIST_STATUS, '') || '"'
                 || ',"activeFlag":"' || NVL(v_tab(v_idx).ACTIVE_FLAG, '') || '"}';

          DBMS_LOB.WRITEAPPEND(v_json, LENGTH(v_item), v_item);
        END;

        v_idx := v_tab.NEXT(v_idx);
      END LOOP;

      DBMS_LOB.WRITEAPPEND(v_json, 1, ']');
      :p_rows_json := v_json;
    END;
  `;

  const binds = {
    p_patient_id: { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
    p_episode_no: { dir: OracleDB.BIND_IN, val: episodeNo ? String(episodeNo) : null, type: OracleDB.STRING },
    p_filter:     { dir: OracleDB.BIND_IN, val: filter, type: OracleDB.STRING },
    p_status:     { dir: OracleDB.BIND_IN, val: status, type: OracleDB.STRING },
    p_rows_json:  { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },
  };

  const result = await connection.execute(plsql, binds, { autoCommit: false });
  const jsonStr = await lobToString(result.outBinds.p_rows_json);
  return JSON.parse(jsonStr || "[]");
}

// ============================================================
// 2. QUERY_PATIENT_CHECKLIST (Detailed questions & answers)
// ============================================================
export async function queryPatientChecklist({
  patientId = 3713,
  episodeNo = 1,
  answersMasterId = null,
  checklistGroupId = null,
  checklistId = null,
  answerSessionId = null,
  recordedAt = null,
  allEpisodes = "A",
  orderBy = "C",
} = {}) {
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
    p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_rows_json:        { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },

    p_patient_id:                { dir: OracleDB.BIND_IN, val: patientId, type: OracleDB.NUMBER },
    p_episode_no:                { dir: OracleDB.BIND_IN, val: episodeNo, type: OracleDB.NUMBER },
    p_answer_session_id:         { dir: OracleDB.BIND_IN, val: answerSessionId, type: OracleDB.NUMBER },
    p_checklist_group_id:        { dir: OracleDB.BIND_IN, val: checklistGroupId, type: OracleDB.NUMBER },
    p_checklist_id:              { dir: OracleDB.BIND_IN, val: checklistId, type: OracleDB.NUMBER },
    p_chk_lst_answers_master_id: { dir: OracleDB.BIND_IN, val: answersMasterId, type: OracleDB.NUMBER },
    p_recorded_at:               { dir: OracleDB.BIND_IN, val: recordedAt, type: OracleDB.DATE },
    p_all_episodes:              { dir: OracleDB.BIND_IN, val: allEpisodes, type: OracleDB.STRING },
    p_order_by:                  { dir: OracleDB.BIND_IN, val: orderBy, type: OracleDB.STRING },
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
// Runner: Executes test against real maternal cases
// ============================================================
(async () => {
  try {
    const candidateCases = [
      { patientId: 20856, episodeNo: 3, docId: 20790 },
      { patientId: 22757, episodeNo: 2, docId: 20682 },
      { patientId: 14551, episodeNo: 2, docId: 20571 },
      { patientId: 9537,  episodeNo: 6, docId: 20568 },
    ];

    // Check external codes for Maternal Discharge Summary
    console.log(`\n======================================================`);
    console.log(`Checking EXTERNAL_CODES for 'Maternal Discharge Summary'`);
    console.log(`======================================================`);
    try {
      const extRes = await connection.execute(
        `SELECT * 
         FROM EXTERNAL_CODES 
         WHERE EXT_TYPE = 'Maternal Discharge Summary' AND SOURCE = 'NPHIES CLINICAL'`,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`Found ${extRes.rows.length} section definitions in EXTERNAL_CODES:`);
      extRes.rows.forEach(r => console.log(` - EXT_CODE: ${r.EXT_CODE} | OASIS_CODE: ${r.OASIS_CODE}`));
    } catch (e) {
      console.warn("Could not query EXTERNAL_CODES:", e.message);
    }

    // Direct check in CHECK_LIST_ANSWERS_MASTER for candidate patients
    console.log(`\n======================================================`);
    console.log(`Inspecting CHECK_LIST_ANSWERS_MASTER for candidates...`);
    console.log(`======================================================`);
    const pids = candidateCases.map(c => c.patientId).join(",");
    try {
      const directCheck = await connection.execute(
        `SELECT CHECK_LIST_ANSWERS_MASTER_ID, PATIENT_ID, ENCOUNTER_ID, 
                CHECK_LIST_ID, CHECK_LIST_GROUP_ID, RECORDED_AT, STATUS 
         FROM CHECK_LIST_ANSWERS_MASTER 
         WHERE PATIENT_ID IN (${pids}) AND ROWNUM <= 10`,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`Direct table query for [${pids}] found ${directCheck.rows.length} rows.`);
      directCheck.rows.forEach(r => {
        console.log(` -> MasterID: ${r.CHECK_LIST_ANSWERS_MASTER_ID} | Patient: ${r.PATIENT_ID} | Encounter: ${r.ENCOUNTER_ID} | ChecklistID: ${r.CHECK_LIST_ID} | Status: ${r.STATUS}`);
      });
    } catch (e) {
      console.warn("Could not query CHECK_LIST_ANSWERS_MASTER directly:", e.message);
    }

    // Find any maternal patients who actually have checklists recorded
    console.log(`\n======================================================`);
    console.log(`Finding maternal patients who have filled checklists...`);
    console.log(`======================================================`);
    let activeMaternalCases = [];
    try {
      const findMaternalWithChecklistsSql = `
        SELECT DISTINCT cam.PATIENT_ID, cam.ENCOUNTER_ID, cam.CHECK_LIST_ANSWERS_MASTER_ID, cam.RECORDED_AT
        FROM CHECK_LIST_ANSWERS_MASTER cam
        JOIN patient_diagnosis_notes pdn ON pdn.patient_id = cam.PATIENT_ID
        JOIN diagnosis_codes dc ON pdn.diag_code = dc.diag_code
        WHERE dc.hosp_code IN ('O30', 'Z37.0', 'Z38.1', 'O82', 'O68.2')
          AND ROWNUM <= 10
      `;
      const maternalChecklistsRes = await connection.execute(
        findMaternalWithChecklistsSql,
        [],
        { outFormat: OracleDB.OUT_FORMAT_OBJECT }
      );
      console.log(`Found ${maternalChecklistsRes.rows.length} maternal records with checklists in DB:`);
      maternalChecklistsRes.rows.forEach(r => {
        console.log(` -> PatientID: ${r.PATIENT_ID} | Encounter: ${r.ENCOUNTER_ID} | MasterID: ${r.CHECK_LIST_ANSWERS_MASTER_ID} | Date: ${r.RECORDED_AT}`);
        activeMaternalCases.push({
          patientId: Number(r.PATIENT_ID),
          episodeNo: r.ENCOUNTER_ID ? Number(r.ENCOUNTER_ID) : null,
          answersMasterId: Number(r.CHECK_LIST_ANSWERS_MASTER_ID),
        });
      });
    } catch (e) {
      console.warn("Could not query maternal checklists:", e.message);
    }

    // Merge candidates with found active maternal cases
    const casesToTest = activeMaternalCases.length > 0 ? activeMaternalCases : candidateCases;

    for (const c of casesToTest) {
      console.log(`\n======================================================`);
      console.log(`Testing Case: Patient=${c.patientId}, Episode=${c.episodeNo || "ALL"}`);
      console.log(`======================================================`);

      // 1. Try with episodeNo first
      let checklists = await getPatientChecklists({
        patientId: c.patientId,
        episodeNo: c.episodeNo,
      });

      // 2. If 0 found, try without episode filter (all episodes for patient)
      if (checklists.length === 0) {
        console.log(`Trying without episode filter for patient ${c.patientId}...`);
        checklists = await getPatientChecklists({
          patientId: c.patientId,
          episodeNo: null,
          status: "A",
        });
      }

      console.log(`Found ${checklists.length} checklists for patient ${c.patientId}:`);
      checklists.forEach((item, i) => {
        console.log(
          ` [${i + 1}] ID=${item.answersMasterId} | Date=${item.recordedAt} | Status=${item.checklistStatus} | Title=${item.checklistDesc} | Group=${item.groupDesc}`
        );
      });

      // Pick targetMasterId from returned checklists or from direct query
      const targetMasterId = checklists.length > 0 ? checklists[0].answersMasterId : c.answersMasterId;

      if (targetMasterId) {
        console.log(`\nQuerying details for answersMasterId=${targetMasterId}...`);
        const details = await queryPatientChecklist({
          patientId: c.patientId,
          episodeNo: c.episodeNo || 1,
          answersMasterId: targetMasterId,
        });

        console.log(`updateAllowed: ${details.updateAllowed}, completeAllowed: ${details.completeAllowed}, rows: ${details.rows.length}`);
        console.log(`Sample rows from checklist:`);
        details.rows.slice(0, 30).forEach((row, i) => {
          console.log(
            ` [${i + 1}] type=${row.RECORD_TYPE} | reply=${row.REPLY_TYPE || "-"} | data=${row.FORMATTED_DATA}`
          );
        });
        break; // Successfully inspected checklist answers!
      }
    }

  } catch (err) {
    console.error("\n=== ERROR ===");
    console.error("code    :", err.code);
    console.error("message :", err.message);
    if (err.errorNum) console.error("oraNum  :", err.errorNum);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
    process.exit(0);
  }
})();
