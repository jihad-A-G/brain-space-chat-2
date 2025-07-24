import { Sequelize } from 'sequelize';
import mysql from 'mysql2/promise';
import { defineModels } from '../models';
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
dotenv.config();

// Extend Express Request interface to include 'tenant'
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        sequelize: Sequelize;
        models: any;
      };
    }
  }
}

// Configuration for tenant lookup database
const tenantDbConfig = {
  host: '157.180.50.29',
  user: 'root',
  password: 'jWAC5hpomatL2',
  database: 'tenantDB',
  charset: 'utf8mb4'
};

// Configuration for default database
const defaultDbConfig = {
  host: '157.180.50.29',
  user: 'brain',
  password: '8MUG3eT9GYXT298xtRKg',
  database: 'brain_space',
  charset: 'utf8mb4'
};

const sequelizeCache: Record<string, { sequelize: Sequelize, models: any }> = {};

export default async function tenantSequelizeMiddleware(req: Request, res: Response, next: NextFunction) {
  try {

    // Always extract subdomain from referer
    const referer = req.headers.referer || req.headers.referrer as string;
    console.log(`[TENANT DEBUG] Referer header: '${referer}'`);
    let subdomain = '';
    if (referer) {
      // Special case: referer is brain-space2.vercel.app
      if (referer.startsWith('https://brain-space2.vercel.app/')) {
        console.log(`[TENANT DEBUG] Referer is brain-space2.vercel.app, using special credentials`);
        const vercelSequelize = new Sequelize('pos_new', 'root', 'TryHarderplease!@#$2232', {
          host: '88.198.32.140',
          dialect: 'mysql',
          logging: false,
          pool: { max: 5, min: 0, idle: 10000 }
        });
        const models = defineModels(vercelSequelize);
        sequelizeCache['vercel'] = { sequelize: vercelSequelize, models };
        req.tenant = sequelizeCache['vercel'];
        return next();
      }
      try {
        const refererUrl = new URL(referer);
        const refererHostname = refererUrl.hostname;
        const refererParts = refererHostname.split('.');
        console.log(`[TENANT DEBUG] Referer hostname: '${refererHostname}', parts:`, refererParts);
        if (refererParts.length >= 3 && 
            refererParts[refererParts.length - 2] === 'brain-space' && 
            refererParts[refererParts.length - 1] === 'app') {
          const refererSubdomain = refererParts[0];
          if (refererSubdomain !== 'chat' && refererSubdomain !== 'www') {
            subdomain = refererSubdomain;
            console.log(`[TENANT DEBUG] Extracted subdomain from referer: '${subdomain}'`);
          } else {
            console.log(`[TENANT DEBUG] Referer subdomain is '${refererSubdomain}' (ignoring)`);
          }
        } else {
          console.log(`[TENANT DEBUG] Referer is not from brain-space.app domain`);
        }
      } catch (error) {
        console.log(`[TENANT DEBUG] Failed to parse referer URL: ${error}`);
      }
    } else {
      console.log(`[TENANT DEBUG] No referer header found, cannot determine subdomain.`);
    }

    console.log(`[TENANT DEBUG] Final subdomain decision: '${subdomain}' (empty = default DB)`);

    // If no subdomain, use default database
    if (!subdomain) {
      console.log(`[TENANT DEBUG] Using default database connection`);
      
      // Check cache for default connection
      if (sequelizeCache['default']) {
        console.log(`[TENANT DEBUG] Found cached default connection`);
        // @ts-ignore
        req.tenant = sequelizeCache['default'];
        return next();
      }

      console.log(`[TENANT DEBUG] Creating new default database connection`);
      console.log(`[TENANT DEBUG] Default DB config:`, {
        host: defaultDbConfig.host,
        user: defaultDbConfig.user,
        database: defaultDbConfig.database
      });

      // Create default database connection
      const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
        host: defaultDbConfig.host,
        dialect: 'mysql',
        logging: false,
        pool: { max: 5, min: 0, idle: 10000 }
      });

      const models = defineModels(defaultSequelizeInstance);
      sequelizeCache['default'] = { sequelize: defaultSequelizeInstance, models };
      console.log(`[TENANT DEBUG] Default connection cached and assigned to request`);
      // @ts-ignore
      req.tenant = sequelizeCache['default'];
      return next();
    }

    console.log(`[TENANT DEBUG] Looking up tenant-specific connection for subdomain: '${subdomain}'`);

    // Check cache for tenant-specific connection
    if (sequelizeCache[subdomain]) {
      console.log(`[TENANT DEBUG] Found cached connection for subdomain: '${subdomain}'`);
      // @ts-ignore
      req.tenant = sequelizeCache[subdomain];
      return next();
    }

    console.log(`[TENANT DEBUG] No cached connection found, querying tenant database`);
    console.log(`[TENANT DEBUG] Tenant DB lookup config:`, {
      host: tenantDbConfig.host,
      user: tenantDbConfig.user,
      database: tenantDbConfig.database
    });

    // Lookup tenant DB info from tenantDB
    const tenantConn = await mysql.createConnection(tenantDbConfig);
    console.log(`[TENANT DEBUG] Connected to tenant lookup database`);
    
    const [rows]: any = await tenantConn.execute(
      'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
      [subdomain]
    );
    await tenantConn.end();
    
    console.log(`[TENANT DEBUG] Tenant lookup query result: ${rows.length} rows found`);

    if (!rows.length) {
      console.log(`[TENANT DEBUG] No tenant found for subdomain: '${subdomain}' on path ${req.path}`);
      // Fallback: For non-API requests, use default DB instead of 404
      if (!req.path.startsWith('/api/')) {
        console.log(`[TENANT DEBUG] Fallback to default DB for non-API path: ${req.path}`);
        if (sequelizeCache['default']) {
          req.tenant = sequelizeCache['default'];
          return next();
        }
        const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
          host: defaultDbConfig.host,
          dialect: 'mysql',
          logging: false,
          pool: { max: 5, min: 0, idle: 10000 }
        });
        const models = defineModels(defaultSequelizeInstance);
        sequelizeCache['default'] = { sequelize: defaultSequelizeInstance, models };
        req.tenant = sequelizeCache['default'];
        return next();
      }
      // For API requests, still return 404
      return res.status(404).send('Tenant not found');
    }

    // @ts-ignore
    const { db_name, db_user, db_pass } = rows[0];
    let dbHost = 'localhost';
    if (subdomain === 'dev') {
      dbHost = '88.198.32.140';
      console.log(`[TENANT DEBUG] Subdomain 'dev' detected, using host: ${dbHost}`);
    }
    console.log(`[TENANT DEBUG] Found tenant credentials:`, {
      db_name,
      db_user,
      host: dbHost
    });

    console.log(`[TENANT DEBUG] Creating tenant-specific database connection`);
    const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
      host: dbHost,
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });

    const models = defineModels(tenantSequelize);
    sequelizeCache[subdomain] = { sequelize: tenantSequelize, models };
    console.log(`[TENANT DEBUG] Tenant connection cached and assigned to request for subdomain: '${subdomain}'`);
    // @ts-ignore
    req.tenant = sequelizeCache[subdomain];
    next();
  } catch (err) {
    console.error(`[TENANT ERROR] Middleware error:`, err);
    next(err);
  }
} 