import * as net from 'net';
import { getDb } from '../db';
import { parseHL7, MLLP_START, MLLP_END } from '../hl7-utils';

export async function handleMedconnMessage(message: string, socket: net.Socket, equipmentId: number, options: { isRaw?: boolean } = {}) {
  console.log(`[MedconnAdapter] Handling message for equipment ${equipmentId}. Raw mode: ${options.isRaw}`);
  
  // Compliance with Section 1.1.2 Data transmission:
  // "sending and receiving of messages are synchronized... after each message is sent, a confirmation message is awaited."
  // We must respond with ACK/Response immediately (within 2 seconds).
  
  try {
    const db = getDb();
    let segments = parseHL7(message);

    // Robust parsing for missing newlines
    if (segments.length <= 1 && (message.includes('PID|') || message.includes('OBR|') || message.includes('OBX|') || message.includes('QRD|'))) {
        console.log('[MedconnAdapter] Detected single segment, attempting robust split');
        const rawSegments = message.split(/(?=(?:MSH|PID|OBR|OBX|QRD|QRF|DSC)\s*\|)/).filter(s => s.trim() !== '');
        segments = rawSegments.map(s => s.split('|'));
    }

    const msh = segments.find(s => s[0] === 'MSH');
    if (!msh) {
        console.error('[MedconnAdapter] No MSH segment found, cannot process');
        return;
    }

    // MSH-9: Message Type (e.g., ORU^R01 or QRY^Q02)
    // Standard is Index 8 (Field 9).
    // However, some devices (like Medconn in logs) seem to shift fields or skip Security (Field 8), putting Message Type at Index 7 (Field 8).
    // Log example: MSH|^&~\|Medconn|MH120SR||20260222...||ORU^R01|345345|...
    // Index 7 is ORU^R01. Index 8 is 345345.
    
    let messageTypeField = msh[8] || ''; 
    
    // Heuristic: If Index 8 doesn't look like a message type (no ^, or not ORU/QRY), check Index 7.
    if (!messageTypeField.includes('^') && !['ORU', 'QRY'].includes(messageTypeField)) {
        const candidate = msh[7] || '';
        if (candidate.includes('^') || ['ORU', 'QRY'].includes(candidate)) {
            console.log(`[MedconnAdapter] Detected shifted Message Type at Index 7: ${candidate}`);
            messageTypeField = candidate;
        }
    }

    const [messageType, triggerEvent] = messageTypeField.split('^');
    
    // Message Control ID is usually MSH-10 (Index 9).
    // If Message Type was at Index 7, Control ID might be at Index 8.
    let messageControlId = msh[9] || ''; 
    if (messageTypeField === msh[7]) {
         messageControlId = msh[8] || '';
    }
    
    console.log(`[MedconnAdapter] Message Type: ${messageType}, Control ID: ${messageControlId}`);

    // Log incoming
    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, messageTypeField || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU') {
      // Handle Results
      await handleResults(segments, db, equipmentId, msh, socket, messageControlId, options);
    } else if (messageType === 'QRY') {
      // Handle Order Query
      await handleQuery(segments, db, equipmentId, msh, socket, messageControlId, options);
    } else {
        // Unknown type, just ACK
        console.log('[MedconnAdapter] Unknown message type, sending generic ACK');
        sendACK(socket, msh, messageControlId, 'AA', options.isRaw);
    }

  } catch (error) {
    console.error('Error handling Medconn message:', error);
  }
}

