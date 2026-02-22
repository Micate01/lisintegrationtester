import * as net from 'net';
import { getDb } from '../db';
import { parseHL7, MLLP_START, MLLP_END } from '../hl7-utils';

export async function handleMedconnMessage(message: string, socket: net.Socket, equipmentId: number) {
  console.log(`Received Medconn HL7 message from equipment ${equipmentId}`);
  
  try {
    const db = getDb();
    let segments = parseHL7(message);

    // Robust parsing for missing newlines
    if (segments.length <= 1 && (message.includes('PID|') || message.includes('OBR|') || message.includes('OBX|') || message.includes('QRD|'))) {
        const rawSegments = message.split(/(?=(?:MSH|PID|OBR|OBX|QRD|QRF|DSC)\s*\|)/).filter(s => s.trim() !== '');
        segments = rawSegments.map(s => s.split('|'));
    }

    const msh = segments.find(s => s[0] === 'MSH');
    if (!msh) return;

    // MSH-9: Message Type (e.g., ORU^R01 or QRY^Q02)
    const messageTypeField = msh[8] || ''; // Index 8 in 0-based array (9th field)
    const [messageType, triggerEvent] = messageTypeField.split('^');
    const messageControlId = msh[9] || ''; // MSH-10

    // Log incoming
    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, messageTypeField || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU') {
      // Handle Results
      await handleResults(segments, db, equipmentId, msh, socket, messageControlId);
    } else if (messageType === 'QRY') {
      // Handle Order Query
      await handleQuery(segments, db, equipmentId, msh, socket, messageControlId);
    } else {
        // Unknown type, just ACK
        sendACK(socket, msh, messageControlId, 'AA');
    }

  } catch (error) {
    console.error('Error handling Medconn message:', error);
  }
}

