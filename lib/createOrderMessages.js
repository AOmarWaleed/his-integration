// // http://hl7-definition.caristix.com/v2/HL7v2.5.1/Segments/ORC

import { query } from "../config/pgDB.js";
import {
  buildDG1Segments,
  createEVNSegment,
  createMSHSegment,
  createPIDSegment,
  createPV1Segment,
} from "../oldVersion.js";
import {  getConfValue } from "../util/loadConf.js";
import { formatDateTime } from "./segments/datesFormate.js";

/**
 * Get HL7 configuration from database
 */
export async function getHL7Config(facilityId) {


  try {
    const keys = [
            'NPHIES_CS_ADT_HL7_VERSION',
            'NPHIES_CS_DOMAIN',
            'NPHIES_CS_FACILITY_OID_SEG',
            'NPHIES_CS_RECEIVING_APP_SEG',
            'NPHIES_CS_IDENTITY_AUTHORITY_SEG',
    ];
    const conf = {} ;
    for (const key of keys) {
      const value = await getConfValue({ key, facilityId }) ;
      conf[key] = value;
      
    }

    return conf;
  } catch (error) {
    console.log(error);
  }
}

//!!! ORM
export const createORCSegment = (config = {}) => {
  const {
    // ✅ Required
    orderControl = "NW", // ORC-1: كود التحكم في الطلب (R)
    // مثال: "NW" = New Order, "CA" = Cancel
    placerOrderNumber = "", // ORC-2: رقم الطلب من الجهة الطالبة (R*)
    // مثال: "CLINIC1234"
    fillerOrderNumber = "", // ORC-3: رقم الطلب من الجهة المنفذة (R*) بديل عن ORC-2
    // مثال: "LAB5678"
    orderingProvider = "", // ORC-12: الطبيب طالب الخدمة بصيغة XCN (R)
    // مثال: "123^Ali^Ahmed^Dr"

    // 🟡 Optional
    serviceDept = "", // ORC-21: قسم الخدمة (O) -
    admissionNo = "", // ORC-4: رقم القبول/الزيارة (O) - placerGroupNumber
    masterOrderNo = "", // ORC-8: رقم الطلب الرئيسي (O) - parentOrder

    placerGroupNumber = "", // ORC-4: رقم مجموعة الطلب (O)
    orderStatus = "", // ORC-5: حالة الطلب مثل "CM" مكتمل (O)
    responseFlag = "", // ORC-6: 'R' إن كان الرد مطلوبًا (O)
    quantityTiming = "", // ORC-7: توقيت وتكرار التنفيذ (O)
    parentOrder = "", // ORC-8: الطلب الأب (O)
    orderDateTime = new Date(), // ORC-9: وقت الطلب (O)
    enteredBy = "", // ORC-10: من أدخل الطلب (O)
    verifiedBy = "", // ORC-11: من تحقق من الطلب (O)
    entererLocation = "", // ORC-13: موقع الإدخال (O)
    callBackPhoneNumber = "", // ORC-14: رقم التواصل (O)
    orderEffectiveDateTime = "", // ORC-15: وقت التفعيل المتوقع (O)
    orderControlCodeReason = "", // ORC-16: سبب التعديل/الإلغاء (O)
    enteringOrganization = "", // ORC-17: اسم المنشأة التي أدخلت الطلب (O)
    enteringDevice = "", // ORC-18: الجهاز المستخدم للإدخال (O)
    actionBy = "", // ORC-19: منفذ الإجراء (O)
    advancedBeneficiaryNoticeCode = "", // ORC-20: كود مسؤولية الدفع ABN (O)
    orderingFacilityName = "", // ORC-21: اسم المنشأة الطالبة (O)
    orderingFacilityAddress = "", // ORC-22: عنوان المنشأة (O)
    orderingFacilityPhoneNumber = "", // ORC-23: رقم هاتف المنشأة (O)
    orderingProviderAddress = "", // ORC-24: عنوان الطبيب (O)
    orderStatusModifier = "", // ORC-25: تعديل على حالة الطلب (O)
    advancedBeneficiaryNoticeReason = "", // ORC-26: سبب تجاوز ABN (O)
    fillerExpectedAvailabilityDateTime = "", // ORC-27: وقت توفر النتيجة المتوقع (O)
    confidentialityCode = "", // ORC-28: كود السرية (مثال: "N") (O)
    orderType = "", // ORC-29: نوع الطلب (Routine, STAT) (O)
    entererAuthorizationMode = "", // ORC-30: طريقة التوثيق (O)
    parentUniversalServiceIdentifier = "", // ORC-31: معرف الخدمة الأب (O)
  } = config;

  // ✅ validations
  if (!["NW", "CA", "XO", "SN", "SC", "NA"].includes(orderControl)) {
    throw new Error(
      "❌ORC_1 must be one on the follow values NW, CA, XO, SN, SC, NA",
    );
  }
  if (!placerOrderNumber && !fillerOrderNumber) {
    throw new Error("❌ ORC_2 أو ORC_3 Required");
  }
  if (!orderingProvider) {
    throw new Error("❌ ORC_12 Required");
  }

  // ✅ إنشاء السطر النهائي للـ ORC Segment
  return [
    "ORC", // Segment Name
    orderControl, // ORC-1: كود التحكم
    placerOrderNumber, // ORC-2: رقم الطلب من الجهة الطالبة
    fillerOrderNumber, // ORC-3: رقم الطلب من الجهة المنفذة
    admissionNo || placerGroupNumber, // ORC-4: رقم مجموعة الطلب
    orderStatus, // ORC-5: حالة الطلب
    responseFlag, // ORC-6: هل يتطلب رد
    quantityTiming, // ORC-7: تفاصيل الكمية والتكرار
    masterOrderNo || parentOrder, // ORC-8: الطلب الأب
    formatDateTime(orderDateTime), // ORC-9: وقت الطلب
    enteredBy, // ORC-10: من أدخل الطلب
    verifiedBy, // ORC-11: من تحقق من الطلب
    orderingProvider, // ORC-12: الطبيب طالب الخدمة
    entererLocation, // ORC-13: موقع الإدخال
    callBackPhoneNumber, // ORC-14: هاتف التواصل
    formatDateTime(orderEffectiveDateTime), // ORC-15: وقت التفعيل المتوقع
    orderControlCodeReason, // ORC-16: سبب الكود (إلغاء - تعديل)
    enteringOrganization, // ORC-17: المؤسسة المُدخلة
    enteringDevice, // ORC-18: الجهاز المستخدم
    actionBy, // ORC-19: منفذ الإجراء
    advancedBeneficiaryNoticeCode, // ORC-20: كود ABN
    serviceDept || orderingFacilityName, // ORC-21: اسم المنشأة
    orderingFacilityAddress, // ORC-22: عنوان المنشأة
    orderingFacilityPhoneNumber, // ORC-23: هاتف المنشأة
    orderingProviderAddress, // ORC-24: عنوان الطبيب
    orderStatusModifier, // ORC-25: ملاحظات الحالة
    advancedBeneficiaryNoticeReason, // ORC-26: سبب تجاوز ABN
    formatDateTime(fillerExpectedAvailabilityDateTime), // ORC-27: وقت توفر النتيجة المتوقع
    confidentialityCode, // ORC-28: السرية
    orderType, // ORC-29: نوع الطلب
    entererAuthorizationMode, // ORC-30: طريقة التوثيق
    parentUniversalServiceIdentifier, // ORC-31: الخدمة الأب
  ].join("|");
};

