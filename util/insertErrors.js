import {  query } from "../config/pgDB.js";

/** * Inserts error records into the `api_message` table for each error in the provided array. This function iterates over the array of error objects and executes an SQL INSERT statement for each error, populating the relevant fields such as `api
 * trans_id`, `error_element`, `element_value`, `resource`, `nphies_message_id`, and `nphies_message`. The function uses parameterized queries to prevent SQL injection and ensure safe database interactions.
 * @param {Array} errors - an array of error objects, each containing details about the error to be inserted into the database
 * @return {Promise<void>} a promise that resolves when all error records have been inserted into the database
 */
export async function insertErrors (errors = []) {
    for (const err of errors) { 
      await query(
            `INSERT INTO api_message (
              api_trans_id,
              error_element,
              element_value,
              resource,
              nphies_message_id,
              nphies_message
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6

            )
   
              `,
            [
              err.api_trans_id,
              err.error_element || "",
              err.element_value || "",
              err.resource || "",
              err.nphies_message_id || "",
              err.msg || "",
            ],
          );
    }
}