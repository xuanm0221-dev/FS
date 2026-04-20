/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * 공유 Snowflake 연결 싱글턴
 * - 프로세스 당 연결 1개만 유지 (Next.js dev 핫리로드 대응: global 사용)
 * - Snowflake SDK 로그를 ERROR 레벨로만 출력해 터미널 노이즈 제거
 * - 연결 끊김 시 자동 재연결
 */

type SfConnection = {
  execute: (opts: {
    sqlText: string;
    complete: (err: Error | undefined, stmt: unknown, rows: unknown[] | undefined) => void;
  }) => void;
  destroy: (cb: () => void) => void;
  isUp?: () => boolean;
};

declare global {
  // eslint-disable-next-line no-var
  var _sfConn: SfConnection | null | undefined;
  // eslint-disable-next-line no-var
  var _sfConnecting: Promise<SfConnection> | null | undefined;
  // eslint-disable-next-line no-var
  var _sfLogConfigured: boolean | undefined;
}

function getSfConfig() {
  // .env.local의 SNOWFLAKE_PRIVATE_KEY는 escape된 \n 문자열로 저장 → 실제 개행으로 복원
  const privateKey = process.env.SNOWFLAKE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return {
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    authenticator: 'SNOWFLAKE_JWT' as const,
    privateKey,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE,
    database: process.env.SNOWFLAKE_DATABASE,
    schema: process.env.SNOWFLAKE_SCHEMA,
    role: process.env.SNOWFLAKE_ROLE,
  };
}

function buildConnection(): Promise<SfConnection> {
  const sf = require('snowflake-sdk');
  if (!global._sfLogConfigured) {
    sf.configure({ logLevel: 'ERROR' });
    global._sfLogConfigured = true;
  }
  const conn = sf.createConnection(getSfConfig());
  return new Promise((resolve, reject) => {
    conn.connect((err: Error | undefined) => {
      if (err) reject(err);
      else resolve(conn as SfConnection);
    });
  });
}

async function getConnection(): Promise<SfConnection> {
  if (global._sfConn) {
    const alive =
      typeof global._sfConn.isUp === 'function' ? global._sfConn.isUp() : true;
    if (alive) return global._sfConn;
    global._sfConn = null;
  }

  if (!global._sfConnecting) {
    global._sfConnecting = buildConnection()
      .then((conn) => {
        global._sfConn = conn;
        global._sfConnecting = null;
        return conn;
      })
      .catch((err) => {
        global._sfConnecting = null;
        throw err;
      });
  }

  return global._sfConnecting;
}

export async function executeSnowflakeQuery<T>(sql: string): Promise<T[]> {
  const conn = await getConnection();
  return new Promise<T[]>((resolve, reject) => {
    conn.execute({
      sqlText: sql,
      complete: (execErr, _stmt, rows) => {
        if (execErr) {
          global._sfConn = null;
          reject(execErr);
          return;
        }
        resolve((rows as T[]) ?? []);
      },
    });
  });
}
