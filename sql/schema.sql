CREATE EXTENSION ltree;
CREATE EXTENSION btree_gist;
CREATE OR REPLACE FUNCTION compute_path_initial()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    NEW.path = (SELECT path FROM entries WHERE entries."filesystemID" = NEW."filesystemID" AND entries."entryID" = NEW."parentID") || (NEW."entryID");
    RETURN NEW;
END
$BODY$;

CREATE OR REPLACE FUNCTION compute_path_for_children()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    UPDATE entries SET path = (NEW.path || path[(array_position(path, OLD."entryID") + 1):]) WHERE ("filesystemID" = NEW."filesystemID") AND (path && ARRAY[NEW."entryID"]) AND ("entryID" <> NEW."entryID");
    RETURN NEW;
END
$BODY$;

CREATE OR REPLACE FUNCTION increment_refcount_after_upload()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    UPDATE files SET "referenceCount" = "referenceCount" + 1 WHERE "filesystemID" = NEW."filesystemID" AND "fileID" = NEW."fileID";
    RETURN NEW;
END
$BODY$;

CREATE OR REPLACE FUNCTION decrement_refcount_after_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    UPDATE files SET "referenceCount" = "referenceCount" - 1, "expires" = NOW() + 'P1D'::interval WHERE "filesystemID" = OLD."filesystemID" AND "fileID" = OLD."fileID";
    RETURN OLD;
END
$BODY$;

CREATE OR REPLACE FUNCTION delete_children()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    DELETE FROM entries WHERE "filesystemID" = OLD."filesystemID" AND "parentID" = OLD."entryID";
    RETURN OLD;
END
$BODY$;

BEGIN;

CREATE SEQUENCE filesystems_seq;
CREATE TABLE filesystems (
    "filesystemID" BIGINT NOT NULL DEFAULT nextval('filesystems_seq'),
    "name" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    CONSTRAINT "filesystems_primary" PRIMARY KEY ("filesystemID"),
    CONSTRAINT "filesystems_unique_alias" UNIQUE ("alias")
);

CREATE TABLE filesystem_permissions (
    "issuer" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "filesystemID" BIGINT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "canWrite" BOOLEAN NOT NULL DEFAULT FALSE,
    "canShare" BOOLEAN NOT NULL DEFAULT FALSE,
    "canManage" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "filesystem_permissions_primary" PRIMARY KEY ("issuer", "attribute", "value", "filesystemID")
);

CREATE TYPE t_entry AS ENUM ('file', 'directory');

CREATE TABLE entries (
    "filesystemID" BIGINT NOT NULL,
    "entryID" BIGINT NOT NULL,
    "parentID" BIGINT,
    "path" BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],
    "name" TEXT NOT NULL,
    "entryType" t_entry NOT NULL,
    "fileID" BIGINT,
    "lastModified" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT "entries_primary" PRIMARY KEY ("filesystemID", "entryID"),
    CONSTRAINT "entries_unique_name" UNIQUE ("filesystemID", "parentID", "name"),
    CONSTRAINT "entries_has_fileID" CHECK ("entryType" = 'file' AND "fileID" IS NOT NULL OR "entryType" <> 'file'),
    CONSTRAINT "entries_parent" FOREIGN KEY ("filesystemID", "parentID") REFERENCES entries("filesystemID", "entryID")
) PARTITION BY LIST ("filesystemID");
CREATE INDEX path_gin_idx ON entries USING GIN (path);
-- UNIQUE constraints don't catch cases where one of the columns is NULL, so in order to enforce uniqueness
--  within the root directory (parentID=null), we need a partial unique index, as described here:
--  https://www.enterprisedb.com/postgres-tutorials/postgresql-unique-constraint-null-allowing-only-one-null
CREATE UNIQUE INDEX entries_unique_name_null ON entries ("filesystemID", ("parentID" IS NULL), name) WHERE "parentID" IS NULL;

-- NOTE: The below needs to be installed per-partition!
-- CREATE TRIGGER entries_path_on_create BEFORE INSERT
-- ON entries
-- FOR EACH ROW
-- EXECUTE FUNCTION compute_path_initial();

CREATE TRIGGER entries_path_on_update AFTER UPDATE OF path, "parentID" ON entries FOR EACH ROW WHEN (OLD."entryType" = 'directory' OR NEW."entryType" = 'directory') EXECUTE FUNCTION compute_path_for_children();
CREATE TRIGGER entries_file_on_upload AFTER INSERT ON entries FOR EACH ROW WHEN (NEW."entryType" = 'file') EXECUTE FUNCTION increment_refcount_after_upload();
CREATE TRIGGER entries_file_on_delete AFTER DELETE ON entries FOR EACH ROW WHEN (OLD."entryType" = 'file') EXECUTE FUNCTION decrement_refcount_after_delete();
CREATE TRIGGER entries_directory_on_delete BEFORE DELETE ON entries FOR EACH ROW WHEN (OLD."entryType" = 'directory') EXECUTE FUNCTION delete_children();

CREATE TABLE entry_permissions (
    "issuer" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "filesystemID" BIGINT NOT NULL,
    "entryID" BIGINT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "canWrite" BOOLEAN NOT NULL DEFAULT FALSE,
    "canShare" BOOLEAN NOT NULL DEFAULT FALSE,
    "issuerForRevocation" TEXT NOT NULL,
    "attributeForRevocation" TEXT NOT NULL,
    "valueForRevocation" TEXT NOT NULL,
    "comment" TEXT,
    CONSTRAINT "entry_permissions_primary" PRIMARY KEY ("filesystemID", "entryID", "issuer", "attribute", "value",  "issuerForRevocation", "attributeForRevocation", "valueForRevocation"),
    CONSTRAINT "entry_permissions_entry" FOREIGN KEY ("filesystemID", "entryID") REFERENCES entries ("filesystemID", "entryID") ON DELETE CASCADE
) PARTITION BY LIST ("filesystemID");

CREATE TABLE files (
    "filesystemID" BIGINT NOT NULL,
    "fileID" BIGINT NOT NULL,
    "referenceCount" BIGINT NOT NULL DEFAULT 0,
    "backendID" BIGINT NOT NULL,
    "backendURI" TEXT NOT NULL,
    "expires" TIMESTAMP WITH TIME ZONE,
    "uploadFinished" BOOLEAN NOT NULL DEFAULT FALSE,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "mimetype" TEXT NOT NULL DEFAULT 'application/octet-stream',
    CONSTRAINT "files_primary" PRIMARY KEY ("filesystemID", "fileID")
) PARTITION BY LIST ("filesystemID");

CREATE TABLE files_derivatives (
    "filesystemID" BIGINT NOT NULL,
    "fileID" BIGINT NOT NULL,
    "usageID" TEXT NOT NULL,
    "referenceCount" BIGINT NOT NULL DEFAULT 0,
    "backendID" BIGINT NOT NULL,
    "backendURI" TEXT NOT NULL,
    "expires" TIMESTAMP WITH TIME ZONE,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "mimetype" TEXT NOT NULL DEFAULT 'application/octet-stream',
    CONSTRAINT "files_derivatives_primary" PRIMARY KEY ("filesystemID", "fileID", "usageID")
) PARTITION BY LIST ("filesystemID");

COMMIT;
