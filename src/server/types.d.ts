declare module 'pg' {
  export class Client {
    constructor(config?: { connectionString?: string });
    connect(): Promise<void>;
    end(): Promise<void>;
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      queryText: string,
      values?: readonly unknown[]
    ): Promise<{ rows: T[] }>;
  }

  export class Pool {
    constructor(config?: { connectionString?: string });
    end(): Promise<void>;
    query<T extends Record<string, unknown> = Record<string, unknown>>(
      queryText: string,
      values?: readonly unknown[]
    ): Promise<{ rows: T[] }>;
  }
}
