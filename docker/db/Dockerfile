FROM postgres:13
RUN mkdir -p /docker-entrypoint-initdb.d/schema
COPY sql/schema.sql /schema.sql
COPY sql/prepare-test-template-db.sh /docker-entrypoint-initdb.d/
