import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

/** Real SQLite statements behind the small D1 API used by the application. */
export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(readFileSync(new URL('../../migrations/0001_claim.sql', import.meta.url), 'utf8'));
  sqlite.exec(readFileSync(new URL('../../migrations/0007_resumable_verification_tokens.sql', import.meta.url), 'utf8'));

  class Statement {
    constructor(sql, parameters = []) {
      this.sql = sql;
      this.parameters = parameters;
    }
    bind(...parameters) { return new Statement(this.sql, parameters); }
    async first(column) {
      const row = sqlite.prepare(this.sql).get(...this.parameters);
      if (!row) return null;
      return column ? row[column] : { ...row };
    }
    async all() {
      return { success: true, results: sqlite.prepare(this.sql).all(...this.parameters).map((row) => ({ ...row })) };
    }
    async run() { return this.execute(); }
    execute() {
      const statement = sqlite.prepare(this.sql);
      let results = [];
      if (statement.columns().length) results = statement.all(...this.parameters).map((row) => ({ ...row }));
      else statement.run(...this.parameters);
      return { success: true, results, meta: { changes: sqlite.prepare('SELECT changes() AS count').get().count } };
    }
  }

  return {
    sqlite,
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    close() { sqlite.close(); }
  };
}
