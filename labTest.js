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
// QUERY_PATIENT_CHECKLIST (Detailed questions & answers)
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
  // Uses ASCII CHR(30) (Record Separator) and CHR(31) (Unit Separator)
  // to stream all checklist rows without JSON escaping or 32KB buffer limits.
  const plsql = `
    DECLARE
      v_query_tab         CHECK_LIST.CHECKLIST_QUERY_TAB;
      v_update_allowed    VARCHAR2(32767);
      v_complete_allowed  VARCHAR2(32767);
      v_clob              CLOB;
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

      DBMS_LOB.CREATETEMPORARY(v_clob, TRUE);

      v_idx := v_query_tab.FIRST;
      WHILE v_idx IS NOT NULL LOOP
        IF v_idx > v_query_tab.FIRST THEN
          DBMS_LOB.WRITEAPPEND(v_clob, 1, CHR(30));
        END IF;

        IF v_query_tab(v_idx).RECORD_TYPE IS NOT NULL THEN
          DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_query_tab(v_idx).RECORD_TYPE), v_query_tab(v_idx).RECORD_TYPE);
        END IF;
        DBMS_LOB.WRITEAPPEND(v_clob, 1, CHR(31));

        IF v_query_tab(v_idx).REPLY_TYPE IS NOT NULL THEN
          DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_query_tab(v_idx).REPLY_TYPE), v_query_tab(v_idx).REPLY_TYPE);
        END IF;
        DBMS_LOB.WRITEAPPEND(v_clob, 1, CHR(31));

        IF v_query_tab(v_idx).RECORDED IS NOT NULL THEN
          DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_query_tab(v_idx).RECORDED), v_query_tab(v_idx).RECORDED);
        END IF;
        DBMS_LOB.WRITEAPPEND(v_clob, 1, CHR(31));

        IF v_query_tab(v_idx).CHECK_LIST_ANSWER_ID IS NOT NULL THEN
          DECLARE
            v_ans_str VARCHAR2(50) := TO_CHAR(v_query_tab(v_idx).CHECK_LIST_ANSWER_ID);
          BEGIN
            DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_ans_str), v_ans_str);
          END;
        END IF;
        DBMS_LOB.WRITEAPPEND(v_clob, 1, CHR(31));

        IF v_query_tab(v_idx).FORMATTED_DATA IS NOT NULL THEN
          DBMS_LOB.WRITEAPPEND(v_clob, LENGTH(v_query_tab(v_idx).FORMATTED_DATA), v_query_tab(v_idx).FORMATTED_DATA);
        END IF;

        v_idx := v_query_tab.NEXT(v_idx);
      END LOOP;

      :p_rows_clob := v_clob;
    END;
  `;

  const binds = {
    p_update_allowed:   { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_complete_allowed: { dir: OracleDB.BIND_OUT, type: OracleDB.STRING, maxSize: 32767 },
    p_rows_clob:        { dir: OracleDB.BIND_OUT, type: OracleDB.CLOB },

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

  const clobString = await lobToString(out.p_rows_clob);
  const rows = [];

  if (clobString) {
    const REC_SEP = String.fromCharCode(30);
    const FIELD_SEP = String.fromCharCode(31);

    const records = clobString.split(REC_SEP);
    for (const rec of records) {
      if (!rec) continue;
      const parts = rec.split(FIELD_SEP);
      rows.push({
        RECORD_TYPE: parts[0] || "",
        REPLY_TYPE: parts[1] || "",
        RECORDED: parts[2] || "",
        CHECK_LIST_ANSWER_ID: parts[3] ? Number(parts[3]) : null,
        FORMATTED_DATA: parts.length > 4 ? parts.slice(4).join(FIELD_SEP) : "",
      });
    }
  }

  return {
    updateAllowed: out.p_update_allowed ?? null,
    completeAllowed: out.p_complete_allowed ?? null,
    rows,
  };
}

// ============================================================
// Extractor & Mapper: Transforms checklist rows into the exact
// shapes required by getDefaultValueForSection
// ============================================================
export function extractMaternalSections(rows = []) {
  // Find answer row immediately following a matching question
  function findAnswerForQuestion(questionRegex) {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.RECORD_TYPE === "Q" && questionRegex.test(row.FORMATTED_DATA)) {
        for (let j = i + 1; j < Math.min(i + 5, rows.length); j++) {
          if (rows[j].RECORD_TYPE === "A") {
            return rows[j].FORMATTED_DATA.replace(/\+/g, " ").trim();
          }
          if (rows[j].RECORD_TYPE === "Q" || rows[j].RECORD_TYPE === "H") {
            break;
          }
        }
      }
    }
    return null;
  }

  // Find any row matching regex
  function findRowText(regex) {
    const r = rows.find((x) => regex.test(x.FORMATTED_DATA));
    return r ? r.FORMATTED_DATA.replace(/\+/g, " ").trim() : null;
  }

  // 1. Gestational Age (e.g., 38, 39 weeks)
  let gestAge = "39";
  const gestAgeAns = findAnswerForQuestion(/gestat/i);
  if (gestAgeAns && /\d+/.test(gestAgeAns)) {
    gestAge = gestAgeAns.match(/\d+/)[0];
  } else {
    const rawGest = findRowText(/(\d+)\s*(weeks|wks|weks)/i);
    if (rawGest) {
      const m = rawGest.match(/(\d+)\s*(weeks|wks|weks)/i);
      if (m) gestAge = m[1];
    }
  }

  // 2. Type of Delivery (Vaginal vs Cesarean)
  let deliveryProc = "Vaginal - non-instrumental";
  let deliveryCode = "1";
  const delivAns =
    findAnswerForQuestion(/type of delivery/i) ||
    findRowText(/normal vaginal delivery|c\.s|cesarean/i);

  if (delivAns && /c\.s|cesarean|caesarean/i.test(delivAns)) {
    deliveryProc = "Cesarean section";
    deliveryCode = "2";
  } else if (delivAns && /vaginal|normal/i.test(delivAns)) {
    deliveryProc = "Vaginal - non-instrumental";
    deliveryCode = "1";
  }

  // 3. Formatted timestamps
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");

  const formattedDateTime = `${yyyy}.${mm}.${dd} ${hh}:${mi}:${ss}`;
  const cdaEffectiveTime = `${yyyy}${mm}${dd}${hh}${mi}${ss}+0300`;

  // 4. Pregnancy History (Live births / Para)
  let liveBirths = "1";
  const paraMatch = findRowText(/P(\d+)|para\s*(\d+)/i);
  if (paraMatch) {
    const m = paraMatch.match(/P(\d+)|para\s*(\d+)/i);
    if (m) liveBirths = m[1] || m[2] || "1";
  }

  return {
    pregnancyhistory: [
      {
        INDEX: 1,
        TYPE: "BIRTHS LIVE (REPORTED)",
        CODE: "11636-8",
        CODE_SYSTEM: "2.16.840.1.113883.6.1",
        CODE_SYSTEM_NAME: "LOINC",
        VALUE: liveBirths,
        VALUE_TYPE: "INT",
        UNIT: "",
        TIME_OF_MEASUREMENT: formattedDateTime,
        EFFECTIVE_TIME: cdaEffectiveTime,
      },
    ],
    laboranddeliveryevents: {
      INDEX: 1,
      PROCEDURE: deliveryProc,
      PROCEDURE_CODE: deliveryCode,
      PROCEDURE_CODE_SYSTEM: "2.16.840.1.113883.3.3731.1.203.22",
      PROCEDURE_CODE_SYSTEM_NAME: "KSA Mode of Delivery",
      DATE_TIME: `${formattedDateTime.replace(" ", ", ")}`,
      EFFECTIVE_TIME: cdaEffectiveTime,
      STATUS: "Completed",
    },
    deliveryeventoutcome: [
      {
        INDEX: 1,
        PROCEDURE: "Live Births",
        CODE: "11636-8",
        CODE_SYSTEM: "2.16.840.1.113883.6.1",
        CODE_SYSTEM_NAME: "LOINC",
        VALUE: "1",
        VALUE_TYPE: "INT",
        DATE_TIME_OF_DELIVERY: formattedDateTime,
        EFFECTIVE_TIME: cdaEffectiveTime,
      },
    ],
    newbornstatusatmaternaldischarge: [
      {
        INDEX: 1,
        STATUS_TYPE: "Gestational Age",
        CODE: "49051-6",
        CODE_SYSTEM: "2.16.840.1.113883.6.1",
        CODE_SYSTEM_NAME: "LOINC",
        VALUE: gestAge,
        VALUE_TYPE: "PQ",
        UNIT: "wk",
        EFFECTIVE_TIME: cdaEffectiveTime,
      },
    ],
  };
}

// ============================================================
// Runner: Executes QUERY_PATIENT_CHECKLIST and maps to sections
// ============================================================
(async () => {
  try {
    const candidateCases = [
      { patientId: 8587, episodeNo: 2 },
      { patientId: 4136, episodeNo: 3 },
      { patientId: 5255, episodeNo: 1 },
      { patientId: 4244, episodeNo: 2 },
    ];

    console.log(`\n======================================================`);
    console.log(`MAPPING CHECKLIST DATA TO MATERNAL SECTIONS`);
    console.log(`======================================================`);

    for (const c of candidateCases) {
      console.log(`\n------------------------------------------------------`);
      console.log(`Patient: ${c.patientId} | Episode: ${c.episodeNo}`);
      console.log(`------------------------------------------------------`);

      const details = await queryPatientChecklist({
        patientId: c.patientId,
        episodeNo: c.episodeNo,
        answersMasterId: null,
        allEpisodes: "A",
      });

      console.log(`Total checklist rows fetched: ${details.rows.length}`);

      // Map rows to the 4 sections
      const mapped = extractMaternalSections(details.rows);

      console.log(`\n[Mapped Sections Output for Patient ${c.patientId}]:`);
      console.log(JSON.stringify(mapped, null, 2));
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
