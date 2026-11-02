import { clientLogger } from "../config/logger.js";
// import { handleDocOrderRequest } from "../services/doc/docMain.v2.js";
import { handleDocOrderRequest } from "../services/doc/docMain.js";

/**
 * MAIN HANDLER for doc order requests
 */
export const docOrderRequestControllers = async (req, res, next) => {
  //const startTotal = process.hrtime.bigint();
  //const startPreprocess = process.hrtime.bigint();
  const requestUrl = `${req.originalUrl}`;
  clientLogger.info(
    `Received doc order request with query params: ${JSON.stringify(req.query)}`
  );

  const facility = req.facility;
  const connection = req.oracleConnection;
  try {
    const params = {
      patientId: req.query.patientId || null,
      episodeNo: req.query.episodeNo || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      docType: req.query.docType || null,
      status: req.query.status || null,
      orderLine: req.query.order_line || null,
      documentId: req.query.documentId || null,
      isCancel: req.query.isCancel || null,
      // cdType: req.query.cdType || null,
    };

    const results = await handleDocOrderRequest({
      params,
      facility,
      connection,
      requestUrl
    });

    const isAllSuccess = results.failedCount === 0;
    const description = `${results.message}${results.exportedBundles?.length > 0 ? `\nSuccess transactions id (${results.exportedBundles.map((b) => b.api_trans_id).join(", ")})` : ""}${results.failedRequests?.length > 0 ? `\nFailed transactions id (${results.failedRequests.map((b) => b.api_trans_id + " : " + b.message).join(", ")})` : ""}`;


    

    if(isAllSuccess){
      return res.json({
        success: true,
        data : {
          msgId : 10001,
          description : description
        }
      })
    }else {
      return res.status(400).json({
        success: false,
        data : {
          msgId : -10003,
          description : description?.length > 100 ? (description?.split(' ' , 30).join(' ') + '...') : description
        }
      })
    }

 
  } catch (error) {

    clientLogger.debug( error .message);
    clientLogger.debug( error .stack);
    // next(error);
    res.status(500).json({
      success: false,
      data: {
        description:
          error.message ||
          "An error occurred while processing the doc order request",
        msgId: -10002,
      },
      details: {
        error: error.message,
        stack: error.stack,
      },
    });
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (err) {
        clientLogger.error("Error closing connection:", err);
      }
    }
  }
};
