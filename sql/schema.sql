CREATE EXTENSION ltree;
CREATE EXTENSION btree_gist;
CREATE OR REPLACE FUNCTION compute_path_initial()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    NEW.path = (SELECT path FROM entries WHERE entries."entryID" = NEW."parentID") || (NEW."entryID");
    RETURN NEW;
END
$BODY$;

CREATE OR REPLACE FUNCTION compute_path_for_children()
RETURNS trigger
LANGUAGE plpgsql
AS $BODY$
BEGIN
    UPDATE entries SET path = (NEW.path || path[(array_position(path, OLD."entryID") + 1):]) WHERE (path && ARRAY[NEW."entryID"]) AND ("entryID" <> NEW."entryID");
    RETURN NEW;
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
    "subject" TEXT NOT NULL,
    "filesystemID" BIGINT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "canWrite" BOOLEAN NOT NULL DEFAULT FALSE,
    "canManage" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "filesystem_permissions_primary" PRIMARY KEY ("issuer", "subject", "filesystemID")
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

-- NOTE: The below needs to be installed per-partition!
-- CREATE TRIGGER entries_path_on_create BEFORE INSERT
-- ON entries
-- FOR EACH ROW
-- EXECUTE FUNCTION compute_path_initial();

CREATE TRIGGER entries_path_on_update AFTER UPDATE OF path, "parentID" ON entries FOR EACH ROW WHEN (OLD."entryType" = 'directory' OR NEW."entryType" = 'directory') EXECUTE FUNCTION compute_path_for_children();

CREATE TABLE entry_permissions (
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "filesystemID" BIGINT NOT NULL,
    "entryID" BIGINT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT FALSE,
    "canWrite" BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT "entry_permissions_primary" PRIMARY KEY ("filesystemID", "issuer", "subject", "entryID"),
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
    CONSTRAINT "files_derivatives_primary" PRIMARY KEY ("filesystemID", "fileID", "usageID")
) PARTITION BY LIST ("filesystemID");

COMMIT;
