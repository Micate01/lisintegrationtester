import express from 'express';
import { createServer as createViteServer } from 'vite';
import { initDb, getDb } from './server/db';
import { startAdapter } from './server/hl7';
import cors from 'cors';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/equipments', async (req, res) => {
  try {
    const db = getDb();
    const { rows } = await db.query('SELECT * FROM equipments ORDER BY id ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/equipments', async (req, res) => {
  try {
    const { name, model, ip_address, port } = req.body;
    const db = getDb();
    const { rows } = await db.query(
      'INSERT INTO equipments (name, model, ip_address, port) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, model, ip_address, port]
    );
    const newEquipment = rows[0];
    
    // Start adapter for the new equipment
    startAdapter(newEquipment.port, newEquipment.id);
    
    res.json(newEquipment);
  } catch (error) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/results', async (req, res) => {
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
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/logs', async (req, res) => {
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
      startAdapter(equipment.port, equipment.id);
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