async function handleResults(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string, options: { isRaw?: boolean }) {
    console.log('[MedconnAdapter] Handling Results (ORU)');
    const pid = segments.find(s => s[0] === 'PID');
    const obr = segments.find(s => s[0] === 'OBR');
    const obxSegments = segments.filter(s => s[0] === 'OBX');

    const patientName = pid ? pid[5]?.replace(/\^/g, ' ') : '';
    // OBR-3 is Sample ID/Barcode in Medconn
    const sampleBarcode = obr ? (obr[3] || obr[2]) : ''; 
    
    console.log(`[MedconnAdapter] Processing results for Sample: ${sampleBarcode}, Patient: ${patientName}`);

    for (const obx of obxSegments) {
        // OBX-3: Identifier (e.g., 6690-2^WBC^LN)
        const testIdFull = obx[3] || '';
        const parts = testIdFull.split('^');
        const testNo = parts[0] || ''; // 6690-2
        const testName = parts[1] || ''; // WBC

        // OBX-5: Data value type ^ Data string (e.g. 0^7.780000)
        // 0: Value, 1: String, etc.
        const rawResultValue = obx[5] || '';
        let resultValue = rawResultValue;
        
        if (rawResultValue.includes('^')) {
            const valParts = rawResultValue.split('^');
            // If it starts with a number type (0, 1, etc), take the second part
            if (valParts.length > 1 && /^\d+$/.test(valParts[0])) {
                resultValue = valParts[1];
            }
        }

        const resultUnit = obx[6] || '';
        
        console.log(`Parsed result: ${testName} (${testNo}) = ${resultValue} ${resultUnit}`);
        
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

    sendACK(socket, msh, messageControlId, 'AA', options.isRaw);
}

async function handleQuery(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string, options: { isRaw?: boolean }) {
    console.log('[MedconnAdapter] Handling Query (QRY)');
    const qrd = segments.find(s => s[0] === 'QRD');
    if (!qrd) return;

    // QRD-9: Who Subject Filter (Sample ID) - Content 9 in doc, so Index 9 in split array (0=QRD, 1=Field1...)
    // Doc 3.4.1: 9 T00014 Query user filter
    const sampleId = qrd[9] || ''; 
    
    console.log(`[MedconnAdapter] Query for Sample ID: ${sampleId}`);

    // Check worklist
    const { rows } = await db.query('SELECT * FROM worklist WHERE sample_barcode = $1 LIMIT 1', [sampleId]);
    const order = rows[0];

    // Construct DSR^Q03 response
    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    
    // MSH
    const resMsh = `MSH|^~\\&|Medconn|MH|||${date}||DSR^Q03|${messageControlId}|P|2.4||||||UNICODE||||`;
    
    let msa = '';
    let dspSegments = '';

    if (order) {
        console.log('[MedconnAdapter] Order found, building DSP segments');
        msa = `MSA|AA|${messageControlId}||||0|`;
        
        const testMode = order.test_names || 'CBC+DIFF';
        const pid = order.patient_id || '';
        const name = order.patient_name || '';
        const dob = ''; 
        const sex = order.sex || 'M'; 
        const age = order.age || ''; // e.g. "32^Y"

        // DSP Segment Construction
        // Indices based on Doc 3.5.1 and 4.4 tables
        // Index = Content Number - 1
        // Content 5: Measurement pattern -> Index 4
        // Content 6: Review -> Index 5
        // Content 7: Review mode -> Index 6
        // Content 8: Location -> Index 7
        // Content 10: Patient ID -> Index 9
        // Content 12: Name -> Index 11
        // Content 14: DOB -> Index 13
        // Content 15: Sex -> Index 14
        // Content 38: Age (32^Y) -> Index 37 (See Doc 4.4.18 / Page 22/23 transition)
        // Content 39: Applicant number (Sample ID) -> Index 38

        const dspFields = new Array(40).fill('');
        dspFields[0] = 'DSP';
        dspFields[4] = testMode;
        dspFields[5] = 'N';
        dspFields[6] = testMode;
        dspFields[7] = '^';
        dspFields[9] = pid;
        dspFields[11] = name;
        dspFields[13] = dob;
        dspFields[14] = sex;
        dspFields[37] = age;
        dspFields[38] = sampleId;

        dspSegments = dspFields.join('|');
        
    } else {
        console.log('[MedconnAdapter] Order not found, sending MSA|AE');
        msa = `MSA|AE|${messageControlId}||||204|`;
        // No DSP segments for failure? Doc 3.6 doesn't show DSP.
    }

    const response = `${resMsh}\r${msa}\r${dspSegments ? dspSegments + '\r' : ''}`;
    
    const ackBuffer = options.isRaw 
        ? Buffer.from(response, 'utf8') 
        : Buffer.concat([MLLP_START, Buffer.from(response, 'utf8'), MLLP_END]);
        
    socket.write(ackBuffer);
    console.log(`[MedconnAdapter] Sent DSR response. Raw: ${options.isRaw}`);

    await db.query(
        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
        [equipmentId, 'DSR^Q03', 'OUT', response]
    );
}

function sendACK(socket: net.Socket, msh: string[], messageControlId: string, code: string, isRaw: boolean = false) {
    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const ackMsh = `MSH|^~\\&|Medconn|MH|||${date}||ACK^R01|${messageControlId}|P|2.4||||||UNICODE||||`;
    const msa = `MSA|${code}|${messageControlId}||||0|`;
    const response = `${ackMsh}\r${msa}\r`;
    
    const ackBuffer = isRaw 
        ? Buffer.from(response, 'utf8') 
        : Buffer.concat([MLLP_START, Buffer.from(response, 'utf8'), MLLP_END]);
        
    socket.write(ackBuffer);
    console.log(`[MedconnAdapter] Sent ACK (${code}). Raw: ${isRaw}`);
}