async function handleResults(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string) {
    const pid = segments.find(s => s[0] === 'PID');
    const obr = segments.find(s => s[0] === 'OBR');
    const obxSegments = segments.filter(s => s[0] === 'OBX');

    const patientName = pid ? pid[5]?.replace(/\^/g, ' ') : '';
    // OBR-3 is Sample ID/Barcode in Medconn
    const sampleBarcode = obr ? (obr[3] || obr[2]) : ''; 

    for (const obx of obxSegments) {
        // OBX-3: Identifier (e.g., 6690-2^WBC^LN)
        const testIdFull = obx[3] || '';
        const parts = testIdFull.split('^');
        const testNo = parts[0] || ''; // 6690-2
        const testName = parts[1] || ''; // WBC

        const resultValue = obx[5] || '';
        const resultUnit = obx[6] || '';
        
        let resultTime = new Date();
        // OBR-7 is Date/Time of Observation usually, or check OBX-14
        if (obr && obr[7]) {
             // Parse YYYYMMDDHHMMSS
             const t = obr[7];
             if (t.length >= 14) {
                 const year = parseInt(t.substring(0, 4));
                 const month = parseInt(t.substring(4, 6)) - 1;
                 const day = parseInt(t.substring(6, 8));
                 const hour = parseInt(t.substring(8, 10));
                 const min = parseInt(t.substring(10, 12));
                 const sec = parseInt(t.substring(12, 14));
                 resultTime = new Date(year, month, day, hour, min, sec);
             }
        }

        // Duplicate check
        const existing = await db.query(
            `SELECT id FROM results 
             WHERE equipment_id = $1 AND sample_barcode = $2 AND test_no = $3 AND result_time = $4`,
            [equipmentId, sampleBarcode, testNo, resultTime]
        );

        if (existing.rows.length === 0) {
            await db.query(
                `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [equipmentId, sampleBarcode, patientName, testNo, testName, resultValue, resultUnit, resultTime]
            );
        } else {
             await db.query(
                'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                [equipmentId, 'DUPLICATE', 'INFO', `Duplicate result skipped: ${sampleBarcode} - ${testNo}`]
            );
        }
    }

    sendACK(socket, msh, messageControlId, 'AA');
}

async function handleQuery(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string) {
    const qrd = segments.find(s => s[0] === 'QRD');
    if (!qrd) return;

    // QRD-9: Who Subject Filter (Sample ID)
    const sampleId = qrd[8] || ''; // Index 8

    // Check worklist
    const { rows } = await db.query('SELECT * FROM worklist WHERE sample_barcode = $1 LIMIT 1', [sampleId]);
    const order = rows[0];

    // Construct DSR^Q03 response
    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    
    // MSH
    const resMsh = `MSH|^~\\&|Medconn|MH|||${date}||DSR^Q03|${messageControlId}|P|2.4||||||UNICODE||||`;
    
    // MSA
    // If order found -> AA, else -> AE (according to doc 3.6 for "no order")
    // Doc says: "Order request returned (no order) ... MSA|AE|||||204|"
    // "Order request returned (an order exists) ... MSA|AA|||||0|"
    
    let msa = '';
    let dspSegments = '';

    if (order) {
        msa = `MSA|AA|${messageControlId}||||0|`;
        
        // DSP Segments construction based on Doc 3.5.1
        // DSP||||CBC+DIFF+SAA|N|CBC+DIFF|^||PID123||lucy||20221010122530|W|||||||||||||||||||||||32^Y|T00014|||
        // We need to map our DB fields to this structure.
        // Field 5: Measurement pattern (e.g. CBC+DIFF) - stored in test_names?
        // Field 10: Patient ID
        // Field 12: Patient Name
        // Field 14: DOB (or date?)
        // Field 15: Sex
        // Field 32: Age
        
        const testMode = order.test_names || 'CBC+DIFF';
        const pid = order.patient_id || '';
        const name = order.patient_name || '';
        const dob = ''; // We might not have DOB in worklist, maybe created_at?
        const sex = order.sex || 'U';
        const age = order.age || ''; // e.g. "32^Y"

        // Construct DSP line. Note: The doc example puts data in specific fields.
        // DSP field indices (1-based):
        // 1: Set ID (empty)
        // ...
        // 5: Measurement pattern
        // 6: Review (N)
        // 7: Review mode?
        // 8: Location
        // 9: Patient ID? (Doc says "patient ID" for field 9, "Patient identification form" for 10)
        // 10: Patient ID (Medical Record Num)
        // 12: Name
        // 14: DOB
        // 15: Sex
        // 32: Age
        
        // Using array to build DSP safely
        const dspFields = new Array(34).fill('');
        dspFields[0] = 'DSP';
        dspFields[5] = testMode; // Field 5
        dspFields[6] = 'N';
        dspFields[9] = pid; // Field 9 or 10? Doc says 9 is "patient ID", 10 is "Patient identification form". Example has PID123 in field 10 (index 9 in 0-based split? No, pipe counting).
        // Let's count pipes in example:
        // DSP||||CBC... -> DSP is 0. | is 1.
        // DSP | | | | CBC+DIFF+SAA (5) | N (6) | ...
        // Let's just use the example structure.
        
        // DSP||||TestMode|N|TestMode|^||PatID||Name||DOB|Sex|||||||||||||||||||||||Age|SampleID|||
        
        // Reconstructing based on visual count of example:
        // DSP||||CBC+DIFF+SAA|N|CBC+DIFF|^||PID123||lucy||2022...|W|...
        
        // Let's build it manually to be safe
        dspSegments = `DSP||||${testMode}|N|${testMode}|^||${pid}||${name}||${dob}|${sex}|||||||||||||||||||||||${age}|${sampleId}|||`;
        
    } else {
        msa = `MSA|AE|${messageControlId}||||204|`;
        // No DSP segments for failure? Doc 3.6 doesn't show DSP.
    }

    const response = `${resMsh}\r${msa}\r${dspSegments ? dspSegments + '\r' : ''}`;
    
    const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(response, 'utf8'), MLLP_END]); // Medconn uses UTF-8
    socket.write(ackBuffer);

    await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'DSR^Q03', 'OUT', response]
    );
}

function sendACK(socket: net.Socket, msh: string[], messageControlId: string, code: string) {
    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const ackMsh = `MSH|^~\\&|Medconn|MH|||${date}||ACK^R01|${messageControlId}|P|2.4||||||UNICODE||||`;
    const msa = `MSA|${code}|${messageControlId}||||0|`;
    const response = `${ackMsh}\r${msa}\r`;
    
    const ackBuffer = Buffer.concat([MLLP_START, Buffer.from(response, 'utf8'), MLLP_END]);
    socket.write(ackBuffer);
}
