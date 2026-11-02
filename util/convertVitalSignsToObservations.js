import { generateUUID } from "./generateUUID.js";

/**
 * Converts vital signs data to NPHIES observation format
 * @param {Object} vitalSigns - Vital signs data from fetchEpisodeVitalSign
 * @param {number} patientId - Patient ID
 * @param {number} episodeNo - Episode number
 * @returns {Array} Array of observation objects for the template
 */
export function convertVitalSignsToObservations(vitalSigns, patientId, episodeNo) {
  const observations = [];

  if (!vitalSigns) {
    MEDICATION_LOGGER.debug('No vital signs data available for conversion');
    return observations;
  }

  // Mapping of database fields to SNOMED/LOINC codes and display names
  const vitalSignMapping = [
    {
      field: 'hight',
      snomedCode: '50373000',
      snomedDisplay: 'Body Height Measure',
      loincCode: '8302-2',
      unit: 'cm',
      defaultIfNull: null
    },
    {
      field: 'weight',
      snomedCode: '363808001',
      snomedDisplay: 'Body Weight Measure',
      loincCode: '29463-7',
      unit: 'kg',
      defaultIfNull: null
    },
    // {
    //   field: 'temperature',
    //   snomedCode: '386725007',
    //   snomedDisplay: 'Body temperature',
    //   loincCode: '8310-5',
    //   unit: 'Cel',
    //   defaultIfNull: null
    // },
    // {
    //   field: 'high_blood_pressure',
    //   snomedCode: '271649006',
    //   snomedDisplay: 'Systolic blood pressure',
    //   loincCode: '8480-6',
    //   unit: 'mm[Hg]',
    //   defaultIfNull: null
    // },
    // {
    //   field: 'low_blood_pressure',
    //   snomedCode: '271650006',
    //   snomedDisplay: 'Diastolic blood pressure',
    //   loincCode: '8462-4',
    //   unit: 'mm[Hg]',
    //   defaultIfNull: null
    // },
    // {
    //   field: 'pulse_rate',
    //   snomedCode: '364075005',
    //   snomedDisplay: 'Heart rate',
    //   loincCode: '8867-4',
    //   unit: '/min',
    //   defaultIfNull: null
    // },
    // {
    //   field: 'respiratory_rate',
    //   snomedCode: '86290005',
    //   snomedDisplay: 'Respiratory rate',
    //   loincCode: '9279-1',
    //   unit: '/min',
    //   defaultIfNull: null
    // },
    // {
    //   field: 'oxygen_saturation',
    //   snomedCode: '431314004',
    //   snomedDisplay: 'Peripheral oxygen saturation',
    //   loincCode: '2708-6',
    //   unit: '%',
    //   defaultIfNull: null
    // }
  ];

  // Check if we have data for each vital sign and add to observations
  let hasAnyData = false;
  for (const mapping of vitalSignMapping) {
    const value = vitalSigns[mapping.field?.toUpperCase()];
    
    // Skip if value is null, undefined, or empty
    if (value === null || value === undefined || value === '') {
      continue;
    }

    // Convert to number if string
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numericValue)) {
      MEDICATION_LOGGER.warn(`Invalid numeric value for ${mapping.field}: ${value}`);
      continue;
    }

    hasAnyData = true;
    observations.push({
      OBSERVATION_ID: generateUUID(),
      OBSERVATION_CODE: mapping.snomedCode,
      OBSERVATION_DISPLAY: mapping.snomedDisplay,
      CODABLE_CONCEPT_CODE: numericValue.toString(),
      CODABLE_CONCEPT_DISPLAY: mapping.unit,
      // Additional fields for more detailed FHIR observation
      LOINC_CODE: mapping.loincCode,
      PATIENT_ID: patientId,
      EPISODE_NO: episodeNo,
      OBSERVATION_DATE: new Date().toISOString()
    });
  }

  

  if (!hasAnyData) {
    MEDICATION_LOGGER.debug('No valid vital signs data found for conversion');
  }

  return observations;
}
