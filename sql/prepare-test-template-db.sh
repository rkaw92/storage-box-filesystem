#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE storagebox_test_template;
EOSQL
pwd
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname storagebox_test_template <schema.sql