export const createOBRSegment = (config = {}) => {
  const {
    // ✅ Required
    setId = "1", // OBR-1: رقم تسلسلي للسطر (R) — مثال: "1"
    placerOrderNumber = "", // OBR-2: رقم الطلب من الجهة الطالبة (R*) — مثال: "CLINIC-123"
    fillerOrderNumber = "", // OBR-3: رقم الطلب من الجهة المنفذة (R*) — مثال: "LAB-456"
    universalServiceIdentifier = "", // OBR-4: كود التحليل أو الخدمة (R) — مثال: "CBC^Complete Blood Count"

    // 🟡 Optional fields
    serviceDept = "", // يمكن إضافته في OBR-24 (diagnosticServSectionId)
    admissionNo = "", // يمكن إضافته في OBR-18 (placerField1)
    masterOrderNo = "", // يمكن إضافته في OBR-29 (parent)

    priority = "", // OBR-5: أولوية الطلب — مثال: "R" = Routine, "S" = Stat
    requestedDateTime = new Date(), // OBR-6: وقت إرسال الطلب — مثال: new Date()
    observationDateTime = "", // OBR-7: وقت التنفيذ المتوقع
    observationEndDateTime = "", // OBR-8: نهاية وقت الملاحظة
    collectionVolume = "", // OBR-9: كمية العينة — مثال: "5^mL"
    collectorIdentifier = "", // OBR-10: من قام بسحب العينة — مثال: "123^Ali^Nurse"
    specimenActionCode = "", // OBR-11: إجراء العينة — مثال: "A"
    dangerCode = "", // OBR-12: تحذير خطر العينة — مثال: "BIO"
    relevantClinicalInfo = "", // OBR-13: معلومات طبية مرتبطة — مثال: "Patient has fever"
    specimenReceivedDateTime = "", // OBR-14: وقت استلام العينة
    specimenSource = "", // OBR-15: مصدر العينة — مثال: "URINE"
    orderingProvider = "", // OBR-16: الطبيب الطالب — مثال: "567^Ahmed^Dr"
    orderCallbackPhoneNumber = "", // OBR-17: رقم الهاتف للمتابعة — مثال: "+966500000000"
    placerField1 = "", // OBR-18: بيانات إضافية من الجهة الطالبة
    placerField2 = "", // OBR-19: بيانات إضافية من الجهة الطالبة
    fillerField1 = "", // OBR-20: بيانات إضافية من الجهة المنفذة
    fillerField2 = "", // OBR-21: بيانات إضافية من الجهة المنفذة
    resultRptStatusChangeDateTime = "", // OBR-22: وقت تحديث حالة النتيجة
    chargeToPractice = "", // OBR-23: بيانات الفاتورة — مثال: "Bill^Insurance"
    diagnosticServSectionId = "", // OBR-24: رمز القسم التشخيصي — مثال: "RAD"
    resultStatus = "", // OBR-25: حالة النتيجة — مثال: "F" = Final
    parentResult = "", // OBR-26: مرجع لنتيجة سابقة
    quantityTiming = "", // OBR-27: كمية وتوقيت الطلب — مثال: "1^D" = مرة يومياً
    resultCopiesTo = "", // OBR-28: نسخة إلى جهة أخرى — مثال: "Physician^Ali"
    parent = "", // OBR-29: الطلب الأب
    transportationMode = "", // OBR-30: وسيلة نقل العينة
    reasonForStudy = "", // OBR-31: سبب الدراسة — مثال: "Check for infection"
    principalResultInterpreter = "", // OBR-32: الطبيب المفسّر الرئيسي
    assistantResultInterpreter = "", // OBR-33: الطبيب المساعد
    technician = "", // OBR-34: الفني المنفذ
    transcriptionist = "", // OBR-35: الكاتب
    scheduledDateTime = "", // OBR-36: وقت التنفيذ المجدول
    numberOfSampleContainers = "", // OBR-37: عدد أنابيب العينة
    transportLogistics = "", // OBR-38: ملاحظات نقل العينة
    collectorComment = "", // OBR-39: ملاحظات من الساحب
    transportArrangementResp = "", // OBR-40: مسؤول الترتيب
    transportArranged = "", // OBR-41: هل تم الترتيب — "Y" أو "N"
    escortRequired = "", // OBR-42: هل يتطلب مرافقة — "Y" أو "N"
    plannedTransportComment = "", // OBR-43: ملاحظات النقل المخطط له
    procedureCode = "", // OBR-44: كود الإجراء
    procedureCodeModifier = "", // OBR-45: تعديل كود الإجراء
    placerSupplementalServiceInfo = "", // OBR-46: معلومات إضافية من الجهة الطالبة
    fillerSupplementalServiceInfo = "", // OBR-47: معلومات إضافية من الجهة المنفذة
    medicalNecessityProcedureReason = "", // OBR-48: سبب طبي للطلب
    resultHandling = "", // OBR-49: طريقة التعامل مع النتائج
    parentUniversalServiceIdentifier = "", // OBR-50: كود الخدمة الأب
  } = config;

  // ✅ validations
  if (!universalServiceIdentifier) {
    throw new Error("❌ OBR-4: required universalServiceIdentifier.");
  }

  if (!placerOrderNumber && !fillerOrderNumber) {
    throw new Error("❌ OBR-2 or OBR-3 is required.");
  }

  // 🔧 إنشاء السطر النهائي للـ OBR Segment
  return [
    "OBR",
    setId, // OBR-1: رقم تسلسلي
    placerOrderNumber, // OBR-2: رقم الطلب من الجهة الطالبة
    fillerOrderNumber, // OBR-3: رقم الطلب من الجهة المنفذة
    universalServiceIdentifier, // OBR-4: كود الخدمة/التحليل
    priority, // OBR-5: أولوية الطلب
    formatDateTime(requestedDateTime), // OBR-6: وقت الطلب
    formatDateTime(observationDateTime), // OBR-7: وقت التنفيذ
    formatDateTime(observationEndDateTime), // OBR-8: نهاية التنفيذ
    collectionVolume, // OBR-9: حجم العينة
    collectorIdentifier, // OBR-10: الساحب
    specimenActionCode, // OBR-11: إجراء العينة
    dangerCode, // OBR-12: كود الخطر
    relevantClinicalInfo, // OBR-13: معلومات طبية
    formatDateTime(specimenReceivedDateTime), // OBR-14: وقت استلام العينة
    specimenSource, // OBR-15: مصدر العينة
    orderingProvider, // OBR-16: الطبيب الطالب
    orderCallbackPhoneNumber, // OBR-17: هاتف للمتابعة
    admissionNo || placerField1, // OBR-18
    placerField2, // OBR-19
    fillerField1, // OBR-20
    fillerField2, // OBR-21
    formatDateTime(resultRptStatusChangeDateTime), // OBR-22
    chargeToPractice, // OBR-23
    serviceDept || diagnosticServSectionId, // OBR-24
    resultStatus, // OBR-25
    parentResult, // OBR-26
    quantityTiming, // OBR-27
    resultCopiesTo, // OBR-28
    masterOrderNo || parent, // OBR-29
    transportationMode, // OBR-30
    reasonForStudy, // OBR-31
    principalResultInterpreter, // OBR-32
    assistantResultInterpreter, // OBR-33
    technician, // OBR-34
    transcriptionist, // OBR-35
    formatDateTime(scheduledDateTime), // OBR-36
    numberOfSampleContainers, // OBR-37
    transportLogistics, // OBR-38
    collectorComment, // OBR-39
    transportArrangementResp, // OBR-40
    transportArranged, // OBR-41
    escortRequired, // OBR-42
    plannedTransportComment, // OBR-43
    procedureCode, // OBR-44
    procedureCodeModifier, // OBR-45
    placerSupplementalServiceInfo, // OBR-46
    fillerSupplementalServiceInfo, // OBR-47
    medicalNecessityProcedureReason, // OBR-48
    resultHandling, // OBR-49
    parentUniversalServiceIdentifier, // OBR-50
  ].join("|");
};

