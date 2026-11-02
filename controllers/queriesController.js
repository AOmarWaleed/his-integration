import { fetchEpisodeDiagnosis } from "../util/fetchEpisodeDiagnosis.js";
import { fetchAdmissionInfo } from "../util/fetchAdmissionInfo.js";
import { fetchEpisodeVitalSign } from "../util/fetchEpisodeVitalSign.js";
import { fetchChiefComplaints } from "../util/fetchChiefComplaints.js";
import { fetchEpisodeMainSymptoms } from "../util/fetchEpisodeMainSymptoms.js";
import { ok, fail } from "@givc/shared-backend";

export const handleEpisodeDiagnosis = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const data = await fetchEpisodeDiagnosis({
      patientId: Number(patientId),
      episodeNo: Number(episodeNo),
      oracleConnection: connection,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};

export const handleAdmissionInfo = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const data = await fetchAdmissionInfo({
      patientId: Number(patientId),
      episodeNo: Number(episodeNo),
      oracleConnection: connection,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};

export const handleEpisodeVitalSign = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const data = await fetchEpisodeVitalSign({
      patientId: Number(patientId),
      episodeNo: Number(episodeNo),
      oracleConnection: connection,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};

export const handleChiefComplaints = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const data = await fetchChiefComplaints({
      patientId: Number(patientId),
      episodeNo: Number(episodeNo),
      oracleConnection: connection,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};

export const handleEpisodeMainSymptoms = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const data = await fetchEpisodeMainSymptoms({
      patientId: Number(patientId),
      episodeNo: Number(episodeNo),
      oracleConnection: connection,
    });
    return ok(res, data);
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};

export const handleClinicalData = async (req, res, next) => {
  const connection = req.oracleConnection;
  try {
    const { patientId, episodeNo } = req.query;
    const pid = Number(patientId);
    const eno = Number(episodeNo);

    const diagnosis = await fetchEpisodeDiagnosis({
      patientId: pid,
      episodeNo: eno,
      oracleConnection: connection,
    });
    const admissionInfo = await fetchAdmissionInfo({
      patientId: pid,
      episodeNo: eno,
      oracleConnection: connection,
    });
    const vitalSign = await fetchEpisodeVitalSign({
      patientId: pid,
      episodeNo: eno,
      oracleConnection: connection,
    });
    const chiefComplaints = await fetchChiefComplaints({
      patientId: pid,
      episodeNo: eno,
      oracleConnection: connection,
    });
    const episodeMainSymptoms = await fetchEpisodeMainSymptoms({
      patientId: pid,
      episodeNo: eno,
      oracleConnection: connection,
    });

    return ok(res, {
      diagnosis,
      admissionInfo,
      vitalSign,
      chiefComplaints,
      episodeMainSymptoms,
    });
  } catch (error) {
    return fail(res, error.message, 500);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
};
