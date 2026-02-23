import * as net from 'net';
import { getDb } from './db';
import { parseHL7, MLLP_START, MLLP_END } from './hl7-medconn-utils';

export async function handleMedconnMessage(message: string, socket: net.Socket, equipmentId: number, options: { isRaw?: boolean } = {}) {
  console.log(`[MedconnAdapter] Handling message for equipment ${equipmentId}. Raw mode: ${options.isRaw}`);
  
  try {
    const db = getDb();
    let segments = parseHL7(message);

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

    const messageTypeField = msh[8] || ''; 
    const [messageType, triggerEvent] = messageTypeField.split('^');
    const messageControlId = msh[9] || ''; 
    
    console.log(`[MedconnAdapter] Message Type: ${messageType}, Control ID: ${messageControlId}`);

    await db.query(
      'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
      [equipmentId, messageTypeField || 'UNKNOWN', 'IN', message]
    );

    if (messageType === 'ORU') {
      await handleResults(segments, db, equipmentId, msh, socket, messageControlId, options);
    } else if (messageType === 'QRY') {
      await handleQuery(segments, db, equipmentId, msh, socket, messageControlId, options);
    } else {
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
            patientName = pid[5]?.replace(/\^/g, ' ') || '';
        }
        
        const sampleBarcode = obr ? (obr[3] || '') : ''; 
        const sampleNumber = obr ? (obr[4] || '') : '';
        
        const identifier = sampleBarcode || sampleNumber || '';
        
        console.log(`[MedconnAdapter] Processing results for Sample: ${identifier}, Patient: ${patientName}`);

        for (const obx of obxSegments) {
            try {
                const testIdFull = obx[3] || '';
                const parts = testIdFull.split('^');
                const testNo = parts[0] || ''; 
                const testName = parts[1] || ''; 

                const rawResultValue = obx[5] || '';
                let resultValue = rawResultValue;
                
                if (rawResultValue.includes('^')) {
                    const valParts = rawResultValue.split('^');
                    if (valParts.length > 1 && /^\d+$/.test(valParts[0])) {
                        resultValue = valParts[1];
                    }
                }

                const resultUnit = obx[6] || '';
                
                console.log(`Parsed result: ${testName} (${testNo}) = ${resultValue} ${resultUnit}`);
                
                let resultTime = new Date();
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

                const existing = await db.query(
                    `SELECT id FROM results 
                     WHERE equipment_id = $1 AND sample_barcode = $2 AND test_no = $3 AND result_value = $4`,
                    [equipmentId, identifier, testNo, resultValue]
                );

                if (existing.rows.length === 0) {
                    await db.query(
                        `INSERT INTO results (equipment_id, sample_barcode, patient_name, test_no, test_name, result_value, result_unit, result_time)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [equipmentId, identifier, patientName, testNo, testName, resultValue, resultUnit, resultTime]
                    );
                } else {
                     await db.query(
                        'INSERT INTO logs (equipment_id, message_type, direction, raw_message) VALUES ($1, $2, $3, $4)',
                        [equipmentId, 'DUPLICATE', 'INFO', `Duplicate result skipped: ${identifier} - ${testNo}`]
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
        await sendACK(socket, msh, messageControlId, 'AE', options.isRaw, db, equipmentId);
    }
}

async function handleQuery(segments: string[][], db: any, equipmentId: number, msh: string[], socket: net.Socket, messageControlId: string, options: { isRaw?: boolean }) {
    console.log('[MedconnAdapter] Handling Query (QRY)');
    const qrd = segments.find(s => s[0] === 'QRD');
    if (!qrd) return;
    
    let sampleId = qrd[8] || ''; 
    if (!sampleId && qrd[9]) {
        sampleId = qrd[9];
    }
    
    console.log(`[MedconnAdapter] Query for Sample ID: ${sampleId}`);

    const { rows } = await db.query('SELECT * FROM worklist WHERE sample_barcode = $1 LIMIT 1', [sampleId]);
    const order = rows[0];

    const date = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const deviceId = msh[3] || 'MH';
    
    const resMshFields = new Array(21).fill('');
    resMshFields[0] = 'MSH';
    resMshFields[1] = '^~\\&';
    resMshFields[2] = 'Medconn';
    resMshFields[3] = deviceId;
    resMshFields[4] = '';
    resMshFields[5] = deviceId;
    resMshFields[6] = date;
    resMshFields[8] = 'DSR^Q03';
    resMshFields[9] = messageControlId;
    resMshFields[10] = 'P';
    resMshFields[11] = '2.4';
    resMshFields[15] = '0';
    resMshFields[17] = 'UNICODE';
    const resMsh = resMshFields.join('|');
    
    let msa = '';
    let dspSegments = '';

    if (order) {
        console.log('[MedconnAdapter] Order found, building DSP segments');
        msa = `MSA|AA|${messageControlId}|||0|`;
        
        const testMode = order.test_names || 'CBC+DIFF';
        const pid = order.patient_id || '';
        const name = order.patient_name || '';
        const dob = ''; 
        const sex = order.sex || 'M'; 
        const age = order.age || ''; 

        const dspFields = new Array(72).fill('');
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
        dspFields[41] = 'N'; 
        dspFields[42] = date; 
        dspFields[47] = '0.000000'; 
        dspFields[69] = '1'; 
        dspFields[70] = '0'; 

        dspSegments = dspFields.join('|');
        
    } else {
        console.log('[MedconnAdapter] Order not found, sending MSA|AE');
        msa = `MSA|AE|${messageControlId}|||204|`;
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
    const deviceId = msh[3] || 'MH';
    
    const ackMshFields = new Array(21).fill('');
    ackMshFields[0] = 'MSH';
    ackMshFields[1] = '^~\\&';
    ackMshFields[2] = 'Medconn';
    ackMshFields[3] = deviceId;
    ackMshFields[4] = '';
    ackMshFields[5] = deviceId;
    ackMshFields[6] = date;
    ackMshFields[8] = 'ACK^R01';
    ackMshFields[9] = messageControlId;
    ackMshFields[10] = 'P';
    ackMshFields[11] = '2.4';
    ackMshFields[15] = '0';
    ackMshFields[17] = 'UNICODE';
    const ackMsh = ackMshFields.join('|');
    
    const msa = `MSA|${code}|${messageControlId}|||0|`;
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
