import Knex from 'knex';
import { DBGateway } from './DBGateway';

export function getDBGateway(connectionString: string | undefined = process.env.PG_CONNECTION_STRING) {
    const db = Knex({
        client: 'pg',
        connection: connectionString
    });
    const gateway = new DBGateway(db);
    return gateway;
};
