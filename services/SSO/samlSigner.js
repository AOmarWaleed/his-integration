import { SignedXml } from "xml-crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DOMParser } from "xmldom";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export const signSAMLResponse = (samlXml) => {
  return new Promise((resolve, reject) => {
    try {
      let privateKey, publicCert;
      
      try {
        privateKey = fs.readFileSync(
           path.join(__dirname, "../../certs/private.key.pem"),
          // path.join(__dirname, "../../certs/ghirnatah.private-key.pem"),
          "utf8",
        );

        global.SSO_PRIVATE_KEY = privateKey;

        publicCert = fs.readFileSync(
           path.join(__dirname, "../../certs/public.cert.pem"),
          // path.join(__dirname, "../../certs/ghirnatah.cert.pem"),
          // path.join(__dirname, "../../certs/ghirnatah.cert.pem"),
          "utf8",
        );

        global.SSO_PUBLIC_CERT = publicCert;

        SSO_LOGGER.info("Certificate files loaded successfully");
      } catch (error) {
        SSO_LOGGER.error("Error reading certificate files:", error);
        // process.exit(1);
      }

      SSO_LOGGER.verbose("Starting SAML Assertion signing");

      if (!privateKey) {
        throw new Error("Private key is not loaded");
      }

      const doc = new DOMParser().parseFromString(samlXml);

      const assertions = doc.getElementsByTagNameNS(
        "urn:oasis:names:tc:SAML:2.0:assertion",
        "Assertion",
      );

      if (!assertions.length) {
        throw new Error("Could not find Assertion element");
      }

      const assertion = assertions[0];
      const assertionId = assertion.getAttribute("ID");

      if (!assertionId) {
        throw new Error("Assertion ID not found");
      }

      SSO_LOGGER.debug(`Signing Assertion with ID: ${assertionId}`);

      const sig = new SignedXml();

      sig.idAttributes = ["ID"];

      sig.signingKey = privateKey;

      sig.signatureAlgorithm =
        "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
      sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";

      // Use XPath (required by xml-crypto 2.x)
      sig.addReference(
        "//*[local-name()='Assertion']",
        [
          "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
          "http://www.w3.org/2001/10/xml-exc-c14n#",
        ],
        "http://www.w3.org/2001/04/xmlenc#sha256",
      );

      // Prepare certificate
      const x509Cert = publicCert
        .replace("-----BEGIN CERTIFICATE-----", "")
        .replace("-----END CERTIFICATE-----", "")
        .replace(/\r?\n|\r/g, "");

      sig.keyInfoProvider = {
        getKeyInfo() {
          return `<ds:X509Data><ds:X509Certificate>${x509Cert}</ds:X509Certificate></ds:X509Data>`;
        },
      };

      sig.computeSignature(samlXml, {
        location: {
          reference: "//*[local-name()='Assertion']/*[local-name()='Issuer']",
          action: "after",
        },
        prefix: "ds",
      });

      const signedXml = sig.getSignedXml();

      if (signedXml.includes("<ds:Signature")) {
        SSO_LOGGER.info("✅ SAML Assertion signed with ds:prefix");

        if (signedXml.includes("</saml:Issuer><ds:Signature")) {
          SSO_LOGGER.info("✅ Signature placed correctly after Issuer");
        } else {
          SSO_LOGGER.warn("⚠️ Signature may not be in the correct position");
        }
      } else {
        SSO_LOGGER.warn("⚠️ Signature may not have ds:prefix");
      }

      resolve(signedXml);
    } catch (error) {
      SSO_LOGGER.error(`SAML signing error: ${error.message}`);
      reject(error);
    }
  });
};
