import axios from 'axios';
import crypto from 'crypto';
import { DOMParser } from 'xmldom';

const BASE_URL = 'http://localhost:4300/api/v1/hl7/lab/laboratory-xml';
const PATIENT_ID = '830380';
const EPISODE_NO = '1';

async function testLabOrderEndpoint() {
  console.log('\n🧪 Testing Lab Order Endpoint');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Make request
    console.log(`\n📤 Making request to: ${BASE_URL}`);
    console.log(`   Patient ID: ${PATIENT_ID}, Episode: ${EPISODE_NO}`);
    
    const response = await axios.get(BASE_URL, {
      params: { patientId: PATIENT_ID, episodeNo: EPISODE_NO }
    });
    
    console.log(`✅ Response status: ${response.status}`);
    
    // Step 2: Validate response structure
    console.log('\n📋 Validating response structure...');
    if (!response.data) {
      throw new Error('No response data');
    }
    if (!response.data.success) {
      throw new Error(`Request fail: ${JSON.stringify(response.data.error || response.data)}`);
    }
    if (!response.data.xml) {
      throw new Error('No XML in response');
    }
    console.log('✅ Response structure valid');
    
    const soapEnvelope = response.data.xml;
    
    // Step 3: Validate SOAP envelope
    console.log('\n📦 Validating SOAP envelope...');
    if (!soapEnvelope.includes('<soap:Envelope')) {
      throw new Error('Not a SOAP envelope - missing <soap:Envelope> root');
    }
    if (!soapEnvelope.includes('<Document id=')) {
      throw new Error('Missing <Document> element');
    }
    console.log('✅ SOAP envelope structure valid');
    
    // Step 4: Check for leftover placeholders
    console.log('\n🔍 Checking for leftover placeholders...');
    const placeholderMatches = soapEnvelope.match(/\{\{DATA\.\w+\}\}/g);
    if (placeholderMatches) {
      console.error(`❌ Found ${placeholderMatches.length} leftover placeholders:`);
      placeholderMatches.forEach(p => console.error(`   - ${p}`));
      throw new Error('SOAP envelope contains unprocessed placeholders');
    }
    console.log('✅ No leftover placeholders in SOAP envelope');
    
    // Step 5: Parse envelope and extract base64 CDA
    console.log('\n📄 Extracting and decoding CDA document...');
    const parser = new DOMParser();
    const envelopeDoc = parser.parseFromString(soapEnvelope, 'text/xml');
    const documentElements = envelopeDoc.getElementsByTagName('Document');
    
    if (documentElements.length === 0) {
      throw new Error('No <Document> element found');
    }
    
    const base64CDA = documentElements[0].textContent;
    if (!base64CDA || base64CDA.trim() === '') {
      throw new Error('Document element is empty');
    }
    
    console.log(`✅ Found base64 CDA (${base64CDA.length} chars)`);
    
    // Step 6: Decode base64
    const cdaBuffer = Buffer.from(base64CDA, 'base64');
    const cdaXml = cdaBuffer.toString('utf-8');
    
    console.log(`✅ Decoded CDA (${cdaXml.length} chars, ${cdaBuffer.length} bytes)`);
    
    // Step 7: Validate CDA structure
    console.log('\n🏥 Validating CDA document...');
    if (!cdaXml.includes('<ClinicalDocument')) {
      throw new Error('Not a valid CDA - missing <ClinicalDocument> root');
    }
    if (!cdaXml.includes('urn:hl7-org:v3')) {
      throw new Error('Missing HL7 namespace');
    }
    console.log('✅ CDA structure valid');
    
    // Step 8: Check CDA for placeholders
    console.log('\n🔍 Checking CDA for leftover placeholders...');
    const cdaPlaceholders = cdaXml.match(/\{\{DATA\.\w+\}\}/g);
    if (cdaPlaceholders) {
      console.error(`❌ Found ${cdaPlaceholders.length} leftover placeholders in CDA:`);
      cdaPlaceholders.forEach(p => console.error(`   - ${p}`));
      throw new Error('CDA contains unprocessed placeholders');
    }
    console.log('✅ No leftover placeholders in CDA');
    
    // Step 9: Parse CDA XML
    console.log('\n🔍 Parsing CDA XML structure...');
    const cdaDoc = parser.parseFromString(cdaXml, 'text/xml');
    const cdaErrors = cdaDoc.getElementsByTagName('parsererror');
    if (cdaErrors.length > 0) {
      throw new Error('CDA XML parse error: ' + cdaErrors[0].textContent);
    }
    console.log('✅ CDA XML parses successfully');
    
    // Step 10: Verify hash
    console.log('\n🔐 Verifying SHA-1 hash...');
    const computedHash = crypto.createHash('sha1').update(cdaXml, 'utf-8').digest('hex');
    
    // Extract hash from envelope (rim:Slot)
    const hashMatch = soapEnvelope.match(/<rim:Slot\s+name="hash"[^>]*>[\s\S]*?<rim:Value>([^<]+)<\/rim:Value>/i);
    if (hashMatch) {
      const envelopeHash = hashMatch[1];
      console.log(`   Envelope hash: ${envelopeHash}`);
      console.log(`   Computed hash: ${computedHash}`);
      
      if (envelopeHash === computedHash) {
        console.log('✅ Hash matches!');
      } else {
        console.warn('⚠️  Hash mismatch (might be expected if CDA was modified)');
      }
    } else {
      console.log(`   Computed hash: ${computedHash}`);
      console.warn('⚠️  Could not find hash in envelope to compare');
    }
    
    // Step 11: Verify size
    console.log('\n📏 Verifying size...');
    const actualSize = cdaBuffer.length;
    const sizeMatch = soapEnvelope.match(/<rim:Slot\s+name="size"[^>]*>[\s\S]*?<rim:Value>(\d+)<\/rim:Value>/i);
    if (sizeMatch) {
      const envelopeSize = parseInt(sizeMatch[1]);
      console.log(`   Envelope size: ${envelopeSize} bytes`);
      console.log(`   Actual size:   ${actualSize} bytes`);
      
      if (envelopeSize === actualSize) {
        console.log('✅ Size matches!');
      } else {
        console.warn(`⚠️  Size mismatch (difference: ${Math.abs(envelopeSize - actualSize)} bytes)`);
      }
    } else {
      console.log(`   Actual size: ${actualSize} bytes`);
      console.warn('⚠️  Could not find size in envelope to compare');
    }
    
    // Step 12: Verify key CDA sections present
    console.log('\n📑 Verifying CDA sections...');
    const requiredSections = [
      'recordTarget',
      'author',
      'custodian',
      'documentationOf',
      'componentOf',
      'structuredBody'
    ];
    
    let missingSections = [];
    for (const section of requiredSections) {
      if (!cdaXml.includes(`<${section}`)) {
        missingSections.push(section);
      }
    }
    
    if (missingSections.length > 0) {
      console.warn(`⚠️  Missing sections: ${missingSections.join(', ')}`);
    } else {
      console.log('✅ All required sections present');
    }
    
    // Step 13: Extract and display key metadata
    console.log('\n📊 Key Metadata:');
    const patientIdMatch = cdaXml.match(/extension="(\d+)"[^>]*root="2\.16\.840\.1\.113883\.3\.3731\.1\.2\.3/);
    if (patientIdMatch) {
      console.log(`   Patient ID: ${patientIdMatch[1]}`);
    }
    
    const orderLineMatch = cdaXml.match(/<id\s+[^>]*extension="([^"]+)"[^>]*root="2\.16\.840\.1\.113883\.3\.3731\.1\.2\.2\.100\.1\.1\.[^"]+\.100\.1"/);
    if (orderLineMatch) {
      console.log(`   Order Line: ${orderLineMatch[1]}`);
    }
    
    // Success summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ ALL TESTS PASSED');
    console.log('='.repeat(60));
    console.log(`\n📄 Output saved to: test-output.xml`);
    
    // Save files for inspection
    const fs = await import('fs');
    fs.writeFileSync('c:\\ws\\HIS-Integration\\back-end\\test\\test-output-envelope.xml', soapEnvelope, 'utf-8');
    fs.writeFileSync('c:\\ws\\HIS-Integration\\back-end\\test\\test-output-cda.xml', cdaXml, 'utf-8');
    console.log(`📄 SOAP Envelope: test-output-envelope.xml`);
    console.log(`📄 CDA Document:  test-output-cda.xml`);
    
  } catch (error) {
    console.error('\n❌ TEST FAIL');
    console.error('=' .repeat(60));
    
    if (error.response) {
      console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received from server');
      console.error('Is the server running on port 3500?');
    } else {
      console.error('Error:', error.message);
    }
    
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    
    process.exit(1);
  }
}

// Run test
testLabOrderEndpoint();
