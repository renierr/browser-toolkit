import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic } from 'sql.js';

export type WorkerRequest =
  | { type: 'LOAD_DB'; payload: { buffer: Uint8Array } }
  | { type: 'GET_TABLES' }
  | { type: 'GET_SCHEMA'; payload: { table: string } }
  | { type: 'GET_DATA'; payload: { table: string; limit: number; offset: number } }
  | { type: 'EXECUTE_QUERY'; payload: { sql: string } };

export type WorkerResponse =
  | { type: 'LOAD_DB_SUCCESS' }
  | { type: 'GET_TABLES_SUCCESS'; payload: { tables: string[] } }
  | { type: 'GET_SCHEMA_SUCCESS'; payload: { table: string; schema: any[] } }
  | {
      type: 'GET_DATA_SUCCESS';
      payload: { table: string; columns: string[]; rows: any[][]; totalCount: number };
    }
  | { type: 'EXECUTE_QUERY_SUCCESS'; payload: { columns: string[]; rows: any[][] } }
  | { type: 'ERROR'; payload: { message: string } };

let db: Database | null = null;
let SQL: SqlJsStatic | null = null;

// The WASM url is injected during initialization by the main thread
export async function initializeSqlJs(wasmUrl: string) {
  if (SQL) return;
  SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });
}

self.onmessage = async (e: MessageEvent<{ wasmUrl?: string; req?: WorkerRequest }>) => {
  const { wasmUrl, req } = e.data;

  try {
    if (wasmUrl) {
      await initializeSqlJs(wasmUrl);
      self.postMessage({ type: 'INIT_SUCCESS' });
      return;
    }

    if (!req) return;
    if (!SQL) throw new Error('sql.js not initialized');

    switch (req.type) {
      case 'LOAD_DB': {
        if (db) {
          db.close();
        }
        db = new SQL.Database(req.payload.buffer);
        self.postMessage({ type: 'LOAD_DB_SUCCESS' });
        break;
      }

      case 'GET_TABLES': {
        if (!db) throw new Error('Database not loaded');
        const res = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;");
        const tables = res.length > 0 ? res[0].values.map((v: any) => v[0] as string) : [];
        self.postMessage({ type: 'GET_TABLES_SUCCESS', payload: { tables } });
        break;
      }

      case 'GET_SCHEMA': {
        if (!db) throw new Error('Database not loaded');
        const res = db.exec(`PRAGMA table_info("${req.payload.table}");`);
        const schema = res.length > 0 ? res[0].values : [];
        self.postMessage({ type: 'GET_SCHEMA_SUCCESS', payload: { table: req.payload.table, schema } });
        break;
      }

      case 'GET_DATA': {
        if (!db) throw new Error('Database not loaded');
        
        // Get total count
        const countRes = db.exec(`SELECT COUNT(*) FROM "${req.payload.table}";`);
        const totalCount = countRes.length > 0 ? (countRes[0].values[0][0] as number) : 0;
        
        // Get paginated data
        const res = db.exec(`SELECT * FROM "${req.payload.table}" LIMIT ${req.payload.limit} OFFSET ${req.payload.offset};`);
        
        if (res.length > 0) {
          self.postMessage({
            type: 'GET_DATA_SUCCESS',
            payload: {
              table: req.payload.table,
              columns: res[0].columns,
              rows: res[0].values,
              totalCount,
            },
          });
        } else {
           self.postMessage({
            type: 'GET_DATA_SUCCESS',
            payload: {
              table: req.payload.table,
              columns: [],
              rows: [],
              totalCount,
            },
          });
        }
        break;
      }

      case 'EXECUTE_QUERY': {
        if (!db) throw new Error('Database not loaded');
        const res = db.exec(req.payload.sql);
        if (res.length > 0) {
           self.postMessage({ type: 'EXECUTE_QUERY_SUCCESS', payload: { columns: res[0].columns, rows: res[0].values } });
        } else {
           self.postMessage({ type: 'EXECUTE_QUERY_SUCCESS', payload: { columns: [], rows: [] } });
        }
        break;
      }
    }
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', payload: { message: err.message || String(err) } });
  }
};
