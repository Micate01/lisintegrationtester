import { Pool } from 'pg';
import Database from 'better-sqlite3';

export interface IDatabase {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

class PostgresDatabase implements IDatabase {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async query(text: string, params?: any[]): Promise<{ rows: any[] }> {
    return this.pool.query(text, params);
  }
}

class SQLiteDatabase implements IDatabase {
  private db: Database.Database;

  constructor() {
    this.db = new Database('local.db');
    this.db.pragma('journal_mode = WAL');
  }

  async query(text: string, params?: any[]): Promise<{ rows: any[] }> {
    // Convert Postgres $1, $2 syntax to SQLite ? syntax
    let sql = text.replace(/\$\d+/g, '?');
    
    // Convert Postgres-specific syntax to SQLite
    sql = sql.replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT');
    sql = sql.replace(/TIMESTAMP DEFAULT CURRENT_TIMESTAMP/gi, 'DATETIME DEFAULT CURRENT_TIMESTAMP');
    
    // Handle multiple statements if present (better-sqlite3 doesn't support multiple statements in one prepare)
    if (sql.trim().toLowerCase().startsWith('create')) {
       // Split by semicolon for initialization scripts
       const statements = sql.split(';').filter(s => s.trim());
       for (const stmt of statements) {
         this.db.prepare(stmt).run();
       }
       return { rows: [] };
    }

    const stmt = this.db.prepare(sql);
    
    // Convert Date objects to ISO strings for SQLite
    const safeParams = params ? params.map(p => p instanceof Date ? p.toISOString() : p) : [];

    // If the query is a SELECT or has RETURNING, use .all()
    if (sql.trim().toLowerCase().startsWith('select') || sql.toLowerCase().includes('returning')) {
      const rows = stmt.all(safeParams);
      return { rows };
    } else {
      stmt.run(safeParams);
      return { rows: [] };
    }
  }
}

let dbInstance: IDatabase | null = null;

export function getDb(): IDatabase {
  if (!dbInstance) {
    const connectionString = process.env.DATABASE_URL || 'postgres://lislogin:lislogin@localhost:5432/lisdb';
    if (connectionString) {
      console.log('Using PostgreSQL database:', connectionString);
      dbInstance = new PostgresDatabase(connectionString);
    } else {
      console.warn('DATABASE_URL not found. Using local SQLite database.');
      dbInstance = new SQLiteDatabase();
    }
  }
  return dbInstance;
}

export async function initDb() {
  try {
    let db = getDb();

    // Test Postgres connection if active
    if (db instanceof PostgresDatabase) {
      try {
        await db.query('SELECT 1');
        console.log('Postgres connection successful');
      } catch (error) {
        console.warn('Postgres connection failed. Falling back to local SQLite database.', error);
        dbInstance = new SQLiteDatabase();
        db = dbInstance;
      }
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS equipments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        model VARCHAR(255) NOT NULL,
        ip_address VARCHAR(255),
        port INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'disconnected',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS results (
        id SERIAL PRIMARY KEY,
        equipment_id INTEGER REFERENCES equipments(id),
        sample_barcode VARCHAR(255),
        patient_name VARCHAR(255),
        test_no VARCHAR(50),
        test_name VARCHAR(255),
        result_value VARCHAR(255),
        result_unit VARCHAR(50),
        result_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS logs (
        id SERIAL PRIMARY KEY,
        equipment_id INTEGER REFERENCES equipments(id),
        message_type VARCHAR(50),
        direction VARCHAR(10),
        raw_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
  }
}