export async function createORMMessage(
  patient,
  visit = {},
  order = {},
  event = {},
  diagnosis = [],
  deliveryData = { deliveries: [], deliveryDetails: [] },
  facilityId
) {
  const hl7Config = await getHL7Config(facilityId);

  const segments = [];
  deliveryData.deliveries.forEach(delivery => {
    const details = deliveryData.deliveryDetails.filter(
      d => d.delivery_id === delivery.delivery_id
    );
    
    segments.push(...createDeliveryZSegments({
      ...delivery,
      details: details
    }));
  });

  // console.log({segments});
  

  const msg = [
    createMSHSegment({
      messageType: "ORM^O01",
      sendingFacility: hl7Config.NPHIES_CS_SENDING_FACILITY,
      sendingApp: hl7Config.HL7_SENDING_APP,
      receivingApp: 'MOH^2.16.840.1.113883.3.3731.1.1.2^ISO',
      sendingFacilityOID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createEVNSegment({
      eventType: "O01",
      operatorId: visit.attendingDoctor?.id || "",
      facilityOID: '2.16.840.1.113883.3.3731.1.2.2',
      ...event,
    }),
    createPIDSegment(patient, patient.identityNo, patient.mrn, patient.idType, {
      GOVERNMENT_OID: '2.16.840.1.113883.3.3731.1.1100.1&ISO',
      HL7_SENDING_FACILITY_OID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createPV1Segment({
      ...visit,
      patientClass: visit.ATTENDANCE_TYPE || "O",
      ATTENDANCE_TYPE: visit.ATTENDANCE_TYPE || "O",
      visit_no: visit.VISIT_NO || Date.now().toString().slice(0, 5),
      admitDate: visit.START_DATE || new Date(),
    }),

    createORCSegment({
      serviceDept: order.SERVICE_DEPT,
      admissionNo: order.ADMISSION_NO,
      masterOrderNo: order.MASTER_ORDER_NO,
      orderControl: order.ORDER_CONTROL || "NW", // ORC-1: من حقل ORDER_CONTROL إن وجد
      placerOrderNumber:
        order.OF_ORDER_NO || order.MASTER_ORDER_NO || "UNKNOWN", // ORC-2: من OF_ORDER_NO أو MASTER_ORDER_NO
      fillerOrderNumber:
        order.ORDER_LINE || order.FILLER_ORDER_MASTER || "UNKNOWN", // ORC-3: من FILLER_ORDER_MASTER أو ORDER_LINE
      orderingProvider: `${order.CONSULTANT_ID || ""}^${
        order.ORDER_BY_TYPE || ""
      }^${order.STAFF_ID || ""}`, // ORC-12: دمج عدة حقول
      orderDateTime: new Date(
        order.CREATION_DATE || order.ORDER_DATE || Date.now(),
      ), // ORC-9
      orderStatus: `${order.STATUS || ""}^${order.OM_STATUS}`, // ORC-5: من STATUS مع افتراضي "In Progress"
      orderType: order.URGENT_FLAG, // ORC-29
      orderStatusModifier: order.STATUS_REASON, // ORC-25: من STATUS_REASON
      confidentialityCode: order.CONFIDENTIALITY_FLAG || "N", // ORC-28
      parentOrder: order.PARENT_ORDER_LINE, // ORC-8: من PARENT_ORDER_LINE
      orderEffectiveDateTime: order.LINE_ORDER_DATE
        ? new Date(order.LINE_ORDER_DATE)
        : null, // ORC-15
      fillerExpectedAvailabilityDateTime: order.LINE_EXPIRY_DATE
        ? new Date(order.LINE_EXPIRY_DATE)
        : null, // ORC-27
      advancedBeneficiaryNoticeCode: order.PRE_AUTH_REQUIRED || "N", // ORC-20
      enteredBy: order.CREATED_BY_USER || "SYSTEM", // ORC-10
      verifiedBy: order.PHARMACIST_REVIEW || order.NURSE_REVIEW_REQUIRED || "", // ORC-11
      entererLocation: order.HOSPITAL_ID || "", // ORC-13
      orderingFacilityName: order.ORDERING_FACILITY_NAME || "", // ORC-21
      orderingFacilityPhoneNumber: order.ORDERING_FACILITY_PHONE || "", // ORC-23
    }),

    createOBRSegment({
      setId: "1",
      placerOrderNumber:
        order.OF_ORDER_NO || order.MASTER_ORDER_NO || "UNKNOWN", // OBR-2
      fillerOrderNumber:
        order.FILLER_ORDER_MASTER || order.ORDER_LINE || "UNKNOWN", // OBR-3
      universalServiceIdentifier: `${order.IOS_MAIN || ""}^${
        order.BRAND_GENERIC_ID || ""
      }^${order.PROCEDURE_CODE || ""}`, // OBR-4
      priority: order.URGENT_FLAG, // OBR-5
      requestedDateTime: new Date(order.CREATION_DATE || Date.now()), // OBR-6
      observationDateTime: order.PACS_ORDER_STARTED_DATE
        ? new Date(order.PACS_ORDER_STARTED_DATE)
        : null, // OBR-7
      observationEndDateTime: order.PACS_ORDER_COMPLETED_DATE
        ? new Date(order.PACS_ORDER_COMPLETED_DATE)
        : null, // OBR-8
      specimenSource: order.SPECIMEN_SOURCE || "BLD", // OBR-15
      orderingProvider: `${order.CONSULTANT_ID || ""}^${
        order.ORDER_BY_TYPE || ""
      }^${order.STAFF_ID || ""}`, // OBR-16
      resultStatus: order.LAB_ACKNOWLEDGED ? "F" : "P", // OBR-25: إذا تم التحميل في LAB
      diagnosticServSectionId: order.DIAGNOSTIC_SECTION || "LAB", // OBR-24
      relevantClinicalInfo: order.RELEVANT_CLINICAL_INFO || "", // OBR-13
      quantityTiming: order.DOSAGE_CODE || "", // OBR-27
      procedureCode: order.PROCEDURE_CODE || "", // OBR-44
      reasonForStudy: order.REASON_FOR_IOS || "", // OBR-31
      specimenActionCode: order.SPECIMEN_ACTION_CODE || "A", // OBR-11
      collectorIdentifier: order.COLLECTOR_ID || "", // OBR-10
      transportArranged: order.TRANSPORT_ARRANGED || "N", // OBR-41
      resultHandling: order.RESULT_HANDLING || "", // OBR-49
      parentUniversalServiceIdentifier: order.PARENT_UNIVERSAL_SERVICE_ID || "", // OBR-50
      collectionVolume: order.UNITS_ORDERED || "", // OBR-9
    }),

    buildDG1Segments(diagnosis),
    ...segments
  ]
    .filter(Boolean)
    .join("\r\n");

    // console.log(msg , "m.sg ************************");
    

  return msg;
}
// !!!! end orm
//!!!! start rde

export const createRXESegment = (config = {}) => {
  const {
    // ✅ Required
    quantityTiming = "", // RXE-1: الكمية والتوقيت (R) — مثال: "1^D^X10" = مرة يومياً لمدة 10 أيام
    giveCode = "", // RXE-2: كود الدواء (R) — مثال: "000543^AMOXICILLIN^NDC"
    giveAmountMinimum = "", // RXE-3: الجرعة الدنيا (R) — مثال: "500"
    giveUnits = "", // RXE-4: وحدة الجرعة (R) — مثال: "MG"

    // 🟡 Optional
    giveAmountMaximum = "", // RXE-5: الجرعة القصوى (O)
    giveUnitsCode = "", // RXE-6: كود الوحدة (O) — مثال: "MG"
    giveDosageForm = "", // RXE-7: شكل الجرعة (O) — مثال: "TABLET"
    providerAdministrationInstructions = "", // RXE-8: تعليمات التعاطي (O) — مثال: "TAKE WITH FOOD"
    deliverToLocation = "", // RXE-9: موقع التسليم (O) — مثال: "PHARMACY"
    substitutionStatus = "", // RXE-10: حالة الاستبدال (O) — مثال: "G" = Generic
    dispenseAmount = "", // RXE-11: الكمية المعطاة (O) — مثال: "30"
    dispenseUnits = "", // RXE-12: وحدة الكمية (O) — مثال: "TAB"
    numberOfRefills = "", // RXE-13: عدد مرات إعادة الصرف (O) — مثال: "2"
    orderingProvidersDEANumber = "", // RXE-14: رقم ترخيص الطبيب (O)
    pharmacistVerifierID = "", // RXE-15: رقم الصيدلي المراجع (O)
    prescriptionNumber = "", // RXE-16: رقم الوصفة (O)
    numberOfRefillsRemaining = "", // RXE-17: عدد مرات إعادة الصرف المتبقية (O)
    numberOfRefillsDosesDispensed = "", // RXE-18: عدد الجرعات المعطاة (O)
    DTOfMostRecentRefillOrDoseDispensed = "", // RXE-19: تاريخ آخر صرف (O)
    totalDailyDose = "", // RXE-20: الجرعة اليومية الكلية (O)
    needsHumanReview = "", // RXE-21: يحتاج مراجعة بشرية (O) — "Y" أو "N"
    specialDispensingInstructions = "", // RXE-22: تعليمات صرف خاصة (O)
    givePerTimeUnit = "", // RXE-23: الجرعة لكل وحدة زمنية (O) — مثال: "2"
    giveRateAmount = "", // RXE-24: معدل الجرعة (O)
    giveRateUnits = "", // RXE-25: وحدة معدل الجرعة (O)
    giveStrength = "", // RXE-26: قوة الدواء (O)
    giveStrengthUnits = "", // RXE-27: وحدة قوة الدواء (O)
    giveIndication = "", // RXE-28: مؤشر الاستعمال (O)
    dispensePackageSize = "", // RXE-29: حجم العبوة (O)
    dispensePackageSizeUnit = "", // RXE-30: وحدة حجم العبوة (O)
    dispensePackageMethod = "", // RXE-31: طريقة التغليف (O)
    supplementaryCode = "", // RXE-32: أكواد إضافية (O)
    originalOrderDateTime = "", // RXE-33: تاريخ الأمر الأصلي (O)
    giveDrugStrengthVolume = "", // RXE-34: حجم قوة الدواء (O)
    giveDrugStrengthVolumeUnits = "", // RXE-35: وحدة حجم قوة الدواء (O)
    controlledSubstanceSchedule = "", // RXE-36: جدولة الدواء (O)
    formularyStatus = "", // RXE-37: حالة الدواء في الفورمولاري (O)
    pharmaceuticalSubstanceAlternative = "", // RXE-38: بديل المادة الدوائية (O)
    pharmacyOfMostRecentFill = "", // RXE-39: الصيدلية التي صرفت آخر مرة (O)
    initialDispenseAmount = "", // RXE-40: الكمية المعطاة أول مرة (O)
    dispensingPharmacy = "", // RXE-41: الصيدلية الصارفة (O)
    dispensingPharmacyAddress = "", // RXE-42: عنوان الصيدلية (O)
    deliverToPatientLocation = "", // RXE-43: موقع تسليم المريض (O)
    deliverToAddress = "", // RXE-44: عنوان التسليم (O)
    pharmacyOrderType = "", // RXE-45: نوع أمر الصيدلية (O)
  } = config;

  // ✅ التحقق من الحقول الإلزامية
  if (!quantityTiming || !giveCode || !giveAmountMinimum || !giveUnits) {
    throw new Error("❌ RXE-1, RXE-2, RXE-3, RXE-4 are required");
  }

  return [
    "RXE", // اسم المقطع
    quantityTiming, // RXE-1
    giveCode, // RXE-2
    giveAmountMinimum, // RXE-3
    giveUnits, // RXE-4
    giveAmountMaximum, // RXE-5
    giveUnitsCode, // RXE-6
    giveDosageForm, // RXE-7
    providerAdministrationInstructions, // RXE-8
    deliverToLocation, // RXE-9
    substitutionStatus, // RXE-10
    dispenseAmount, // RXE-11
    dispenseUnits, // RXE-12
    numberOfRefills, // RXE-13
    orderingProvidersDEANumber, // RXE-14
    pharmacistVerifierID, // RXE-15
    prescriptionNumber, // RXE-16
    numberOfRefillsRemaining, // RXE-17
    numberOfRefillsDosesDispensed, // RXE-18
    formatDateTime(DTOfMostRecentRefillOrDoseDispensed), // RXE-19
    totalDailyDose, // RXE-20
    needsHumanReview, // RXE-21
    specialDispensingInstructions, // RXE-22
    givePerTimeUnit, // RXE-23
    giveRateAmount, // RXE-24
    giveRateUnits, // RXE-25
    giveStrength, // RXE-26
    giveStrengthUnits, // RXE-27
    giveIndication, // RXE-28
    dispensePackageSize, // RXE-29
    dispensePackageSizeUnit, // RXE-30
    dispensePackageMethod, // RXE-31
    supplementaryCode, // RXE-32
    formatDateTime(originalOrderDateTime), // RXE-33
    giveDrugStrengthVolume, // RXE-34
    giveDrugStrengthVolumeUnits, // RXE-35
    controlledSubstanceSchedule, // RXE-36
    formularyStatus, // RXE-37
    pharmaceuticalSubstanceAlternative, // RXE-38
    pharmacyOfMostRecentFill, // RXE-39
    initialDispenseAmount, // RXE-40
    dispensingPharmacy, // RXE-41
    dispensingPharmacyAddress, // RXE-42
    deliverToPatientLocation, // RXE-43
    deliverToAddress, // RXE-44
    pharmacyOrderType, // RXE-45
  ].join("|");
};

export const createRXOSegment = (config = {}) => {
  const {
    // ✅ Required
    requestedGiveCode = "", // RXO-1: كود الدواء المطلوب (R) — مثال: "000543^AMOXICILLIN^NDC"
    requestedGiveAmountMinimum = "", // RXO-2: الحد الأدنى للجرعة (R) — مثال: "500"
    requestedGiveUnits = "", // RXO-3: وحدة الجرعة (R) — مثال: "MG"

    // 🟡 Optional
    requestedGiveAmountMaximum = "", // RXO-4: الحد الأقصى للجرعة (O)
    requestedGiveUnitsCode = "", // RXO-5: كود الوحدة (O)
    requestedDosageForm = "", // RXO-6: شكل الجرعة المطلوب (O)
    providersAdministrationInstructions = "", // RXO-7: تعليمات التعاطي (O)
    deliverToLocation = "", // RXO-8: موقع التسليم (O)
    allowSubstitutions = "", // RXO-9: السماح بالاستبدال (O) — "Y" أو "N"
    requestedDispenseAmount = "", // RXO-10: الكمية المطلوب صرفها (O)
    requestedDispenseUnits = "", // RXO-11: وحدة الكمية (O)
    numberOfRefills = "", // RXO-12: عدد مرات إعادة الصرف (O)
    orderingProvidersDEANumber = "", // RXO-13: رقم ترخيص الطبيب (O)
    pharmacistVerifierID = "", // RXO-14: رقم الصيدلي المراجع (O)
    requestedGivePerTimeUnit = "", // RXO-15: الجرعة لكل وحدة زمنية (O)
    requestedGiveStrength = "", // RXO-16: قوة الدواء المطلوبة (O)
    requestedGiveStrengthUnits = "", // RXO-17: وحدة القوة (O)
    indication = "", // RXO-18: مؤشر الاستعمال (O)
    requestedGiveRateAmount = "", // RXO-19: معدل الجرعة المطلوب (O)
    requestedGiveRateUnits = "", // RXO-20: وحدة معدل الجرعة (O)
    totalDailyDose = "", // RXO-21: الجرعة اليومية الكلية (O)
    supplementaryCode = "", // RXO-22: أكواد إضافية (O)
    requestedDrugStrengthVolume = "", // RXO-23: حجم قوة الدواء المطلوب (O)
    requestedDrugStrengthVolumeUnits = "", // RXO-24: وحدة الحجم (O)
    controlledSubstanceSchedule = "", // RXO-25: جدولة الدواء (O)
    formularyStatus = "", // RXO-26: حالة الدواء في الفورمولاري (O)
    pharmaceuticalSubstanceAlternative = "", // RXO-27: بديل المادة الدوائية (O)
    pharmacyOfMostRecentFill = "", // RXO-28: الصيدلية التي صرفت آخر مرة (O)
  } = config;

  // ✅ التحقق من الحقول الإلزامية
  if (
    !requestedGiveCode ||
    !requestedGiveAmountMinimum ||
    !requestedGiveUnits
  ) {
    throw new Error("❌ RXO-1, RXO-2, RXO-3 are required");
  }

  return [
    "RXO", // اسم المقطع
    requestedGiveCode, // RXO-1
    requestedGiveAmountMinimum, // RXO-2
    requestedGiveUnits, // RXO-3
    requestedGiveAmountMaximum, // RXO-4
    requestedGiveUnitsCode, // RXO-5
    requestedDosageForm, // RXO-6
    providersAdministrationInstructions, // RXO-7
    deliverToLocation, // RXO-8
    allowSubstitutions, // RXO-9
    requestedDispenseAmount, // RXO-10
    requestedDispenseUnits, // RXO-11
    numberOfRefills, // RXO-12
    orderingProvidersDEANumber, // RXO-13
    pharmacistVerifierID, // RXO-14
    requestedGivePerTimeUnit, // RXO-15
    requestedGiveStrength, // RXO-16
    requestedGiveStrengthUnits, // RXO-17
    indication, // RXO-18
    requestedGiveRateAmount, // RXO-19
    requestedGiveRateUnits, // RXO-20
    totalDailyDose, // RXO-21
    supplementaryCode, // RXO-22
    requestedDrugStrengthVolume, // RXO-23
    requestedDrugStrengthVolumeUnits, // RXO-24
    controlledSubstanceSchedule, // RXO-25
    formularyStatus, // RXO-26
    pharmaceuticalSubstanceAlternative, // RXO-27
    pharmacyOfMostRecentFill, // RXO-28
  ].join("|");
};

export const createRXCSegment = (config = {}) => {
  const {
    // ✅ Required
    componentType = "B", // RXC-1: نوع المكون (R) — "B" = Base, "A" = Additive
    componentCode = "", // RXC-2: كود المكون (R) — مثال: "001234^SALINE^NDC"
    componentAmount = "", // RXC-3: كمية المكون (R) — مثال: "100"
    componentUnits = "", // RXC-4: وحدة الكمية (R) — مثال: "ML"

    // 🟡 Optional
    componentStrength = "", // RXC-5: قوة المكون (O)
    componentStrengthUnits = "", // RXC-6: وحدة القوة (O)
    supplementaryCode = "", // RXC-7: أكواد إضافية (O)
    componentDrugStrengthVolume = "", // RXC-8: حجم قوة الدواء (O)
    componentDrugStrengthVolumeUnits = "", // RXC-9: وحدة الحجم (O)
  } = config;

  // ✅ التحقق من الحقول الإلزامية
  if (!componentCode || !componentAmount || !componentUnits) {
    throw new Error("❌ RXC-2, RXC-3, RXC-4 are required");
  }

  return [
    "RXC", // اسم المقطع
    componentType, // RXC-1
    componentCode, // RXC-2
    componentAmount, // RXC-3
    componentUnits, // RXC-4
    componentStrength, // RXC-5
    componentStrengthUnits, // RXC-6
    supplementaryCode, // RXC-7
    componentDrugStrengthVolume, // RXC-8
    componentDrugStrengthVolumeUnits, // RXC-9
  ].join("|");
};

export async function createRDEMessage(
  patient,
  visit = {},
  order = {},
  event = {},
  diagnosis = [],
  deliveryData = { deliveries: [], deliveryDetails: [] },
) {
  const hl7Config = await getHL7Config();
    const segments = [];
  deliveryData.deliveries.forEach(delivery => {
    const details = deliveryData.deliveryDetails.filter(
      d => d.delivery_id === delivery.delivery_id
    );
    
    segments.push(...createDeliveryZSegments({
      ...delivery,
      details: details
    }));
  });

  const msg = [
    createMSHSegment({
      messageType: "RDE^O11",
      sendingFacility: hl7Config.NPHIES_CS_SENDING_FACILITY,
      sendingApp: hl7Config.HL7_SENDING_APP,
      receivingApp: 'MOH^2.16.840.1.113883.3.3731.1.1.2^ISO',
      sendingFacilityOID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createEVNSegment({
      eventType: "O11",
      operatorId: visit.attendingDoctor?.id || "",
      facilityOID: '2.16.840.1.113883.3.3731.1.2.2',
      ...event,
    }),
    createPIDSegment(patient, patient.identityNo, patient.mrn, patient.idType, {
      GOVERNMENT_OID: '2.16.840.1.113883.3.3731.1.1100.1&ISO',
      HL7_SENDING_FACILITY_OID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createPV1Segment({
      ...visit,
      patientClass: visit.ATTENDANCE_TYPE || "O",
      ATTENDANCE_TYPE: visit.ATTENDANCE_TYPE || "O",
      visit_no: visit.VISIT_NO || Date.now().toString().slice(0, 5),
      admitDate: visit.START_DATE || new Date(),
    }),

    createORCSegment({
      serviceDept: order.SERVICE_DEPT,
      admissionNo: order.ADMISSION_NO,
      masterOrderNo: order.MASTER_ORDER_NO,
      orderControl: order.ORDER_CONTROL || "NW", // ORC-1: من حقل ORDER_CONTROL إن وجد
      placerOrderNumber: order.IOS_MAIN || order.MASTER_ORDER_NO || "UNKNOWN", // ORC-2: من OF_ORDER_NO أو MASTER_ORDER_NO
      fillerOrderNumber:
        order.ORDER_LINE || order.FILLER_ORDER_MASTER || "UNKNOWN", // ORC-3: من FILLER_ORDER_MASTER أو ORDER_LINE
      orderingProvider: `${order.CONSULTANT_ID || ""}^${
        order.ORDER_BY_TYPE || ""
      }^${order.STAFF_ID || ""}`, // ORC-12: دمج عدة حقول
      orderDateTime: new Date(
        order.CREATION_DATE || order.ORDER_DATE || Date.now(),
      ), // ORC-9
      orderStatus: `${order.STATUS || ""}^${order.OM_STATUS}`, // ORC-5: من STATUS مع افتراضي "In Progress"
      orderType: order.URGENT_FLAG === "Y" ? "STAT" : "ROUTINE", // ORC-29
      orderStatusModifier: order.STATUS_REASON, // ORC-25: من STATUS_REASON
      confidentialityCode: order.CONFIDENTIALITY_FLAG || "N", // ORC-28
      parentOrder: order.PARENT_ORDER_LINE, // ORC-8: من PARENT_ORDER_LINE
      orderEffectiveDateTime: order.LINE_ORDER_DATE
        ? new Date(order.LINE_ORDER_DATE)
        : null, // ORC-15
      fillerExpectedAvailabilityDateTime: order.LINE_EXPIRY_DATE
        ? new Date(order.LINE_EXPIRY_DATE)
        : null, // ORC-27
      advancedBeneficiaryNoticeCode: order.PRE_AUTH_REQUIRED || "N", // ORC-20
      enteredBy: order.CREATED_BY_USER || "SYSTEM", // ORC-10
      verifiedBy: order.PHARMACIST_REVIEW || order.NURSE_REVIEW_REQUIRED || "", // ORC-11
      entererLocation: order.HOSPITAL_ID || "", // ORC-13
      orderingFacilityName: order.ORDERING_FACILITY_NAME || "", // ORC-21
      orderingFacilityPhoneNumber: order.ORDERING_FACILITY_PHONE || "", // ORC-23
    }),

    // ⭐ المقاطع الجديدة الخاصة بـ RDE
    // RXO Segment
    createRXOSegment({
      // ✅ Required Fields
      requestedGiveCode: `${order.PRESCRIBED_CODE}^${
        order.ITEM_DESCRIPTION || "DRUG"
      }^NDC`, // RXO-1
      requestedGiveAmountMinimum: order.UNIT || "unknown", // RXO-2
      requestedGiveUnits: order.UNIT_TYPE_RAW || "unknewn", // RXO-3

      // 🟡 Optional Fields
      requestedGiveAmountMaximum: order.DOSE_RATE_VALUE || "", // RXO-4
      requestedGiveUnitsCode: order.DOSE_RATE_CODE || "", // RXO-5
      requestedDosageForm: order.UNIT_TYPE_RAW || "", // RXO-6
      providersAdministrationInstructions: `${order.DOSAGE || ""} ${
        order.PER || ""
      }`, // RXO-7
      allowSubstitutions: order.SELECTION_REASON_RAW === "GENERIC" ? "Y" : "N", // RXO-9
      requestedDispenseAmount: order.SUPPLY_PERIOD
        ? order.UNIT * order.SUPPLY_PERIOD
        : order.UNIT, // RXO-10
      requestedDispenseUnits: order.UNIT_TYPE_RAW || "", // RXO-11
      numberOfRefills: order.SUPPLY_PERIOD || "0", // RXO-12
      orderingProvidersDEANumber: order.STAFF_ID || "", // RXO-13
      requestedGivePerTimeUnit: order.FREQUENCY || "", // RXO-15
      requestedGiveStrength: order.STRENGTH || "", // RXO-16
      requestedGiveStrengthUnits: order.STRENGTH_UNIT || "MG", // RXO-17
      indication: order.DOSAGE_INSTRUCTION_TEXT || "", // RXO-18
      supplementaryCode: order.ITEM_NO || "", // RXO-22
    }),

    // RXE Segment
    createRXESegment({
      // ✅ Required Fields
      quantityTiming: `${order.DOSAGE_TIMES || ""}^${
        order.PERIOD_UNIT || ""
      }^X${order.DURATION_VALUE || "1"}`, // RXE-1
      giveCode: `${order.PRESCRIBED_CODE || ""}^${
        order.ITEM_DESCRIPTION || "DRUG"
      }^NDC`, // RXE-2
      giveAmountMinimum: order.UNIT || "unkknwon", // RXE-3
      giveUnits: order.UNIT_TYPE_RAW || "unknown", // RXE-4

      // 🟡 Optional Fields
      giveAmountMaximum: order.DOSE_RATE_VALUE || "", // RXE-5
      giveUnitsCode: order.DOSE_RATE_CODE || "", // RXE-6
      giveDosageForm: order.UNIT_TYPE_RAW || "", // RXE-7
      providerAdministrationInstructions: `${order.DOSAGE || ""} ${
        order.PER || ""
      }  ${order.DOSAGE_INSTRUCTION_TEXT || ""}`, // RXE-8
      deliverToLocation: order.PATIENT_INSTITUTION || "", // RXE-9
      substitutionStatus: order.SELECTION_REASON === "GENERIC" ? "G" : "D", // RXE-10
      // dispenseAmount: order.SUPPLY_PERIOD
      //   ? order.UNIT * order.SUPPLY_PERIOD
      //   : order.UNIT, // RXE-11
      dispenseAmount: order.UNITS_ORDERED,
      dispenseUnits: order.UNIT_TYPE_RAW, // RXE-12
      numberOfRefills: order.SUPPLY_PERIOD || "0", // RXE-13
      orderingProvidersDEANumber: order.STAFF_ID || "", // RXE-14
      DTOfMostRecentRefillOrDoseDispensed: order.REPEAT_START || "", // RXE-19
      totalDailyDose: order.DOSE_RATE_VALUE || "", // RXE-20
      needsHumanReview: order.MED_STATUS === "PENDING" ? "Y" : "N", // RXE-21
      specialDispensingInstructions: order.PATIENT_INSTRUCTION || "", // RXE-22
      givePerTimeUnit: order.FREQUENCY || "", // RXE-23
      giveRateAmount: order.DOSE_RATE_VALUE || "", // RXE-24
      giveRateUnits: order.DOSE_RATE_CODE || "", // RXE-25
      giveStrength: order.STRENGTH || "", // RXE-26
      giveStrengthUnits: order.STRENGTH_UNIT || "MG", // RXE-27
      giveIndication: order.DOSAGE_INSTRUCTION_TEXT || "", // RXE-28
      supplementaryCode: `${order.REQ_ITEM_ID || ""}^${
        order.ORDER_LINE_ID || ""
      }`, // RXE-32
      originalOrderDateTime: order.REPEAT_START || "", // RXE-33
      pharmacyOrderType: order.ROUTE_RAW, //-- RXE45
    }),

    // ⭐ إضافة مكونات الدواء إذا كانت متوفرة
    ...(order.components || []).map((component, index) =>
      createRXCSegment({
        componentType: component.TYPE || "B",
        componentCode: `${component.CODE || ""}^${component.NAME || ""}^NDC`,
        componentAmount: component.AMOUNT || "1",
        componentUnits: component.UNIT || "ML",
        componentStrength: component.STRENGTH || "",
        componentStrengthUnits: component.STRENGTH_UNIT || "",
      }),
    ),

    buildDG1Segments(diagnosis),
    ...segments
  ]
    .filter(Boolean)
    .join("\r\n");

  return msg;
}

// !!!! end rde
//!!!!! start oru
export const createOBXSegment = (config = {}) => {
  const {
    // ✅ Required
    setId = "1", // OBX-1: رقم تسلسلي (R) — يزيد مع كل نتيجة
    valueType = "", // OBX-2: نوع القيمة (R) — مثال: "NM" (Numeric), "ST" (String), "CE" (Coded Entry)
    observationIdentifier = "", // OBX-3: كود التحليل/الملاحظة (R) — مثال: "CBC^Complete Blood Count^L"
    observationValue = "", // OBX-5: قيمة النتيجة (R) — مثال: "12.5" أو "Positive"

    // 🟡 Optional
    observationSubId = "", // OBX-4: معرف فرعي (O)
    units = "", // OBX-6: الوحدة (O) — مثال: "g/dL"
    referencesRange = "", // OBX-7: المدى الطبيعي (O) — مثال: "10.0-15.0"
    abnormalFlags = "", // OBX-8: flags غير طبيعية (O) — مثال: "H" (High), "L" (Low)
    probability = "", // OBX-9: الاحتمالية (O)
    natureOfAbnormalTest = "", // OBX-10: طبيعة الاختبار غير الطبيعي (O)
    observationResultStatus = "F", // OBX-11: حالة النتيجة (O) — "F" (Final), "P" (Preliminary)
    effectiveDateOfReferenceRange = "", // OBX-12: تاريخ فعالية المدى الطبيعي (O)
    userDefinedAccessChecks = "", // OBX-13: checks وصول معرفة من قبل المستخدم (O)
    dateTimeOfTheObservation = new Date(), // OBX-14: وقت أخذ العينة/الملاحظة (O)
    producersReference = "", // OBX-15: مرجع المنتج (O)
    responsibleObserver = "", // OBX-16: المسؤول عن الملاحظة (O)
    observationMethod = "", // OBX-17: طريقة الملاحظة (O)
    equipmentInstanceIdentifier = "", // OBX-18: معرف الجهاز (O)
    dateTimeOfTheAnalysis = new Date(), // OBX-19: وقت التحليل (O)
    observationSite = "", // OBX-20: موقع الملاحظة (O)
    observationInstanceIdentifier = "", // OBX-21: معرف الملاحظة (O)
    moodCode = "", // OBX-22: كود الحالة (O)
    performingOrganizationName = "", // OBX-23: اسم المنظمة المنفذة (O)
    performingOrganizationAddress = "", // OBX-24: عنوان المنظمة المنفذة (O)
    performingOrganizationMedicalDirector = "", // OBX-25: المدير الطبي للمنظمة المنفذة (O)
  } = config;

  // ✅ التحقق من الحقول الإلزامية
  // if (
  //   !valueType ||
  //   !observationIdentifier ||
  //   observationValue === undefined ||
  //   observationValue === null
  // ) {
  //   throw new Error("❌ OBX-2, OBX-3, OBX-5 are required");
  // }

  return [
    "OBX", // اسم المقطع
    setId, // OBX-1
    valueType, // OBX-2
    observationIdentifier, // OBX-3
    observationSubId, // OBX-4
    observationValue, // OBX-5
    units, // OBX-6
    referencesRange, // OBX-7
    abnormalFlags, // OBX-8
    probability, // OBX-9
    natureOfAbnormalTest, // OBX-10
    observationResultStatus, // OBX-11
    formatDateTime(effectiveDateOfReferenceRange), // OBX-12
    userDefinedAccessChecks, // OBX-13
    formatDateTime(dateTimeOfTheObservation), // OBX-14
    producersReference, // OBX-15
    responsibleObserver, // OBX-16
    observationMethod, // OBX-17
    equipmentInstanceIdentifier, // OBX-18
    formatDateTime(dateTimeOfTheAnalysis), // OBX-19
    observationSite, // OBX-20
    observationInstanceIdentifier, // OBX-21
    moodCode, // OBX-22
    performingOrganizationName, // OBX-23
    performingOrganizationAddress, // OBX-24
    performingOrganizationMedicalDirector, // OBX-25
  ].join("|");
};

export async function createORUMessage(
  patient,
  visit = {},
  order = {},
  event = {},
  diagnosis = [],
  // results = [] //
  deliveryData = { deliveries: [], deliveryDetails: [] },
) {
  const hl7Config = await getHL7Config();
      const segments = [];
  deliveryData.deliveries.forEach(delivery => {
    const details = deliveryData.deliveryDetails.filter(
      d => d.delivery_id === delivery.delivery_id
    );
    
    segments.push(...createDeliveryZSegments({
      ...delivery,
      details: details
    }));
  });

  const msg = [
    createMSHSegment({
      messageType: "ORU^R01",
      sendingFacility: hl7Config.NPHIES_CS_SENDING_FACILITY,
      sendingApp: hl7Config.HL7_SENDING_APP,
      receivingApp: 'MOH^2.16.840.1.113883.3.3731.1.1.2^ISO',
      sendingFacilityOID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createEVNSegment({
      eventType: "R01",
      operatorId: visit.attendingDoctor?.id || "",
      facilityOID: '2.16.840.1.113883.3.3731.1.2.2',
      ...event,
    }),
    createPIDSegment(patient, patient.identityNo, patient.mrn, patient.idType, {
      GOVERNMENT_OID: '2.16.840.1.113883.3.3731.1.1100.1&ISO',
      HL7_SENDING_FACILITY_OID: '2.16.840.1.113883.3.3731.1.2.2',
    }),
    createPV1Segment({
      ...visit,
      patientClass: visit.ATTENDANCE_TYPE || "O",
      ATTENDANCE_TYPE: visit.ATTENDANCE_TYPE || "O",
      visit_no: visit.VISIT_NO || Date.now().toString().slice(0, 5),
      admitDate: visit.START_DATE || new Date(),
    }),

    createOBRSegment({
      setId: "1",
      placerOrderNumber:
        order.OF_ORDER_NO || order.MASTER_ORDER_NO || "UNKNOWN", // OBR-2
      fillerOrderNumber:
        order.FILLER_ORDER_MASTER || order.ORDER_LINE || "UNKNOWN", // OBR-3
      universalServiceIdentifier: `${order.IOS_MAIN || ""}^${
        order.BRAND_GENERIC_ID || ""
      }^${order.PROCEDURE_CODE || ""}`, // OBR-4
      priority: order.URGENT_FLAG, // OBR-5
      requestedDateTime: new Date(
        order.ORDER_DATE || order.CREATION_DATE || Date.now(),
      ), // OBR-6 //! 2-orderDate
      observationDateTime: order.PACS_ORDER_STARTED_DATE
        ? new Date(order.PACS_ORDER_STARTED_DATE)
        : null, // OBR-7
      observationEndDateTime: order.PACS_ORDER_COMPLETED_DATE
        ? new Date(order.PACS_ORDER_COMPLETED_DATE)
        : null, // OBR-8
      specimenSource: order.SPECIMEN_SOURCE || "BLD", // OBR-15
      orderingProvider: `${order.CONSULTANT_ID || ""}^${
        order.ORDER_BY_TYPE || ""
      }^${order.STAFF_ID || ""}`, // OBR-16
      resultStatus: `${order.STATUS || ""}^${order.OM_STATUS}`, // OBR-25: إذا تم التحميل في LAB //! 1-order status
      diagnosticServSectionId: order.DIAGNOSTIC_SECTION || "LAB", // OBR-24
      relevantClinicalInfo: order.RELEVANT_CLINICAL_INFO || "", // OBR-13
      quantityTiming: order.DOSAGE_CODE || "", // OBR-27
      procedureCode: order.PROCEDURE_CODE || "", // OBR-44
      reasonForStudy: order.REASON_FOR_IOS || "", // OBR-31
      specimenActionCode: order.SPECIMEN_ACTION_CODE || "A", // OBR-11
      collectorIdentifier: order.COLLECTOR_ID || "", // OBR-10
      transportArranged: order.TRANSPORT_ARRANGED || "N", // OBR-41
      resultHandling: order.RESULT_HANDLING || "", // OBR-49
      parentUniversalServiceIdentifier: order.PARENT_UNIVERSAL_SERVICE_ID || "", // OBR-50
      collectionVolume: order.UNITS_ORDERED || "", // OBR-9
      serviceDept: order.SERVICE_DEPT,
      admissionNo: order.ADMISSION_NO,
      masterOrderNo: order.MASTER_ORDER_NO,
      placerField2: order.HIS_LAB_ID, // OBR-19 his_lab_id

      // ✅ مكان order.status - الخيار الأفضل
      // resultStatus: order.status || "F", // OBR-25: حالة النتيجة

      // ✅ مكان line_expiry_date - الخيار الأفضل
      quantityTiming: order.LINE_EXPIRY_DATE
        ? new Date(order.LINE_EXPIRY_DATE).toISOString()
        : null, // OBR-27: الكمية والتوقيت

      // serviceDept = "", // يمكن إضافته في OBR-24 (diagnosticServSectionId)
      // admissionNo = "", // يمكن إضافته في OBR-18 (placerField1)
      // masterOrderNo = "", // يمكن إضافته في OBR-29 (parent)
    }),

    // ...results.map((result, index) =>
    createOBXSegment({
      observationMethod: order.METHOD, // OBX-17

      setId: order.OBX1_set_id, // OBX-1
      valueType: order.VALUE_TYPE, // OBX-2 → رقم
      observationIdentifier: `${order.OBSERVATION_ID}^${order.OBSERVATION_TEXT || ""}^L`, // OBX-3
      observationValue: order.RESULT_NUM || "", // OBX-5
      units: order.UNIT, // OBX-6
      referencesRange: `${order.START_NUMERIC_VALUE}-${order.END_NUMERIC_VALUE}`, // OBX-7
      abnormalFlags:
        order.RESULT_NUM < order.START_NUMERIC_VALUE
          ? "L"
          : order.RESULT_NUM > order.END_NUMERIC_VALUE
            ? "H"
            : "N", // OBX-8
      observationResultStatus: "F", // OBX-11
      dateTimeOfTheObservation: order.LAB_DATE, // OBX-14
      responsibleObserver: order.STAFF_ID, // OBX-16
      equipmentInstanceIdentifier: order.MACHINE_NO, // OBX-18
      dateTimeOfTheAnalysis: order.LAB_DATE, // OBX-19
      performingOrganizationName: `Hospital-${order.HOSPITAL_ID}`, // OBX-23
    }),
    // ),

    buildDG1Segments(diagnosis),
    ...segments
  ]
    .filter(Boolean)
    .join("\r\n");

  return msg;
}

// !!!! deleviry
//  Delivery  Segment (master and details)
export const createDeliveryZSegments = (config = {}) => {
  const {
    delivery_date = "",
    location_id = "",
    status = "",
    created_by = "",
    creation_date = "",
    modified_by = "",
    modification_date = "",
    his_delivery_id = "",

    details = [],
  } = config;

  const segments = [];

  segments.push(
    [
      "ZDS",
      his_delivery_id,
      formatDateTime(delivery_date),
      location_id,
      status,
      created_by,
      formatDateTime(creation_date),
      modified_by,
      formatDateTime(modification_date),
    ].join("|"),
  );

  details.forEach((detail) => {
    segments.push(
      [
        "ZDD",
        detail.his_delivery_id,
        detail.his_delivery_detail_id,
        detail.his_order_detail_id,
        detail.alt_item_id,
        detail.qty_delivered,
        detail.unit_price,
        detail.status,
        detail.created_by,
        formatDateTime(detail.creation_date),
        detail.modified_by,
        formatDateTime(detail.modification_date),
        formatDateTime(detail.delivery_date),
        detail.claim_req_id
        // detail.package_delivery_detail_id
      ].join("|"),
    );
  });

  return segments;
};
