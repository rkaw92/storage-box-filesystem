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
    "name" TEXT NOT NULL,
    "entryType" t_entry NOT NULL,
    "fileID" BIGINT,
    "lastModified" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT "entries_primary" PRIMARY KEY ("filesystemID", "entryID"),
    CONSTRAINT "entries_unique_name" UNIQUE ("filesystemID", "parentID", "name"),
    CONSTRAINT "entries_has_fileID" CHECK ("entryType" = 'file' AND "fileID" IS NOT NULL OR "entryType" <> 'file'),
    CONSTRAINT "entries_parent" FOREIGN KEY ("filesystemID", "parentID") REFERENCES entries("filesystemID", "entryID")
);

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
);

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
);

COMMIT;
