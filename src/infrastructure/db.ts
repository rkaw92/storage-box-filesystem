import Knex from 'knex';
import { DBGateway } from './DBGateway';

export function getDBGateway() {
    const db = Knex({
        client: 'pg',
        connection: process.env.PG_CONNECTION_STRING
    });
    const gateway = new DBGateway(db);
    return gateway;
};
