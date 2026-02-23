import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb, getDb } from './server/db';
import { startAdapter, stopAdapter } from './server/adapterManager';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  console.log('GET /api/health');
  res.json({ status: 'ok' });
});

app.get('/api/equipments', async (req, res) => {
  console.log('GET /api/equipments');
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM equipments ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/equipments:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/equipments', async (req, res) => {
  console.log('POST /api/equipments');
  try {
    const { name, model, ip_address, port } = req.body;
    const db = getDb();
    const { rows } = await db.query(
      'INSERT INTO equipments (name, model, ip_address, port) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, model, ip_address, port]
    );
    const newEquipment = rows[0];
    
    // Start adapter for the new equipment
    startAdapter(newEquipment.port, newEquipment.id, newEquipment.model);
    
    res.json(newEquipment);
  } catch (error) {
    console.error('Error in POST /api/equipments:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/equipments/:id', async (req, res) => {
  console.log('DELETE /api/equipments/:id');
  try {
    const { id } = req.params;
    const db = getDb();
    
    // Stop adapter first
    stopAdapter(parseInt(id));

    // Delete from DB
    await db.query('DELETE FROM equipments WHERE id = $1', [id]);
    
    res.json({ message: 'Equipment deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/equipments/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/results', async (req, res) => {
  console.log('GET /api/results');
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT r.*, e.name as equipment_name 
      FROM results r 
      LEFT JOIN equipments e ON r.equipment_id = e.id 
      ORDER BY r.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/results:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/results', async (req, res) => {
  console.log('DELETE /api/results');
  try {
    const db = getDb();
    await db.query('DELETE FROM results');
    res.json({ message: 'Results cleared successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/results:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/worklist', async (req, res) => {
  console.log('GET /api/worklist');
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM worklist ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/worklist:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/qc_results', async (req, res) => {
  console.log('GET /api/qc_results');
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT q.*, e.name as equipment_name 
      FROM qc_results q 
      LEFT JOIN equipments e ON q.equipment_id = e.id 
      ORDER BY q.result_time DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/qc_results:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/worklist', async (req, res) => {
  console.log('POST /api/worklist', req.body);
  try {
    const db = getDb();
    const { 
      sample_barcode, patient_id, patient_name, age, sex, test_names,
      admission_number, bed_number, birth_date, blood_type, sample_id,
      sample_time, stat_flag, sample_type, fetch_doctor, fetch_department
    } = req.body;
    
    await db.query(
      `INSERT INTO worklist (
        sample_barcode, patient_id, patient_name, age, sex, test_names,
        admission_number, bed_number, birth_date, blood_type, sample_id,
        sample_time, stat_flag, sample_type, fetch_doctor, fetch_department
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        sample_barcode, patient_id, patient_name, age, sex, test_names,
        admission_number, bed_number, birth_date, blood_type, sample_id,
        sample_time, stat_flag, sample_type, fetch_doctor, fetch_department
      ]
    );
    res.json({ message: 'Order added successfully' });
  } catch (error) {
    console.error('Error in POST /api/worklist:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/worklist/:id', async (req, res) => {
  console.log('DELETE /api/worklist/:id', req.params.id);
  try {
    const db = getDb();
    await db.query('DELETE FROM worklist WHERE id = $1', [req.params.id]);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/worklist/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// --- Patients API ---

app.get('/api/patients', async (req, res) => {
  console.log('GET /api/patients');
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM patients ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/patients:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/patients', async (req, res) => {
  console.log('POST /api/patients', req.body);
  try {
    const db = getDb();
    const { patient_id, name, date_of_birth, sex, blood_type, phone, address } = req.body;
    const { rows } = await db.query(
      `INSERT INTO patients (patient_id, name, date_of_birth, sex, blood_type, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [patient_id, name, date_of_birth, sex, blood_type, phone, address]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error in POST /api/patients:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.put('/api/patients/:id', async (req, res) => {
  console.log('PUT /api/patients/:id', req.params.id, req.body);
  try {
    const db = getDb();
    const { patient_id, name, date_of_birth, sex, blood_type, phone, address } = req.body;
    const { rows } = await db.query(
      `UPDATE patients 
       SET patient_id = $1, name = $2, date_of_birth = $3, sex = $4, blood_type = $5, phone = $6, address = $7
       WHERE id = $8 RETURNING *`,
      [patient_id, name, date_of_birth, sex, blood_type, phone, address, req.params.id]
    );
    res.json(rows[0]);
  } catch (error) {
    console.error('Error in PUT /api/patients/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  console.log('DELETE /api/patients/:id', req.params.id);
  try {
    const db = getDb();
    await db.query('DELETE FROM patients WHERE id = $1', [req.params.id]);
    res.json({ message: 'Patient deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/patients/:id:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/patients/:patient_id/history', async (req, res) => {
  console.log('GET /api/patients/:patient_id/history', req.params.patient_id);
  try {
    const db = getDb();
    // Fetch results for this patient. We match by patient_name or sample_barcode if we can link them.
    // In our current schema, `results` table has `patient_name` and `sample_barcode`.
    // We can join `results` with `worklist` to get `patient_id`.
    const { rows } = await db.query(`
      SELECT r.*, e.name as equipment_name, w.patient_id
      FROM results r
      LEFT JOIN equipments e ON r.equipment_id = e.id
      LEFT JOIN worklist w ON r.sample_barcode = w.sample_barcode
      WHERE w.patient_id = $1 OR r.patient_name = (SELECT name FROM patients WHERE patient_id = $1 LIMIT 1)
      ORDER BY r.result_time DESC
    `, [req.params.patient_id]);
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/patients/:patient_id/history:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/logs', async (req, res) => {
  console.log('GET /api/logs');
  try {
    const db = getDb();
    const { rows } = await db.query(`
      SELECT l.*, e.name as equipment_name 
      FROM logs l 
      LEFT JOIN equipments e ON l.equipment_id = e.id 
      ORDER BY l.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error in GET /api/logs:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/logs', async (req, res) => {
  console.log('DELETE /api/logs');
  try {
    const db = getDb();
    await db.query('DELETE FROM logs');
    res.json({ message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/logs:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

async function startServer() {
  // Initialize Database
  await initDb();

  // Start existing adapters
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM equipments');
    for (const equipment of rows) {
      startAdapter(equipment.port, equipment.id, equipment.model);
    }
  } catch (error) {
    console.error('Failed to start adapters. Database might not be configured.');
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
