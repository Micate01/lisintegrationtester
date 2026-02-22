import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb, getDb } from './server/db';
import { startAdapter, stopAdapter } from './server/hl7';
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
