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
        segments = rawSegments.map(s => {
            const parts = s.trimStart().split('|');
            if (parts.length > 0) parts[0] = parts[0].trim();
            return parts;
        });
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
        await sendACK(socket, msh, messageControlId, 'AA', options.isRaw, db, equipmentId);
    }

  } catch (error) {
    console.error('Error handling Medconn message:', error);
  }
}

async function handleResults(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string, options: { isRaw?: boolean }) {
    console.log('[MedconnAdapter] Handling Results (ORU)');
    try {
        const pid = segments.find(s => s[0] === 'PID');
        const obr = segments.find(s => s[0] === 'OBR');
        const obxSegments = segments.filter(s => s[0] === 'OBX');

        let patientName = '';
        if (pid) {
            // Patient name can be at index 5 or 6 depending on the device's exact HL7 dialect
            patientName = pid[5]?.replace(/\^/g, ' ') || pid[6]?.replace(/\^/g, ' ') || '';
        }
        
        // OBR-3 is Sample ID/Barcode in Medconn. Sometimes it's at OBR-4 (index 4) or OBR-2 (index 2)
        const sampleBarcode = obr ? (obr[3] || obr[4] || obr[2] || '') : ''; 
        
        console.log(`[MedconnAdapter] Processing results for Sample: ${sampleBarcode}, Patient: ${patientName}`);

        for (const obx of obxSegments) {
            try {
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
                // In some logs, time is at OBR-6 or OBR-7 (index 6 or 7)
                const timeField = (obr && obr[7]) ? obr[7] : (obr && obr[6] ? obr[6] : null);
                if (timeField && timeField.length >= 14) {
                     const year = parseInt(timeField.substring(0, 4));
                     const month = parseInt(timeField.substring(4, 6)) - 1;
                     const day = parseInt(timeField.substring(6, 8));
                     const hour = parseInt(timeField.substring(8, 10));
                     const min = parseInt(timeField.substring(10, 12));
                     const sec = parseInt(timeField.substring(12, 14));
                     resultTime = new Date(year, month, day, hour, min, sec);
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
            } catch (innerErr: any) {
                console.error(`[MedconnAdapter] Error processing OBX segment:`, innerErr);
                await db.query(
                    'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                    [equipmentId, 'ERROR', 'SYS', `Error processing OBX: ${innerErr.message}`]
                );
            }
        }

        await sendACK(socket, msh, messageControlId, 'AA', options.isRaw, db, equipmentId);
    } catch (err: any) {
        console.error(`[MedconnAdapter] Fatal error in handleResults:`, err);
        await db.query(
            'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
            [equipmentId, 'ERROR', 'SYS', `Fatal error in handleResults: ${err.message}\n${err.stack}`]
        );
        // Still try to send AE ACK
        await sendACK(socket, msh, messageControlId, 'AE', options.isRaw, db, equipmentId);
    }
}

async function handleQuery(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string, options: { isRaw?: boolean }) {
    console.log('[MedconnAdapter] Handling Query (QRY)');
    const qrd = segments.find(s => s[0] === 'QRD');
    if (!qrd) return;

    // QRD-9: Who Subject Filter (Sample ID)
    // Log: QRD|20260222204543|BC|D|1|||RD|000001|||||T|
    // Index 0: QRD
    // Index 1: 20260222204543
    // Index 2: BC
    // Index 3: D
    // Index 4: 1
    // Index 5: 
    // Index 6: 
    // Index 7: RD
    // Index 8: 000001 (This is the Sample ID!)
    
    let sampleId = qrd[8] || ''; 
    if (!sampleId && qrd[9]) {
        sampleId = qrd[9];
    }
    
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
        // According to section 3.5.1 DSP: Display data segment
        // The example shows 71 fields.
        const dspFields = new Array(72).fill('');
        dspFields[0] = 'DSP';
        dspFields[4] = testMode; // Content 5: Measurement pattern
        dspFields[5] = 'N'; // Content 6: Whether to review
        dspFields[6] = testMode; // Content 7: Review mode
        dspFields[7] = '^'; // Content 8: Patient location
        dspFields[9] = pid; // Content 10: Patient ID
        dspFields[11] = name; // Content 12: Patient name
        dspFields[13] = dob; // Content 14: Date of birth
        dspFields[14] = sex; // Content 15: Sex
        dspFields[37] = age; // Content 38: Age (e.g. 32^Y)
        dspFields[38] = sampleId; // Content 39: Applicant number (barcode)
        dspFields[41] = 'N'; // Content 42: Emergency (N)
        dspFields[42] = date; // Content 43: Date and time of application
        dspFields[47] = '0.000000'; // Content 48: Sample processing code (dilution)
        dspFields[69] = '1'; // Content 70: Sample blood type (1 = whole blood)
        dspFields[70] = '0'; // Content 71: Type of reexamination (0)

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

async function sendACK(socket: net.Socket, msh: string[], messageControlId: string, code: string, isRaw: boolean = false, db: any, equipmentId: number) {
    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const ackMsh = `MSH|^~\\&|Medconn|MH|||${date}||ACK^R01|${messageControlId}|P|2.4||||||UNICODE||||`;
    const msa = `MSA|${code}|${messageControlId}||||0|`;
    const response = `${ackMsh}\r${msa}\r`;
    
    const ackBuffer = isRaw 
        ? Buffer.from(response, 'utf8') 
        : Buffer.concat([MLLP_START, Buffer.from(response, 'utf8'), MLLP_END]);
        
    socket.write(ackBuffer);
    console.log(`[MedconnAdapter] Sent ACK (${code}). Raw: ${isRaw}`);

    if (db && equipmentId) {
        await db.query(
            'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
            [equipmentId, 'ACK^R01', 'OUT', response]
        );
    }
}
